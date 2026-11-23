// User-facing native messages go to the shared chat as they arrive, in stream order.
// Tool output and reasoning never enter this channel. The runner still owns task completion.
// Language guard: a message without a single Russian letter is held
// if intermediate and marked if it is the answer, so the rule does not depend on attention.
import { splitOcenka } from './ocenki.mjs'
import { bezMd, apkKartochkami } from './skachat.mjs'
const RUSSIAN = /[А-Яа-яЁё]/
export const NO_RUSSIAN_MARK = '⚠ Сторож моста: в этой реплике нет ни одной русской буквы — исполнитель нарушил правило «писать владельцу по-русски».'
export const hasRussian = text => RUSSIAN.test(text)

// The lead's hidden <ocenka> block never reaches the chat: it goes to onOcenka.
// An intermediate message that opens with the address «пользователь» is an answer. The second such message in one turn is
// the same answer rewritten before the next tool (twelve bubbles «пользователь, вижу проблему…» to one
// question, ). It is held, not shown; if the turn ends on it, finish delivers it.
export const isAddressed = text => /^\s*[*_]*владелец(?![А-Яа-яЁё])/i.test(text) // \b в JS не видит кириллицу
// Claude ended the turn with «You've hit your limit · resets 2:40pm», the language guard held it,
// and пользователь waited four hours without a word. The limit line is the CLI's, not the lead's: it is translated, never held.
// эта строка и limitNotice очереди сказали одно и то же
// через секунду. Очередь молчит, если лимит только что объявлен здесь.
let limitSaidAt = 0
export const limitJustSaid = (now = Date.now(), windowMs = 30 * 60 * 1000) => now - limitSaidAt < windowMs
export function limitPoRusski(text) {
  if (!/hit your .*limit|usage limit|limit reached/i.test(text) || hasRussian(text)) return null
  limitSaidAt = Date.now()
  const m = /resets\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i.exec(text)
  let until = ''
  if (m) {
    let h = +m[1] % 12
    if (/pm/i.test(m[3] || '')) h += 12
    if (!m[3] && +m[1] >= 12) h = +m[1]
    until = ` Обновится в ${String(h).padStart(2, '0')}:${m[2] || '00'}.`
  }
  const which = /week/i.test(text) ? 'Недельный лимит Claude кончился.' : /session|5-hour|five/i.test(text) ? 'Лимит Claude на 5 часов кончился.' : 'Лимит Claude кончился.'
  return which + until + ' Твои сообщения ждут на компьютере, ничего не потеряно. Пиши дальше: после сброса я прочитаю всё накопленное и продолжу работу.'
}
export function localReplies({ say, onHold = () => {}, onOcenka = () => {}, fileExists = () => false, releaseOrigin = '' }) {
  const seen = new Set(), messages = []
  let addressedShown = false
  let delivery = Promise.resolve()
  function send(message) {
    message.held = false
    const text = apkKartochkami(bezMd(message.text, fileExists), fileExists, releaseOrigin)
    const shown = hasRussian(text) ? text : NO_RUSSIAN_MARK + '\n\n' + text
    delivery = delivery.then(() => say(shown))
    // Event callbacks cannot await I/O. finish/flush propagate failures to the runner.
    void delivery.catch(() => {})
    return shown
  }
  const cut = value => {
    const { text, ocenki } = splitOcenka(value)
    for (const ocenka of ocenki) { try { onOcenka(ocenka) } catch {} }
    return text
  }
  function publish(value, key, phase) {
    value = cut(value)
    if (typeof value === 'string') value = limitPoRusski(value) ?? value
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text || seen.has(key || text)) return ''
    seen.add(key || text)
    const message = { text, phase, raw: value, held: false }
    messages.push(message)
    if (phase === 'commentary' && !hasRussian(text)) {
      message.held = true
      try { onHold(text) } catch {}
      return ''
    }
    if (phase === 'commentary' && isAddressed(text)) {
      if (addressedShown) { message.held = true; message.addressedHeld = true; return '' }
      addressedShown = true
    }
    return send(message)
  }
  function finish(value) {
    // The final result repeats the streamed text: its block is the same rating, so it is not counted twice.
    value = splitOcenka(value).text
    if (typeof value === 'string') value = limitPoRusski(value) ?? value
    const text = typeof value === 'string' ? value.trim() : ''
    const all = messages.map(message => message.text).join('\n\n')
    const final = messages.filter(message => message.phase !== 'commentary').map(message => message.text).join('\n\n')
    const rawAll = messages.map(message => message.raw).join('\n\n').trim()
    const rawFinal = messages.filter(message => message.phase !== 'commentary').map(message => message.raw).join('\n\n').trim()
    // CLI results may echo the final message or concatenate every message (no phase field).
    // Neither should create a second bubble containing the whole conversation with ourselves.
    if (text && !messages.some(message => message.text === text) && ![all, final, rawAll, rawFinal].includes(text)) {
      const remainder = all && text.startsWith(all + '\n\n') ? text.slice(all.length + 2) : text
      publish(remainder)
    } else if (messages.at(-1)?.held) {
      // The turn ended on a held message: that is the answer. Deliver it, marked, not lose it.
      send(messages.at(-1))
    }
    // держанное «пользователь, …» терялось, если итог хода совпал с более поздней репликой. Выпускаем
    // последнее держанное обращение (свежая переписка ответа), если его нет в итоге. Ранние переписки им же заменены,
    // их не выпускаем — иначе вернутся «три ответа» ; английские реплики держит сторож языка — тоже не выпускаем.
    const lastAddressed = messages.findLast(message => message.addressedHeld)
    if (lastAddressed?.held && !(text && text.includes(lastAddressed.text))) send(lastAddressed)
    return delivery
  }
  function event(value, executor) {
    if (executor === 'codex' && value.type === 'item.completed' && value.item?.type === 'agent_message') {
      return publish(value.item.text, value.item.id, value.item.phase)
    }
    // DeepSeek Harness: каждое committed-сообщение шага приходит как text (dsh-turn.mjs).
    if (['deepseek','antigravity'].includes(executor) && value.type === 'item.completed' && value.item?.type === 'agent_message') {
      return publish(value.item.text, value.item.id, value.item.phase)
    }
    const stream = executor === 'claude'
    if (stream && value.type === executor + '.progress' && value.event?.type === 'assistant') {
      const raw = value.event, content = raw.message?.content
      // A helper's own messages are its report to the lead, not words to пользователь.
      if (raw.parent_tool_use_id) return ''
      const text = Array.isArray(content) ? content.filter(block => block.type === 'text').map(block => block.text || '').join('\n') : ''
      // Claude streams one message id per content block; the uuid keeps each block distinct.
      return publish(text, (executor === 'claude' ? raw.uuid : null) || raw.message?.id || raw.uuid, 'commentary')
    }
    // Claude also emits a normalized final item on process close. Its result can be an echo.
    if (stream && value.type === 'item.completed' && value.item?.type === 'agent_message') {
      const before = messages.length
      void finish(value.item.text)
      return messages.length > before ? messages.at(-1).text : ''
    }
    return ''
  }
  return { event, finish, flush: () => delivery }
}
