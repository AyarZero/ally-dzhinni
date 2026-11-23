// Owns only the loopback mobile gateway and its HTTPS tunnel, never a model session.
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createMobileProxy } from './mobile-proxy.mjs'
import { connect } from 'node:net'
import { createMobileEdgeRelay } from './mobile-edge-relay.mjs'
import { sharedMobileProxy } from './mobile-proxy-link.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = process.env.DZHINNI_MOBILE_DATA || 'D:/Cache/DzhinniMobile'
const EXE = process.env.DZHINNI_CLOUDFLARED || join(process.env.USERPROFILE || '', '.local', 'bin', 'cloudflared.exe')
async function control(action, data = {}) {
  const config = JSON.parse(await readFile(join(DATA, 'access.json'), 'utf8'))
  const response = await fetch('http://127.0.0.1:8800/local/' + action, { method: 'POST', headers: {
    'x-mobile-control': config.control, 'content-type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(3000) })
  if (!response.ok) throw new Error('Mobile control unavailable')
  return response.json()
}
export const URL_WAIT_MS = 90000
export async function ensureMobileService() {
  try { return await control('status') } catch {}
  const occupied = await new Promise(resolve => {
    const socket = connect(8800, '127.0.0.1'); socket.setTimeout(1000)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false) })
  })
  if (occupied) throw new Error('Mobile port owner is not confirmed')
  await mkdir(DATA, { recursive: true })
  const out = await open(join(DATA, 'service.out.log'), 'a'), err = await open(join(DATA, 'service.log'), 'a')
  const child = spawn(process.execPath, [join(HERE, 'mobile-service.mjs')], { cwd: HERE, env: process.env,
    detached: true, windowsHide: true, stdio: ['ignore', out.fd, err.fd] })
  child.once('error', () => {}); child.unref(); await out.close(); await err.close()
  return { starting: true }
}
export async function runMobileService({ adopt = null } = {}) {
  await mkdir(DATA, { recursive: true })
  // Bind before starting a tunnel. EADDRINUSE ends a duplicate launcher without touching an existing tunnel.
  const proxy = await createMobileProxy({ dataDir: DATA })
  let network = {}
  try { network = JSON.parse(await readFile(join(DATA, 'network.json'), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') { await proxy.close(); throw error } }
  let edgeRelay = null
  try { if (network.edgeProxyPort) edgeRelay = await createMobileEdgeRelay({ proxyPort: network.edgeProxyPort,
    ensureProxy: network.edgeProxyPort === 18118 ? sharedMobileProxy() : null }) }
  catch (error) { await proxy.close(); throw error }
  let child = null, closed = false, retry = null, adoptedWatch = null, origin = '', failures = 0
  const runtime = async extra => writeFile(join(DATA, 'runtime.json'), JSON.stringify({ pid: process.pid,
    tunnelPid: child?.pid ?? null, origin, edgeVia: edgeRelay ? 'local-http-proxy' : 'direct', ...extra }, null, 2))
  async function start() {
    if (closed) return
    origin = ''; await runtime({ state: 'connecting' })
    child = spawn(EXE, ['tunnel', '--no-autoupdate', '--protocol', 'http2',
      ...(edgeRelay ? ['--edge', edgeRelay.address] : []), '--url', 'http://127.0.0.1:8800'],
      { cwd: DATA, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let text = ''
    const consume = chunk => {
      text = (text + chunk.toString()).slice(-16000)
      const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0]
      if (url && url !== origin) {
        origin = url
        // писалось только после ответа моста. Мост был закрыт → файл навсегда «connecting», хотя
        // туннель жил и телефон работал; по этому файлу дважды ложно объявили «телефон без связи». Адрес есть — ready.
        void runtime({ state: 'ready' }).catch(() => {})
        void control('origin', { origin }).catch(e => runtime({ state: 'ready', bridge: 'не принял адрес: ' + (e?.message || e) }).catch(() => {}))
      }
    }
    child.stdout.on('data', consume); child.stderr.on('data', consume)
    // страховка — нет адреса туннеля за URL_WAIT_MS, гасим туннель, end() перезапустит.
    // (Повод — «connecting» в runtime.json с 00:25 — оказался ложным: файл не обновлялся, телефон работал; см. выше.)
    const own = child
    const noUrl = setTimeout(() => { if (!origin && child === own) own.kill() }, URL_WAIT_MS)
    let ended = false
    const end = () => {
      clearTimeout(noUrl)
      if (ended) return; ended = true; child = null
      if (closed) return
      failures++; void runtime({ state: 'offline' })
      retry = setTimeout(() => { void start().catch(() => {}) }, Math.min(60000, 10000 * failures))
    }
    child.once('error', end); child.once('exit', end)
  }
  const close = async () => { if (closed) return; closed = true; clearTimeout(retry); clearInterval(adoptedWatch); child?.kill(); await proxy.close(); await edgeRelay?.close(); await runtime({ state: 'stopped' }) }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close().finally(() => process.exit(0)) })
  if (adopt) {
    // The maintenance command verifies the existing cloudflared process before handing it over.
    if (!Number.isInteger(adopt.pid) || adopt.pid <= 0 || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(adopt.origin)) throw new Error('Invalid tunnel handover')
    let tunnelAlive = true
    try { process.kill(adopt.pid, 0) } catch { tunnelAlive = false }
    const config = JSON.parse(await readFile(join(DATA, 'access.json'), 'utf8'))
    if (config.origin !== adopt.origin) throw new Error('Tunnel origin changed during handover')
    if (!tunnelAlive) {
      // Windows can close a child with its parent's pipe/job. Restore service, never leave a bound but dead gateway.
      await start()
      return { proxy, close }
    }
    origin = adopt.origin
    child = { pid: adopt.pid, kill: () => { try { process.kill(adopt.pid) } catch {} } }
    await runtime({ state: 'ready', adopted: true })
    adoptedWatch = setInterval(() => {
      try { process.kill(adopt.pid, 0) } catch {
        clearInterval(adoptedWatch); child = null
        if (!closed) void start().catch(() => {})
      }
    }, 5000)
  } else await start()
  return { proxy, close }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--adopt-tunnel')
  const adopt = at < 0 ? null : { pid: Number(process.argv[at + 1]), origin: process.argv[at + 2] }
  runMobileService({ adopt }).catch(error => { process.stderr.write('Mobile gateway failed: ' + (error.code || 'startup') + '\n'); process.exitCode = 1 })
}
