// Living Claude Code processes: one `claude -p --input-format stream-json` per conversation stays open
// between turns while Jinny works. a fresh process per turn —
// 16.5 s and 41k tokens written to cache (SessionStart hooks, system prompt); the same process on the next
// turns — 6–7 s and under 1k. Idea from the DeepSeek Harness plugin.
// The process belongs to one session and one set of launch settings (model, depth, read-only, network);
// another setting or another session gets its own process. 
// no idle timeout by default; DZHINNI_LIVE_IDLE_MIN turns one on. The limit of living processes stays (3).
// In Jinny every new message is a new task with a new session, so one SPARE process with the last launch
// settings waits for it: hooks and start-up are already done.
// Its SessionStart context is from the moment it was launched. DZHINNI_LIVE_SPARE=0 turns the spare off.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { ownTree } from './derevo.mjs'

const minutes = value => (Number(value) > 0 ? Number(value) * 60e3 : 0)

export function claudePool({ max = Number(process.env.DZHINNI_LIVE_MAX) || 3,
  idleMs = minutes(process.env.DZHINNI_LIVE_IDLE_MIN), spare = process.env.DZHINNI_LIVE_SPARE !== '0', spawnFn = spawn } = {}) {
  const entries = new Set()
  // закрываемый процесс сессии ещё дописывает её файл — второй `--resume` той же сессии
  // ждёт его смерти (не дольше 15 с), иначе в одну беседу пишут двое.
  const dying = new Map()
  const alive = entry => entry.child.exitCode === null && entry.child.signalCode === null
  const markDying = entry => {
    if (!entry.session || !alive(entry) || dying.has(entry.session)) return
    const session = entry.session
    const done = new Promise(resolve => {
      const cap = setTimeout(resolve, 15000); cap.unref?.()
      entry.child.once?.('close', () => { clearTimeout(cap); resolve() })
    }).then(() => { if (dying.get(session) === done) dying.delete(session) })
    dying.set(session, done)
  }
  let spareSpec = null
  const drop = entry => {
    clearTimeout(entry.idle)
    markDying(entry)
    entries.delete(entry)
    if (entry.child.exitCode === null && entry.child.signalCode === null) { try { entry.child.kill() } catch {} }
  }
  // Graceful close: end of input lets Claude finish writing its session file; kill only if it lingers.
  const retire = entry => {
    clearTimeout(entry.idle)
    markDying(entry)
    entries.delete(entry)
    try { entry.child.stdin.end() } catch {}
    setTimeout(() => drop(entry), 10000).unref?.()
  }
  const counted = () => [...entries].filter(entry => !entry.spare)
  const evict = () => {
    const idle = counted().filter(entry => !entry.busy).sort((a, b) => a.lastUsed - b.lastUsed)
    let size = counted().length
    while (size >= max && idle.length) { retire(idle.shift()); size-- }
  }
  // One spare for the latest settings; a spare of older settings is closed.
  const prewarm = () => {
    if (!spare || !spareSpec) return
    for (const entry of [...entries]) if (entry.spare && entry.key !== spareSpec.key) retire(entry)
    if ([...entries].some(entry => entry.spare)) return
    try { launch({ ...spareSpec, asSpare: true }) } catch {}
  }
  function launch({ key, command, args, cwd, env, asSpare = false }) {
    if (!asSpare) evict()
    // kill гасит дерево (хуки, помощники), а не только сам процесс.
    const child = ownTree(spawnFn(command, args, { cwd, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }))
    const entry = { child, key, session: null, busy: !asSpare, spare: asSpare, lastUsed: Date.now(), idle: null, listener: null, stderr: '' }
    entries.add(entry)
    createInterface({ input: child.stdout }).on('line', line => entry.listener?.line(line))
    child.stderr.on('data', data => { entry.stderr = (entry.stderr + data.toString()).slice(-4000) })
    child.stdin.on('error', error => { entry.stderr = (entry.stderr + 'stdin: ' + error.message + '\n').slice(-4000) })
    child.once('error', error => { entries.delete(entry); entry.listener?.error(error) })
    child.once('close', (code, signal) => { clearTimeout(entry.idle); entries.delete(entry); entry.listener?.close(code, signal) })
    return entry
  }
  const api = {
    warm(spec) {
      if (!spare) return
      spareSpec = spec
      prewarm()
    },
    // After a bridge restart or a stopped turn the
    // conversation's own session waits already started (`--resume`, hooks done), so the next message does not
    // pay the cold start.
    warmSession({ key, thread, command, args, cwd, env }) {
      if (!thread) return false
      if (dying.has(thread)) {
        dying.get(thread).then(() => api.warmSession({ key, thread, command, args, cwd, env })).catch(() => {})
        return false
      }
      if ([...entries].some(entry => entry.session === thread && alive(entry))) return false
      const entry = launch({ key, command, args, cwd, env })
      entry.busy = false; entry.session = thread; entry.lastUsed = Date.now()
      return true
    },
    // A free process of the same session and settings, or a new one launched with `args`.
    // `fresh` — launch arguments of a new session with the same settings, for the spare.
    acquire({ key, thread, command, args, fresh = args, cwd, env }) {
      spareSpec = { key, command, args: fresh, cwd, env }
      const ready = !thread && [...entries].find(entry => entry.spare && !entry.busy && entry.key === key &&
        entry.child.exitCode === null && entry.child.signalCode === null)
      if (ready) {
        ready.spare = false; ready.busy = true; ready.lastUsed = Date.now(); ready.stderr = ''
        evict()
        return { entry: ready, reused: true }
      }
      const found = thread && [...entries].find(entry => !entry.busy && entry.key === key && entry.session === thread &&
        entry.child.exitCode === null && entry.child.signalCode === null)
      if (found) {
        clearTimeout(found.idle); found.busy = true; found.lastUsed = Date.now(); found.stderr = ''
        return { entry: found, reused: true }
      }
      // The same session open with other settings would write into one conversation twice.
      for (const entry of [...entries]) if (thread && entry.session === thread && !entry.busy) retire(entry)
      return { entry: launch({ key, command, args, cwd, env }), reused: false }
    },
    release(entry, session) {
      entry.busy = false; entry.listener = null; entry.lastUsed = Date.now()
      if (session) entry.session = session
      prewarm()
      if (!entries.has(entry)) return
      clearTimeout(entry.idle)
      if (!idleMs) return
      entry.idle = setTimeout(() => retire(entry), idleMs)
      entry.idle.unref?.()
    },
    drop,
    // Обещание, которое сбывается, когда прежний процесс этой сессии умер; null — ждать нечего.
    settled: thread => (thread && dying.get(thread)) || null,
    size: () => entries.size,
    sessions: () => [...entries].map(entry => ({ session: entry.session, busy: entry.busy, spare: entry.spare, pid: entry.child.pid })),
    closeAll() { for (const entry of [...entries]) retire(entry) },
  }
  return api
}

export const claudeLive = claudePool()
