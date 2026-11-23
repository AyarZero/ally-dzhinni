// The phone uses the desktop's read-only Codex measurement, never a model turn.
import { liveResource } from './live-resource.mjs'

export function mobileContextReader(read = liveResource, now = Date.now) {
  const cache = new Map()
  return async (repo, provider) => {
    if (!repo || provider.executor !== 'codex' || !provider.threadId) return null
    const key = repo + ':' + provider.threadId
    let entry = cache.get(repo)
    if (!entry || entry.key !== key || now() - entry.at >= 5000) {
      entry = { key, at: now(), promise: Promise.resolve().then(() => read(repo)).catch(() => null) }
      cache.set(repo, entry)
    }
    const resource = await entry.promise
    if (resource?.executor !== 'codex' || resource.threadId !== provider.threadId) return null
    const context = resource.contexts?.find(row => row.threadId === provider.threadId)
    if (!context) return null
    // Do not send the native thread ID or account fields to the phone.
    const { usedTokens, windowTokens, percent, at, model } = context
    return { usedTokens, windowTokens, percent, at, model, source: 'measured' }
  }
}
