// Native unmodified Claude Code CLI on the user's subscription (never an API key).
// Stream format: system / assistant / user / result, plus
// rate_limit_event with real subscription windows. Verified on CLI 2.1.319.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { claudeCommand, subscriptionEnv } from './local-executor-probes.mjs'
import { isTokenator, tokenatorModel, tokenatorKey, tokenatorEnv, logTokenatorTurn, readAggregatorConfig } from './tokenator.mjs'
import { claudeLive } from './claude-live.mjs'
import { turnLatency } from './turn-latency.mjs'
import { commandAnswer } from './komandy-claude.mjs'

const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob']
const WRITE_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Task', 'Agent', 'WebFetch', 'WebSearch']
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

export function claudeArgs({ thread = null, readOnly = false, model = null, reasoning = null, live = false } = {}) {
  // Read-only is a tool restriction plus no MCP: Jinny speaks while another engine holds the folder.
  // The user's global MCP servers (Playwright, REA…)
  // started with every Jinny process and put their tools into every request; Jinny works with files, shell and
  // agent-browser. DZHINNI_CLAUDE_MCP=1 brings them back.
  const noMcp = readOnly || process.env.DZHINNI_CLAUDE_MCP !== '1' ? ['--mcp-config', '{"mcpServers":{}}', '--strict-mcp-config'] : []
  const tools = [...(readOnly ? ['--tools', ...READ_ONLY_TOOLS] : []), ...noMcp,
    ...(readOnly ? WRITE_TOOLS.flatMap(tool => ['--disallowed-tools', tool]) : [])]
  // Tokenator: CLI gets the bare model id; --effort is Anthropic-only and is not sent.
  const foreign = isTokenator(model)
  // A living process echoes each user message when it takes it (--replay-user-messages): that echo tells
  // whether a message sent during the turn went into this turn or will open the next one (claude-turn liveTurn).
  // Partial messages: the answer reaches the window and the phone while it is being written (claude-draft.mjs).
  const partial = process.env.DZHINNI_CLAUDE_PARTIAL !== '0' ? ['--include-partial-messages'] : []
  return ['-p', ...tools, ...(live ? ['--input-format', 'stream-json', '--replay-user-messages'] : []), '--output-format', 'stream-json', '--verbose', ...partial,
    '--permission-mode', readOnly ? 'dontAsk' : 'bypassPermissions',
    ...(model ? ['--model', foreign ? tokenatorModel(model) : model] : []),
    ...(!foreign && CLAUDE_EFFORTS.includes(reasoning) ? ['--effort', reasoning] : []),
    ...(thread ? ['--resume', thread] : [])]
}

// Hooks of the user's own Claude still run (guards, memory). The chronicle hook stays
// silent: the bridge records this turn itself, otherwise every turn is written twice.
export function claudeEnv(env = process.env) {
  return { ...subscriptionEnv(env), DZHINNI_TURN: '1', PYTHONUTF8: '1' }
}

// Structured signals only: model text never decides a quota claim.
export function claudeFailure(result, rateLimit) {
  if (rateLimit?.status === 'rejected') {
    return { kind: 'quota_exhausted', resetAt: Number.isSafeInteger(rateLimit.resetsAt) ? rateLimit.resetsAt * 1000 : null }
  }
  const status = result?.api_error_status
  if (status === 401) return { kind: 'authentication', status }
  if (status === 429) return { kind: 'rate_limited', status }
  if (status === 529 || status === 503) return { kind: 'service_transient', status }
  return { kind: 'transport_unknown' }
}

function withAttachments(prompt, images) {
  if (!images.length) return prompt
  return prompt + '\n\n[Вложения владельца — открой каждое инструментом Read]\n' + images.map(path => '- ' + path).join('\n')
}

// «No conversation found» comes as a result with num_turns 0 before any tool ran,
// so starting a fresh session repeats no action. Idea from the DeepSeek Harness plugin:
// a lost session must not block every continuation of the task.
const MISSING_SESSION = /No conversation found/i
export function isMissingSession(result, stderr = '') {
  const errors = Array.isArray(result?.errors) ? result.errors.map(String) : []
  return (result?.is_error === true && (result.num_turns ?? 0) === 0 && errors.some(text => MISSING_SESSION.test(text))) ||
    (!result && MISSING_SESSION.test(stderr))
}

