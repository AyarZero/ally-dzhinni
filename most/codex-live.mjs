// One living `codex app-server` for Jinny's Codex turns instead of a new one per turn (
// "Claude and the other networks stay on while Jinny works"). The server serves any thread; each turn
// subscribes to its notifications and filters by its own thread id. After a success the turn only detaches;
// after a failure, timeout or stop the server is closed, because the state of the running turn is unknown.
import { codexRpc } from './codex-rpc.mjs'

// No idle timeout by default.
const minutes = value => (Number(value) > 0 ? Number(value) * 60e3 : 0)
// Which account the server runs under: another set of OPENAI_/CODEX_ variables gets its own server.
const accountOf = env => env ? Object.keys(env).filter(name => /^(OPENAI|CODEX)_/.test(name)).sort().map(name => name + '=' + env[name]) : null

export function codexLivePool({ idleMs = minutes(process.env.DZHINNI_LIVE_IDLE_MIN), rpcFactory = codexRpc } = {}) {
  let shared = null
  const close = value => { clearTimeout(value.idle); if (shared === value) shared = null; value.rpc.close() }
  function open({ cwd, env, key }) {
    const value = { key, listeners: new Set(), idle: null, rpc: null }
    value.rpc = rpcFactory({ cwd, env,
      onNotification: message => { for (const listener of [...value.listeners]) { try { listener.onNotification(message) } catch (error) { listener.onFailure(error) } } },
      onFailure: error => { if (shared === value) shared = null; clearTimeout(value.idle); for (const listener of [...value.listeners]) listener.onFailure(error) } })
    return value
  }
  const factory = ({ cwd, env, onNotification = () => {}, onFailure = () => {} }) => {
    const key = JSON.stringify([cwd, accountOf(env)])
    if (shared && (shared.rpc.closed || shared.key !== key)) close(shared)
    if (!shared) shared = open({ cwd, env, key })
    const value = shared
    clearTimeout(value.idle)
    const listener = { onNotification, onFailure }
    value.listeners.add(listener)
    const detach = () => {
      if (!value.listeners.delete(listener) || value.listeners.size || !idleMs) return
      value.idle = setTimeout(() => close(value), idleMs)
      value.idle.unref?.()
    }
    return { child: value.rpc.child, get closed() { return value.rpc.closed },
      request: (method, params) => value.rpc.request(method, params),
      close: detach,
      dispose: () => { value.listeners.delete(listener); close(value) } }
  }
  factory.alive = () => !!shared && !shared.rpc.closed
  factory.closeAll = () => { if (shared) close(shared) }
  return factory
}

export const codexLive = codexLivePool()
