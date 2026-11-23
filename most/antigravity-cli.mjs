// Antigravity CLI: подписка Google, один процесс на ход, без API-ключа и автоповторов.
import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const HERE = dirname(fileURLToPath(import.meta.url))
export const AGY_DEFAULT_MODEL = 'gemini-4-argon-medium'
export const AGY_CONTEXT_LIMIT = 350000
export const AGY_MODELS = [
  ...['neon','hydrogen'].flatMap(family => ['low','medium','high','xhigh'].map(level =>
    [`gemini-4-${family}-${level}`, `Gemini 4 ${family === 'neon' ? 'Neon' : 'Hydrogen'} · ${level}`])),
  ...['low','medium','high'].map(level => [`gemini-4-argon-${level}`, `Gemini 4 Argon · ${level}`]),
  ['gemini-pro-orchestrator-neon','Orchestrator · Neon'], ['gemini-pro-orchestrator-g1-pro','Orchestrator · Argon'],
  ...['low','medium','high'].map(level => [`gemini-3.8-flash-${level}`, `Gemini 3.8 Flash · ${level}`]),
  ...['opus','sonnet'].flatMap(family => ['low','medium','high'].map(level =>
    [`claude-${family}-5-5-${level}`, `Claude ${family === 'opus' ? 'Opus' : 'Sonnet'} 5.5 · ${level}`])),
  ['gpt-oss-120b-medium','GPT-OSS 120B · medium']
].map(([value,label]) => ({ value,label }))

export function antigravityWindowTokens(model) {
  const id = typeof model === 'string' ? model : model?.id
  return id === 'gpt-oss-120b-medium' ? 128000 : 1000000
}

// По образцу .claude/settings.json: ведущему ходу разрешены все рабочие инструменты без остановок
// в print-режиме, а разрушительные команды заблокированы. Слот permissions позволяет передавать
// дополнительные правила allow/deny/ask напрямую из кода и настроек интерфейса AllY.
export const AGY_READ_ONLY_PERMISSIONS = {
  allow: ['read_file(*)'],
  deny: ['write_file(*)','command(*)','mcp(*)','read_url(*)','execute_url(*)']
}
export const AGY_FULL_PERMISSIONS = {
  allow: ['command(*)','read_file(*)','write_file(*)','mcp(*)','read_url(*)','execute_url(*)'],
  deny: [
    'command(format *)','command(mkfs*)','command(dd *)',
    'command(shutdown *)','command(reboot*)',
    'command(reg delete*)','command(reg add*)',
    'command(git push --force*)','command(git push -f*)',
    'command(git reset --hard*)','command(git clean*)','command(git checkout -- *)'
  ]
}
export function antigravityPermissions({ readOnly = false, permissions = null, env = process.env } = {}) {
  let stored = null
  const file = join(env.DZHINNI_ENGINE_DATA || join(HERE,'.opencode-data'),'antigravity-permissions.json')
  if (existsSync(file)) { try { stored = JSON.parse(readFileSync(file,'utf8')) } catch {} }
  const custom = permissions || stored
  if (readOnly) {
    const extraAllow = Array.isArray(custom?.allow) ? custom.allow.filter(r => String(r).startsWith('read_file(')) : []
    return { allow: [...new Set([...AGY_READ_ONLY_PERMISSIONS.allow, ...extraAllow])], deny: [...AGY_READ_ONLY_PERMISSIONS.deny] }
  }
  const allow = [...new Set([...AGY_FULL_PERMISSIONS.allow, ...(Array.isArray(custom?.allow) ? custom.allow : [])])]
  const deny = [...new Set([...AGY_FULL_PERMISSIONS.deny, ...(Array.isArray(custom?.deny) ? custom.deny : [])])]
  const ask = Array.isArray(custom?.ask) && custom.ask.length ? [...new Set(custom.ask)] : undefined
  return ask ? { allow, deny, ask } : { allow, deny }
}

export function antigravityCommand(env = process.env) {
  const candidates = [env.DZHINNI_AGY_CLI,
    join(env.LOCALAPPDATA || join(env.USERPROFILE || homedir(), 'AppData','Local'), 'agy','bin','agy.exe'),
    ...(env.PATH || env.Path || '').split(delimiter).filter(Boolean).map(folder => join(folder, process.platform === 'win32' ? 'agy.exe' : 'agy'))]
  const exe = candidates.find(value => value && existsSync(value))
  if (!exe) throw new Error('Antigravity CLI не найдена: настрой DZHINNI_AGY_CLI')
  return exe
}