// resumeFallback() returns the tail of the previous conversation (text) for the fresh session; may be absent.
export async function claudeTurn(args) {
  try {
    return await claudeTurnOnce(args)
  } catch (error) {
    if (!args.thread || error?.claude?.missingSession !== true) throw error
    let tail = ''
    try { tail = String(await args.resumeFallback?.() || '').slice(-4000) } catch {}
    try { args.onEvent?.({ type: 'claude.resume_missing', thread_id: args.thread }) } catch {}
    const notice = '[Служебное примечание моста Джинни, не слова владельца: прежняя сессия Claude не найдена, продолжаю в новой.' +
      (tail ? ' Ниже край прежней переписки.]\n' + tail : ']')
    return claudeTurnOnce({ ...args, thread: null, prompt: args.prompt + '\n\n' + notice })
  }
}

// One turn's view of the stream: the same parser serves a one-shot process and a living one.
// command: name of a «/» command sent as is (komandy-claude.mjs) — its turn may end without the model's text.
function turnReader({ prompt, thread, model, foreign, startedAt, cwd, readOnly, onEvent, stop, command = null }) {
  // sent/echoed: user messages written into a living process during this turn and the ones it has taken.
  const state = { session: '', messages: [], lastResult: null, rateLimit: null, completed: false, finalText: '', sent: 1, echoed: 0,
    compacted: null, compactError: null, commandOutput: '' }
  const emit = event => { try { onEvent(event) } catch (error) { stop(error.message) } }
  // Speed/quality evidence for пользователь's Tokenator report: one journal row per finished turn.
  const journal = (ok, extra) => {
    if (!foreign) return
    const usage = state.lastResult?.usage || {}
    void logTokenatorTurn(cwd, { model: tokenatorModel(model), ok, readOnly,
      seconds: Math.round((Date.now() - startedAt) / 100) / 10, apiSeconds: state.lastResult?.duration_api_ms ? state.lastResult.duration_api_ms / 1000 : null,
      turns: state.lastResult?.num_turns ?? null, input: usage.input_tokens ?? null, output: usage.output_tokens ?? null,
      prompt: prompt.slice(0, 160), ...extra }).catch(() => {})
  }
  // Returns 'done' when a successful result closed the turn.
  const line = raw => {
    raw = raw.replace(/^﻿/, '')
    if (!raw.trim()) return null
    let event
    try { event = JSON.parse(raw) } catch { stop('Claude: некорректный JSON в потоке'); return null }
    if (!event || typeof event !== 'object') { stop('Claude: некорректное событие'); return null }
    if (typeof event.session_id === 'string' && event.session_id && event.session_id !== state.session) {
      state.session = event.session_id
      emit({ type: 'thread.started', thread_id: state.session })
    }
    if (event.type === 'rate_limit_event') {
      state.rateLimit = event.rate_limit_info || null
      emit({ type: 'claude.quota', info: state.rateLimit, at: Date.now() })
    }
    // A replayed user message has string content; tool results come as user events with a block array.
    if (event.type === 'user' && typeof event.message?.content === 'string') {
      state.echoed++
      if (state.echoed === 1) emit({ type: 'local.input_ready', evidence: 'claude_user_echo' })
      const output = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/.exec(event.message.content)
      if (output) state.commandOutput = output[1].trim()
    }
    // «/compact»: итог сжатия приходит системными событиями, текста модели нет.
    if (event.type === 'system' && event.subtype === 'compact_boundary') state.compacted = event.compact_metadata || {}
    if (event.type === 'system' && event.subtype === 'status' && event.compact_result === 'failed') state.compactError = String(event.compact_error || 'failed')
    // Список команд Claude для «/» в окне и на телефоне.
    if (event.type === 'system' && event.subtype === 'commands_changed' && Array.isArray(event.commands)) emit({ type: 'claude.commands', commands: event.commands })
    if (event.type === 'assistant') {
      const content = event.message?.content
      const text = Array.isArray(content) ? content.filter(block => block.type === 'text').map(block => block.text || '').join('\n') : ''
      if (text) state.messages.push(text)
    }
    let done = null
    if (event.type === 'result') {
      state.lastResult = event
      if (state.completed) { stop('Claude: повторное завершение хода'); return null }
      if (event.is_error || event.subtype !== 'success') {
        stop(typeof event.result === 'string' && event.result.trim() ? 'Claude: ' + event.result.trim().slice(0, 300)
          : `Claude: ${event.subtype || 'ошибка хода'}`)
      } else {
        state.completed = true; done = 'done'
        state.finalText = typeof event.result === 'string' ? event.result : state.messages.join('\n\n')
        const models = Object.keys(event.modelUsage || {})
        emit({ type: 'local.usage', actualModel: models.length === 1 ? { providerID: foreign ? 'tokenator' : 'anthropic', id: models[0] } : null,
          usage: event.usage || {} })
      }
    }
    emit({ type: 'claude.progress', event })
    return done
  }
  const fail = (error, stderr) => {
    journal(false, { error: String(error.message).slice(0, 300) })
    error.claude = { result: state.lastResult, rateLimit: state.rateLimit, failure: claudeFailure(state.lastResult, state.rateLimit),
      missingSession: !!thread && !state.messages.length && isMissingSession(state.lastResult, stderr) }
    return error
  }
  // The visible answer; null when the turn ended without text.
  const answer = () => {
    let text = state.finalText.trim()
    if (command && (command === 'compact' || !text)) {
      text = commandAnswer({ name: command, compacted: state.compacted, compactError: state.compactError,
        output: state.commandOutput, text: command === 'compact' && (state.compacted || state.compactError) ? '' : text })
    }
    if (!text) return null
    try { onEvent({ type: 'item.completed', item: { type: 'agent_message', text } }) } catch (error) { return error }
    journal(true, { answer: text.slice(0, 300) })
    return text
  }
  // A message sent mid-turn after the CLI had already finished: it opens the next turn of the same process.
  // The answer so far is delivered; the turn goes on until the result that follows the last sent message.
  const proceed = () => { state.completed = false; state.messages = []; state.finalText = ''; state.commandOutput = '' }
  return { state, line, fail, answer, proceed }
}

