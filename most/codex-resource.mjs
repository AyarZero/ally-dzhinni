import { open } from 'node:fs/promises'
import { codexRpc } from './codex-rpc.mjs'

const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const duration = minutes => minutes === 10080 ? 'Неделя' : minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} ч` : `${minutes} мин`

export function quotaWindows(response) {
  const buckets = Object.values(response.rateLimitsByLimitId || {})
  if (!buckets.length && response.rateLimits) buckets.push(response.rateLimits)
  return buckets.flatMap(bucket => ['primary', 'secondary'].flatMap(key => {
    const win = bucket[key]
    if (!win || !finite(win.usedPercent)) return []
    const name = bucket.limitName || (bucket.limitId === 'codex' ? '' : bucket.limitId)
    return [{ id: `${bucket.limitId || 'codex'}:${key}`, label: [name, finite(win.windowDurationMins) ? duration(win.windowDurationMins) : 'Лимит'].filter(Boolean).join(' · '),
      percent: win.usedPercent, resetsAt: finite(win.resetsAt) ? win.resetsAt * 1000 : null }]
  }))
}

// The last request footprint is context. Lifetime/turn totals are cumulative costs.
// Bound disk reads even when a tool has appended a very large output to the rollout.
export async function readContext(thread) {
  if (!thread?.path) return null
  const file = await open(thread.path, 'r')
  try {
    const info = await file.stat()
    if (!info.isFile()) return null
    const size = Math.min(info.size, 512 * 1024), offset = info.size - size
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await file.read(buffer, 0, size, offset)
    const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n')
    if (offset) lines.shift()
    for (const line of lines.reverse()) {
      let event
      try { event = JSON.parse(line) } catch { continue }
      if (event.type !== 'event_msg' || event.payload?.type !== 'token_count') continue
      const usage = event.payload.info
      const usedTokens = usage?.last_token_usage?.total_tokens
      const windowTokens = usage?.model_context_window
      if (!finite(usedTokens) || !finite(windowTokens) || !windowTokens) continue
      return { threadId: thread.id, model: thread.model, usedTokens, windowTokens,
        percent: usedTokens / windowTokens * 100, at: Number.isFinite(Date.parse(event.timestamp)) ? Date.parse(event.timestamp) : info.mtimeMs }
    }
    return null
  } finally { await file.close() }
}

export function codexResources({ repo, getThread, start, onChange = () => {}, pollMs = 5000, limitsMs = 60000 }) {
  let rpc = null, running = false, closed = false, enabled = false
  let value = { limits: [], limitsAt: null, contexts: [], error: '', contextError: '' }
  const cache = new Map()
  const timer = setInterval(() => { if (enabled) refresh() }, pollMs)
  timer.unref()
  async function refresh() {
    enabled = true
    if (running || closed) return
    running = true
    try {
      if (!rpc || rpc.closed) rpc = codexRpc({ cwd: repo, start })
      if (!value.limitsAt || Date.now() - value.limitsAt >= limitsMs) {
        try {
          const response = await rpc.request('account/rateLimits/read')
          value = { ...value, limits: quotaWindows(response), limitsAt: Date.now(), error: '' }
        } catch { value = { ...value, error: 'Не удалось обновить лимиты Codex' } }
      }
      const threads = []
      const windowId = getThread()
      if (windowId) {
        const result = await rpc.request('thread/read', { threadId: windowId })
        threads.push({ ...result.thread, kind: 'window' })
      }
      const contexts = []
      for (const thread of threads) {
        try {
          const measured = await readContext(thread)
          if (measured) cache.set(thread.id, measured)
          const context = cache.get(thread.id)
          if (context) contexts.push({ ...context, kind: thread.kind })
        } catch { /* A newly created rollout may not be materialized yet. */ }
      }
      value = { ...value, contexts, contextError: '' }
    } catch {
      value = { ...value, contextError: 'Не удалось обновить контекст Codex' }
      rpc?.close(); rpc = null
    } finally { running = false; if (!closed) onChange() }
  }
  function close() { closed = true; clearInterval(timer); rpc?.close() }
  return { status: () => value, refresh, close, pause() { enabled = false } }
}
