// Гасить дерево процесса, а не только его самого.
// В Windows `spawn(..., { shell: true })` даёт cmd.exe, а claude под ним остаётся сиротой и жжёт лимит.
// ownTree(child) подменяет child.kill на `taskkill /T /F`; не вышло — обычный kill.
import { spawn } from 'node:child_process'

export function ownTree(child, { run = spawn, platform = process.platform } = {}) {
  if (platform !== 'win32' || !Number.isSafeInteger(child?.pid)) return child
  const kill = child.kill.bind(child)
  child.kill = () => {
    if (child.exitCode !== null || child.signalCode !== null) return false
    const stop = run('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, shell: false, stdio: 'ignore' })
    stop.once('error', () => kill()); stop.once('exit', code => { if (code) kill() }); return true
  }
  return child
}
