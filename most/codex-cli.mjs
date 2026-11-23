import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { createInterface } from 'node:readline'

// The TUI and queue must attach to the same daemon, never a private fallback server.
export const CODEX_SHARED_SERVER = 'unix://'

export function codexCommand(env = process.env) {
  if (env.DZHINNI_CODEX_CLI) {
    const cli = env.DZHINNI_CODEX_CLI
    return /\.m?js$/i.test(cli) ? [process.execPath, [cli]] : [cli, []]
  }
  if (process.platform !== 'win32') return ['codex', []]
  const folders = (env.PATH || env.Path || '').split(delimiter)
  if (env.APPDATA) folders.push(join(env.APPDATA, 'npm'))
  for (const folder of folders) {
    const target = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    const packaged = join(folder, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', `codex-win32-${process.arch}`,
      'vendor', `${target}-pc-windows-msvc`, 'bin', 'codex.exe')
    if (existsSync(packaged)) return [packaged, []]
    const script = join(folder, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    if (existsSync(script)) return [process.execPath, [script]]
    const native = join(folder, 'codex.exe')
    if (existsSync(native)) return [native, []]
  }
  throw new Error('Codex CLI не найден. Установи его: npm install -g @openai/codex')
}

export function startCodex(args, options = {}) {
  const [command, prefix] = codexCommand()
  return spawn(command, [...prefix, ...args], { windowsHide: true, ...options, shell: false })
}

export function codexExec({ prompt, cwd, thread, images = [], onEvent = () => {}, onChild = () => {}, timeout = null, readOnly = false, model, env }) {
  return new Promise((resolve, reject) => {
    const args = ['exec', ...(thread ? ['resume', thread] : []), '--json',
      '-c', `sandbox_mode="${readOnly ? 'read-only' : 'danger-full-access'}"`, '-c', 'approval_policy="never"',
      '--skip-git-repo-check', ...(model ? ['--model', model] : []), ...images.flatMap(file => ['--image', file]), '-']
    let child
    try { child = startCodex(args, { cwd, ...(env && { env }) }) } catch (error) { reject(error); return }
    onChild(child)
    let stderr = '', failure = '', completed = false, settled = false, exitTimer
    const result = []
    // Descendants can inherit pipes after the CLI exits: close may never arrive.
    // Exit confirms the process stopped; allow a bounded drain of its JSON output.
    const finish = code => {
      if (settled) return
      settled = true; clearTimeout(timer); clearTimeout(exitTimer)
      child.stdout.destroy(); child.stderr.destroy()
      if (code !== 0 || failure || !completed) reject(new Error(failure || stderr.trim() || `Codex: код ${code}`))
      else resolve(result.join('\n\n').trim())
    }
    // No clock by default; only a caller that asks for one (the diary) gets it.
    const timer = timeout > 0 ? setTimeout(() => {
      failure = 'Codex не ответил вовремя'; child.kill(); finish(child.exitCode)
    }, timeout) : null
    createInterface({ input: child.stdout }).on('line', line => {
      let event
      try { event = JSON.parse(line) } catch { return }
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.phase !== 'commentary') result.push(event.item.text || '')
      if (event.type === 'turn.completed') completed = true
      if (event.type === 'turn.failed') failure = event.error?.message || 'Ход Codex завершился с ошибкой'
      if (event.type === 'error') failure = event.message || 'Ошибка Codex'
      try { onEvent(event) } catch (error) { failure = error.message; child.kill() }
    })
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000) })
    child.stdin.on('error', () => {})
    child.once('error', error => { failure = error.message; finish(child.exitCode) })
    child.once('exit', code => { exitTimer = setTimeout(() => finish(code), 1000) })
    child.once('close', finish)
    child.stdin.end(prompt, 'utf8')
  })
}
