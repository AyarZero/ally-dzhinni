import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Fixed allowlist: the HTTP endpoint cannot execute an arbitrary command or path.
export async function openEngine({ engine }) {
  if (!['codex', 'claude'].includes(engine)) throw new Error('Неизвестный исполнитель')
  const launcher = join(dirname(fileURLToPath(import.meta.url)), 'dzhinni-hidden.vbs')
  await new Promise((resolve, reject) => {
    const child = spawn('wscript.exe', [launcher, engine], { windowsHide: true, detached: true, stdio: 'ignore' })
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
  })
  return { ok: true }
}