export function antigravityEnv(env = process.env) {
  const out = { ...env }
  for (const key of ['OPENAI_API_KEY','CODEX_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','GEMINI_API_KEY','GOOGLE_API_KEY']) delete out[key]
  let proxy = env.DZHINNI_AGY_PROXY, required = env.DZHINNI_AGY_PROXY_REQUIRED === '1'
  if (proxy === undefined) {
    const file = join(env.DZHINNI_ENGINE_DATA || join(HERE,'.opencode-data'),'antigravity-network.json')
    if (existsSync(file)) {
      const config = JSON.parse(readFileSync(file,'utf8'))
      proxy = config.proxy; required ||= config.required === true
    }
  }
  if (required && !proxy) throw new Error('Antigravity: обязательный прокси не настроен; прямой выход запрещён')
  if (proxy) {
    const parsed = new URL(proxy)
    if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Antigravity: нужен HTTP-прокси без пароля в адресе')
    out.HTTPS_PROXY = out.HTTP_PROXY = parsed.href
    out.NO_PROXY = 'localhost,127.0.0.1,::1'
    delete out.ALL_PROXY; delete out.all_proxy; delete out.http_proxy; delete out.https_proxy
  }
  return out
}

export function antigravityArgs({ thread = null, model = AGY_DEFAULT_MODEL, reasoning, readOnly = false, permissions = null, env = process.env } = {}) {
  if (!AGY_MODELS.some(row => row.value === (model || AGY_DEFAULT_MODEL))) throw new Error('Antigravity: неизвестная модель ' + model)
  const resolvedPermissions = antigravityPermissions({ readOnly, permissions, env })
  return ['--input-format','stream-json','--output-format','stream-json','--mode','accept-edits',
    '--settings',JSON.stringify({ permissions: resolvedPermissions }), '--model', model || AGY_DEFAULT_MODEL,
    ...(reasoning ? ['--effort',reasoning] : []), ...(thread ? ['--conversation',thread] : [])]
}

// Квоты и auth не выводятся из произвольного текста модели.
export function antigravityFailure({ status, error_code } = {}) {
  if (status === 'UNAUTHENTICATED' || error_code === 401) return { kind: 'authentication', status: 401 }
  if (status === 'RESOURCE_EXHAUSTED' || error_code === 429) return { kind: 'rate_limited', status: 429 }
  return { kind: 'transport_unknown' }
}

function withAttachments(prompt, images) {
  if (!images?.length) return prompt
  return prompt + '\n\n[Вложения владельца — открой каждое инструментом read_file]\n' + images.map(path => '- ' + path).join('\n')
}

