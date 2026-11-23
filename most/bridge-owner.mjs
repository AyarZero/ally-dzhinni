// One OS-owned endpoint per canonical storage directory, before recovery or dispatch.
// Windows pipes / Linux abstract sockets disappear when the owning process exits.
import net from 'node:net'
import { mkdir, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export async function claimBridgeStorage(storage) {
  await mkdir(storage, { recursive: true })
  let canonical = await realpath(storage)
  if (process.platform === 'win32') canonical = canonical.toLowerCase()
  const key = createHash('sha256').update(canonical).digest('hex').slice(0, 40)
  const path = process.platform === 'win32' ? '\\\\.\\pipe\\dzhinni-bridge-' + key
    : process.platform === 'linux' ? '\0dzhinni-bridge-' + key
      : join(tmpdir(), 'dzhinni-bridge-' + key + '.sock')
  const server = net.createServer(socket => socket.destroy())
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(Object.assign(new Error(
      'Хранилище Джинни уже занято другим мостом или недоступно: ' + error.code), { code: error.code })))
    server.listen({ path, exclusive: true }, resolve)
  })
  server.unref()
  let closing
  return () => closing ||= new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
