// Byte-preserving CONNECT relay: cloudflared still verifies Cloudflare's TLS certificate.
import net from 'node:net'
import http from 'node:http'

export async function createMobileEdgeRelay({ proxyPort = 18118, target = 'region1.v2.argotunnel.com:7844', port = 0, ensureProxy = null } = {}) {
  if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535) throw new Error('Invalid proxy port')
  const sockets = new Set()
  const server = net.createServer(async local => {
    sockets.add(local)
    local.once('close', () => sockets.delete(local))
    local.on('error', () => {})
    try { await ensureProxy?.() } catch { local.destroy(); return }
    if (local.destroyed) return
    const request = http.request({ host: '127.0.0.1', port: proxyPort, method: 'CONNECT', path: target,
      headers: { host: target }, agent: false })
    const timer = setTimeout(() => { request.destroy(); local.destroy() }, 15000)
    local.once('close', () => { clearTimeout(timer); request.destroy() })
    request.once('error', () => { clearTimeout(timer); local.destroy() })
    request.once('response', response => { response.destroy(); clearTimeout(timer); local.destroy() })
    request.once('connect', (response, remote, head) => {
      clearTimeout(timer)
      remote.on('error', () => local.destroy())
      local.once('close', () => remote.destroy())
      remote.once('close', () => local.destroy())
      if (response.statusCode !== 200 || local.destroyed) { remote.destroy(); local.destroy(); return }
      if (head.length) local.write(head)
      local.pipe(remote).pipe(local)
    })
    request.end()
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return { address: `127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => {
    for (const socket of sockets) socket.destroy()
    server.close(resolve)
  }) }
}