function launchSettings({ model, env, cwd }) {
  const foreign = isTokenator(model)
  const [command, prefix] = claudeCommand(env)
  const cfg = foreign ? readAggregatorConfig({ repo: cwd, env }) : {}
  const childEnv = foreign ? tokenatorEnv(claudeEnv(env), model, tokenatorKey({ env, repo: cwd }), cfg.baseUrl) : claudeEnv(env)
  return { foreign, command, prefix, childEnv }
}

function checkInput(prompt, images) {
  if (!Array.isArray(images) || images.length > 20 || images.some(path => typeof path !== 'string' || !existsSync(path))) {
    return new Error('Claude: вложение не найдено или неверен список изображений')
  }
  if (typeof prompt !== 'string' || !prompt.trim()) return new Error('Claude: пустой запрос')
  return null
}

function claudeTurnOnce(args) {
  return args.live ? liveTurn(args) : oneShotTurn(args)
}

// a flat 30 min from the start killed a working turn (tests running, replies going) and the
// answer was lost. 
// so a turn has NO clock by default: it ends at its answer or at «стоп». A clock exists only when a caller
// passes one (tests) or DZHINNI_CLAUDE_IDLE_MIN / DZHINNI_CLAUDE_MAX_MIN are set by hand.
// The clock's own stop: the session is whole on disk, so the conversation goes on in it (local-task-runner).
export const TURN_CLOCK_STOP = /^(Claude не ответил вовремя|Ход Claude идёт дольше)/
export function turnClock(stop, { timeout = null, maxMs = null, env = process.env } = {}) {
  const idle = Number(env.DZHINNI_CLAUDE_IDLE_MIN) * 60e3 || timeout
  const cap = Number(env.DZHINNI_CLAUDE_MAX_MIN) * 60e3 || maxMs
  const minutes = ms => ms >= 60e3 ? Math.round(ms / 60e3) + ' мин' : Math.round(ms / 1e3) + ' с'
  let quiet = null
  const kick = () => {
    if (!(idle > 0)) return
    clearTimeout(quiet)
    quiet = setTimeout(() => stop(`Claude не ответил вовремя: ${minutes(idle)} без единого события, ход остановлен`), idle)
  }
  const far = cap > 0 ? setTimeout(() => stop(`Ход Claude идёт дольше ${minutes(cap)} — остановлен`), cap) : null
  kick()
  return { kick, clear() { clearTimeout(quiet); clearTimeout(far) } }
}

