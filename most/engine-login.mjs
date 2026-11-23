import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, extname, join } from 'node:path'
import { antigravityCommand, antigravityEnv } from './antigravity-cli.mjs'

const states = new Map()

function searchDirs(env = process.env) {
  const appData = env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  const localAppData = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  const rawPath = (env.PATH || env.Path || '').split(delimiter).filter(Boolean)
  return [...new Set([join(appData, 'npm'), join(localAppData, 'Programs'), join(homedir(), '.local', 'bin'), ...rawPath])]
}

function findExecutable(names, env = process.env) {
  for (const dir of searchDirs(env)) {
    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function findQoderExecutable(env = process.env) {
  if (env.DZHINNI_QODER_CLI) return existsSync(env.DZHINNI_QODER_CLI) ? env.DZHINNI_QODER_CLI : null
  const isWin = process.platform === 'win32'
  const fromPath = findExecutable(isWin ? ['qodercli.exe', 'qodercli.cmd', 'qoder.exe', 'qoder.cmd', 'qoder'] : ['qodercli', 'qoder'], env)
  if (fromPath) return fromPath
  if (!isWin || (env.PATH === '' && env.Path === '')) return null
  const localAppData = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  const candidates = [
    env.QODER_HOME ? join(env.QODER_HOME, 'bootstrap', 'qodercli.exe') : '',
    join(localAppData, 'Qoder', 'bootstrap', 'qodercli.exe'),
    join(homedir(), '.qoder', 'bootstrap', 'qodercli.exe'),
    'D:/Tools/Qoder/bootstrap/qodercli.exe',
    'C:/Tools/Qoder/bootstrap/qodercli.exe'
  ].filter(Boolean)
  return candidates.find(candidate => existsSync(candidate)) || null
}

function qoderConfigDir(exe, env = process.env) {
  const candidates = [
    env.DZHINNI_QODER_CONFIG_DIR,
    env.QODER_CONFIG_DIR,
    exe ? join(dirname(dirname(exe)), 'config') : '',
    join(homedir(), '.qoder')
  ].filter(Boolean)
  return candidates.find(dir => existsSync(dir)) || null
}

function probeQoderAuth(exe, env = process.env) {
  const candidates = [
    env.DZHINNI_QODER_CONFIG_DIR,
    env.QODER_CONFIG_DIR,
    exe ? join(dirname(dirname(exe)), 'config') : '',
    join(homedir(), '.qoder')
  ].filter(Boolean)
  for (const dir of candidates) {
    try {
      const userFile = join(dir, '.auth', 'user')
      if (existsSync(userFile) && statSync(userFile).size > 0) return true
    } catch {}
  }
  return false
}

function resolveLoginSpec(engine, env = process.env) {
  const isWin = process.platform === 'win32'
  if (engine === 'claude') {
    const exe = findExecutable(isWin ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude'], env)
    return { exe, args: ['auth', 'login', '--claudeai'], env }
  }
  if (engine === 'codex') {
    const exe = findExecutable(isWin ? ['codex.exe', 'codex.cmd', 'codex'] : ['codex'], env)
    return { exe, args: ['login'], env }
  }
  if (engine === 'antigravity') {
    let exe = null
    try { exe = antigravityCommand(env) } catch { exe = null }
    let childEnv = env
    try { childEnv = antigravityEnv(env) } catch {}
    return { exe, args: ['auth', 'login'], env: childEnv }
  }
  if (engine === 'qoder') {
    const exe = findQoderExecutable(env)
    const cfg = qoderConfigDir(exe, env)
    return { exe, args: cfg ? ['--config-dir', cfg, 'login'] : ['login'], env }
  }
  return null
}

export function probeQoderInstalled(env = process.env) {
  const exe = findQoderExecutable(env)
  if (!exe) return { installed: false, path: null }
  return { installed: true, authenticated: probeQoderAuth(exe, env), path: exe }
}

export function engineLogin(engine, repo, env = process.env) {
  const spec = resolveLoginSpec(engine, env)
  if (!spec) {
    return { running: false, text: '', url: null, error: 'Интерактивный вход поддержан для Claude, Codex, Antigravity и Qoder.' }
  }
  if (!spec.exe) {
    return { running: false, text: '', url: null, error: 'CLI не найден. Сначала выполни команду установки.' }
  }
  const previous = states.get(engine)
  if (previous?.running) return previous
  const state = { running: true, text: '', url: null, error: '' }
  states.set(engine, state)
  const useCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(extname(spec.exe))
  const cmd = useCmd ? (env.ComSpec || 'cmd.exe') : spec.exe
  const args = useCmd ? ['/d', '/c', spec.exe, ...spec.args] : spec.args
  const child = spawn(cmd, args, { cwd: repo, env: spec.env, windowsHide: true, shell: false })
  const output = data => {
    state.text = (state.text + data.toString().replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')).slice(-12000)
    const match = state.text.match(/https:\/\/[^\s"'<>]+/)
    if (match) state.url = match[0]
  }
  child.stdout.on('data', output); child.stderr.on('data', output); child.stdin.end()
  const timer = setTimeout(() => { try { child.kill() } catch {} state.error = 'Время входа истекло; попробуй ещё раз' }, 10 * 60e3)
  child.once('error', error => { state.error = error.message; state.running = false; clearTimeout(timer) })
  child.once('close', code => { state.running = false; clearTimeout(timer); if (code && !state.error) state.error = 'Вход не завершён' })
  return state
}

export const engineLoginStatus = engine => states.get(engine) || { running: false, text: '', url: null, error: '' }