export function antigravityTurn({ prompt, cwd, thread = null, images = [], readOnly = false, model, reasoning, permissions = null,
  onEvent = () => {}, onChild = () => {}, timeout = null, env = process.env, start = spawn }) {
  if (!Array.isArray(images) || images.length > 20 || images.some(path => typeof path !== 'string' || !existsSync(path))) {
    return Promise.reject(new Error('Antigravity: вложение не найдено или неверен список изображений'))
  }
  const fullPrompt = withAttachments(prompt, images)
  return new Promise((resolve, reject) => {
    let child, result = null, terminalError = null, stderr = '', timer, closeGuard = null, settled = false
    let sent = 1, results = 0, promptWritten = false, stdinClosing = false, lastEnrichedUsage = {}
    const steps = new Map(), tools = new Map(), responses = []
    const actualModel = { providerID: 'antigravity', id: model || AGY_DEFAULT_MODEL }
    const emit = value => { try { onEvent(value) } catch {} }
    const fail = (message, detail = {}) => Object.assign(new Error(message), { antigravity: { ...detail, failure: antigravityFailure(detail) } })
    const finish = (error, text) => {
      if (settled) return
      settled = true; clearTimeout(timer); clearTimeout(closeGuard)
      if (error) reject(error)
      else resolve(text)
    }
    try {
      child = start(antigravityCommand(env), antigravityArgs({ thread, model, reasoning, readOnly, permissions, env }), {
        cwd, env: antigravityEnv(env), windowsHide: true, shell: false, stdio: ['pipe','pipe','pipe'] })
      Object.defineProperty(child, 'canSteer', {
        configurable: true,
        get: () => promptWritten && !settled && !stdinClosing && child.exitCode === null && child.signalCode === null
      })
      child.steer = async ({ content, images: attachments = [], id } = {}) => {
        if (!child.canSteer) return { accepted: false }
        if (!Array.isArray(attachments) || attachments.length > 20 || attachments.some(p => typeof p !== 'string' || !existsSync(p))) {
          return { accepted: false }
        }
        const steeredPrompt = '[Новое сообщение пользователя во время хода]\n\n' + withAttachments(String(content || ''), attachments)
        sent++
        child.stdin.write(JSON.stringify({ event: 'user', message: { content: steeredPrompt } }) + '\n', 'utf8')
        emit({ type: 'antigravity.steered', id })
        return { accepted: true }
      }
      onChild(child)
    } catch (error) { finish(error); return }
    createInterface({ input: child.stdout }).on('line', line => {
      let raw
      try { raw = JSON.parse(line.replace(/^\uFEFF/,'')) } catch { return }
      if (raw.event === 'init') {
        if (raw.conversation_id) emit({ type: 'thread.started', thread_id: raw.conversation_id })
        emit({ type: 'local.latency', stage: 'process_acquired', reused: false })
      }
      if (raw.event === 'step_update') {
        const step = raw.step_update || {}, id = 'agy-' + step.step_index
        if (step.step_type === 'user_input' && step.state === 'DONE') emit({ type: 'local.input_ready' })
        if (step.step_type === 'agent_response') {
          if (typeof step.text_delta === 'string') {
            steps.set(id, (steps.get(id) || '') + step.text_delta)
            emit({ type: 'antigravity.draft', text: steps.get(id) })
          }
          if (step.state === 'DONE' && steps.get(id)) emit({ type: 'item.completed', item: { id, type: 'agent_message', text: steps.get(id), phase: 'commentary' } })
        }
        if (step.step_type === 'tool') {
          const toolName = step.tool_name || step.tool_info?.name || ''
          const toolInput = step.tool_info?.parameters || step.tool_info?.arguments || step.parameters || {}
          const sig = toolName + ':' + JSON.stringify(toolInput)
          if (tools.get(id) !== sig) { tools.set(id, sig); emit({ type: 'item.started', item: { id, type: 'tool_call', name: toolName, input: toolInput } }) }
          if (step.state === 'DONE' || step.state === 'ERROR') emit({ type: 'item.completed', item: { id, type: 'tool_result', status: step.tool_info?.error || step.state === 'ERROR' ? 'failed' : 'completed' } })
        }
      }
      if (raw.event === 'result') {
        result = raw.result
        results++
        const rawUsage = result?.usage || {}
        const totalInput = (Number(rawUsage.input_tokens) || 0) + (Number(rawUsage.cache_read_tokens) || 0)
        const llmSteps = Math.max(1, steps.size + tools.size)
        const contextTokens = Number(rawUsage.context_tokens) || (totalInput > 0 ? Math.round(totalInput / llmSteps) : 0)
        const enrichedUsage = contextTokens > 0 ? { ...rawUsage, context_tokens: contextTokens } : rawUsage
        lastEnrichedUsage = enrichedUsage
        const text = result?.response?.trim()
        if (text) responses.push(text)
        emit({ type: 'local.usage', usage: enrichedUsage, actualModel })
        steps.clear(); tools.clear()
        if (result?.status !== 'SUCCESS' || results >= sent) {
          stdinClosing = true
          try { child.stdin.end() } catch {}
          closeGuard = setTimeout(() => { try { child.kill() } catch {} }, 5000)
          closeGuard.unref?.()
        }
      }
    })
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-8000)
      for (const line of stderr.split('\n')) if (line.startsWith('AGY_ERROR: ')) {
        try { terminalError = JSON.parse(line.slice(11)) } catch {}
      }
    })
    child.once('error', error => finish(fail('Antigravity: ' + error.message)))
    child.once('close', code => {
      const finalText = responses.join('\n\n').trim() || result?.response?.trim() || ''
      if (code !== 0 || result?.status !== 'SUCCESS' || !finalText) {
        finish(fail('Antigravity: ' + (result?.error || terminalError?.short_error || 'нет подтверждённого ответа') + ` (код ${code})`, terminalError || {})); return
      }
      emit({ type: 'turn.completed', usage: lastEnrichedUsage })
      finish(null, finalText)
    })
    child.stdin.on('error', () => {})
    // stdin обходит лимит Windows на длину командной строки и не светит промпт в списке процессов.
    child.stdin.write(JSON.stringify({ event: 'user', message: { content: fullPrompt } }) + '\n', 'utf8')
    promptWritten = true
    if (timeout) timer = setTimeout(() => { child.kill(); finish(fail('Antigravity: время ожидания истекло; исход требует сверки')) }, timeout)
  })
}

