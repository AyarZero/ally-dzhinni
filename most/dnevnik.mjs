// Дневник «Честный разговор» внутри Джинни.
// Фасилитатор «Мудрый» для вечернего дневника. Промт читается при каждом ходе:
//   у клиента — .claude/skills/chestny-razgovor/mudryy.md, у нас — act/diary/prompts/facilitator-mudryy.md.
// Память: записки conversations/*.md и журнал razgovory/ — у клиента в pamyat/dnevnik/, у нас в act/diary/personal.
// Всё личное лежит ТОЛЬКО на этом компьютере, на сервер не уезжает.
// Модель — по подписке (`claude -p` в пустой песочнице, чтобы CLAUDE.md папки не подмешивался).
//
// Мост с «Знаю о тебе»: дневник читает pamyat/znaet-tebya.md, чтобы не переспрашивать известное;
// в конце разговора записка предлагает 1–5 строк «запомнить: …?». В файл ложится ТОЛЬКО то, на что человек ответил «да».
//
// const dn = dnevnik({ repo, log, znaet })
// dn.sostoyanie() → { idet, msgs, nachat, zapomnit, zapiskaIdet }
// dn.hod(text) → { ok, reply } реплика человека → ответ спутника
// dn.nachat() → { ok, reply } «сел за практику»: спутник открывает разговор
// dn.zakonchit() → { ok, zapiska } разговор в журнал; записка и «запомнить?» — в фоне
// dn.zapomnit(id, da) → { ok, zapisano } ответ человека на «запомнить: …?»; пишет только при da === true
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, appendFile, readdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dopisat, razobrat, razdelyFaila } from './znayu.mjs'
import { ownTree } from './derevo.mjs'
import { claudeCommand } from './local-executor-probes.mjs'

const NACHALO = '(я сел за практику)'
const MARKER = /^## СИСТЕМНЫЙ ПРОМТ/m
const ZAP_MARKER = '=== ЗАПОМНИТЬ ==='
const kluch = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()

const ZADACHA_ZAPISKI = `Ниже — расшифровка практики «Честный разговор»: человек говорит с фасилитатором о себе.

Сожми её в записку для фасилитатора, который будет вести СЛЕДУЮЩИЙ разговор с этим же человеком.
Записка нужна, чтобы не заставлять человека объяснять всё заново.

Что должно быть в записке:
- О чём был разговор — двумя-тремя фразами, без пересказа по ходам.
- Что человек сказал о себе важного: его собственные слова, в кавычках, дословно. Это ценнее выводов.
- До чего дошли: названные фигуры (внутренние голоса), сцены из прошлого, противоречия.
- Что осталось открытым: вопросы без ответа, ветки, которые он вынес и оставил.
- Чего делать НЕ надо: что уже проговорено и повторять не нужно.

Пиши по-русски, живым языком, без канцелярита и без терапевтических штампов.
Не ставь диагнозов и не давай советов — это записка о том, что было, а не разбор человека.
Не выдумывай ничего, чего в расшифровке нет. Уложись в 40 строк. Без вступлений и без заголовка.

После записки поставь отдельной строкой «${ZAP_MARKER}» и под ней от нуля до пяти строк: новое о человеке, что
стоит помнить и в делах, а не только в следующем разговоре, — кто он, чего хочет, как устроен, что для него важно.
Формат каждой строки: «раздел | что знаю». Раздел — ровно одно из: {RAZDELY}.
«Что знаю» — одна короткая фраза, как можно ближе к его словам, без оценок, диагнозов и догадок; только то, что он
сказал сам. Не предлагай того, что уже есть в «Что уже знаю». Настроение одного вечера не предлагай.
Предложить нечего — после строки «${ZAP_MARKER}» ничего не пиши.`

