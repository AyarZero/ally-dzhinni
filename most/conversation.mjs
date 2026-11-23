// One conversation of Jinny for every network.
// The conversation belongs to Jinny, not to an engine: the chat journal is the truth, engine sessions are a cache.
// - The same engine continues its own session of the conversation while it stays warm and small: its living
//   process and prompt cache make the next message cheap, and it remembers the whole talk, not 6 lines.
// - A switch of engine (limits, manual choice, Auto order) or a ceiling starts a fresh session that gets the
//   conversation packet: who led before and the edge of the shared chat.
// - An engine outside CONTINUES keeps one session per task (reason 'per_task_engine').
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// «предел в 150 тысяч, после которого новая сессия, — не надо так. Автокомпакт на 300–350 тысяч,
// и сессия продолжается, пока Джинни открыта». Каждая новая сессия стоила ~63 тысячи токенов на вход (правила,
// память, навыки, план), а 23 сессии за два дня — больше, чем рост одной. Поэтому по умолчанию потолков нет:
// окно держит сам движок своим автокомпактом (Claude — modelSettings.autoCompactWindow = 350000 в ~/.claude/settings.json).
// Новая сессия остаётся только при смене нейросети и когда прежней нет на диске. Переменные — ручной потолок, если понадобится.
const ceiling = value => Number(value) > 0 ? Number(value) : Infinity
export const ANTIGRAVITY_MAX_CONTEXT = 350000
export const CONVERSATION_LIMITS = {
  maxTurns: ceiling(process.env.DZHINNI_TALK_MAX_TURNS),               // turns of one session before a fresh one
  maxContext: ceiling(process.env.DZHINNI_TALK_MAX_CONTEXT),           // tokens the last turn carried
  maxGapMs: ceiling(process.env.DZHINNI_TALK_GAP_HOURS) * 3600e3,      // a long pause starts a new topic
}
// tokenator = the claude CLI on the reserve route: it resumes its own sessions too (without it every reserve
// message started a fresh session and the lead «forgot» the talk). deepseek = dsh headless with --session-id.
export const CONTINUES = new Set(['claude', 'codex', 'tokenator', 'deepseek', 'antigravity'])

// Claude keeps a session as <config>/projects/<cwd with every non-alphanumeric char as «-»>/<id>.jsonl.
// a turn killed 23 s after start («отправить сейчас») never wrote its file; the bridge still
// recorded its id and the next turn resumed nothing — «прежняя сессия Claude не найдена», the talk was lost.
export function claudeSessionSaved(cwd, id, env = process.env) {
  if (!id || !cwd) return false
  const base = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  return existsSync(join(base, 'projects', String(cwd).replace(/[^A-Za-z0-9]/g, '-'), id + '.jsonl'))
}

// The session of this conversation the engine may continue, or null with the reason for a fresh one.
// exists(id) — optional check that the session is really on disk; a missing one falls back to the previous session.
export function conversationSession(talk, { executor, now = Date.now(), limits = CONVERSATION_LIMITS, exists = null, fresh = false }) {
  if (!CONTINUES.has(executor)) return { session: null, reason: 'per_task_engine' }
  if (fresh) return { session: null, reason: 'asked' }
  let own = talk?.sessions?.[executor]
  if (talk?.lastExecutor && talk.lastExecutor !== executor) return { session: null, reason: 'engine_switch' }
  if (!talk || !own?.id) return { session: null, reason: 'no_session' }
  if (exists && !exists(own.id)) {
    if (own.previous?.id && exists(own.previous.id)) own = own.previous
    else return { session: null, reason: 'session_missing' }
  }
  if (now - (talk.lastAt || 0) > limits.maxGapMs) return { session: null, reason: 'pause' }
  if ((own.turns || 0) >= limits.maxTurns) return { session: null, reason: 'turns' }
  const effectiveMaxContext = executor === 'antigravity'
    ? Math.min(limits.maxContext, ANTIGRAVITY_MAX_CONTEXT)
    : limits.maxContext
  if ((own.context || 0) >= effectiveMaxContext) return { session: null, reason: 'context' }
  return { session: own.id, reason: 'continues' }
}

// Кнопка не нужна: сообщение,
// которое НАЧИНАЕТСЯ словами «новая беседа» / «новый разговор» (или /new, /clear), — с любого устройства — идёт в
// свежую сессию с пакетом беседы; остаток сообщения после этих слов — обычная просьба. Потолков по-прежнему нет.
export function askedFresh(text) {
  return /^\s*(?:\/new|\/clear|нов(?:ая|ую) бесед[ау]|новый разговор)(?![\p{L}\p{N}])/iu.test(String(text || ''))
}

