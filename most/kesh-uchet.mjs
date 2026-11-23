// Учёт кэша подсказки по ходам Claude и причина промаха.
// Файл `.opencode-data/kesh-hody.jsonl` (имя папки историческое): одна строка на результат хода Claude.
// Мост ничего не меняет в самом Claude Code CLI — только считает то, что CLI сам сообщает в usage итога хода.
import { appendFile, readFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// TTL кэша: ДОКАЗАТЕЛЬСТВО. В журналах Claude Code (~/.claude/projects/*.jsonl) у каждой
// записи кэша usage.cache_creation = { ephemeral_1h_input_tokens: N, ephemeral_5m_input_tokens: 0 }: подписка пишет
// кэш в ведро на 1 ЧАС. по последним шести журналам: сумма записи в 5m-ведро = 0, в 1h-ведро = 4 313 869
// токенов; те же цифры дал замер ведущей по ходам Джинни и терминала (zamer/agg_out.json). Каждое чтение
// кэша продлевает срок ещё на час, поэтому отсчёт идёт от конца ПОСЛЕДНЕГО запроса хода.
export const KESH_TTL_MS = 60 * 60e3
// Запись в кэш меньше этого — не промах: минимальный размер кэшируемого куска у Anthropic.
export const KESH_MISS_MIN = 1024
export const KESH_FILE = 'kesh-hody.jsonl'
export const keshFile = storage => join(storage, KESH_FILE)
// «smena-modeli» по слову пользователя: беседа всегда на Opus.
export const REASONS = ['compact', 'novyy-process', 'pausa>TTL', 'resume', 'neizvestno']

const num = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)

// usage итога хода → плоские числа. Раздельные ведра берутся, только если CLI их прислал.
export function keshUsage(usage) {
  const u = usage && typeof usage === 'object' ? usage : {}
  const bucket = u.cache_creation && typeof u.cache_creation === 'object' ? u.cache_creation : null
  const m5 = bucket ? num(bucket.ephemeral_5m_input_tokens) : null
  const h1 = bucket ? num(bucket.ephemeral_1h_input_tokens) : null
  return { input: num(u.input_tokens), output: num(u.output_tokens), read: num(u.cache_read_input_tokens),
    creation: num(u.cache_creation_input_tokens) || (m5 || 0) + (h1 || 0), creation_5m: m5, creation_1h: h1 }
}

// Причина промаха или null, если промаха нет (запись мала либо истории ещё не было).
export function keshMiss({ creation, prev, mode, model, compacted = false, pauseMs = null, ttlMs = KESH_TTL_MS }) {
  if (!prev || creation < KESH_MISS_MIN) return null
  if (compacted || prev.compact) return 'compact'
  if (mode === 'novyy-process') return 'novyy-process'
  if (pauseMs != null && pauseMs > ttlMs) return 'pausa>TTL'
  if (mode === 'resume') return 'resume'
  return 'neizvestno'
}

// info: { executor, model, thread, usage, mode, compacted, startedAt, endedAt, context }; prev — прежняя строка этого исполнителя.
export function keshRow(info, prev = null) {
  const u = keshUsage(info.usage)
  const endedAt = info.endedAt ?? Date.now()
  const pauseMs = prev ? Math.max(0, (info.startedAt ?? endedAt) - prev.at) : null
  return { at: endedAt, executor: info.executor, model: info.model || null, thread: info.thread || null,
    input: u.input, cache_creation: u.creation, cache_creation_5m: u.creation_5m, cache_creation_1h: u.creation_1h,
    cache_read: u.read, output: u.output, context: Number.isFinite(info.context) ? info.context : null,
    pause_ms: pauseMs, mode: info.mode || null, compact: !!info.compacted,
    miss: keshMiss({ creation: u.creation, prev, mode: info.mode, model: info.model, compacted: !!info.compacted, pauseMs }) }
}

export async function keshChitat(file, limit = 400) {
  let text = ''
  try { text = await readFile(file, 'utf8') } catch { return [] }
  const rows = []
  for (const line of text.split('\n').slice(-limit - 1)) {
    if (!line.trim()) continue
    try { const row = JSON.parse(line); if (row && Number.isFinite(row.at)) rows.push(row) } catch {}
  }
  return rows.slice(-limit)
}

// Журнал одного файла: записи идут по очереди, прежняя строка исполнителя помнится в памяти.
const journals = new Map()
export function keshJournal(file) {
  if (journals.has(file)) return journals.get(file)
  let chain = Promise.resolve(), last = null
  const journal = {
    zapisat(info) {
      chain = chain.catch(() => {}).then(async () => {
        if (!last) { last = {}; for (const row of await keshChitat(file, 200)) last[row.executor] = row }
        const row = keshRow(info, last[info.executor] || null)
        last[info.executor] = row
        await mkdir(dirname(file), { recursive: true })
        await appendFile(file, JSON.stringify(row) + '\n', 'utf8')
        return row
      })
      return chain
    },
    flush: () => chain.catch(() => {}),
  }
  journals.set(file, journal)
  return journal
}

// Сводка для GET /api/kesh: последние n ходов, итог за сутки и последний ход Claude (от него окно ведёт отсчёт).
export function keshSvodka(rows, { n = 20, now = Date.now(), dayMs = 864e5, ttlMs = KESH_TTL_MS } = {}) {
  const day = rows.filter(row => now - row.at < dayMs)
  const sum = key => day.reduce((total, row) => total + num(row[key]), 0)
  const by = {}
  for (const row of day) if (row.miss) {
    by[row.miss] ||= { count: 0, tokens: 0 }
    by[row.miss].count++; by[row.miss].tokens += num(row.cache_creation)
  }
  const claude = rows.filter(row => row.executor === 'claude').at(-1) || null
  return { ttl_ms: ttlMs, at: now, turns: rows.slice(-Math.max(1, n)),
    day: { turns: day.length, cache_creation: sum('cache_creation'), cache_creation_1h: sum('cache_creation_1h'),
      cache_creation_5m: sum('cache_creation_5m'), cache_read: sum('cache_read'), input: sum('input'), output: sum('output'),
      misses: Object.values(by).reduce((total, row) => total + row.count, 0),
      miss_tokens: Object.values(by).reduce((total, row) => total + row.tokens, 0), by_reason: by },
    last: claude ? { executor: claude.executor, at: claude.at, thread: claude.thread, model: claude.model, context: claude.context,
      expires_at: claude.at + ttlMs } : null }
}

export async function keshStatus(storage, options = {}) {
  return keshSvodka(await keshChitat(keshFile(storage), 2000), options)
}
