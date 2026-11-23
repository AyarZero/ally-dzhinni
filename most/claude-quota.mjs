// Claude subscription windows as the CLI itself reports them in rate_limit_event.
// A snapshot is evidence only until its window resets; afterwards it is unknown again.
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const claudeQuotaFile = repo => join(repo, 'projects', 'dzhinni', '.core-data', 'claude-quota.json')
const WINDOWS = [['five_hour', 'primary'], ['seven_day', 'secondary']]
export const REJECTED_BEZ_SROKA_MS = 60 * 60e3

export async function saveClaudeQuota(file, info, at = Date.now()) {
  if (!info || typeof info !== 'object') return
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file + '.tmp', JSON.stringify({ at, info }))
  await rename(file + '.tmp', file)
}

export function readClaudeQuota(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

// → observation quota {state, windows}. Only confirmed, not yet reset windows count.
export function claudeQuota(snapshot, now = Date.now()) {
  const info = snapshot?.info
  if (!info || !Number.isSafeInteger(snapshot.at) || snapshot.at > now) return { state: 'unknown', windows: [] }
  const windows = []
  for (const [name, id] of WINDOWS) {
    const win = info.unifiedWindows?.[name]
    const resetAt = Number.isSafeInteger(win?.resetsAt) ? win.resetsAt * 1000 : null
    if (typeof win?.utilization !== 'number' || !resetAt || resetAt <= now) continue
    windows.push({ id, usedPercent: Math.max(0, Math.min(100, Math.round(win.utilization * 1000) / 10)), resetAt, status: win.status })
  }
  // «rejected» без resetsAt держал «исчерпано» навсегда. Такой снимок верен час, потом — неизвестно.
  const rejectedUntil = Number.isSafeInteger(info.resetsAt) ? info.resetsAt * 1000 : snapshot.at + REJECTED_BEZ_SROKA_MS
  if (info.status === 'rejected' && rejectedUntil > now ||
      windows.some(win => win.status === 'rejected' || win.usedPercent >= 100)) {
    return { state: 'exhausted', windows: windows.map(({ status, ...win }) => win) }
  }
  const clean = windows.map(({ status, ...win }) => win)
  return { state: clean.length === 2 ? 'available' : 'unknown', windows: clean }
}
