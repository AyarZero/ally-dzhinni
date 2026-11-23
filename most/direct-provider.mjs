// Main Jinny control plane. Only native subscription CLIs (Codex, Claude Code); no server/API of other engines.
import { mkdir, readFile, writeFile, rename, appendFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { runLocalTask, nativeLocalTurns } from './local-task-runner.mjs'
import { chronicleBridge } from './chronicle-bridge.mjs'
import { routeTask, DIRECT_EXECUTORS, ASSIGN_PREFIX } from './task-router.mjs'
import { eligibility } from '../core/availability-policy.mjs'
import { taskBoardSnapshot, orderedQueue } from './task-board.mjs'
import { defaultContextPolicy, normalizeContextPolicy, unknownContext } from './context-policy.mjs'
import { defaultExecutorSettings, normalizeExecutorSettings, executorCatalog } from './executor-settings.mjs'
import { AGY_DEFAULT_MODEL, AGY_CONTEXT_LIMIT, antigravityWindowTokens } from './antigravity-cli.mjs'
import { claimBridgeStorage } from './bridge-owner.mjs'
import { isTokenator, tokenatorKey } from './tokenator.mjs'
import { warmClaude, onLateClaude } from './claude-turn.mjs'
import { splitOcenka } from './ocenki.mjs'
import { quotaNotice } from './turn-notice.mjs'
import { parseCommand, commandList } from './komandy-claude.mjs'
import { tekstHod } from './tekst-hod.mjs'
import { limitJustSaid } from './local-replies.mjs'
import { conversationSession, claudeSessionSaved } from './conversation.mjs'
import { prune as pruneSverka } from './sverka-arhiv.mjs'
import { codexCompact } from './codex-compact.mjs'
import { saveCompactRequest } from './manual-compact-store.mjs'

// Данные для шкалы UI; не меняет компактацию или настройки исполнителя.
function claudeAutoCompactTokens(model) {
  try {
    const table = JSON.parse(readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8')).modelSettings || {}
    const id = typeof model === 'string' ? model.replace(/\[.*\]$/, '') : model?.id
    const value = table[id]?.autoCompactWindow
    if (Number.isSafeInteger(value) && value > 0) return value
    const values = [...new Set(Object.values(table).map(row => row?.autoCompactWindow).filter(n => Number.isSafeInteger(n) && n > 0))]
    return values.length === 1 ? values[0] : null
  } catch { return null }
}

export async function directProvider(options) {
  const release = await claimBridgeStorage(options.storage)
  try {
    const provider = await createDirectProvider(options)
    let closing
    return { ...provider, close: () => closing ||= (async () => {
      try { await provider.close() } finally { await release() }
    })() }
  } catch (error) { await release(); throw error }
}

async function createDirectProvider({ repo, storage, core, parked = [], push = () => {}, say, hod = () => {},
  turns = nativeLocalTurns, compactTurn = codexCompact, pollMs = 2000, quotaPollMs = 60000 }) {
  if (!core) throw new Error('Прямым исполнителям требуется TaskCore')
  // A Claude answer that came after its turn had closed (a background command woke the process) — to the chat,
  // without the rating block; such answers were lost.
  if (say && turns === nativeLocalTurns) onLateClaude(({ text }) => {
    const clean = splitOcenka(text).text
    if (clean) void Promise.resolve(say(clean, 'claude')).catch(() => {})
  })
  // Пауза исполнителя (механизм остался общим). Живой мост берёт
  // список из most/parked.json (server.mjs). Исполнитель на паузе не виден в окне, задачи не получает;
  // код, вход и настройки модели целы. Вернуть — убрать имя из parked.json и перезапустить мост.
  const PARKED = new Set(parked)
  const ACTIVE = DIRECT_EXECUTORS.filter(id => !PARKED.has(id))
  // a parked engine was still probed before turns (17 s per turn). It is not checked at all now.
  if (Array.isArray(core.enabledExecutors)) core.enabledExecutors = core.enabledExecutors.filter(id => !PARKED.has(id))
  // Ручной выбор исполнителя на паузе держал бы очередь вечно — переводим на «Авто».
  if (PARKED.has(core.selection?.options?.().preference)) await core.selection.save({ mode: 'auto' })
  await mkdir(storage, { recursive: true })
  const file = join(storage, 'engine.json')
  let saved = { queue: [], localSessions: {}, currentTask: null }
  try { saved = { ...saved, ...JSON.parse(await readFile(file, 'utf8')) } }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!Array.isArray(saved.queue)) throw new Error('Повреждена очередь Джинни')
  saved.receipts ||= {}
  // Older files have no policy: defaults reproduce the previous turn cap (3).
  let policyMissing = saved.contextPolicy === undefined
  try { saved.contextPolicy = normalizeContextPolicy(saved.contextPolicy) }
  catch { saved.contextPolicy = defaultContextPolicy(); policyMissing = true }
  // Строки ушедших исполнителей в старом engine.json молча отбрасываются (executor-settings.mjs, RETIRED).
  let settingsMissing = saved.executorSettings === undefined
  try { saved.executorSettings = normalizeExecutorSettings(saved.executorSettings, defaultExecutorSettings()) }
  catch { saved.executorSettings = defaultExecutorSettings(); settingsMissing = true }
  const agyModel = () => saved.executorSettings?.antigravity?.model || AGY_DEFAULT_MODEL
  if (core.probes && typeof core.probes === 'object') core.probes = { ...core.probes, agyModel }
  else if (core.probes === undefined) core.probes = { agyModel }
  let expediting = false, reordering = false, stopping = false, steering = null
  let writes = Promise.resolve(), refreshing = null, dispatching = false, busy = false, closed = false, child = null, job = null
  let activeTaskId = null
  // в лимит стрелка «отправить сейчас» мигала — признак зависел от короткой проверки очереди
  // (dispatching, раз в 2 с). Теперь: пока выбранный исполнитель стоит в лимите, стрелки нет вовсе (отправка
  // ничего не даст, очередь уйдёт сама после сброса); в остальное время проверка очереди стрелку не гасит.
  let quotaWait = false
  let compactSaving = null, compactStoreUnknown = false, compacting = false, compactJob = null
  const canSteer = () => busy && !paused && !stopping && !expediting && !closed &&
    !Object.values(saved.contextCompactionRequests || {}).some(row => row.taskId === activeTaskId) && child?.canSteer === true && typeof child.steer === 'function'
  function attach(input, parent) {
    core.store.attachInput(input.taskId, parent.taskId, parent.ticket.attemptId, {
      commandId: `attach:${input.id}:${parent.ticket.attemptId}`, expectedRevision: core.store.get(input.taskId).revision })
    input.parentId = parent.id; input.state = 'sending'
  }
  function finishInput(input, outcome, notAccepted = false) {
    core.store.finishInput(input.taskId, { outcome, notAccepted,
      commandId: `input-finish:${input.id}:${core.store.get(input.taskId).revision}`,
      expectedRevision: core.store.get(input.taskId).revision })
    input.state = outcome === 'queued' ? 'prepared' : outcome
    if (outcome === 'queued') { delete input.parentId; input.liveRejected = true }
  }
  // error is what the window shows; paused is the only state that stops the queue.
  // An uncertain turn must never replay its own message, but later messages are independent.
  // Исполнитель ушедшего движка в старом engine.json не считается текущим.
  let executor = ACTIVE.includes(saved.directExecutor) ? saved.directExecutor : null, error = '', waiting = '', paused = false
  // What the current (or next) turn is allowed to do, and whose shift explains a read-only turn.
  let readOnly = false, writer = null, shift = null
  const persist = () => {
    saved.directExecutor = executor
    const text = JSON.stringify(saved, null, 2)
    writes = writes.catch(() => {}).then(async () => { await writeFile(file + '.tmp', text); await rename(file + '.tmp', file) })
    return writes
  }
  if (policyMissing || settingsMissing) void persist()
  // Delivery may have reached an old or killed process. Never migrate it by replay.
  // Recovery stays in needsReview and the task journal, not in the conversation's global error.
  for (const item of [...saved.queue]) {
    const task = core.store.get(item.taskId)
    // SQLite is committed before engine.json. A stale "prepared" snapshot is not
    // permission to replay a delivery already claimed by a previous process.
    if (task.state === 'completed') {
      saved.queue = saved.queue.filter(value => value !== item)
      continue
    }
    const open = task.attempts.find(attempt => ['prepared', 'sending', 'running', 'uncertain'].includes(attempt.state))
    if (open) {
      if (open.state !== 'uncertain') await core.fail({ taskId: task.taskId,
        attemptId: open.attemptId, executor: open.executor }, { kind: 'transport_unknown',
        stoppedConfirmed: false, reason: 'direct_restart_requires_reconciliation' })
      if (item.state !== 'parked') item.state = 'uncertain'
      continue
    }
    // SQLite commits before the queue snapshot; recover linked inputs from its durable record.
    if (!task.attempts.length && core.store.events(item.taskId).some(event => event.kind === 'input.attached')) {
      if (task.state === 'completed') { saved.queue = saved.queue.filter(value => value !== item); continue }
      if (task.state === 'queued') { item.state = 'prepared'; delete item.parentId; item.liveRejected = true; continue }
      if (task.state === 'running') finishInput(item, 'uncertain')
      if (item.state === 'parked') continue
      item.state = 'uncertain'
      continue
    }
    if (['prepared', 'parked', 'uncertain'].includes(item.state)) continue
    item.state = 'uncertain'
    if (item.ticket) await core.fail(item.ticket, { kind: 'transport_unknown', stoppedConfirmed: false,
      reason: 'direct_restart_requires_reconciliation' }).catch(() => {})
  }
  // старое «неизвестно» — в архив рядом, хвосты завершённых задач — прочь.
  for(const row of Object.values(saved.contextCompactionRequests || {})) {
    if(row.mode==='native' && row.state==='running') row.state='unknown'
    if(row.mode!=='native') row.state='cancelled'
  }
  const pruned = pruneSverka(saved, { taskInfo: id => core.store.get(id) })
  if (pruned.archived.length) await appendFile(join(storage, 'engine-arhiv.jsonl'),
    pruned.archived.map(item => JSON.stringify(item) + '\n').join(''))
  await persist()
  const status = () => {
    const rows = core.registry.list().filter(row => ACTIVE.includes(row.executor))
    const currentSession = saved.localSessions?.[executor + ':' + (saved.currentTask?.task_id || '')] || null
    // A measurement belongs only to the session that produced it.
    const claudeMeasured = saved.claudeContext?.sessionId && (!currentSession || saved.claudeContext.sessionId === currentSession)
      ? saved.claudeContext : null
    const agyTalk = saved.conversation?.sessions?.antigravity, agyModel = saved.antigravityContext?.model || saved.executorSettings?.antigravity?.model || AGY_DEFAULT_MODEL
    const agyModelWin = antigravityWindowTokens(agyModel), agyWin = Math.min(agyModelWin, AGY_CONTEXT_LIMIT)
    const agyRawUsed = saved.antigravityContext?.usedTokens > 0 ? saved.antigravityContext.usedTokens : (agyTalk?.context > 0 ? agyTalk.context : null)
    const agyUsed = Number.isFinite(agyRawUsed) && agyRawUsed > 0 && agyRawUsed <= agyModelWin ? agyRawUsed : null
    const antigravityMeasured = Number.isFinite(agyUsed) && agyUsed > 0
      ? { usedTokens: agyUsed, windowTokens: agyWin, percent: (agyUsed / agyWin) * 100, source: 'measured', windowSource: 'config',
          at: saved.antigravityContext?.at || saved.conversation?.lastAt || null, model: agyModel, sessionId: saved.antigravityContext?.sessionId || agyTalk?.id || null, turns: agyTalk?.turns || 1 }
      : { usedTokens: null, windowTokens: agyWin, percent: null, source: 'unknown', windowSource: 'config', at: null, model: agyModel, turns: agyTalk?.turns || 0 }
    const compactSession = currentSession || (!busy ? saved.conversation?.sessions?.[executor]?.id : null)
    const compaction = Object.entries(saved.contextCompactionRequests || {}).find(([key,row]) => row.mode === 'native' && key.startsWith(executor + ':') && row.sessionId === compactSession && (row.taskId === (saved.currentTask?.task_id || 'conversation') || ['scheduled','running','unknown'].includes(row.state)))?.[1] || null
    return { provider: 'direct', executor, serverPid: process.pid, core: core.status(), selection: core.selectionStatus(),
      busy, queued: saved.queue.filter(item => item.state === 'prepared').length,
      queuedItems: saved.queue.filter(item => item.state === 'prepared').map(item => ({ id: item.id, text: String(item.content || '').split('\n\nВложения из окна')[0].slice(0, 280) })),
      parked: saved.queue.filter(item => item.state === 'parked').length,
      needsReview: saved.queue.filter(item => item.state === 'uncertain').length,
      paused, error, waiting: compacting ? 'Сжимаю контекст текущей сессии' : waiting, task: saved.currentTask,
      executorSettings: saved.executorSettings, executorCatalog: executorCatalog(saved.executorSettings).filter(row => !PARKED.has(row.id)),
      context: executor === 'claude' ? claudeMeasured ?? unknownContext() : executor === 'antigravity' ? antigravityMeasured : null,
      antigravityContext: antigravityMeasured, antigravityContextLimit: AGY_CONTEXT_LIMIT, contextPolicy: saved.contextPolicy,
      claudeAutoCompactTokens: claudeAutoCompactTokens(claudeMeasured?.model || saved.executorSettings.claude?.model),
      contextCompaction: compactStoreUnknown ? {state:'unknown'} : compaction && !compactSaving ? { state: compaction.state, requestedAt: compaction.requestedAt } : null,
      canCompactContext: !!compactSession && executor === 'codex' && !compactStoreUnknown,
      contextCompactionMode: executor === 'codex' ? 'native' : null,
      compactTarget: compactSession ? createHash('sha256').update(executor + ':' + compactSession + ':' + (saved.currentTask?.task_id || 'conversation')).digest('hex').slice(0,24) : null,
      steerMode: canSteer() ? 'live' : 'same_session_next_step', steerLive: canSteer(), stopFlush: true,
      readOnly, writer, shift,
      installed: rows.some(row => row.observation?.service === 'available'),
      authenticated: rows.some(row => row.observation?.auth === 'authenticated'),
      threadId: saved.localSessions?.[executor + ':' + (saved.currentTask?.task_id || '')] || saved.localSessions?.[executor] || null, model: saved.currentTask?.model || null,
      availability: rows, permissions: 0, integrations: [], phoneURL: null, login: {} }
  }
  const emit = () => { push('provider', status()); if (canSteer()) void steerPending() }
  function steerPending() {
    if (steering || !canSteer() || reordering) return steering
    const parent = saved.queue.find(value => value.state === 'sending' && !value.parentId)
    // an old message waiting since the limit (11:15, not tied to this turn) stood first in the queue,
    // and the live check looked only at the first one — пользователь's message to the running turn waited behind it.
    // Like the terminal: a message written to THIS turn goes into it, whatever older items wait for their own turn.
    // «/compact» и другие команды в идущий ход не подмешиваются: им нужен свой ход (komandy-claude.mjs).
    const input = saved.queue.find(value => value.state === 'prepared' && !value.liveRejected && !value.flushBatch &&
      !value.assigned && !value.command && value.continueOf === activeTaskId)
    if (!parent || !input || !['auto', executor].includes(core.selectionStatus().mode)) return null
    const control = child
    attach(input, parent)
    steering = (async () => {
      await persist()
      try {
        const result = await control.steer(input)
        if (result?.accepted === false) finishInput(input, 'queued', true)
        else if (result?.accepted === true) {
          saved.receipts[input.id].receivedAt = Date.now()
          saved.receipts[input.id].state = 'steered'
        } else throw new Error('Нет подтверждения приёма сообщения')
      } catch (failure) {
        finishInput(input, 'uncertain')
        error = 'Не подтверждена доставка сообщения во время работы; повтор отключён. ' + failure.message
      }
      await persist()
    })().catch(failure => { paused = true; error = 'Не сохранена доставка: ' + failure.message })
      .finally(() => { steering = null; emit() })
    return steering
  }
  async function refresh() {
    if (!refreshing) refreshing = core.refresh().catch(failure => { waiting = 'Не удалось проверить доступность: ' + failure.message })
      .finally(() => { refreshing = null; emit() })
    return refreshing
  }
  // модель агрегатора (OpenRouter) у Claude Code не зависит от подписки Anthropic —
  // её вход, лимиты и блоки по квоте к такому ходу не относятся (ключ и пакет свои).
  // reserveRoute: запасной ход через Агрегатор уже выбран — на время резерва ядро видит Claude Code доступным.
  let reserveRoute = false
  function viaTokenator(row) {
    // Исполнитель на паузе для ядра «без сведений» → не доступен, задачи ему не идут.
    if (PARKED.has(row.executor)) return { ...row, observation: null }
    if (row.executor !== 'claude' || !row.observation) return row
    if (!reserveRoute && !isTokenator(saved.executorSettings.claude?.model)) return row
    return { ...row, blocks: [], observation: { ...row.observation, observedAt: Date.now(), service: 'available',
      auth: 'authenticated', modelAvailable: true, quota: { state: 'unknown', windows: [] } } }
  }
  // One lens for both the bridge's own route and TaskCore's controller decision.
  core.registry.view = viaTokenator
  // Первый круг: собственное решение по задаче на основе свежего статуса подчинённых.
  // Неизвестные возможности (например, глубина рассуждений) сюда не подаются.
  function routeFor(item) {
    const rows = core.registry.list().filter(row => ACTIVE.includes(row.executor))
    // Claude Code enters Auto only after a live check; an explicit owner choice is enough on its own.
    const { claudeVerified, preference: mode } = core.selection.options()
    const preference = item.assigned ?? mode
    const candidates = rows.map(row => ({ executor: row.executor,
      ...eligibility(row, { images: (item.images ?? []).length > 0, now: Date.now(), preference, claudeVerified }),
      observation: row.observation ?? null }))
    const route = routeTask({ content: item.content, images: item.images ?? [], candidates,
      preference: mode, assigned: item.assigned ?? undefined, order: ACTIVE })
    return route.executor ? route : reserveFor(item, route, candidates, preference) ?? route
  }
  // Запасной: в «Авто» нет ни одного доступного по ПОДТВЕРЖДЁННОЙ причине (лимиты, вход,
  // бюджет) → ход берёт Claude Code на модели агрегатора (OpenRouter). Устаревшие сведения — не повод: ядро их обновит.
  const UNKNOWN = ['status_stale', 'status_unknown', 'refresh_required']
  function reserveFor(item, route, candidates, preference) {
    if (preference !== 'auto' || route.source !== 'jinny' || !candidates.length) return null
    if (candidates.some(row => UNKNOWN.includes(row.reason))) return null
    if ((item.images ?? []).length) return null  // картинки через чужую модель не подтверждены
    const claude = core.registry.list().find(row => row.executor === 'claude')
    if (claude?.observation?.service !== 'available') return null  // нужен установленный Claude Code CLI
    const model = saved.executorSettings.tokenator?.model
    if (!isTokenator(model)) return null
    try { tokenatorKey({ repo }) } catch { return null }  // нет ключа агрегатора (OpenRouter) — запаса нет, очередь ждёт
    return { executor: 'claude', source: 'jinny', reserve: true, model, taskType: route.taskType,
      reason: 'запасной: Агрегатор · ' + model.slice('tokenator:'.length) + ' (' +
        candidates.map(row => `${row.executor} — ${row.reason}`).join('; ') + ')' }
  }
  // упёрлись в лимит, в переписку сразу приходит ответ, когда он
  // обновится; сообщения ждут на компьютере и после сброса уходят одним ходом (склейка в pump).
  // Одно уведомление на остановку очереди: ключ — первое ждущее сообщение.
  const QUOTA_REASONS = ['blocked_quota', 'quota_exhausted', 'budget_low']
  function quotaStall() {
    const now = Date.now(), { claudeVerified, preference } = core.selection?.options?.() || {}
    if (!core.registry?.list) return null
    const rows = core.registry.list().filter(row => ACTIVE.includes(row.executor))
    const checks = rows.map(row => ({ row, verdict: eligibility(row, { now, preference, claudeVerified }) }))
    const relevant = preference === 'auto' ? checks : checks.filter(({ row }) => row.executor === preference)
    if (!relevant.length || relevant.some(({ verdict }) => verdict.eligible)) return null
    const spent = relevant.filter(({ verdict }) => QUOTA_REASONS.includes(verdict.reason))
    if (!spent.length) return null
    return spent.map(({ row }) => {
      const times = [...(row.blocks ?? []).filter(block => block.kind === 'quota').map(block => block.until),
        ...(row.observation?.quota?.windows ?? []).filter(win => (win.usedPercent ?? 0) >= 100).map(win => win.resetAt)]
        .filter(value => Number.isFinite(value) && value > now)
      return { executor: row.executor, until: times.length ? Math.max(...times) : null }
    })
  }
  async function limitNotice(item) {
    if (saved.limitNotice?.itemId === item.id) return
    const stall = quotaStall()
    if (!stall) return
    saved.limitNotice = { itemId: item.id, at: Date.now() }
    await persist()
    if (limitJustSaid()) return
    try {
      await say(quotaNotice(stall))
    } catch (failure) { hod({ text: 'Уведомление о лимитах не доставлено: ' + failure.message, at: Date.now() }) }
  }
  async function pump() {
    if (closed || busy || compacting || compactSaving || dispatching || paused || expediting || reordering || stopping || steering) return
    const pendingCompact=Object.values(saved.contextCompactionRequests || {}).find(row => row.mode==='native' && row.state==='scheduled')
    if(pendingCompact) {
      compacting=true
      compactJob=(async()=>{
      try {
        pendingCompact.state='running'; await persist(); emit()
        if(closed) { pendingCompact.state='cancelled'; return }
        await compactTurn({cwd:repo,threadId:pendingCompact.sessionId})
        pendingCompact.state='completed'; pendingCompact.completedAt=Date.now()
      } catch(failure) { pendingCompact.state='unknown'; pendingCompact.error=String(failure.message).slice(0,180) }
      finally { try { await persist() } catch { compactStoreUnknown=true }; compacting=false; emit() }
      })()
      await compactJob; compactJob=null
      if(!closed) void pump()
      return
    }
    const prepared = saved.queue.filter(value => value.state === 'prepared')
    if (!prepared.length) return
    // Сообщение с картинкой при несовместимом исполнителе (images_unsupported) не должно вечно запирать
    // обычные текстовые сообщения за собой.
    const firstRoute = prepared[0].images?.length ? routeFor(prepared[0]) : null
    const imageBlockedHead = !!firstRoute && !firstRoute.executor && /images_unsupported|картинки/.test(firstRoute.reason || '')
    const item = (imageBlockedHead && prepared.find(value => !(value.images?.length) && routeFor(value).executor)) || prepared[0]
    // накопленное в очереди (лимиты кончились, ход шёл) уходит ОДНИМ ходом —
    // нейросеть читает всё, что он писал, и продолжает, как в терминале. Раньше склейка была только после «стоп».
    const inputs = [item]
    let length = item.content.length, images = item.images?.length || 0
    for (const next of prepared.slice(prepared.indexOf(item) + 1)) {
      const sameBatch = item.flushBatch ? next.flushBatch === item.flushBatch
        : !next.flushBatch && (next.continueOf ?? null) === (item.continueOf ?? null)
      if (!sameBatch || next.assigned !== item.assigned || item.command || next.command ||
          length + next.content.length > 100000 || images + (next.images?.length || 0) > 20) break
      // Не приклеивать сообщение с картинкой к текстовому, если картинки не поддерживает текущий исполнитель.
      if (next.images?.length && !images && !routeFor({ ...item, images: next.images }).executor) break
      inputs.push(next); length += next.content.length; images += next.images?.length || 0
    }
    dispatching = true
    try {
      const route = routeFor({ ...item, content: inputs.map(value => value.content).join('\n\n'), images: inputs.flatMap(value => value.images || []) })
      // Старый маршрут (особенно запасной) не должен пережить новое решение: модель хода берётся из него.
      item.route = route.executor ? route : null
      if (route.executor) {
        hod({ text: 'Маршрут: ' + route.executor + ' — ' + route.reason, at: Date.now() })
      }
      reserveRoute = route.reserve === true
      let ticket
      const resumeAt = Date.now()
      try { ticket = await core.resume(item.taskId, route) } finally { reserveRoute = false }
      item.prepTrace = { routeAt: resumeAt, resumeMs: Date.now() - resumeAt,
        parts: (core.timing || []).slice(1).map((at, i) => at - core.timing[i]).join('/') }
      if (ticket.action !== 'dispatch') {
        readOnly = false; writer = null
        waiting = !route.executor && route.reason
          ? route.reason + (route.action ? ' ' + route.action : '')
          : ticket.reason === 'writer_busy'
          ? 'Рабочую папку держит ' + (ticket.writer?.agent || ticket.owner || 'другой исполнитель') + '. Сообщение сохранено.'
          : ticket.reason === 'manual_executor_unavailable' ? 'Выбранный исполнитель недоступен. Сообщение сохранено.'
          : ticket.reason === 'no_eligible_executor' ? 'Нет доступного исполнителя: все подключённые нейросети заняты или без лимитов. Сообщение сохранено.'
          : ticket.reason === 'reconcile_required' ? 'Предыдущий ход не подтверждён: нужна сверка, автоматического повтора нет.'
          : ticket.reason === 'active_attempt_elsewhere' ? 'Предыдущая попытка не закрыта в журнале: нужна сверка. Сообщение сохранено.'
          : 'Задача ожидает доступного исполнителя или сверки предыдущей попытки.'
        quotaWait = !!quotaStall()
        await limitNotice(item)
        emit(); return
      }
      quotaWait = false
      if (!ACTIVE.includes(ticket.executor)) throw new Error('Выбран неподключённый исполнитель')
      item.ticket = ticket; item.state = 'sending'; executor = ticket.executor; busy = true; activeTaskId = ticket.taskId
      for (const input of inputs.slice(1)) attach(input, item)
      // A previous uncertain task remains in needsReview, not in the active turn's error.
      error = ''
      readOnly = ticket.readOnly === true; writer = ticket.writer ?? null
      waiting = readOnly ? 'Рабочую папку держит ' + (writer?.agent || 'другая смена') + ': этот ход только чтением, без записи.'
        : ''
      // черновик оборванного хода лежал в engine.json и мелькал на телефоне в начале нового.
      if (saved.currentTask?.draft) delete saved.currentTask.draft
      await persist(); emit()
      const turnExecutor = executor
      job = runLocalTask({ repo, storage, core, item, saved, persist, inputs, say: text => say(text, turnExecutor, {replyTo:[...new Set([item.id,...inputs.map(input=>input.id),...saved.queue.filter(input=>input.parentId===item.id&&input.state==='sending').map(input=>input.id)])]}), hod, emit, turns,
        onChild: value => { child = value } }).then(async result => {
        await steering
        for (const input of saved.queue.filter(value => value.parentId === item.id && value.state === 'sending')) {
          finishInput(input, result.ok ? 'completed' : result.handoff ? 'queued' : 'uncertain', !!result.handoff)
          if (result.ok) saved.queue = saved.queue.filter(value => value !== input)
        }
        error = result.ok || result.handoff ? '' : result.error
        // The turn is over: an old "folder is busy" line must not outlive it.
        readOnly = false; writer = null
        if (result.handoff) waiting = 'Исполнитель не начал работу — передаю сохранённую задачу другому.'
        else waiting = ''
      }).catch(failure => { item.state = 'uncertain'; error = 'Нужна сверка: ' + failure.message })
        .finally(async () => {
          busy = false; activeTaskId = null; child = null; job = null
          await persist().catch(failure => { error = 'Не сохранено состояние: ' + failure.message })
          emit(); if (!closed) void pump()
        })
    } catch (failure) {
      // Could not even reserve the dispatch: stop and let the owner clear it explicitly.
      paused = true; error = 'Задача сохранена; отправка требует проверки: ' + failure.message; emit()
    } finally { dispatching = false }
  }
  function delivery(messageId) {
    const receipt = saved.receipts[messageId]
    if (!receipt) return null
    const item = saved.queue.find(value => value.id === messageId)
    return { state: receipt.receivedAt ? 'received' : 'computer', receivedAt: receipt.receivedAt || null,
      receivedEvidence: receipt.receivedEvidence || null,
      phase: item?.state || 'finished',
      canExpedite: item?.state === 'prepared' && !receipt.receivedAt && !quotaWait && !expediting && !stopping && !steering }
  }
  async function enqueue(content, images = [], context = {}) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('Пустое сообщение')
    const clientMessageId = context?.clientMessageId
    if (clientMessageId !== undefined && (typeof clientMessageId !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(clientMessageId)))
      throw new Error('Неверный ID сообщения')
    if (context?.sentAt !== undefined && (!Number.isSafeInteger(context.sentAt) || context.sentAt <= 0 || context.sentAt > 8640000000000000))
      throw new Error('Неверное время отправки')
    const id = 'msg_' + (clientMessageId || randomUUID()).replaceAll('-', '')
    const fingerprint = createHash('sha256').update(JSON.stringify([content, images])).digest('hex')
    if (saved.receipts[id]) {
      if (saved.receipts[id].fingerprint !== fingerprint) throw new Error('ID уже принадлежит другому сообщению')
      await writes
      return { ...saved.receipts[id], duplicate: true }
    }
    // Прямое назначение «codex: …» / «claude: …» — директива маршрута, а не часть запроса исполнителю.
    const found = ASSIGN_PREFIX.exec(content)
    const prefix = found && !PARKED.has(found[1].toLowerCase()) ? found : null  // «имя:» исполнителя на паузе — обычный текст
    const text = prefix ? content.replace(ASSIGN_PREFIX, '') : content
    if (!text.trim()) throw new Error('После назначения исполнителя пустой запрос')
    const { task } = core.controller.submit({ requestKey: 'msg:' + id, commandId: 'create:msg:' + id,
      userRequest: text, goal: text.slice(0, 500), acceptance: ['Ответ исполнителя получен'],
      rules: ['coordination/CORE.md', 'CLAUDE.md'], constraints: { paidApiBudget: 0, images: images.length > 0 } })
    // A message sent while a turn runs continues that task's session at its next step;
    // an explicit «codex:»/«claude:» assignment stays a separate task.
    const continueOf = !prefix && busy ? activeTaskId : null
    const command = !prefix && !!parseCommand(text)
    saved.queue.push({ id, taskId: task.taskId, content: text, assigned: prefix?.[1].toLowerCase() ?? null, images,
      state: 'prepared', continueOf, ...(command ? { command: true } : {}) })
    const acceptedAt = Date.now()
    saved.receipts[id] = { messageId: id, clientMessageId: clientMessageId || null, taskId: task.taskId,
      sentAt: context?.sentAt ?? acceptedAt, acceptedAt,
      fingerprint, state: 'queued', receivedAt: null }
    await persist(); emit(); void pump()
    return { ...saved.receipts[id] }
  }
  const taskBoard = () => ({ ...taskBoardSnapshot(saved, core.store, dispatching || expediting || reordering || stopping || !!steering), paused, waiting })
  async function reorderTasks(messageIds, revision) {
    if (dispatching || expediting || reordering || stopping || steering) throw new Error('Очередь сейчас меняется. Обнови список.')
    const previous = saved.queue.filter(item => item.state === 'prepared').map(item => item.id)
    const reordered = orderedQueue(saved.queue, messageIds, revision)
    reordering = true
    try {
      saved.queue = reordered
      await persist()
    } catch (failure) {
      const rank = new Map(previous.map((id, index) => [id, index]))
      const rest = saved.queue.filter(item => item.state === 'prepared' && rank.has(item.id))
        .sort((a, b) => rank.get(a.id) - rank.get(b.id))
      saved.queue = saved.queue.map(item => item.state === 'prepared' && rank.has(item.id) ? rest.shift() : item)
      paused = true; error = 'Порядок не сохранён. Очередь приостановлена; нужна сверка.'
      await persist().catch(() => {})
      throw new Error(error, { cause: failure })
    } finally { reordering = false; emit() }
    return taskBoard()
  }
  async function expedite(messageId, { interrupt = false } = {}) {
    // The queue check (dispatching) is short: wait it out instead of hiding the arrow or answering 409.
    for (let waited = 0; dispatching && waited < 10000; waited += 100) await new Promise(done => setTimeout(done, 100))
    if (quotaWait) throw new Error('Лимит выбранной нейросети ещё не обновился: сообщение уйдёт само сразу после сброса')
    if (dispatching || reordering || !delivery(messageId)?.canExpedite) throw new Error('Сообщение уже отправлено или сейчас недоступно')
    if (busy && !interrupt) throw new Error('Нужно подтвердить остановку текущего ответа')
    if (busy && !child) throw new Error('Исполнитель ещё запускается. Попробуй через несколько секунд')
    expediting = true
    try {
      const item = saved.queue.find(value => value.id === messageId)
      // Never overlap writers: the runner must finish and release its shift before pump can dispatch.
      if (busy) {
        const running = job
        const active = saved.queue.find(value => value.state === 'sending')
        if (active) active.ownerInterrupted = true
        if (child.kill() === false) throw new Error('Не удалось остановить текущий ответ')
        await running
      }
      saved.queue = [item, ...saved.queue.filter(value => value !== item)]
      paused = false
      await persist(); emit()
      return { ok: true, messageId }
    } finally { expediting = false; if (!closed) void pump() }
  }
  async function cancelTask(messageId) {
    if (dispatching || expediting || reordering || stopping || steering) throw new Error('Очередь сейчас меняется. Попробуй через секунду.')
    const item = saved.queue.find(value => value.id === messageId && value.state === 'prepared')
    if (!item) throw new Error('Сообщение уже выполняется или не найдено в очереди')
    saved.queue = saved.queue.filter(value => value !== item)
    if (saved.receipts[messageId]) saved.receipts[messageId].state = 'cancelled'
    if (!saved.queue.some(value => value.state === 'prepared')) waiting = ''
    await persist(); emit(); if (!closed && !busy) void pump()
    return { ok: true, messageId }
  }
  async function compactContext(data = {}) {
    if(closed) throw new Error('Мост закрывается, запрос не принят')
    if(dispatching && !busy) throw new Error('Сообщение уже начинает выполняться. Запрос сжатия не принят; открой контекст после начала ответа.')
    if (compactStoreUnknown) { const error = new Error('Результат сохранения неизвестен. Нужна проверка хранилища.'); error.status=503; throw error }
    if (compactSaving) await compactSaving
    if (data.executor && data.executor !== executor) throw new Error('Нейросеть уже сменилась. Открой окно контекста заново.')
    const taskId = activeTaskId || saved.currentTask?.task_id || 'conversation', sessionKey = executor + ':' + taskId
    const sessionId = saved.localSessions?.[sessionKey] || (!busy ? saved.conversation?.sessions?.[executor]?.id : null)
    if (!sessionId) throw new Error('Сессия ещё не началась. Сжатие станет доступно после начала первого ответа.')
    if(executor!=='codex') throw new Error('Штатное сжатие для этой нейросети пока не подключено. Новая сессия не создаётся.')
    if (data.target && data.target !== createHash('sha256').update(executor + ':' + sessionId + ':' + taskId).digest('hex').slice(0,24))
      throw new Error('Сессия уже сменилась. Открой окно контекста заново.')
    saved.contextCompactionRequests ||= {}
    if(Object.values(saved.contextCompactionRequests).some(row=>row.mode==='native' && row.sessionId===sessionId && row.state==='unknown')) throw new Error('Исход прежнего сжатия неизвестен. Автоматического повтора нет.')
    if (!saved.contextCompactionRequests[sessionKey] || saved.contextCompactionRequests[sessionKey].mode!=='native') {
      const request = { taskId, sessionId, mode:'native', state:'scheduled', requestedAt: Date.now() }
      compactSaving = saveCompactRequest(saved.contextCompactionRequests, sessionKey, request, persist)
      try { await compactSaving }
      catch (error) { if(error.status===503) compactStoreUnknown=true; throw error }
      finally { compactSaving = null }
      emit()
    }
    const result={ok:true,provider:status()}
    if(!busy) void pump()
    return result
  }
  async function compactStatus() {
    while(compactSaving) { try { await compactSaving } catch(error) { if(error.status===503) throw error } }
    if(compactStoreUnknown) { const error=new Error('Результат сохранения неизвестен. Нужна проверка хранилища.'); error.status=503; throw error }
    return {ok:true,provider:status()}
  }
  async function settings(data) {
    const hasMode = data?.mode !== undefined, hasPolicy = data?.contextPolicy !== undefined
    const hasExecutors = data?.executorSettings !== undefined
    if (!hasMode && !hasPolicy && !hasExecutors) throw new Error('Нет изменений: Выбери исполнителя, модель или порог контекста')
    if (hasMode && !['auto', ...DIRECT_EXECUTORS].includes(data.mode)) throw new Error('Выбери Авто, Codex, Claude Code или DeepSeek Harness')
    // исполнитель на паузе (parked.json) вручную не выбирается — ход ушёл бы
    // в выключенный движок. Вернуть — убрать имя из parked.json, как и прежде.
    if (hasMode && PARKED.has(data.mode)) throw new Error(`Исполнитель ${data.mode} на паузе (parked.json) — выбери Авто или другого исполнителя`)
    // Validate every part before applying any of them: a rejected model must not keep a new threshold.
    const policy = hasPolicy ? normalizeContextPolicy(data.contextPolicy, saved.contextPolicy) : saved.contextPolicy
    const executors = hasExecutors ? normalizeExecutorSettings(data.executorSettings, saved.executorSettings) : saved.executorSettings
    const prevAgyModel = saved.executorSettings?.antigravity?.model
    if (hasMode) await core.setSelection(data.mode)
    saved.contextPolicy = policy; saved.executorSettings = executors
    await persist(); emit()
    if (prevAgyModel !== saved.executorSettings?.antigravity?.model) void refresh().then(() => { if (!busy && !closed) void pump() })
    else if (!busy) void pump()
    return status()
  }
  // Список для «/» в окне и на телефоне: свои команды Джинни + присланные Claude (komandy-claude.mjs).
  const commands = () => ({ at: saved.claudeCommands?.at || null,
    list: commandList(saved.claudeCommands?.list, { executor: core.selectionStatus?.()?.mode || 'auto' }) })
  // Тихий текстовый ход для летописца: та же маршрутизация, что у хода пользователя, без переписки.
  const tekst = turns === nativeLocalTurns ? tekstHod({ repo, route: () => routeFor({ content: '', images: [] }),
    settings: () => saved.executorSettings }) : null
  async function checkLogin() { await refresh(); if (!busy) void pump(); return status() }
  async function retry() {
    // Explicit owner action: clear the pause and continue the queue. Unknown messages
    // are never re-sent; only the messages prepared after them are dispatched.
    if (!busy) { paused = false; error = '' }
    await refresh(); if (!busy) void pump(); return status()
  }
  async function feedback(data) {
    const task = saved.currentTask
    if (!['accepted', 'rework'].includes(data.feedback) || !task || task.task_id !== data.taskId || task.status === 'running') throw new Error('Нет завершённой задачи для оценки')
    const journal = chronicleBridge({ root: repo, engine: executor })
    const result = await journal.record({ ...task, event_type: 'task.feedback', message_id: task.task_id + ':' + data.feedback,
      feedback: data.feedback, text: data.feedback === 'accepted' ? 'Результат принят владельцем' : 'владелец запросил переделку' })
    await journal.flush(); return { ok: true, status: result.status }
  }
  // The window asks who holds the folder; nothing is taken or changed here.
  async function shiftInfo() {
    try { shift = await core.shiftState() } catch (failure) { shift = { status: 'unknown', error: failure.message } }
    emit(); return { ...shift, provider: status() }
  }
  // Explicit owner action: clear a forgotten shift so the next answer may write again.
  async function releaseShift() {
    if (busy) throw new Error('Сначала дождись конца текущего ответа, потом снимай смену')
    const result = await core.releaseForeign()
    shift = null; waiting = ''; readOnly = false; writer = null
    emit(); if (!closed) void pump()
    return { ...result, provider: status() }
  }
  async function stop() {
    if (stopping || expediting || reordering) throw new Error('Остановка уже выполняется или очередь меняется')
    if (!busy) throw new Error('Сейчас нечего останавливать')
    if (!child || !job) throw new Error('Исполнитель ещё запускается. Попробуй через несколько секунд')
    stopping = true
    const running = job, process = child
    const active = saved.queue.find(value => value.state === 'sending' && !value.parentId)
    try {
      if (active) active.ownerInterrupted = true
      if (process.kill() === false) throw new Error('Не удалось остановить текущий ответ')
      await running
      if (process.exitCode == null && process.signalCode == null) throw new Error('Остановка исполнителя не подтверждена')
      const batch = randomUUID()
      for (const input of saved.queue.filter(value => value.state === 'prepared')) input.flushBatch = batch
      paused = false
      await persist()
    } catch (failure) {
      paused = true; error = failure.message
      throw failure
    } finally { stopping = false; emit() }
    await pump()
    return status()
  }
  // This interval runs ordinary code only. No task means no model invocation.
  const timer = setInterval(() => { if (!closed) void pump() }, pollMs); timer.unref()
  // Refresh subscription metadata, never invoke a model just to update the phone's limits.
  const quotaTimer = setInterval(() => { if (!closed) void refresh() }, quotaPollMs); quotaTimer.unref()
  void refresh().then(() => {
    if (closed) return
    // Startup only: launch CLI without a prompt, never call a model on the quota timer.
    const selection = core.selection?.options?.() || {}
    if (turns === nativeLocalTurns && ACTIVE.includes('claude') && ['auto', 'claude'].includes(selection.preference)) {
      const row = core.registry.list().find(record => record.executor === 'claude')
      if (eligibility(row, selection).eligible) {
        try {
          warmClaude({ cwd: repo, ...saved.executorSettings.claude })
          const talk = conversationSession(saved.conversation, { executor: 'claude', exists: id => claudeSessionSaved(repo, id) })
          if (talk.session) warmClaude({ cwd: repo, ...saved.executorSettings.claude, thread: talk.session })
        }
        catch (error) { hod({ text: 'Прогрев Claude не выполнен: ' + error.message, at: Date.now() }) }
      }
    }
    void pump()
  })
  return { status, enqueue, delivery, expedite, cancelTask, taskBoard, reorderTasks, compactContext, compactStatus, commands, tekst, settings, checkLogin, retry, feedback, shiftState: shiftInfo, releaseShift, stop,
    permission: async () => { throw new Error('Разрешения определяются настройками native CLI') },
    login: () => ({ ...status(), error: 'Вход выполняется штатной командой Codex или Claude Code на ноутбуке.' }),
    close: async () => { closed = true; clearInterval(timer); clearInterval(quotaTimer); child?.kill(); await job?.catch(() => {}); await compactJob?.catch(() => {}); await refreshing?.catch(() => {}); await writes.catch(() => {}) } }
}
