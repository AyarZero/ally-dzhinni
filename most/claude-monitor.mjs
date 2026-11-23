// Claude transcript/statusline monitor. Dependencies only flow from server into this factory.
import { readFile, readdir, stat, open } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { ostrovDeystviya } from './ostrova.mjs'

export function claudeMonitor({ state, push, remember, dobavitHod, otz, clip, log, EXTERNAL }) {
/* ресурс и лента хода без мода: снимок строки состояния + журнал сессии ----------
 * Мод limity шлёт zamer/hod через $.mcp.call, но в живой сессии до моста не дошёл ни один
 * вызов (ошибки мод глотает). Строка состояния (~/.claude/statusline-command.sh) кладёт свой вход в
 * statusline-state/dzhinni/<сессия>.json; отсюда — контекст, лимиты и путь к журналу. Своя сессия —
 * свежайшая, в журнале которой есть наш канал. */
const SNIMKI = process.env.DZHINNI_SNIMKI || join(homedir(), '.claude', 'statusline-state', 'dzhinni')
const nashi = new Map() // путь журнала → наша ли сессия
// kanal — ход начат репликой из окна (ответ уже пришёл через skazat); otvet — текст хода после последнего инструмента
// skazal — в ходе уже был skazat: текст терминала в окно не дублируем
const slezhka = { zhurnal: null, sdvig: 0, snimokAt: 0, kanal: true, skazal: false, otvet: [], instrumenty: new Map() }
const ZAPUSK = Date.now()

// Разрешение, отвеченное мимо окна (в терминале), не должно висеть в окне «ждёт да». Снимаем запросы этого же
// инструмента; отчёты разработчикам (otchet-…) ждут только кнопку окна и не снимаются.
function snyatOtvechennoe(tool) {
  if (!tool) return
  for (const [id, a] of Object.entries(state.asks)) {
    if (id.startsWith('otchet-') || a.tool !== tool) continue
    delete state.asks[id]
    push('asked', { id })
  }
}

// Реплика владельца из терминала или приложения Claude на телефоне («то, что я ответил, не видно в
// окне переписки»). Окно, команды, хуки и служебные вставки — не реплики.
function replikaIzZhurnala(z) {
  if (z.isMeta || z.isCompactSummary) return null
  const c = z.message?.content
  const t = typeof c === 'string' ? c : Array.isArray(c) && c.every((b) => b.type === 'text') ? c.map((b) => b.text).join('\n') : null
  if (t == null) return null
  const s = t.trim()
  if (!s || /^<(channel|command-|local-command|system-reminder|bash-|user-prompt-submit-hook)/.test(s) || /^Caveat:/.test(s)) return null
  return s
}

const imyaFaila = (p) => String(p ?? '').split(/[\\/]/).filter(Boolean).pop() ?? ''
const korotko = (s, n = 90) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
// То же, что opisanie() в act/mods/limity/hooks/register.tsx
function opisanie(tool, a) {
  if (tool.startsWith('mcp__dzhinni__') || tool === 'ToolSearch') return null
  switch (tool) {
    case 'Read': return `читаю ${imyaFaila(a.file_path)}`
    case 'Edit': return `правлю ${imyaFaila(a.file_path)}`
    case 'Write': return `пишу ${imyaFaila(a.file_path)}`
    case 'NotebookEdit': return `правлю ${imyaFaila(a.notebook_path)}`
    case 'Bash':
    // текст команды в окно не идёт: описание человеческими словами,
    // без описания — имя скрипта или просто «выполняю команду»
    case 'PowerShell': {
      if (a.description) return korotko(a.description)
      const skript = String(a.command || '').match(/([\w.-]+\.(?:py|mjs|js|ps1|sh|bat))\b/i)
      return skript ? `запускаю скрипт ${skript[1]}` : 'выполняю команду'
    }
    case 'Grep': return `ищу «${korotko(a.pattern, 50)}»`
    case 'Glob': return `ищу файлы ${korotko(a.pattern, 50)}`
    case 'Agent': return `отдаю работнику: ${korotko(a.description)}`
    case 'Skill': return `поднимаю навык ${korotko(a.skill, 40)}`
    case 'WebFetch': return `открываю страницу ${korotko(a.url, 60)}`
    case 'WebSearch': return `ищу в сети «${korotko(a.query, 50)}»`
    case 'AskUserQuestion': return 'жду твоего ответа в терминале'
  }
  if (tool.startsWith('mcp__playwright__') || tool.startsWith('mcp__claude-in-chrome__')) return 'смотрю страницу в браузере'
  if (tool.startsWith('mcp__')) return `инструмент ${tool.split('__')[1]}`
  return tool
}

// Какая сессия наша: Claude Code ведёт ~/.claude/sessions/<pid>.json с id сессии — берём файл процесса-родителя
// моста. Иначе любая сессия в этой папке, где упомянут мост, считалась бы «нашей» и окно показало бы чужую.
// Файла нет (другая версия Claude Code) — старый признак ниже. Перечитываем: после /clear id меняется.
async function nashId() {
  try { return JSON.parse(await readFile(join(homedir(), '.claude', 'sessions', `${Number(process.env.DZHINNI_SESSION_PID || process.ppid)}.json`), 'utf8')).sessionId || null } catch { return null }
}
async function nashaSessiya(zhurnal) {
  const sid = await nashId()
  if (sid) return basename(zhurnal, '.jsonl') === sid
  if (nashi.has(zhurnal)) return nashi.get(zhurnal)
  let da = false
  try { da = (await readFile(zhurnal, 'utf8')).includes('mcp__dzhinni__') } catch { return false }
  if (da) nashi.set(zhurnal, true) // «нет» не запоминаем: канал может появиться в журнале позже
  return da
}

// шкала окна шла до 1M (размер окна модели), а компакт стоит на `/autocompact` — показываем его порог
function porogKompakta(model) {
  try {
    const ms = JSON.parse(readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8')).modelSettings || {}
    const id = typeof model === 'string' ? model : model?.id
    const p = (id && ms[id]?.autoCompactWindow) || Object.values(ms).find((v) => v?.autoCompactWindow)?.autoCompactWindow
    return typeof p === 'number' ? p : null
  } catch { return null }
}

function zamerIzSnimka(s) {
  const cw = s.context_window || {}
  const porog = porogKompakta(s.model)
  if (porog && typeof cw.context_window_size === 'number' && porog < cw.context_window_size) {
    const cu0 = cw.current_usage
    const t0 = cu0 ? (cu0.input_tokens || 0) + (cu0.cache_creation_input_tokens || 0) + (cu0.cache_read_input_tokens || 0) : null
    return { ...zamerIzSnimkaSyroy(s), okno: porog, procent: t0 == null ? null : Math.round((t0 / porog) * 100) }
  }
  return zamerIzSnimkaSyroy(s)
}

function zamerIzSnimkaSyroy(s) {
  const cw = s.context_window || {}
  const cu = cw.current_usage
  const tokeny = cu ? (cu.input_tokens || 0) + (cu.cache_creation_input_tokens || 0) + (cu.cache_read_input_tokens || 0) : null
  const limit = (o) => (o && typeof o.used_percentage === 'number' ? { procent: o.used_percentage, sbros: o.resets_at ? o.resets_at * 1000 : null } : null)
  return {
    tokeny,
    okno: typeof cw.context_window_size === 'number' ? cw.context_window_size : null,
    procent: typeof cw.used_percentage === 'number' ? cw.used_percentage : null,
    pyat: limit(s.rate_limits?.five_hour),
    nedelya: limit(s.rate_limits?.seven_day),
  }
}

// «You've hit your session limit · resets 11:10pm (Asia/Vladivostok)» → «лимит 5 часов кончился, до 23:10»
function oshibkaPoRusski(kod, t) {
  if (kod === 'rate_limit') {
    const m = /resets\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i.exec(t)
    let do_ = ''
    if (m) {
      let h = +m[1] % 12
      if (/pm/i.test(m[3] || '')) h += 12
      do_ = `, до ${String(h).padStart(2, '0')}:${m[2] || '00'}`
    }
    return (/week/i.test(t) ? 'недельный лимит кончился' : /session/i.test(t) ? 'лимит 5 часов кончился' : 'лимит кончился') + do_
  }
  if (kod === 'authentication_failed') return 'вход в Claude слетел — нужен /login'
  return 'ошибка Claude: ' + korotko(t, 60)
}

async function lentaIzZhurnala() {
  const f = await open(slezhka.zhurnal, 'r')
  try {
    const { size } = await f.stat()
    if (size < slezhka.sdvig) slezhka.sdvig = 0
    if (size === slezhka.sdvig) return
    const buf = Buffer.alloc(size - slezhka.sdvig)
    await f.read(buf, 0, buf.length, slezhka.sdvig)
    const txt = buf.toString('utf8')
    const konecStroki = txt.lastIndexOf('\n')
    if (konecStroki < 0) return
    slezhka.sdvig += Buffer.byteLength(txt.slice(0, konecStroki + 1), 'utf8')
    for (const line of txt.slice(0, konecStroki).split('\n')) {
      let z
      try { z = JSON.parse(line) } catch { continue }
      if (z.isSidechain) continue
      // Реплика, сказанная посреди хода, ложится в журнал не user-строкой, а вложением queued_command
      if (z.type === 'attachment') {
        const a = z.attachment
        // помощник закончил, упал или остановлен — Claude Code пишет это уведомлением, а не в .meta.json
        //
        if (a?.type === 'queued_command' && typeof a.prompt === 'string' && a.prompt.includes('<task-notification>')) {
          const id = a.prompt.match(/<tool-use-id>([^<]+)<\/tool-use-id>/)?.[1]
          const st = a.prompt.match(/<status>([^<]+)<\/status>/)?.[1]
          if (id && st && st !== 'running') pomoshchKonec.set(id, st)
          continue
        }
        if (a?.type === 'queued_command' && a.origin?.kind === 'human' && typeof a.prompt === 'string') {
          const r = replikaIzZhurnala({ message: { content: a.prompt } })
          if (r) await remember('ty', r)
        }
        continue
      }
      if (z.type === 'user') {
        const c = z.message?.content
        // у инструмента есть результат — значит, на его разрешение уже ответили (может быть, в терминале): снять из окна
        if (Array.isArray(c)) for (const b of c) if (b.type === 'tool_result') snyatOtvechennoe(slezhka.instrumenty.get(b.tool_use_id))
        if (typeof c === 'string' ? c.trimStart().startsWith('<channel') : Array.isArray(c) && c.some((b) => b.type === 'text' && b.text.trimStart().startsWith('<channel'))) {
          slezhka.kanal = true
        } else {
          const r = replikaIzZhurnala(z)
          if (r) { slezhka.kanal = false; slezhka.skazal = false; slezhka.otvet = []; await remember('ty', r) }
        }
        continue
      }
      if (z.type !== 'assistant') continue
      // Кончился лимит или слетел вход — сессия молчит, а ядро висело на «думает»
      if (z.isApiErrorMessage) {
        const t = (z.message?.content || []).map((b) => b.text || '').join(' ')
        dobavitHod({ konec: true, oshibka: oshibkaPoRusski(z.error, t), at: Date.now() })
        otz.sobytie('oshibka', `сессия: ${clip(z.error, 40)}`)
        continue
      }
      for (const b of z.message?.content || []) {
        if (b.type === 'text' && b.text.trim()) slezhka.otvet.push(b.text.trim())
        if (b.type !== 'tool_use') continue
        slezhka.instrumenty.set(b.id, String(b.name))
        if (slezhka.instrumenty.size > 200) slezhka.instrumenty.delete(slezhka.instrumenty.keys().next().value)
        slezhka.otvet = []
        if (String(b.name).endsWith('__skazat')) slezhka.skazal = true
        const text = opisanie(String(b.name), b.input || {})
        if (!text) continue
        dobavitHod({ text: clip(text, 200), at: Date.now(), ...ostrovDeystviya(String(b.name), b.input || {}) })
      }
      // Одно сообщение лежит в журнале несколькими строками с тем же end_turn — черта нужна одна
      if (z.message?.stop_reason === 'end_turn') {
        // Ответ на реплику не из окна — в переписку окна; на реплику из окна он уже там через skazat
        if (!slezhka.kanal && !slezhka.skazal && slezhka.otvet.length) await remember('ya', slezhka.otvet.join('\n\n'), undefined, 'claude')
        slezhka.otvet = []
        if (!state.hod.at(-1)?.konec) dobavitHod({ konec: true, at: Date.now() })
      }
    }
  } finally {
    await f.close()
  }
}

// Помощники пишут свои журналы рядом: <сессия>/subagents/agent-<id>.jsonl (+ .meta.json с описанием). Окно их не
// видело — «Джинни делает» и острова молчали, пока работали два помощника. Каждый помощник —
// строка в «Джинни делает» (шаги и последнее действие), его инструменты — ход с меткой agent: зелёный луч к острову.
const pomoshch = new Map() // путь журнала → { sdvig, id, imya, shagov, konec }
const pomoshchKonec = new Map() // toolUseId запуска помощника → completed | killed | failed
async function pomoshchniki() {
  const papka = join(slezhka.zhurnal.slice(0, -'.jsonl'.length), 'subagents')
  let imena
  try { imena = (await readdir(papka)).filter((n) => n.startsWith('agent-') && n.endsWith('.jsonl')) } catch { return }
  for (const n of imena) {
    const p = join(papka, n)
    let m = pomoshch.get(p)
    const st = await stat(p)
    // старый помощник — заглушка без имени; раньше она проваливалась ниже и давала «Помощник: undefined»
    if (m?.stary) continue
    if (!m) {
      // старые помощники (до запуска моста и закончившиеся) не воскрешаем
      if (st.mtimeMs < ZAPUSK - 60_000 && Date.now() - st.mtimeMs > 10 * 60e3) { pomoshch.set(p, { sdvig: st.size, konec: true, stary: true }); continue }
      let meta = {}
      try { meta = JSON.parse(await readFile(p.slice(0, -'.jsonl'.length) + '.meta.json', 'utf8')) } catch {}
      m = { sdvig: 0, id: 'ag-' + n.slice(6, 14), imya: korotko(meta.description || meta.agentType || 'помощник', 60), shagov: 0, konec: false, start: st.birthtimeMs || Date.now(), tuid: meta.toolUseId }
      pomoshch.set(p, m)
    }
    const itog = m.tuid && pomoshchKonec.get(m.tuid)
    if (itog && !m.konec) { m.konec = true; m.itog = itog }
    if (m.konec && st.size === m.sdvig && m.otp) continue
    if (st.size > m.sdvig) {
      const f = await open(p, 'r')
      try {
        const buf = Buffer.alloc(st.size - m.sdvig)
        await f.read(buf, 0, buf.length, m.sdvig)
        const txt = buf.toString('utf8'), kr = txt.lastIndexOf('\n')
        if (kr >= 0) {
          m.sdvig += Buffer.byteLength(txt.slice(0, kr + 1), 'utf8')
          for (const line of txt.slice(0, kr).split('\n')) {
            let z
            try { z = JSON.parse(line) } catch { continue }
            if (z.type !== 'assistant') continue
            for (const b of z.message?.content || []) {
              if (b.type !== 'tool_use') continue
              const text = opisanie(String(b.name), b.input || {})
              if (!text) continue
              m.shagov++
              m.posl = text
              dobavitHod({ text: clip(text, 200), at: Date.now(), ...ostrovDeystviya(String(b.name), b.input || {}), agent: m.imya })
            }
            // последний ответ помощника без инструментов = он закончил
            if (z.message?.stop_reason === 'end_turn' && !(z.message.content || []).some((b) => b.type === 'tool_use')) {
              m.konec = true
              if (!state.hod.at(-1)?.konec) dobavitHod({ konec: true, at: Date.now() }) // ядро не висит на «думает»
            }
          }
        }
      } finally { await f.close() }
    }
    // Claude Code сам ставит finished в .meta.json, когда помощник сдал работу — надёжнее, чем угадывать по end_turn
    if (!m.konec) { try { if (JSON.parse(await readFile(p.slice(0, -'.jsonl'.length) + '.meta.json', 'utf8')).finished) m.konec = true } catch {} }
    // молчит 15 минут — считаем остановленным
    const stoit = !m.konec && Date.now() - st.mtimeMs > 15 * 60e3
    const q = { id: m.id, name: `Помощник: ${m.imya}`, progress: m.konec ? 100 : 0, note: m.konec ? (m.itog === 'killed' ? `остановлен · шагов ${m.shagov}` : m.itog === 'failed' ? `упал · шагов ${m.shagov}` : `шагов ${m.shagov}`) : `шаг ${m.shagov}${m.posl ? ' · ' + korotko(m.posl, 80) : ''}`,
      at: Date.now(), start: m.start, ag: 1, stoit: stoit ? 1 : 0 }
    const k = JSON.stringify({ ...q, at: 0 })
    if (m.otp === k) continue
    m.otp = k
    state.processes[q.id] = q
    push('process', q)
  }
}

async function sledit() {
  try {
    const imena = (await readdir(SNIMKI)).filter((n) => n.endsWith('.json'))
    const vse = await Promise.all(imena.map(async (n) => ({ p: join(SNIMKI, n), t: (await stat(join(SNIMKI, n))).mtimeMs })))
    vse.sort((a, b) => b.t - a.t)
    for (const { p, t } of vse.slice(0, 6)) {
      const s = JSON.parse(await readFile(p, 'utf8'))
      if (!s.transcript_path || !(await nashaSessiya(s.transcript_path))) continue
      if (slezhka.zhurnal !== s.transcript_path) {
        // Новая сессия: ленту ведём с конца журнала, старое не проигрываем. Но журнал, заведённый после запуска моста,
        // читаем с начала: первая реплика ложится в него раньше, чем сессия станет «нашей»
        const st = await stat(s.transcript_path)
        slezhka.zhurnal = s.transcript_path
        slezhka.sdvig = st.birthtimeMs >= ZAPUSK - 60_000 ? 0 : st.size
      }
      if (t > slezhka.snimokAt) {
        slezhka.snimokAt = t
        state.zamer = { ...zamerIzSnimka(s), at: t }
        push('zamer', state.zamer)
      }
      break
    }
    if (slezhka.zhurnal) await lentaIzZhurnala()
    if (slezhka.zhurnal) await pomoshchniki()
  } catch (e) {
    if (e.code !== 'ENOENT') log('слежка за сессией:', e.message)
  }
}
// проход не наслаивается на прошлый: медленный проход иначе задваивает реплики
let sledim = false
if (!EXTERNAL) setInterval(async () => { if (sledim) return; sledim = true; try { await sledit() } finally { sledim = false } }, 1500).unref()

return { slezhka }
}