// After a successful turn: the engine's session is the conversation's current one.
export function conversationAfterTurn(talk, { executor, sessionId, continued, usage = {}, now = Date.now() }) {
  const next = { sessions: {}, ...(talk || {}) }
  next.sessions = { ...next.sessions }
  const before = next.sessions[executor]
  const context = Number(usage?.context) || ['input_tokens', 'cache_read_tokens', 'cache_write_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'cached_input_tokens']
    .reduce((sum, key) => sum + (Number(usage?.[key]) || 0), 0)
  // The session it replaces stays one step back: if the new one turns out missing on disk, the talk goes on there.
  const previous = before?.id && before.id !== sessionId ? { id: before.id, turns: before.turns || 0, context: before.context || 0 } : before?.previous
  next.sessions[executor] = { id: sessionId, turns: continued && before?.id === sessionId ? (before.turns || 0) + 1 : 1,
    context: context || before?.context || 0, ...(previous ? { previous } : {}) }
  next.lastExecutor = executor; next.lastAt = now
  return next
}

const WHO = { ty: 'владелец', ya: 'Джинни' }
// The edge of the shared chat for a fresh session: last messages, each trimmed, newest kept whole first.
export function conversationEdge(lines, { maxMessages = 12, maxChars = 9000, perMessage = 900 } = {}) {
  const rows = []
  for (const line of lines.slice(-maxMessages * 2)) {
    let row
    try { row = JSON.parse(line) } catch { continue }
    if (!row || typeof row.text !== 'string' || !row.text.trim()) continue
    const who = (WHO[row.who] || row.who || '?') + (row.who === 'ya' && row.engine ? ` (${row.engine})` : '')
    const text = row.text.trim()
    rows.push(who + ': ' + (text.length > perMessage ? text.slice(0, perMessage) + ' …(обрезано)' : text))
  }
  const kept = []
  let size = 0
  for (const row of rows.slice(-maxMessages).reverse()) {
    if (size + row.length > maxChars && kept.length) break
    kept.unshift(row); size += row.length + 1
  }
  return kept.join('\n')
}

export async function readConversationEdge(storage, options) {
  try { return conversationEdge((await readFile(join(storage, 'chat.jsonl'), 'utf8')).split('\n').filter(Boolean), options) }
  catch { return '' }
}

// The service note a fresh session gets in front of the edge.
export function conversationNote({ executor, talk, reason, storage }) {
  const before = talk?.lastExecutor && talk.lastExecutor !== executor ? ` Предыдущие ходы вела ${talk.lastExecutor}; ты продолжаешь ту же беседу.` : ''
  const why = { asked: 'владелец сам попросил новую беседу', engine_switch: 'смена нейросети', pause: 'долгая пауза', turns: 'беседа длинная — новая сессия',
    context: 'окно контекста наполнилось — новая сессия', no_session: 'начало беседы', session_missing: 'прежняя сессия не сохранилась на диске', per_task_engine: 'сессия на задачу' }[reason] || reason
  return `[Служебный контекст моста Джинни, не слова владельца: одна беседа Джинни, исполнитель ${executor}, свежая сессия (${why}).${before}` +
    ` Текущий запрос выше; ниже край общей беседы; полная история: ${storage}/chat.jsonl.]`
}

// The chronicler's brief for a fresh session:
// the hand-off «где остановились» + ★ decisions of the last days from the chronicle. Data, not instructions.
// `state: false` — «где остановились» уже подан хуком SessionStart (Claude), второй раз его в пакет не кладём.
export async function chronicleBrief(repo, { days = 3, maxChars = 5000, now = Date.now(), state: withState = true } = {}) {
  const parts = []
  if (withState) try {
    const state = (await readFile(join(repo, 'memory/_meta/СОСТОЯНИЕ_продолжить.md'), 'utf8'))
      .replace(/^---[\s\S]*?---\s*/, '').replace(/<!--[\s\S]*?-->/g, '').trim()
    if (state) parts.push('Где остановились (подхват):\n' + state.slice(0, 2600))
  } catch {}
  const decisions = []
  for (let back = days - 1; back >= 0; back--) {
    const day = new Date(now - back * 864e5 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 10)
    let text = ''
    try { text = await readFile(join(repo, 'pamyat/letopis', day + '.md'), 'utf8') } catch { continue }
    for (const block of text.split(/\n(?=## )/)) {
      const head = block.match(/^## (\d\d:\d\d) · ★ РЕШЕНИЕ/)
      if (!head) continue
      const body = block.split('\n').slice(1).filter(line => line.trim() && !line.startsWith('<!--')).join(' ').trim()
      if (body) decisions.push(`${day.slice(8, 10)}.${day.slice(5, 7)} ${head[1]} — ${body.slice(0, 400)}`)
    }
  }
  if (decisions.length) parts.push('Решения последних дней (летописец):\n' + decisions.slice(-15).join('\n'))
  return parts.join('\n\n').slice(0, maxChars)
}