export function parseAntigravityQuota(raw = '', model = AGY_DEFAULT_MODEL) {
  let groups = null
  for (const line of String(raw || '').split('\n')) {
    if (!line.trim()) continue
    try {
      const ev = JSON.parse(line.replace(/^\uFEFF/, ''))
      if (ev?.event === 'command_result' && Array.isArray(ev?.command?.data?.groups)) groups = ev.command.data.groups
    } catch {}
  }
  if (!groups?.length) return null
  const buckets = new Map()
  const cleanGroups = groups.map(g => ({
    name: String(g.name || ''),
    buckets: (g.buckets || []).map(b => {
      const rem = Number(b.remaining_fraction)
      const usedPercent = Number.isFinite(rem) ? Math.max(0, Math.min(100, Math.round((1 - rem) * 1000) / 10)) : null
      const parsedReset = b.reset_time ? Date.parse(b.reset_time) : NaN
      const resetAt = Number.isFinite(parsedReset) && parsedReset > 0 ? parsedReset : null
      const row = { id: String(b.id || ''), window: b.window === '5h' ? 'primary' : 'secondary', usedPercent, resetAt }
      if (row.id) buckets.set(row.id, row)
      return row
    })
  }))
  const id = String(model || AGY_DEFAULT_MODEL)
  const is3p = /^(claude-|gpt-oss-)/.test(id)
  const isArgon = /argon|g1-pro/.test(id)
  const primary = is3p ? buckets.get('3p-5h') : buckets.get('gemini-5h')
  const secondary = is3p ? buckets.get('3p-weekly') : isArgon ? (buckets.get('gemini-argon-wtu-weekly') || buckets.get('gemini-weekly')) : buckets.get('gemini-weekly')
  const windows = [
    ...(primary && Number.isFinite(primary.usedPercent) ? [{ id: 'primary', usedPercent: primary.usedPercent, resetAt: primary.resetAt }] : []),
    ...(secondary && Number.isFinite(secondary.usedPercent) ? [{ id: 'secondary', usedPercent: secondary.usedPercent, resetAt: secondary.resetAt }] : [])
  ]
  const exhausted = windows.some(w => w.usedPercent >= 100)
  return { quota: { state: exhausted ? 'exhausted' : windows.length ? 'available' : 'unknown', windows }, groups: cleanGroups }
}

let metadata = null
export function antigravityStatus({ model = AGY_DEFAULT_MODEL, env = process.env, clock = Date.now } = {}) {
  if (metadata && clock() - metadata.at < 45000 && metadata.model === model) return Promise.resolve(metadata.value)
  return new Promise(resolve => {
    let exe, childEnv
    try { exe = antigravityCommand(env); childEnv = antigravityEnv(env) }
    catch { resolve({ installed: false, authenticated: false, quota: { state: 'unknown', windows: [] }, quotaGroups: [] }); return }
    execFile(exe,['-p','/quota','--output-format','stream-json'],{ env:childEnv, windowsHide:true, timeout:20000, maxBuffer:128000 },(qErr,qOut) => {
      const parsed = !qErr && parseAntigravityQuota(qOut, model)
      if (parsed) {
        const value = { installed: true, authenticated: true, quota: parsed.quota, quotaGroups: parsed.groups }
        metadata = { at: clock(), model, value }; resolve(value); return
      }
      execFile(exe,['models'],{ env:childEnv, windowsHide:true, timeout:20000, maxBuffer:64000 },(error,out) => {
        const value = { installed:true, authenticated:!error && /^gemini-[^\t\r\n]+\t/m.test(out || ''), quota:{ state:'unknown', windows:[] }, quotaGroups:[] }
        metadata = { at:clock(), model, value }; resolve(value)
      })
    })
  })
}
