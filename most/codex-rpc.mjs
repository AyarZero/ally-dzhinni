import { createInterface } from 'node:readline'
import { startCodex } from './codex-cli.mjs'

export function codexRpc({ cwd, start = startCodex, timeout = 20000, env,
  onNotification = () => {}, onFailure = () => {} }) {
  const child = start(['app-server', '--stdio'], { cwd, ...(env && { env }) })
  const pending = new Map()
  let seq = 0, closed = false
  function failAll(error) {
    if (closed) return
    closed = true
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error) }
    pending.clear()
    onFailure(error)
  }
  function close() { failAll(new Error('Соединение с Codex закрыто')); child.kill() }
  child.stderr.resume()
  child.stdin.on('error', error => failAll(error))
  child.once('error', failAll)
  child.once('close', () => failAll(new Error('Служба данных Codex остановлена')))
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    let message
    try { message = JSON.parse(line) } catch { return }
    if (message.method) {
      if (message.id !== undefined) {
        child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Interactive requests are not supported' } }) + '\n')
        return
      }
      try { onNotification(message) } catch (error) { failAll(error); child.kill() }
      return
    }
    const call = pending.get(message.id)
    if (!call) return
    pending.delete(message.id); clearTimeout(call.timer)
    if (message.error) call.reject(Object.assign(new Error(message.error.message || 'Ошибка протокола Codex'), { rpcCode: message.error.code }))
    else call.resolve(message.result)
  })
  function send(method, params) {
    if (closed) return Promise.reject(new Error('Соединение с Codex закрыто'))
    return new Promise((resolve, reject) => {
      const id = ++seq
      const timer = setTimeout(() => { close() }, timeout)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }
  const ready = send('initialize', { clientInfo: { name: 'dzhinni_resource', title: 'Джинни — ресурс Codex', version: '1.0.0' } })
    .then(() => child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n'))
  return { child, get closed() { return closed }, close,
    async request(method, params = {}) { await ready; return send(method, params) } }
}
