import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { codexExec, startCodex } from './codex-cli.mjs'
import { codexResources } from './codex-resource.mjs'
import { codexSharedTurn } from './codex-shared.mjs'
import { codexSession } from './codex-session.mjs'
import { codexChronicle } from './codex-chronicle.mjs'
import { quotaDecision, resumeDecision, deliveryAction, inspectDelivery } from './codex-resume-policy.mjs'

export async function codexProvider({ repo, storage, push, say, hod,
  exec = process.env.DZHINNI_CODEX_TRANSPORT === 'exec' ? codexExec : codexSharedTurn, start = startCodex }) {
  const file = join(storage, 'queue.json')
  let saved = { thread: null, queue: [], paused: false, autoResumeAt: null }
  try { saved = { ...saved, ...JSON.parse(await readFile(file, 'utf8')) } } catch (failure) {
    if (failure.code !== 'ENOENT') throw new Error('Не удалось прочитать очередь Codex: ' + failure.message)
  }
  if (!Array.isArray(saved.queue) || saved.queue.some(message => typeof message?.content !== 'string')) throw new Error('Повреждён файл очереди Codex')
  let busy = false, child = null, loginChild = null, loginText = '', loginError = '', error = ''
  let authenticated = false, installed = true, closed = false, deliveryEvidence = null
  const terminalFile = join(storage, 'terminal.json')
  let transport = exec === codexSharedTurn ? 'shared' : 'exec'
  if (saved.queue.length) {
    saved.paused = true
    saved.pauseReason = saved.resumeInFlight ? 'resume_interrupted' : (saved.pauseReason || 'restart')
    saved.resumeInFlight = false
  }
  let resource, journal, journalError = ''
  let writes = Promise.resolve()
  function persist() {
    const content = JSON.stringify(saved, null, 2)
    writes = writes.catch(() => {}).then(async () => {
      await writeFile(file + '.tmp', content, 'utf8')
      await rename(file + '.tmp', file)
    })
    return writes
  }
  const status = () => ({ provider: 'codex', serverPid: process.pid, threadId: saved.thread,
    transport, installed, authenticated, busy, deliveryEvidence, queued: saved.queue.length,
    paused: saved.paused, pauseReason: saved.pauseReason || null, resumeInFlight: !!saved.resumeInFlight, autoResumeAt: saved.autoResumeAt || null, error, resource: resource?.status(),
    chronicle: journal?.status() || { attached: false, error: journalError },
    login: { running: !!loginChild, text: loginText, error: loginError } })
  const emit = () => push('provider', status())
  resource = codexResources({ repo, getThread: () => saved.thread, start, onChange: () => { emit(); autoResume() } })
  let resuming = false
  async function autoResume() {
    if (closed || busy || resuming || !authenticated || exec !== codexSharedTurn) return
    const decision = resumeDecision(saved, resource.status())
    saved.autoResumeAt = decision.at || null
    if (!decision.allowed) return
    resuming = true
    try {
      saved.resumeInFlight = true
      await persist()
      if (closed) return
      saved.paused = false; error = ''
      await work()
    } catch (failure) {
      error = failure.message; saved.paused = true; saved.pauseReason = 'resume_error'
    } finally {
      saved.resumeInFlight = false
      await persist().catch(() => {})
      resuming = false; emit()
    }
  }
  const autoTimer = setInterval(autoResume, 30000)
  autoTimer.unref()
  async function checkLogin() {
    installed = true
    try {
      authenticated = await new Promise(resolve => {
        const proc = start(['login', 'status'], { cwd: repo })
        const timer = setTimeout(() => { proc.kill(); resolve(false) }, 10000)
        proc.stdout.resume(); proc.stderr.resume()
        proc.once('error', () => { clearTimeout(timer); installed = false; resolve(false) })
        proc.once('close', code => { clearTimeout(timer); resolve(code === 0) })
      })
    } catch (failure) { installed = false; error = failure.message; authenticated = false }
    if (authenticated && exec === codexSharedTurn) {
      try {
        const thread = await codexSession({ repo, storage, start })
        saved.thread = thread.id; await persist()
        if (thread.path && journal?.status().threadId !== thread.id) {
          try {
            await journal?.close()
            journal = await codexChronicle({ root: repo, storage, thread, onChange: emit })
            journalError = ''
          } catch (failure) { journalError = failure.message }
        }
      }
      catch (failure) { error = failure.message; saved.paused = true }
    }
    emit()
    if (authenticated) resource.refresh(); else resource.pause()
    return status()
  }
  // A missing PID file says nothing about app/remote consumers. Never fall back to exec.
  async function terminalAlive() {
    try {
      const value = JSON.parse(await readFile(terminalFile, 'utf8'))
      if (!Number.isInteger(value.pid) || value.threadId !== saved.thread) return false
      process.kill(value.pid, 0)
      return true
    } catch { return false }
  }
  async function work() {
    if (closed || busy || saved.paused || !authenticated || !saved.queue.length) return
    busy = true; error = ''; emit()
    const message = saved.queue[0]
    hod({ text: 'Codex обрабатывает сообщение', at: Date.now() })
    try {
      const turn = exec
      const action = deliveryAction({ shared: exec === codexSharedTurn, delivery: message.delivery,
        consumer: message.delivery ? false : await terminalAlive() })
      if (action === 'observe') { deliveryEvidence = await inspectDelivery(message.delivery); emit() }
      if (action === 'consumer_required') {
        saved.pauseReason = 'consumer_required'
        throw new Error('Не подтверждён активный терминал Codex. Открой его и нажми «Продолжить очередь».')
      }
      // Existing durable deliveries are observed by shared transport, never re-enqueued.
      if (action === 'blocked_delivery') {
        saved.pauseReason = 'delivery_uncertain'
        throw new Error('Сообщение уже передавалось в общую беседу. Продолжи её в Codex; повторная отправка отключена.')
      }
      const reply = await turn({ cwd: repo, storage, thread: saved.thread, images: message.images,
        delivery: message.delivery, onDelivery: async delivery => { message.delivery = delivery; await persist() },
        prompt: (saved.thread ? '' : 'Ты — Джинни, помощница в приложении пользователя. Отвечай по-русски, о себе в женском роде. ' +
          'Выполняй задачи в рабочей папке. Ответ показывается в окне автоматически; MCP-инструменты Джинни не нужны.\n\n') + message.content,
        onChild: proc => { child = proc },
        onEvent: event => {
          if (event.type === 'thread.started' && event.thread_id) { saved.thread = event.thread_id; persist().catch(failure => { error = failure.message; saved.paused = true; emit() }) }
          const item = event.item
          if (event.type === 'item.started' && item?.type === 'command_execution') hod({ text: 'команда: ' + String(item.command || '').slice(0, 180), at: Date.now() })
          if (event.type === 'item.completed' && item?.type === 'agent_message' && item.phase === 'commentary') hod({ text: String(item.text || '').slice(0, 200), at: Date.now() })
        },
      })
      if (reply) await say(reply)
      saved.queue.shift(); saved.autoResumeAt = null; saved.pauseReason = null
      await persist()
      hod({ konec: true, at: Date.now() })
    } catch (failure) {
      error = failure.message.slice(-2000); saved.paused = true
      const quota = quotaDecision(resource.status())
      if (quota.reason === 'quota_blocked') saved.pauseReason = 'quota'
      else if (exec === codexSharedTurn && message.delivery && /Ответ общей сессии пока не получен|Не удалось подтвердить доставку/.test(error)) saved.pauseReason = 'delivery_wait'
      else saved.pauseReason ||= 'error'
      saved.autoResumeAt = saved.pauseReason === 'quota' ? quota.at : null
      await persist().catch(() => {})
      hod({ konec: true, oshibka: error, at: Date.now() })
    } finally { busy = false; child = null; emit(); resource.refresh() }
    if (!closed && !saved.paused) setImmediate(work)
  }
  async function enqueue(content, images) {
    if (!authenticated) throw new Error('Сначала войди в Codex кнопкой «Войти в Codex»')
    saved.queue.push({ content, images })
    try { await persist() } catch (failure) { saved.queue.pop(); throw failure }
    emit()
    setImmediate(work)
  }
  function login(device = false) {
    if (loginChild) return status()
    loginText = ''; loginError = ''
    try {
      loginChild = start(['login', ...(device ? ['--device-auth'] : [])], { cwd: repo })
      const proc = loginChild
      const timer = setTimeout(() => { loginError = 'Время входа истекло. Нажми «Войти в Codex» ещё раз.'; proc.kill() }, 10 * 60e3)
      const output = data => { loginText = (loginText + data.toString().replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')).slice(-6000); emit() }
      proc.stdout.on('data', output); proc.stderr.on('data', output)
      proc.once('error', failure => { loginError = failure.message; emit() })
      proc.once('close', async code => {
        clearTimeout(timer); loginChild = null
        if (code !== 0 && !loginError) loginError = 'Вход не завершён. Можно повторить.'
        await checkLogin()
        if (authenticated) { loginText = ''; emit(); work() }
      })
      proc.stdin.end()
    } catch (failure) { loginError = failure.message }
    emit()
    return status()
  }
  async function retry() { await checkLogin(); if (busy || resuming) return status(); saved.paused = false; saved.pauseReason = null; saved.autoResumeAt = null; error = ''; await persist(); work(); return status() }
  async function close() { closed = true; clearInterval(autoTimer); resource.close(); child?.kill(); loginChild?.kill(); await journal?.close() }
  await checkLogin()
  autoResume()
  return { status, enqueue, login, checkLogin, retry, close }
}
