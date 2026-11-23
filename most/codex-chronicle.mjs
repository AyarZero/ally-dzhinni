import { open, readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chronicleBridge, classifyTask } from './chronicle-bridge.mjs'

const keys = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens']
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
const textOf = content => typeof content === 'string' ? content : (Array.isArray(content) ? content : [])
  .filter(part => ['input_text', 'text'].includes(part.type)).map(part => part.text || '').join('\n')

export function codexTurnUsage(before, after) {
  const unknown = { input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_write_tokens: null }
  if (!before || !after) return unknown
  const delta = {}
  for (const key of keys) {
    if (number(before[key]) == null || number(after[key]) == null || after[key] < before[key]) return unknown
    delta[key] = after[key] - before[key]
  }
  // Native Codex input includes cached tokens; portable counters keep them separate.
  const fresh = delta.input_tokens - delta.cached_input_tokens - delta.cache_write_input_tokens
  if (fresh < 0) return unknown
  return { input_tokens: fresh, output_tokens: delta.output_tokens,
    cache_read_tokens: delta.cached_input_tokens, cache_write_tokens: delta.cache_write_input_tokens }
}

// Read-only source observer. It never starts a turn, queues a prompt or touches delivery.
// The cursor contains only offset and small task metadata; the chronicle remains the store.
export async function codexChronicle({ root, storage, thread, record, onChange = () => {},
  pollMs = 3000, bootstrapBytes = 4 * 1024 * 1024, maxReadBytes = 8 * 1024 * 1024, autostart = true }) {
  const cursor = join(storage, 'codex-chronicle.json')
  const bridge = record ? null : chronicleBridge({ root, engine: 'codex' })
  const saveEvent = record || bridge.record
  let state, failure = '', closed = false, pending = null, lastCapture = null
  try {
    state = JSON.parse(await readFile(cursor, 'utf8'))
    if (state.version !== 1 || !Number.isSafeInteger(state.offset) || state.offset < 0) throw new Error('Повреждён курсор летописца Codex')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!state || state.threadId !== thread.id || state.path !== thread.path) {
    const source = await open(thread.path, 'r')
    try {
      const size = (await source.stat()).size, offset = Math.max(0, size - bootstrapBytes)
      state = { version: 1, threadId: thread.id, path: thread.path, offset, skipFirst: offset > 0,
        active: null, totals: null, context: null, malformed: 0 }
    } finally { await source.close() }
  }
  function status() { return { attached: true, threadId: thread.id, offset: state.offset,
    error: failure, lastCapture, malformed: state.malformed || 0 } }
  async function accept(candidate, event) {
    const payload = event.payload || {}, kind = payload.type, at = stamp(event.timestamp)
    if (event.type === 'event_msg' && kind === 'task_started' && payload.turn_id) {
      candidate.active = { id: payload.turn_id, started: at, baseline: candidate.totals,
        models: [], title: '', scheduled: false, sawUsage: false, usageReset: false }
    }
    if (event.type === 'turn_context' && payload.turn_id) {
      candidate.context = { turn: payload.turn_id, model: typeof payload.model === 'string' ? payload.model : null }
      if (candidate.active?.id === payload.turn_id && candidate.context.model &&
        !candidate.active.models.includes(candidate.context.model)) candidate.active.models.push(candidate.context.model)
    }
    if (event.type === 'event_msg' && kind === 'token_count' && payload.info?.total_token_usage) {
      const totals = Object.fromEntries(keys.map(key => [key, number(payload.info.total_token_usage[key])]))
      if (candidate.active) {
        candidate.active.sawUsage = true
        if (candidate.totals && keys.some(key => totals[key] != null && candidate.totals[key] != null &&
          totals[key] < candidate.totals[key])) candidate.active.usageReset = true
      }
      candidate.totals = totals
    }
    const active = candidate.active
    if (active && ((event.type === 'response_item' && kind === 'message' && payload.role === 'user') ||
      (event.type === 'event_msg' && kind === 'user_message'))) {
      const raw = event.type === 'response_item' ? textOf(payload.content) : payload.message
      const prompt = typeof raw === 'string' ? raw.trim() : ''
      if (prompt.startsWith('<heartbeat>') && prompt.includes('<automation_id>')) active.scheduled = true
      else if (!active.title && prompt && !prompt.startsWith('# AGENTS.md instructions') &&
        !prompt.startsWith('<environment_context>')) active.title = prompt.slice(0, 300)
    }
    if (event.type !== 'event_msg' || !['task_complete', 'turn_aborted'].includes(kind) || !payload.turn_id || !at) return
    const task = active?.id === payload.turn_id ? active : null
    const model = task ? (task.models.length === 1 ? task.models[0] : null)
      : (candidate.context?.turn === payload.turn_id ? candidate.context.model : null)
    const base = { engine: 'codex', session_id: thread.id, message_id: payload.turn_id,
      model, occurred_at: at, task_id: task?.scheduled ? null : payload.turn_id }
    // task_complete is authoritative for the final answer even when a Stop hook was missed.
    if (kind === 'task_complete' && typeof payload.last_agent_message === 'string' && payload.last_agent_message.trim()) {
      await saveEvent({ ...base, event_type: 'message', role: 'assistant', text: payload.last_agent_message })
    }
    if (task && !task.scheduled && task.title) {
      const classification = classifyTask(task.title)
      if (task.started) await saveEvent({ ...base, ...classification, event_type: 'task.started',
        occurred_at: task.started, text: task.title, status: 'running' })
      const outcome = kind === 'turn_aborted' ? 'interrupted' : payload.error ? 'failed' : 'succeeded'
      const error = payload.error ? (typeof payload.error === 'string' ? payload.error : payload.error.message || 'Ошибка Codex') : null
      const duration = number(payload.duration_ms) ?? (task.started ? Math.max(0, Date.parse(at) - Date.parse(task.started)) : null)
      await saveEvent({ ...base, ...classification, event_type: 'task.finished', text: task.title,
        status: outcome, outcome, error, duration_ms: duration, cost: null,
        // A model switch or missing/reset baseline cannot be attributed as one measured model turn.
        usage: task.models.length === 1 && task.sawUsage && !task.usageReset
          ? codexTurnUsage(task.baseline, candidate.totals) : codexTurnUsage(null, null) })
    }
    if (task) candidate.active = null
    lastCapture = at
  }
  async function step() {
    const candidate = structuredClone(state), source = await open(thread.path, 'r')
    try {
      const size = (await source.stat()).size
      if (size < state.offset) throw new Error('Журнал Codex сократился; курсор не сброшен автоматически')
      if (size === state.offset) return
      const buffer = Buffer.alloc(Math.min(size - state.offset, maxReadBytes))
      const { bytesRead } = await source.read(buffer, 0, buffer.length, state.offset)
      const end = buffer.subarray(0, bytesRead).lastIndexOf(10)
      if (end < 0) {
        if (bytesRead === maxReadBytes) throw new Error('Запись журнала Codex превышает предел чтения')
        return // Incomplete UTF-8 / JSONL line is reread only when complete.
      }
      const lines = buffer.subarray(0, end + 1).toString('utf8').split('\n')
      if (candidate.skipFirst) { lines.shift(); candidate.skipFirst = false }
      for (const line of lines) {
        if (!line.trim()) continue
        let event
        try { event = JSON.parse(line) } catch { candidate.malformed++; continue }
        if (event && typeof event === 'object') await accept(candidate, event)
      }
      candidate.offset = state.offset + end + 1
      await mkdir(storage, { recursive: true })
      await writeFile(cursor + '.tmp', JSON.stringify(candidate), 'utf8')
      await rename(cursor + '.tmp', cursor)
      state = candidate; failure = ''; onChange()
    } finally { await source.close() }
  }
  function poll() {
    if (closed) return Promise.resolve()
    if (pending) return pending
    pending = step().catch(error => { failure = error.message; onChange() }).finally(() => { pending = null })
    return pending
  }
  const timer = autostart ? setInterval(poll, pollMs) : null
  timer?.unref()
  if (autostart) poll()
  return { poll, status, async close() { closed = true; clearInterval(timer); await pending; await bridge?.flush() } }
}
