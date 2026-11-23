// Только клиентская сборка: запускает собственный мост без задач планировщика владельца.
const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

module.exports = function clientRuntime(here) {
  const root = [path.resolve(here, '..'), path.resolve(here, '../../..')]
    .find(folder => fs.existsSync(path.join(folder, '.ally-client.json')))
  if (!root) throw Error('Не найдено описание пользовательской сборки AllY')
  const config = JSON.parse(fs.readFileSync(path.join(root, '.ally-client.json'), 'utf8'))
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65534) throw Error('Неверный порт AllY')
  let child = null
  function start() {
    if (child && child.exitCode === null && child.signalCode === null) return
    const storage = path.join(root, '.ally-data')
    fs.mkdirSync(storage, { recursive: true })
    const env = { ...process.env }
    // Ярлык пробы может быть запущен из другой Джинни: её история и порты не наследуются.
    for (const key of Object.keys(env)) if (key.startsWith('DZHINNI_')) delete env[key]
    delete env.ELECTRON_RUN_AS_NODE
    Object.assign(env, { ALLY_CLIENT: '1', DZHINNI_REPO: root,
      DZHINNI_PROVIDER: 'direct', DZHINNI_PORT: String(config.port),
      DZHINNI_ENGINE_DATA: storage, DZHINNI_MOBILE_ENABLED: '0' })
    const feedback = config.feedbackUrl
    if (feedback) {
      const address = new URL(feedback)
      if (address.protocol !== 'https:' || address.username || address.password) throw Error('Неверный адрес обратной связи')
      env.DZHINNI_OTZYVY = address.href.replace(/\/$/, '')
    }
    const previewFile=path.join(root,'.ally-preview.json')
    if(fs.existsSync(previewFile))env.DZHINNI_PREVIEW_ANCESTORS=JSON.stringify(JSON.parse(fs.readFileSync(previewFile,'utf8')).origins)
    const out = fs.openSync(path.join(storage, 'server.out.log'), 'a')
    const err = fs.openSync(path.join(storage, 'server.err.log'), 'a')
    try {
      child = spawn('node', [path.join(root, 'most', 'engine-server.mjs')], {
        cwd: root, env, windowsHide: true, shell: false, detached: true, stdio: ['ignore', out, err] })
      const launched = child
      launched.once('error', error => {
        fs.appendFileSync(path.join(storage, 'server.err.log'), error.message + '\n')
        if (child === launched) child = null
      })
      launched.once('exit', () => { if (child === launched) child = null })
      child.unref()
    } finally { fs.closeSync(out); fs.closeSync(err) }
  }
  function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) { child = null; return }
    const pid = child.pid
    child = null
    if (process.platform === 'win32' && pid) {
      spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
    } else if (pid) {
      try { process.kill(pid, 'SIGTERM') } catch {}
    }
  }
  return { root, port: config.port, start, stop }
}