function oneShotTurn({ prompt, cwd, thread, images = [], readOnly = false, model = null, reasoning = null,
  onEvent = () => {}, onChild = () => {}, timeout = null, maxMs, env = process.env, command = null }) {
  const invalid = checkInput(prompt, images)
  if (invalid) return Promise.reject(invalid)
  return new Promise((resolve, reject) => {
    let launch, child
    try { launch = launchSettings({ model, env, cwd }) } catch (error) { reject(error); return }
    try {
      child = spawn(launch.command, [...launch.prefix, ...claudeArgs({ thread, readOnly, model, reasoning, live: !!command })],
        { cwd, env: launch.childEnv, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) { reject(error); return }
    let failure = '', stderr = '', settled = false
    const stop = message => { failure ||= message; child.kill() }
    const reader = turnReader({ prompt, thread, model, foreign: launch.foreign, startedAt: Date.now(), cwd, readOnly, onEvent, stop, command })
    const clock = turnClock(stop, { timeout, maxMs, env })
    const finish = (error, text) => {
      if (settled) return
      settled = true; clock.clear()
      if (error) reject(reader.fail(error, stderr)); else resolve(text)
    }
    createInterface({ input: child.stdout }).on('line', line => { clock.kick(); reader.line(line) })
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000) })
    child.stdin.on('error', error => { stderr = (stderr + 'stdin: ' + error.message + '\n').slice(-4000) })
    child.once('error', error => finish(error))
    child.once('close', (code, signal) => {
      if (failure || code !== 0 || !reader.state.completed) {
        finish(new Error(failure || stderr.trim().slice(-500) || (signal ? `Claude отменён (${signal})` : `Claude: незавершённый ход, код ${code}`)))
        return
      }
      const text = reader.answer()
      if (text instanceof Error) finish(text)
      else if (!text) finish(new Error('Claude завершил ход без текста ответа'))
      else finish(null, text)
    })
    try { onChild(child) } catch (error) { stop(error.message) }
    child.stdin.end(command ? JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } }) + '\n'
      : withAttachments(prompt, images), 'utf8')
  })
}

export function afterExit(child, done) {
  if (!child || child.exitCode !== null || child.signalCode !== null) { done(); return }
  const timer = setTimeout(done, 10000)
  child.once('close', () => { clearTimeout(timer); done() })
}

// The turn is over at its result event; the process stays for the next message of the same session.
// Any failure, timeout or stop retires the process: its state is no longer known.
function liveSpec({ cwd, thread, readOnly = false, model = null, reasoning = null, env = process.env }) {
  const launch = launchSettings({ model, env, cwd })
  const fresh = [...launch.prefix, ...claudeArgs({ readOnly, model, reasoning, live: true })]
  const key = JSON.stringify([launch.command, claudeArgs({ readOnly, model, reasoning, live: true }), cwd, launch.foreign ? model : 'subscription'])
  return { launch, key, thread, command: launch.command,
    args: [...launch.prefix, ...claudeArgs({ thread, readOnly, model, reasoning, live: true })], fresh, cwd, env: launch.childEnv }
}
// after the result a living CLI can wake again by itself — a background command it started
// has finished — and answer once more. The pool dropped the listener on release, so the answer was lost
//. Now a released process keeps a late listener that hands each such
// answer to the sink the bridge installs (chat as a separate message). Only text after a result is late, so nothing
// already delivered goes out twice.
let lateSink = null
export function onLateClaude(fn) { lateSink = typeof fn === 'function' ? fn : null }
export function lateListener(entry, sink = () => lateSink) {
  let texts = []
  return {
    line(raw) {
      let event
      try { event = JSON.parse(String(raw).replace(/^﻿/, '')) } catch { return }
      if (!event || typeof event !== 'object') return
      if (event.type === 'assistant' && !event.parent_tool_use_id) {
        const content = event.message?.content
        const text = Array.isArray(content) ? content.filter(block => block.type === 'text').map(block => block.text || '').join('\n') : ''
        if (text) texts.push(text)
      }
      if (event.type !== 'result') return
      const text = (event.subtype === 'success' && typeof event.result === 'string' && event.result.trim() ? event.result : texts.join('\n\n')).trim()
      texts = []
      const deliver = sink()
      if (text && deliver) { try { deliver({ session: entry.session, text, usage: event.usage || {} }) } catch {} }
    },
    error() {}, close() {},
  }
}