export function razobratZapisku(out) {
 const at = out.indexOf(ZAP_MARKER)
 const zapiska = (at < 0 ? out : out.slice(0, at)).trim()
 const stroki = at < 0 ? [] : out.slice(at + ZAP_MARKER.length).split(/\r?\n/)
 .map((l) => l.match(/^\s*(?:[-*•]|\d+[.)])?\s*([^|]{2,60})\|(.+)$/))
 .filter(Boolean)
 .map((m) => ({ razdel: m[1].replace(/[«»"*]/g, '').trim(), chto: m[2].replace(/[|\r\n]+/g, ' ').trim().slice(0, 300) }))
 .filter((s) => s.chto.length > 2)
 .slice(0, 5)
 return { zapiska, stroki }
}

export function dnevnik({ repo, log = () => {}, znaet, complete }) {
 const PROMPT_KLIENT = join(repo, '.claude', 'skills', 'chestny-razgovor', 'mudryy.md')
 const PROMPT_NASH = join(repo, 'act', 'diary', 'prompts', 'facilitator-mudryy.md')
 const PROMPT = process.env.DZHINNI_DNEVNIK_PROMPT || (existsSync(PROMPT_KLIENT) ? PROMPT_KLIENT : PROMPT_NASH)
 const PAMYAT = process.env.DZHINNI_DNEVNIK ||
 (PROMPT === PROMPT_NASH ? join(repo, 'act', 'diary', 'personal') : join(repo, 'pamyat', 'dnevnik'))
 const ZNAET = znaet || join(repo, 'pamyat', 'znaet-tebya.md')
 const RAZG = join(PAMYAT, 'razgovory')
 const TEK = join(RAZG, '_tekushiy.json')
 const ZAP = join(RAZG, '_zapomnit.json') // «запомнить: …?», ждущие ответа человека
 const SANDBOX = join(tmpdir(), 'dzhinni_dnevnik')
 const MODEL = process.env.DZHINNI_DNEVNIK_MODEL || 'opus' // беседа: глубина и язык важнее цены
 const MODEL_ZAPISKI = process.env.DZHINNI_ZAPISKA_MODEL || 'sonnet'
 let tek = null // { nachat, msgs: [{role, content, at}] }
 let zanyat = false
 let zapiskaIdet = false

 const strip = (t) => t.replace(/^---[\s\S]*?---\s*/, '').trim()
  const den = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const chitat = (f) => readFile(f, 'utf8').catch(() => '')

  async function zagruzit() {
    if (tek) return tek
    try { tek = JSON.parse(await readFile(TEK, 'utf8')) } catch { tek = null }
    return tek
  }
  async function zapisatJson(f, v) {
    await mkdir(RAZG, { recursive: true })
    await writeFile(f + '.tmp', JSON.stringify(v, null, 1), 'utf8')
    await rename(f + '.tmp', f)
  }
  const sohranit = () => zapisatJson(TEK, tek)
  const zhdut = async () => { try { return JSON.parse(await readFile(ZAP, 'utf8')) || [] } catch { return [] } }
  // правки списка «запомнить?» — по одной: два быстрых «да» подряд не должны вернуть уже отвеченную строку
  let zamok = Promise.resolve()
  const podZamkom = (fn) => { const p = zamok.then(fn, fn); zamok = p.catch(() => {}); return p }

  // «Знаю о тебе» без истории: всё, что до «Что могло устареть», — сверено с человеком
  async function znaetTekst() {
    const t = strip(await chitat(ZNAET))
    const at = t.search(/^##\s+Что могло устареть/im)
    return (at < 0 ? t : t.slice(0, at)).trim().slice(0, 12000)
  }

  async function sistema() {
    const raw = await readFile(PROMPT, 'utf8')
    const at = raw.search(MARKER)   // заголовок с начала строки: в шапке файла эти слова тоже встречаются
    const t = (at < 0 ? raw : raw.slice(raw.indexOf('\n', at) + 1)).trim()
    if (t.length < 2000) throw new Error('промт фасилитатора пуст или обрезан')
    const chasti = []
    const zn = await znaetTekst()
    if (zn) chasti.push('### Что он уже рассказал о себе (файл «Знаю о тебе», сверено с ним)\n' + zn)
    const about = join(PAMYAT, 'about-me.md')
    if (existsSync(about)) chasti.push(strip(await readFile(about, 'utf8')))
    const conv = join(PAMYAT, 'conversations')
    if (existsSync(conv)) {
      for (const f of (await readdir(conv)).filter((f) => f.endsWith('.md')).sort().slice(-8))
        chasti.push(`### Разговор ${f.replace(/\.md$/, '')}\n` + strip(await readFile(join(conv, f), 'utf8')))
    }
    const pamyat = chasti.length ? '\n\n=== ЧТО ТЫ УЖЕ ЗНАЕШЬ О ЧЕЛОВЕКЕ (фон, не сценарий) ===\n' +
      'Ниже — то, что человек рассказывал раньше, и записки о прошлых ' +
      'разговорах. Держи это про себя: не объявляй, что знаешь, не пересказывай ему его же слова как ' +
      'справку, не козыряй подробностями. Знание должно быть заметно только по тому, что ты не ' +
      'переспрашиваешь уже сказанное. Если сегодня он говорит иначе, чем записано, — верь сегодняшнему.\n\n' +
      chasti.join('\n\n') : ''
    // в репликах бывают ошибки распознавания речи — это не небрежность
    return t + pamyat + '\n\n=== ГДЕ ИДЁТ РАЗГОВОР ===\nВ окне Джинни, вечером. В репликах человека бывают опечатки, ' +
      'ошибки распознавания и нет знаков препинания — понимай по смыслу, не поправляй.'
  }

  // подготовка файлов — ДО промиса (ошибка внутри `new Promise(async…)` не доходила до вызвавшего,
  // и `zanyat` оставался true навсегда); таймаут гасит дерево — под cmd.exe жил осиротевший claude.
  async function zvat(system, tekst, model, sekund, imya) {
    if (complete) return complete(system, tekst, sekund * 1000)
    await mkdir(SANDBOX, { recursive: true })
    // своё имя на беседу и на записку: они идут одновременно (записка в фоне, а человек уже начал новый разговор)
    const sys = join(SANDBOX, `sys_${imya}.txt`)
    await writeFile(sys, system, 'utf8')
    return new Promise((ok, ne) => {
      const env = { ...process.env }
      delete env.ANTHROPIC_API_KEY
      delete env.ANTHROPIC_AUTH_TOKEN
      delete env.CLAUDECODE   // мост живёт внутри Claude Code: без этого вложенный claude -p откажется
      const win = process.platform === 'win32'
      const flags = ['--model', model, '--output-format', 'text', '--exclude-dynamic-system-prompt-sections']
      let cmd = process.env.CLAUDE_CLI || ''
      let args = ['-p', '--system-prompt-file', win ? `"${sys}"` : sys, ...flags]
      let useShell = win
      if (!cmd) {
        try {
          const [exe, prefix] = claudeCommand()
          cmd = exe
          args = [...prefix, '-p', '--system-prompt-file', sys, ...flags]
          useShell = false
        } catch {
          cmd = 'claude'
        }
      }
      const ch = ownTree(spawn(cmd, args, { cwd: SANDBOX, env, windowsHide: true, shell: useShell }))
      let out = '', err = ''
      const t = setTimeout(() => { ch.kill(); ne(new Error(`модель не ответила за ${sekund / 60} мин`)) }, sekund * 1e3)
      ch.stdout.on('data', (d) => (out += d))
      ch.stderr.on('data', (d) => (err += d))
      ch.on('error', (e) => { clearTimeout(t); ne(e) })
      ch.on('close', (c) => { clearTimeout(t); c === 0 && out.trim() ? ok(out.trim()) : ne(new Error(err.slice(-300) || `claude: код ${c}`)) })
      ch.stdin.end(tekst, 'utf8')
    })
  }

  const dialog = (msgs) => msgs.filter((m) => m.content !== NACHALO)
    .map((m) => (m.role === 'user' ? '[человек] ' : '[спутник] ') + m.content).join('\n\n')

  async function otvetit() {
    if (zanyat) return { ok: false, error: 'спутник ещё думает над прошлым' }
    zanyat = true
    try {
      const tekst = tek.msgs.map((m) => (m.role === 'user' ? '[человек] ' : '[спутник] ') + m.content).join('\n\n') + '\n\n[спутник]'
      const reply = await zvat(await sistema(), tekst, MODEL, 180, 'beseda')
      tek.msgs.push({ role: 'assistant', content: reply, at: Date.now() })
      await sohranit()
      return { ok: true, reply }
    } catch (e) {
      log('дневник:', e.message)
      return { ok: false, error: e.message }
    } finally { zanyat = false }
  }

  // Записка к следующему разговору + строки «запомнить: …?» (одним вызовом модели)
  async function zapiska(msgs, d) {
    const znTxt = await chitat(ZNAET)
    const razdely = razdelyFaila(znTxt)
    const system = ZADACHA_ZAPISKI.replace('{RAZDELY}', razdely.map((r) => `«${r}»`).join(', '))
    const tekst = `Что уже знаю о человеке:\n${(await znaetTekst()) || '(пока ничего)'}\n\n---\n\nРасшифровка:\n\n${dialog(msgs)}`
    const { zapiska: z, stroki } = razobratZapisku(await zvat(system, tekst, MODEL_ZAPISKI, 600, 'zapiska'))
    const stamp = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
    if (z.length >= 200) {
      await mkdir(join(PAMYAT, 'conversations'), { recursive: true })
      await writeFile(join(PAMYAT, 'conversations', `${den(d)}-${stamp}.md`),
        `---\nдата: ${den(d)}\nвремя: ${stamp.slice(0, 2)}:${stamp.slice(2)}\nреплик: ${msgs.length}\nисточник: razgovory/${den(d)}.jsonl\n---\n\n${z}\n`, 'utf8')
    } else log('дневник: записка слишком короткая, не сохраняю')
    // уже известное и уже ждущее — не предлагать второй раз
    const n = await podZamkom(async () => {
      const izvestno = new Set(razobrat(await chitat(ZNAET)).flatMap((r) => r.stroki.map((s) => kluch(s.chto))))
      const spisok = await zhdut()
      for (const s of spisok) izvestno.add(kluch(s.chto))
      let k = 0
      for (const s of stroki) {
        if (izvestno.has(kluch(s.chto))) continue
        izvestno.add(kluch(s.chto))
        spisok.push({ id: `${Date.now().toString(36)}${k++}`, razdel: razdely.find((r) => kluch(r) === kluch(s.razdel)) || s.razdel, chto: s.chto, razgovor: den(d) })
      }
      if (k) await zapisatJson(ZAP, spisok)
      return k
    })
    log(`дневник: записка ${z.length >= 200 ? 'готова' : 'не вышла'}, «запомнить?» — ${n}`)
  }

  return {
    async sostoyanie() {
      const t = await zagruzit()
      return { idet: !!t, nachat: t?.nachat || null, dumaet: zanyat, zapiskaIdet,
        msgs: (t?.msgs || []).filter((m) => m.content !== NACHALO),
        zapomnit: (await zhdut()).map(({ id, razdel, chto }) => ({ id, razdel, chto })) }
    },
    async nachat() {
      if (await zagruzit()) return { ok: true, uzhe: true }
      tek = { nachat: Date.now(), msgs: [{ role: 'user', content: NACHALO, at: Date.now() }] }
      await sohranit()
      return otvetit()
    },
    async hod(text) {
      text = String(text || '').trim()
      if (!text) return { ok: false, error: 'пусто' }
      // занято — реплику не кладём: иначе она ляжет без ответа, а ответ на прошлую встанет после неё
      if (zanyat) return { ok: false, zanyat: true, error: 'спутник ещё думает над прошлым' }
      if (!(await zagruzit())) tek = { nachat: Date.now(), msgs: [] }
      tek.msgs.push({ role: 'user', content: text, at: Date.now() })
      await sohranit()
      return otvetit()
    },
    // Конец разговора: журнал дня, записка к следующему разу и «запомнить: …?» — в фоне, окно не ждёт
    async zakonchit() {
      // пока спутник думает, закрывать нельзя: его ответ упал бы в уже закрытый разговор
      if (zanyat) return { ok: false, zanyat: true, error: 'спутник ещё думает — закончим, когда ответит' }
      const t = await zagruzit()
      if (!t) return { ok: false, error: 'разговора нет' }
      const msgs = t.msgs.map(({ role, content }) => ({ role, content }))
      const posl = msgs.length && msgs[msgs.length - 1].role === 'assistant' ? msgs[msgs.length - 1].content : ''
      const d = new Date(t.nachat)
      const zapis = { ts: new Date().toISOString(), backend: 'dzhinni', avatar: null, turns: msgs.length,
        messages: posl ? msgs.slice(0, -1) : msgs, reply: posl }
      await mkdir(RAZG, { recursive: true })
      await appendFile(join(RAZG, `${den(d)}.jsonl`), JSON.stringify(zapis) + '\n', 'utf8')
      tek = null
      await writeFile(TEK, 'null', 'utf8').catch(() => {})
      const zhivyh = msgs.filter((m) => m.role === 'user' && m.content !== NACHALO).length
      if (zhivyh < 2) return { ok: true, zapiska: false }   // два слова — не разговор, записку не пишем
      zapiskaIdet = true
      zapiska(msgs, d).catch((e) => log('дневник: записка не вышла:', e.message)).finally(() => { zapiskaIdet = false })
      return { ok: true, zapiska: true }
    },
    // Ответ человека на «запомнить: …?». Пишем в «Знаю о тебе» ТОЛЬКО при da === true; «нет» — просто убрать.
    zapomnit(id, da) {
      return podZamkom(async () => {
        const spisok = await zhdut()
        const s = spisok.find((x) => x.id === String(id))
        if (!s) return { ok: false, error: 'такой строки нет' }
        let r = { ok: true }
        if (da === true) {
          r = await dopisat({ fail: ZNAET, razdel: s.razdel, chto: s.chto, otkuda: 'дневник' })
          if (!r.ok) return r
        }
        await zapisatJson(ZAP, spisok.filter((x) => x !== s))
        return { ...r, zapisano: da === true && !r.uzhe }
      })
    },
  }
}
