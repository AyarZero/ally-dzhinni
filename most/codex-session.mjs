import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { codexRpc } from './codex-rpc.mjs'

// A pinned ID, shared by the terminal, the window and the phone. Never exec a second conversation.
export async function codexSession({ repo, storage, start, rpcFactory = codexRpc }) {
  const file = join(storage, 'session.json')
  const rpc = rpcFactory({ cwd: repo, start })
  try {
    let saved
    try { saved = JSON.parse(await readFile(file, 'utf8')) } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (saved?.threadId) {
      const { thread } = await rpc.request('thread/read', { threadId: saved.threadId })
      // The desktop app can change a chat's cwd when it is opened outside a project.
      // Keep the explicit project binding without selecting a different conversation.
      if (resolve(saved.repo || thread.cwd) !== resolve(repo)) throw new Error('Беседа Джинни принадлежит другой рабочей папке')
      return thread
    }
    const list = await rpc.request('thread/list', { cwd: repo, sourceKinds: ['cli'], sortKey: 'updated_at', limit: 1 })
    const thread = list.data?.[0] || (await rpc.request('thread/start', {
      cwd: repo, ephemeral: false, threadSource: 'cli', approvalPolicy: 'never', sandbox: 'danger-full-access',
    })).thread
    await mkdir(storage, { recursive: true })
    await writeFile(file + '.tmp', JSON.stringify({ threadId: thread.id, repo: resolve(repo) }, null, 2), 'utf8')
    await rename(file + '.tmp', file)
    return thread
  } finally { rpc.close() }
}
