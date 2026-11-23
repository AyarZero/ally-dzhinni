import { codexLive } from './codex-live.mjs'

const input = (text, images = []) => [{ type: 'text', text }, ...images.map(path => ({ type: 'localImage', path }))]
const itemTypes = { agentMessage: 'agent_message', commandExecution: 'command_execution',
  fileChange: 'file_change', mcpToolCall: 'mcp_tool_call', reasoning: 'reasoning' }

export function codexTurn({ prompt, cwd, thread, images = [], readOnly = false, model, reasoning = null, env,
  onEvent = () => {}, onChild = () => {}, timeout = null, rpcFactory = codexLive }) {
  return new Promise((resolve, reject) => {
    let rpc, threadId = thread, turnId = null, terminal = false, failure = null, usage = {}, usageBase = null
    const replies = new Map()
    // No clock by default; only an explicit one.
    const timer = timeout > 0 ? setTimeout(() => finish(new Error('Codex не ответил вовремя')), timeout) : null
    let child = null
    const onClose = () => finish(new Error('Служба Codex остановлена'))
    const onError = error => finish(error)
    // The turn ends at turn/completed. A living server (codex-live.mjs) stays for the next turn after a success;
    // after a failure it is closed: the running turn's state is unknown.
    function finish(error = null) {
      if (terminal) return
      terminal = true; turnId = null; failure = error; clearTimeout(timer)
      child?.off('close', onClose); child?.off('error', onError)
      if (error) (rpc?.dispose || rpc?.close)?.call(rpc); else rpc?.close()
      const reply = [...replies.values()].join('\n\n').trim()
      if (failure || !reply) {
        const error = failure || new Error('Codex завершился без подтверждённого ответа')
        // A stopped server must be gone before the runner decides about the writer shift.
        if (failure && child && child.exitCode == null && child.signalCode == null && rpc?.closed) {
          const timer = setTimeout(() => reject(error), 10000)
          child.once('close', () => { clearTimeout(timer); reject(error) })
        } else reject(error)
      }
      else resolve(reply)
    }
    function notification({ method, params = {} }) {
      if (terminal || params.threadId !== threadId) return
      if (method === 'turn/started') {
        turnId = params.turn.id
        onEvent({ type: 'local.input_ready' })
      }
      if (params.turnId && turnId && params.turnId !== turnId) return
      if (['item/started', 'item/completed'].includes(method)) {
        const raw = params.item, type = itemTypes[raw?.type]
        if (type) {
          const item = { ...raw, type, exit_code: raw.exitCode,
            status: ['interrupted', 'declined'].includes(raw.status) ? 'failed' : raw.status }
          onEvent({ type: method.replace('/', '.'), item })
          if (method === 'item/completed' && type === 'agent_message' && raw.phase !== 'commentary') replies.set(raw.id, raw.text)
        }
      }
      if (method === 'thread/tokenUsage/updated') {
        // `last` is one model call; a turn makes many. The turn's usage =
        // thread total now − thread total before the turn's first call; a repeated update does not count twice.
        const last = params.tokenUsage?.last || {}, total = params.tokenUsage?.total
        const keys = [['input_tokens', 'inputTokens'], ['cached_input_tokens', 'cachedInputTokens'], ['output_tokens', 'outputTokens']]
        if (!total) usage = Object.fromEntries(keys.map(([to, from]) => [to, last[from]]))
        else {
          usageBase ||= Object.fromEntries(keys.map(([, from]) => [from, (Number(total[from]) || 0) - (Number(last[from]) || 0)]))
          usage = Object.fromEntries(keys.map(([to, from]) => [to, (Number(total[from]) || 0) - usageBase[from]]))
        }
      }
      if (method === 'turn/completed' && (!turnId || params.turn.id === turnId)) {
        const turn = params.turn
        if (turn.status === 'completed') {
          onEvent({ type: 'turn.completed', usage })
          finish()
        } else finish(new Error(turn.error?.message || 'Ход Codex остановлен: ' + turn.status))
      }
      if (method === 'error' && !params.willRetry) finish(new Error(params.error?.message || 'Ошибка Codex'))
    }
    try {
      rpc = rpcFactory({ cwd, env, onNotification: notification, onFailure: error => finish(error) })
      child = rpc.child
      Object.defineProperty(child, 'canSteer', { configurable: true, get: () => !!turnId && !terminal && !rpc.closed })
      child.steer = async ({ content, images: attachments, id }) => {
        if (!child.canSteer) return { accepted: false }
        const expectedTurnId = turnId
        try {
          const ack = await rpc.request('turn/steer', { threadId, expectedTurnId,
            input: input(content, attachments), clientUserMessageId: id })
          if (ack.turnId !== expectedTurnId) throw new Error('Codex подтвердил другой ход')
          return { accepted: true }
        } catch (error) {
          if ([-32600, -32601, -32602].includes(error.rpcCode)) return { accepted: false }
          throw error
        }
      }
      child.once('close', onClose)
      child.once('error', onError)
      onChild(child)
      void (async () => {
        const started = await rpc.request(thread ? 'thread/resume' : 'thread/start', {
          ...(thread && { threadId: thread }), cwd, model,
          sandbox: readOnly ? 'read-only' : 'danger-full-access', approvalPolicy: 'never' })
        threadId = started.thread.id
        onEvent({ type: 'thread.started', thread_id: threadId })
        const startedTurn = await rpc.request('turn/start', { threadId, input: input(prompt, images), ...(reasoning && { effort: reasoning }) })
        if (!terminal) { turnId = startedTurn.turn.id; onEvent({ type: 'local.input_ready' }) }
      })().catch(finish)
    } catch (error) { finish(error) }
  })
}
