import { open, readFile, rm } from 'node:fs/promises'

// Pure decisions: timestamps saved by an older process never establish quota freshness.
export function quotaDecision(resource, now = Date.now(), maxAge = 90000) {
  if (!resource || resource.error || !Number.isFinite(resource.limitsAt) ||
      resource.limitsAt > now || now - resource.limitsAt > maxAge ||
      !Array.isArray(resource.limits) || !resource.limits.length ||
      resource.limits.some(win => !Number.isFinite(win.percent) || win.percent < 0)) {
    return { allowed: false, reason: 'quota_unknown', at: null }
  }
  const blocked = resource.limits.filter(win => win.percent >= 100)
  if (!blocked.length) return { allowed: true, reason: 'quota_clear', at: null }
  return { allowed: false, reason: 'quota_blocked', at: blocked.every(win => Number.isFinite(win.resetsAt))
    ? Math.max(...blocked.map(win => win.resetsAt)) : null }
}

export function resumeDecision(saved, resource, now = Date.now()) {
  if (saved.resumeInFlight) return { allowed: false, reason: 'resume_in_flight' }
  if (!saved.paused || !saved.queue?.length) return { allowed: false, reason: 'no_paused_work' }
  if (!['quota', 'delivery_wait'].includes(saved.pauseReason)) return { allowed: false, reason: 'manual_pause' }
  return quotaDecision(resource, now)
}

// An absent marker is evidence only, never permission to replay an old delivery.
export async function inspectDelivery(delivery, chunkSize = 512 * 1024) {
  if (!delivery?.path || typeof delivery.marker !== 'string' || !delivery.marker ||
      !Number.isSafeInteger(delivery.offset) || delivery.offset < 0) return 'unknown'
  let file
  try {
    file = await open(delivery.path, 'r')
    const info = await file.stat()
    if (!info.isFile() || info.size < delivery.offset) return 'unknown'
    const marker = Buffer.from(delivery.marker)
    let position = delivery.offset, tail = Buffer.alloc(0)
    while (position < info.size) {
      const buffer = Buffer.alloc(Math.min(chunkSize, info.size - position))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, position)
      if (!bytesRead) return 'unknown'
      position += bytesRead
      const data = Buffer.concat([tail, buffer.subarray(0, bytesRead)])
      if (data.includes(marker)) return 'found'
      tail = data.subarray(Math.max(0, data.length - marker.length + 1))
    }
    return 'absent'
  } catch { return 'unknown' } finally { await file?.close().catch(() => {}) }
}

export async function removeOwnedTerminal(file, pid) {
  if (!Number.isInteger(pid)) return
  try {
    const record = JSON.parse(await readFile(file, 'utf8'))
    if (record.pid === pid) await rm(file, { force: true })
  } catch { /* Missing or unreadable ownership must not remove another launcher. */ }
}

export function deliveryAction({ shared, delivery, consumer = false }) {
  if (delivery) return shared ? 'observe' : 'blocked_delivery'
  return shared && !consumer ? 'consumer_required' : 'send'
}
