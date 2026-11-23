import { open, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { startCodex, CODEX_SHARED_SERVER } from './codex-cli.mjs'
import { codexSession } from './codex-session.mjs'

// Parse the terminal's own rollout, ignoring replies to other messages/turns.
export class SharedReply {
  constructor(marker, onEvent = () => {}) { this.marker = marker; this.onEvent = onEvent; this.parts = [] }
  accept(event) {
    const p = event.payload || {}
    if (event.type === 'event_msg' && p.type === 'task_started') this.activeTurn = p.turn_id
    if (event.type === 'event_msg' && p.type === 'user_message' && p.message?.includes(this.marker)) {
      this.matched = true; this.turn = this.activeTurn
    }
    // Current paginated rollouts persist the input as a response_item, without user_message.
    if (event.type === 'response_item' && p.type === 'message' && p.role === 'user' &&
      (p.content || []).some(part => part.text?.includes(this.marker))) {
      this.matched = true; this.turn = this.activeTurn
    }
    if (!this.matched) return
    if (event.type === 'response_item' && p.type === 'message' && p.role === 'assistant') {
      const text = (p.content || []).map(part => part.text || '').join('')
      if (p.phase === 'commentary') this.onEvent({ type: 'item.completed', item: { type: 'agent_message', phase: 'commentary', text } })
      else this.parts.push(text)
    }
    if (event.type === 'event_msg' && p.type === 'task_complete' && (!this.turn || p.turn_id === this.turn)) {
      this.done = true; this.reply = this.parts.join('\n\n') || p.last_agent_message || ''
    }
    if (event.type === 'event_msg' && p.type === 'turn_aborted' && (!this.turn || p.turn_id === this.turn)) {
      throw new Error('Ход в терминале Codex прерван. Сообщение уже доставлено; повторно не отправляю.')
    }
    if (event.type === 'event_msg' && p.type === 'error') {
      throw new Error(p.message || 'Ошибка общей сессии Codex; проверь терминал')
    }
  }
}

async function queueMessage(start, args, cwd, onChild) {
  return new Promise((resolve, reject) => {
    const child = start(args, { cwd })
    onChild(child)
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Нет подтверждения от очереди Codex за 30 секунд')) }, 30000)
    child.stdout.on('data', data => { output = (output + data).slice(-4000) })
    child.stderr.on('data', data => { output = (output + data).slice(-4000) })
    child.stdin.end()
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(output || `Codex queue: код ${code}`)) })
  })
}

export async function codexSharedTurn({ prompt, cwd, storage, delivery, onDelivery = async () => {},
  onEvent = () => {}, onChild = () => {}, start = startCodex, session = codexSession, timeout = null, pollMs = 500 }) {
  let cancelled = false, child
  onChild({ kill() { cancelled = true; child?.kill() } })
  if (!delivery) {
    const thread = await session({ repo: cwd, storage, start })
    if (!thread.path) throw new Error('Codex ещё не создал журнал беседы. Открой терминал Джинни и отправь первое сообщение.')
    delivery = { threadId: thread.id, path: thread.path, offset: (await stat(thread.path)).size,
      marker: `[Джинни ${randomUUID()}]`, state: 'prepared' }
    await onDelivery(delivery)
    try {
      await queueMessage(start, ['queue', '--thread', thread.id, '--message', delivery.marker + '\n' + prompt,
        '--remote', CODEX_SHARED_SERVER, '--resume'], cwd, proc => { child = proc })
      delivery.state = 'submitted'
      await onDelivery(delivery)
    } catch (error) {
      delivery.state = 'uncertain'; await onDelivery(delivery)
      throw new Error('Не удалось подтвердить доставку в терминал: ' + error.message + '. Проверь терминал; повторная отправка автоматически отключена.')
    }
  }
  onEvent({ type: 'thread.started', thread_id: delivery.threadId })
  const reply = new SharedReply(delivery.marker, onEvent)
  const decoder = new StringDecoder('utf8')
  let offset = delivery.offset, pending = ''
  // No clock by default: the turn waits for its answer or for «стоп».
  const deadline = timeout > 0 ? Date.now() + timeout : Infinity
  const file = await open(delivery.path, 'r')
  try {
    while (!cancelled && Date.now() < deadline) {
      const size = (await file.stat()).size
      if (size < offset) throw new Error('Журнал общей беседы Codex изменился; проверь терминал')
      if (size > offset) {
        const buffer = Buffer.alloc(Math.min(size - offset, 512 * 1024))
        const { bytesRead } = await file.read(buffer, 0, buffer.length, offset)
        offset += bytesRead; pending += decoder.write(buffer.subarray(0, bytesRead))
        const lines = pending.split('\n'); pending = lines.pop()
        for (const line of lines) {
          let event
          try { event = JSON.parse(line) } catch { continue }
          reply.accept(event)
          if (reply.done) return reply.reply
        }
        continue
      }
      await new Promise(done => setTimeout(done, pollMs))
    }
    throw new Error(cancelled ? 'Наблюдение за терминалом остановлено' : 'Ответ общей сессии пока не получен. Сообщение сохранено; «Продолжить очередь» продолжит ожидание без повторной отправки.')
  } finally { await file.close() }
}