export function warmClaude({ pool = claudeLive, thread = null, ...options }) {
  if (isTokenator(options.model) || process.env.DZHINNI_CLAUDE_LIVE === '0') return false
  const spec = liveSpec({ ...options, thread })
  // The conversation's session: its own process waits with --resume (claude-live warmSession).
  if (thread) return pool.warmSession ? pool.warmSession(spec) : false
  pool.warm({ ...spec, args: spec.fresh })
  return true
}
// прежний процесс той же сессии ещё умирает — второй `--resume` ждёт его (claude-live settled).
function liveTurn(options) {
  const wait = (options.pool || claudeLive).settled?.(options.thread)
  return wait ? wait.then(() => liveTurnNow(options)) : liveTurnNow(options)
}
function liveTurnNow({ prompt, cwd, thread, images = [], readOnly = false, model = null, reasoning = null,
  onEvent = () => {}, onChild = () => {}, timeout = null, maxMs, env = process.env, pool = claudeLive, command = null }) {
  const latency = turnLatency(onEvent)
  const invalid = checkInput(prompt, images)
  if (invalid) return Promise.reject(invalid)
  return new Promise((resolve, reject) => {
    let launch, taken
    try {
      const spec = liveSpec({ cwd, thread, readOnly, model, reasoning, env })
      launch = spec.launch
      taken = pool.acquire(spec)
    } catch (error) { reject(error); return }
    const { entry } = taken, child = entry.child
    latency('process_acquired', { reused: taken.reused })
    let failure = '', settled = false
    const stop = message => { failure ||= message; pool.drop(entry) }
    const reader = turnReader({ prompt, thread, model, foreign: launch.foreign, startedAt: Date.now(), cwd, readOnly,
      onEvent: event => {
        if (event.type === 'claude.progress' && event.event?.type === 'stream_event' && !event.event.parent_tool_use_id) {
          latency('first_stream')
          if (event.event.event?.delta?.type === 'text_delta') latency('first_text')
        }
        onEvent(event)
      }, stop, command })
    const clock = turnClock(stop, { timeout, maxMs, env })
    const finish = (error, text) => {
      if (settled) return
      settled = true; clock.clear()
      // After a failure the runner frees the writer shift only for a process that is really gone, so the
      // answer waits for the close (≤10 s) instead of racing it.
      if (error) { pool.drop(entry); afterExit(child, () => reject(reader.fail(error, entry.stderr))) }
      else { pool.release(entry, reader.state.session); entry.listener = lateListener(entry); resolve(text) }
    }
    // A message that never shows its echo must not hold the turn forever: after an intermediate result
    // the turn waits for the echo this long, then ends on the answer it already has.
    let echoWait = null, lastText = null
    const echoMs = Number(env.DZHINNI_CLAUDE_ECHO_MS) || 60e3
    entry.listener = {
      line(raw) {
        if (settled) return
        latency('first_output')
        clock.kick()
        const step = reader.line(raw)
        // Echo of the last sent message = its turn has started; it may run long tools, so stop waiting.
        if (echoWait && reader.state.echoed >= reader.state.sent) { clearTimeout(echoWait); echoWait = null }
        if (step !== 'done') return
        const text = reader.answer()
        if (text instanceof Error) { finish(text); return }
        // a reused process may be finishing its own late answer — its result must not close the
        // new turn before the new prompt's echo.
        if ((reader.state.sent > 1 || taken.reused) && reader.state.echoed < reader.state.sent) {
          // the message sent
          // during the turn arrived after the CLI had finished; its answer comes as the next result.
          if (text) lastText = text
          reader.proceed()
          clearTimeout(echoWait)
          echoWait = setTimeout(() => { if (lastText) finish(null, lastText); else finish(new Error('Claude завершил ход без текста ответа')) }, echoMs)
          echoWait.unref?.()
          return
        }
        if (!text && !lastText) finish(new Error('Claude завершил ход без текста ответа'))
        else finish(null, text || lastText)
      },
      error: error => finish(error),
      close(code, signal) {
        finish(new Error(failure || entry.stderr.trim().slice(-500) || (signal ? `Claude отменён (${signal})` : `Claude: процесс закрылся, код ${code}`)))
      },
    }
    if (failure) { finish(new Error(failure)); return }
    // Live input (direct-provider steerPending): a message пользователь sends during the turn goes into this process.
    // a message written while a tool runs is taken right after that tool and
    // answered in the same turn; one written after the last step opens the next turn (handled in line()).
    let promptWritten = false
    Object.defineProperty(child, 'canSteer', { configurable: true,
      get: () => promptWritten && !settled && !failure && child.exitCode === null && child.signalCode === null })
    child.steer = async ({ content, images: attachments = [], id }) => {
      if (!child.canSteer) return { accepted: false }
      if (checkInput(content, attachments)) return { accepted: false }
      const text = '[Новое сообщение владельца, пришло во время хода]\n\n' + withAttachments(content, attachments)
      child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n', 'utf8')
      reader.state.sent++
      try { onEvent({ type: 'claude.steered', id }) } catch {}
      return { accepted: true }
    }
    try { onChild(child) } catch (error) { stop(error.message) }
    try {
      child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: withAttachments(prompt, images) } }) + '\n', 'utf8')
      promptWritten = true
      latency('stdin_queued')
    } catch (error) { finish(error) }
  })
}
