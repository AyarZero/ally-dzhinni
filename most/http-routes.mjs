// HTTP/UI boundary. Live chat is read through getChat because server replaces the array.
import http from 'node:http'
import { readFile, readdir, writeFile, mkdir, stat, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { znayu } from './znayu.mjs'
import { schetDnya, OSOBYE, AGENTY } from './ostrova.mjs'
import { zhelezo } from './zhelezo.mjs'
import { skachat } from './skachat.mjs'
import { mobileRoutes } from './mobile-routes.mjs'
import { taskPlanSnapshot, reorderTaskPlan } from './task-plan.mjs'
import { oknoZhizn } from './okno-zhizn.mjs'
import { stroykaState } from './stroyka.mjs'
import { zadachiVse, fokusPravka, zadachaKarta } from './zadachi-fokus.mjs'
import { keshStatus } from './kesh-uchet.mjs'
import { helperResources, resourceFile } from './helper-resources.mjs'
import { taskEditor } from './task-editor.mjs'
import { localFileReferences } from './local-file-reference.mjs'
import { productionRoutes } from './production-routes.mjs'
import { obuchenieRoutes } from './obuchenie-routes.mjs'
import { developerInterface, ensureDeveloperPreview, resetDeveloperPreview } from './developer-interface.mjs'
import { windowSecurity } from './window-security.mjs'
import { aggregatorPublicStatus, saveAggregatorConfig, testAggregatorConnection, TOKENATOR_PREFIX } from './tokenator.mjs'
import { engineLogin, engineLoginStatus, probeQoderInstalled } from './engine-login.mjs'
import { listQuickNotes, addQuickNote, deleteQuickNote } from './quick-notes.mjs'
import { validateFeedbackFile, validateFeedbackFiles, safeFeedbackName } from './otzyvy-files.mjs'

// в отзыв разработчикам — без имён файлов человека: /f/<имя> и /fajl/<код> сводим к префиксу
export const dlyaOtzyva = (pathname) => String(pathname).replace(/^\/(f|fajl)\/.*$/s, '/$1/…')

export function serveWindow({ HERE, REPO, HOST, PORT, CODEX, EXTERNAL, provider, state, listeners, getChat,
  repoState, otz, pod, dn, sl, gl, dst, vid, ZNAYU, dokSpisok, doki, sohranitDoki, wikiState,
  shapka, clip, HOD_DIR, den, zdoroveRepo, istoriyaRaboty, sohranitVoprosy, remember, PUT,
  ochered, razbudit, mcp, pravkaZadachi, nazhat, push, bezPutey, log, helperBalanceReader = null, referencePicker }) {
/* HTTP: окно ---------- */
// Чужие страницы в браузере не должны писать в сессию: принимаем только запросы
// с нашим Host и с заголовком X-Dzhinni (его нельзя послать с чужого сайта без
// предварительного запроса, на который мы не отвечаем разрешением).
const okHost = (req) => req.headers.host === `${HOST}:${PORT}` || req.headers.host === `localhost:${PORT}`
const body = (req) => new Promise((res, rej) => {
  // куски склеиваем байтами: русская буква на границе куска иначе рвётся
  const kuski = []
  let n = 0
  // 1 МБ, как у шлюза телефона (mobile-proxy.mjs): 120 000 русских знаков с JSON-экранированием \uXXXX — до ~720 КБ;
  // прежние 128 000 байт обрывали сообщение уже на ~60 000 знаков.
  req.on('data', (c) => { kuski.push(c); n += c.length; if (n > 1024 * 1024) { rej(Object.assign(new Error('сообщение слишком длинное'), { status: 413 })); req.destroy() } })
  req.on('end', () => res(Buffer.concat(kuski).toString('utf8')))
  req.on('error', rej)
})
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)) }
const helperBalances = helperBalanceReader || helperResources({ file: resourceFile(process.env.DZHINNI_ENGINE_DATA || join(HERE, '.opencode-data')) })

// Окно закрыли — мост сам закрывается через 9 минут (okno-zhizn.mjs). Только у фонового моста с хранилищем
// (engine-server, 8798): старый канал Claude на 8794 живёт, пока жив его терминал.
const zhizn = provider && process.env.DZHINNI_ENGINE_DATA ? oknoZhizn({ file: join(process.env.DZHINNI_ENGINE_DATA, 'okno-zakrytie.json'),
  busy: () => { const p = provider.status?.() || {}; return !!p.busy || (p.queued || 0) > 0 }, log }) : null
if (zhizn) setInterval(() => zhizn.tick(), 15e3)

// Вложения из окна (скриншоты из буфера, файлы, документы) ложатся сюда; в сессию уходят их пути
const FILES = process.env.DZHINNI_FILES || join(HERE, '.vlozheniya')
const OTZ_FILES = join(FILES, 'otzyvy-tmp')
const MAX_FILE = 50 * 1024 * 1024
const references = localFileReferences({ pick: referencePicker })
// Same as the phone's composer (android MainActivity: LengthFilter(120000)); a test keeps them equal.
const MAX_SAY_TEXT = 120000
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' }
const safeName = (s, limit = 120) => basename(String(s || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(-limit)
let seq = 0
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${++seq}` }
const saveTo = (req, path) => new Promise((ok, fail) => {
  let n = 0, settled = false
  const out = createWriteStream(path)
  const interrupted = error => {
    if (settled) return
    settled = true
    // Windows cannot remove an open upload. Wait for its own stream to close.
    out.once('close', () => unlink(path).catch(() => {})); out.destroy(); fail(error)
  }
  req.on('data', (c) => { n += c.length; if (n > MAX_FILE) { req.unpipe(out); interrupted(Object.assign(new Error('файл больше 50 МБ'), { status: 413 })) } })
  out.on('finish', () => { if (!settled) { settled = true; ok(n) } })
  out.on('error', interrupted)
  req.on('error', interrupted)
  req.on('aborted', () => interrupted(new Error('Загрузка файла прервана')))
  req.pipe(out)
})
const saveFeedbackTo = (req, path, limit, overMessage) => new Promise((ok, fail) => {
  let n = 0, settled = false
  const out = createWriteStream(path)
  const interrupted = error => {
    if (settled) return
    settled = true
    out.once('close', () => unlink(path).catch(() => {})); out.destroy(); fail(error)
  }
  req.on('data', (c) => { n += c.length; if (n > limit) { req.unpipe(out); interrupted(Object.assign(new Error(overMessage), { status: 413 })) } })
  out.on('finish', () => { if (!settled) { settled = true; ok(n) } })
  out.on('error', interrupted)
  req.on('error', interrupted)
  req.on('aborted', () => interrupted(new Error('Загрузка файла прервана')))
  req.pipe(out)
})
// Имя вложения из окна → полный путь, только если файл правда лежит в папке вложений
async function attached(names) {
  if (names === undefined) return []
  if (!Array.isArray(names) || names.length > 20) throw Object.assign(new Error('Можно отправить до 20 вложений за раз'), { status: 400 })
  const out = []
  for (const n of names) {
    // Stored names include the upload timestamp in addition to the 120-character original.
    if (typeof n !== 'string' || !n || safeName(n, 200) !== n) throw Object.assign(new Error('Некорректное имя вложения'), { status: 400 })
    let valid = false
    try { valid = (await stat(join(FILES, n))).isFile() } catch {}
    if (!valid) throw Object.assign(new Error('Вложение не найдено: ' + n), { status: 400 })
    out.push(n)
  }
  return out
}

const server = http.createServer(async (req, res) => {
  if (!okHost(req)) { res.writeHead(403); return res.end() }
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  try {
    if (await obuchenieRoutes({ req, res, url, HERE })) return
    if (await productionRoutes({ req, res, url, HERE, REPO })) return
    if (await mobileRoutes({ req, res, url, HERE, REPO, provider, state, getChat, zhizn, helpers: helperBalances })) return
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      // окно не встраивается в чужой сайт: иначе под «ДА» можно подложить чужую кнопку
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...windowSecurity() })
      const html=await readFile(join(HERE, EXTERNAL ? 'okno-engine.html' : 'okno.html'),'utf8')
      return res.end(developerInterface(html,REPO))
    }
    if (req.method === 'GET' && url.pathname === '/okno.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      const scripts = await Promise.all(['okno-motion.js', 'chat-render.js', 'okno.js', 'okno-ostrova.js', 'okno-core.js'].map(name => readFile(join(HERE, name), 'utf8')))
      return res.end(scripts.join('\n'))
    }
    if (req.method === 'GET' && url.pathname === '/engines.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end((await Promise.all(['engines-okno.js', 'chat-composer.js', 'onboarding-guides.js', 'onboarding-ui.js', 'quick-notes-ui.js', 'guide-ui.js'].map(name => readFile(join(HERE, name), 'utf8')))).join('\n'))
    }
    if (req.method === 'GET' && url.pathname === '/api/quick-notes') {
      const dataDir = process.env.DZHINNI_ENGINE_DATA || join(HERE, '.opencode-data')
      return json(res, 200, { ok: true, notes: await listQuickNotes({ dataDir }) })
    }
    if (req.method === 'GET' && url.pathname === '/api/aggregator') {
      return json(res, 200, aggregatorPublicStatus({ repo: REPO }))
    }
    if (req.method === 'GET' && url.pathname === '/api/onboarding/status') {
      return json(res, 200, { qoder: probeQoderInstalled(), aggregator: aggregatorPublicStatus({ repo: REPO }) })
    }
    if (req.method === 'GET' && url.pathname === '/chat-composer.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await readFile(join(HERE, 'chat-composer.js')))
    }
    if (req.method === 'GET' && url.pathname === '/task-board.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await readFile(join(HERE, 'task-board-ui.js')))
    }
    if (req.method === 'GET' && url.pathname === '/resurs.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await readFile(join(HERE, 'resurs.js')))
    }
    // Свой значок окна вместо глобуса Edge на панели задач
    if (req.method === 'GET' && url.pathname === '/znachok.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=86400' })
      return res.end(await readFile(join(HERE, 'dzhinni.png')))
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, { ...(await repoState()), provider: provider?.status() || { provider: 'claude' }, live: { processes: Object.values(state.processes), panels: state.panels, asks: Object.values(state.asks), voprosy: state.voprosy, said: state.said.at(-1) || null, chat: getChat(), zamer: state.zamer, hod: state.hod } })
    }
    if (req.method === 'GET' && url.pathname === '/api/provider') return json(res, 200, provider?.status() || { provider: 'claude' })
    if (req.method === 'GET' && url.pathname === '/api/helper-resources') {
      if (req.headers['x-dzhinni'] !== '1') return json(res, 403, { error: 'Запрос только из AllY' })
      return json(res, 200, await helperBalances.get({ refresh: url.searchParams.get('refresh') === '1' }))
    }
    // «/» в поле ввода: свои команды Джинни + присланные Claude (komandy-claude.mjs).
    if (req.method === 'GET' && url.pathname === '/api/komandy') return json(res, 200, provider?.commands ? provider.commands() : { at: null, list: [] })
    // Кэш подсказки по ходам Claude: последние ходы, итог за сутки, причины промахов (kesh-uchet.mjs).
    if (req.method === 'GET' && url.pathname === '/api/kesh') {
      const storage = process.env.DZHINNI_ENGINE_DATA || join(HERE, '.opencode-data')
      return json(res, 200, await keshStatus(storage, { n: Math.min(200, Number(url.searchParams.get('n')) || 20) }))
    }
    if (req.method === 'GET' && url.pathname === '/kesh.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await readFile(join(HERE, 'kesh-okno.js')))
    }
    if (req.method === 'GET' && url.pathname === '/komandy.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await readFile(join(HERE, 'komandy-okno.js')))
    }
    if (req.method === 'GET' && url.pathname === '/api/task-board') {
      if (!provider?.taskBoard) return json(res, 409, { error: 'Список поручений доступен в прямом режиме Джинни.' })
      const delivery = provider.taskBoard()
      return json(res, 200, { ...delivery, plan: taskPlanSnapshot(REPO, delivery) })
    }
    if (req.method === 'GET' && ['/api/performance', '/performance'].includes(url.pathname)) {
      const { performanceReport, performanceHTML } = await import('./performance-view.mjs')
      const report = await performanceReport(REPO, Number(url.searchParams.get('days') || 7))
      if (url.pathname === '/api/performance') return json(res, 200, report)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' })
      return res.end(performanceHTML(report))
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      res.write(': связь есть\n\n')
      const emit = (c) => res.write(c)
      listeners.add(emit)
      const ping = setInterval(() => res.write(': пинг\n\n'), 25000)
      req.on('close', () => { clearInterval(ping); listeners.delete(emit) })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/otzyvy') return json(res, 200, await otz.sostoyanie())
    if (req.method === 'GET' && url.pathname === '/api/podderzhka') {
      if (!pod) return json(res, 200, { vkl: false })
      const id = url.searchParams.get('id')
      return json(res, 200, { vkl: true, ...(id ? await pod.kopiya(id) : await pod.kopii()) })
    }
    if (req.method === 'GET' && url.pathname === '/vidzhety.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await readFile(join(HERE, 'vidzhety_okno.js')))
    }
    if (req.method === 'GET' && url.pathname === '/slukh_okno.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await readFile(join(HERE, 'slukh_okno.js')))
    }
    if (req.method === 'GET' && url.pathname === '/guide') {
      let html = null
      for (const candidate of [join(REPO, 'docs', 'index.html'), join(HERE, '..', 'sborka', 'shablon', 'docs', 'index.html')]) {
        try { html = await readFile(candidate, 'utf8'); break } catch {}
      }
      if (!html) { res.writeHead(404); return res.end('Guide not found') }
      const sec = windowSecurity()
      const rawCsp = sec['content-security-policy'] || ''
      const csp = !rawCsp || rawCsp === "frame-ancestors 'none'"
        ? "frame-ancestors 'self'"
        : rawCsp.replace(/^frame-ancestors\s+/, "frame-ancestors 'self' ")
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': csp, 'x-frame-options': 'SAMEORIGIN' })
      return res.end(html)
    }
    if (req.method === 'GET' && url.pathname === '/api/dnevnik') return json(res, 200, await dn.sostoyanie())
    if (req.method === 'GET' && url.pathname === '/api/slukh') return json(res, 200, await sl.sostoyanie())
    if (req.method === 'GET' && url.pathname === '/api/znayu') return json(res, 200, (await znayu(ZNAYU)) || { vsego: 0, razdely: [], novoe: [] })
    if (req.method === 'GET' && url.pathname === '/api/dostup') return json(res, 200, (await dst.proverit(), dst.svodka()))
    if (req.method === 'GET' && url.pathname === '/api/vidzhety') return json(res, 200, { vidzhety: await vid.spisok() })
    {
      const m = req.method === 'GET' && url.pathname.match(/^\/vidzhet\/([a-z0-9-]{1,40})\/(vid\.html|dannye)$/)
      if (m && m[2] === 'dannye') return json(res, 200, await vid.dannye(m[1]))
      if (m) {
        const s = await vid.stranica(m[1])
        if (!s) { res.writeHead(404); return res.end() }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': s.csp, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' })
        return res.end(s.html)
      }
    }
    // 
    // путь к .md/.txt в ответе = ссылка, окно читает файл отсюда. Только внутри папки владельца, только текст,
    // секреты и служебное не отдаём.
    if (req.method === 'GET' && url.pathname === '/api/dokumenty') return json(res, 200, dokSpisok())
    if (await skachat(req, res, url, REPO)) return
    if (req.method === 'GET' && url.pathname === '/api/fajl') {
      const put = String(url.searchParams.get('put') || '').replace(/^[`'"«]+|[`'"»]+$/g, '')
      const polnyy = resolve(REPO, put)
      const vnutri = polnyy.toLowerCase().startsWith(resolve(REPO).toLowerCase() + '\\') || polnyy.toLowerCase().startsWith(resolve(REPO).toLowerCase() + '/')
      if (!vnutri || !/\.(md|txt)$/i.test(polnyy) || /[\\/](_?secrets?|\.git|node_modules)[\\/]|\.env/i.test(polnyy)) return json(res, 403, { oshibka: 'этот файл окно не открывает' })
      try {
        const st = await stat(polnyy)
        if (st.size > 2e6) return json(res, 413, { oshibka: 'файл больше 2 МБ' })
        return json(res, 200, { put: put.replace(/\\/g, '/'), tekst: await readFile(polnyy, 'utf8'), at: st.mtimeMs })
      } catch { return json(res, 404, { oshibka: 'файла нет' }) }
    }
    if (req.method === 'GET' && url.pathname === '/api/wiki') return json(res, 200, await wikiState())
    // Страница «Задачи»: все живые задачи из свода + отметка фокуса
    if (req.method === 'GET' && url.pathname === '/api/zadachi') {
      try { return json(res, 200, await zadachiVse(REPO)) } catch { return json(res, 200, { net: true }) }
    }
    // Карточка задачи — открыть, как страницу в Notion: свойства, текст, вложения, ссылки
    if (req.method === 'GET' && url.pathname === '/api/zadacha') {
      try { const r = await zadachaKarta(REPO, String(url.searchParams.get('slug') || '')); return json(res, r.ok ? 200 : 404, r) }
      catch { return json(res, 500, { ok: false, error: 'карточка не собралась' }) }
    }
    // Стройка навыков — только у владельца: в клиентской копии сводной задачи нет
    if (req.method === 'GET' && url.pathname === '/api/stroyka') {
      try { return json(res, 200, await stroykaState(REPO, { svezho: url.searchParams.has('svezho') })) }
      catch { return json(res, 200, { net: true }) }
    }
    if (req.method === 'GET' && url.pathname === '/api/ostrova') {
      const navyki = (await wikiState()).navyki.map(({ name, imya, opis, rod, arh }) => ({ name, imya, opis: clip(opis, 220), rod, arh }))
      // Помощники: свои — из .claude/agents (поле «имя»), встроенные — из AGENTY
      const agenty = { ...AGENTY }
      try {
        for (const f of await readdir(join(REPO, '.claude', 'agents'))) {
          if (!f.endsWith('.md')) continue
          try { const o = shapka((await readFile(join(REPO, '.claude', 'agents', f), 'utf8')).slice(0, 4000)); if (o['имя']) agenty[f.slice(0, -3)] = o['имя'] } catch {}
        }
      } catch {}
      return json(res, 200, { navyki, agenty, osobye: OSOBYE, segodnya: await schetDnya(HOD_DIR, den(Date.now())), hod: state.hod })
    }
    if (req.method === 'GET' && url.pathname === '/api/zdorove') return json(res, 200, await zdoroveRepo(url.searchParams.get('svezhiy') === '1'))
    if (req.method === 'GET' && url.pathname === '/api/zhelezo') return json(res, 200, await zhelezo(REPO))
    if (req.method === 'GET' && url.pathname === '/api/istoriya') return json(res, 200, await istoriyaRaboty(url.searchParams.get('den')))
    if (req.method === 'GET' && url.pathname.startsWith('/f/')) {
      // кривой %-код и пропавший файл — 404, а не 500 с «ошибкой» в отзывы разработчикам
      let name = ''
      try { name = decodeURIComponent(url.pathname.slice(3)) } catch {}
      if (!name || safeName(name, 200) !== name) { res.writeHead(404); return res.end() }
      let data
      try { data = await readFile(join(FILES, name)) } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'EISDIR') { res.writeHead(404); return res.end() }
        throw e
      }
      const type = MIME[extname(name).toLowerCase()]
      res.writeHead(200, { 'content-type': type || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'content-disposition': `${type ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}` })
      return res.end(data)
    }
    if (req.method === 'POST' && req.headers['x-dzhinni'] === '1') {
      if (url.pathname === '/api/developer/preview') {
        await body(req)
        try{const result=await ensureDeveloperPreview(REPO);res.setHeader('x-ally-preview-origin',new URL(result.url).origin);return json(res,200,result)}
        catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
      }
      if (url.pathname === '/api/developer/preview/reset') {
        await body(req)
        try{const result=await resetDeveloperPreview(REPO);res.setHeader('x-ally-preview-origin',new URL(result.url).origin);return json(res,200,result)}
        catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
      }
      if (url.pathname === '/api/aggregator/test') {
        try {
          const payload = JSON.parse((await body(req)) || '{}')
          return json(res, 200, await testAggregatorConnection({ ...payload, repo: REPO }))
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message })
        }
      }
      if (url.pathname === '/api/aggregator') {
        try {
          const payload = JSON.parse((await body(req)) || '{}')
          const status = saveAggregatorConfig(payload, { repo: REPO })
          if (payload.defaultModel && provider?.settings) {
            const raw = String(payload.defaultModel).trim()
            const modelId = raw.startsWith(TOKENATOR_PREFIX) ? raw : TOKENATOR_PREFIX + raw
            await provider.settings({ executorSettings: { tokenator: { model: modelId }, claude: { model: modelId } } }).catch(() => {})
          }
          return json(res, 200, { ok: true, aggregator: status, provider: provider?.status?.() || null })
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message })
        }
      }
      if (url.pathname === '/api/quick-notes') {
        try {
          const payload = JSON.parse((await body(req)) || '{}')
          const dataDir = process.env.DZHINNI_ENGINE_DATA || join(HERE, '.opencode-data')
          return json(res, 200, { ok: true, ...(await addQuickNote({ repo: REPO, dataDir, kind: payload.kind, text: payload.text })) })
        } catch (error) {
          return json(res, error.status || 400, { ok: false, error: error.message })
        }
      }
      if (url.pathname === '/api/quick-notes/delete') {
        try {
          const payload = JSON.parse((await body(req)) || '{}')
          const dataDir = process.env.DZHINNI_ENGINE_DATA || join(HERE, '.opencode-data')
          return json(res, 200, { ok: true, ...(await deleteQuickNote({ repo: REPO, dataDir, id: payload.id })) })
        } catch (error) {
          return json(res, error.status || 400, { ok: false, error: error.message })
        }
      }
      if (zhizn && url.pathname === '/api/okno/zhiva') { zhizn.zhiva(); return json(res, 200, { ok: true }) }
      if (zhizn && url.pathname === '/api/okno/zakryta') { zhizn.zakryta(); return json(res, 200, { ok: true }) }
      // Летописец разбирает день через Джинни: текст → доступная нейросеть → текст (tekst-hod.mjs).
      if (url.pathname === '/api/tekst') {
        if (!provider?.tekst) return json(res, 503, { error: 'текстовый ход есть только в прямом режиме моста' })
        try { return json(res, 200, await provider.tekst(JSON.parse(await body(req)))) }
        catch (error) { return json(res, error.status || 500, { error: String(error.message || error).slice(0, 500) }) }
      }
      if (CODEX && provider && url.pathname === '/codex/login') return json(res, 200, provider.login())
      if (CODEX && provider && url.pathname === '/codex/login-device') return json(res, 200, provider.login(true))
      if (provider && url.pathname === '/codex/status') return json(res, 200, await provider.checkLogin())
      if (provider && url.pathname === '/codex/retry') return json(res, 200, await provider.retry())
      if (url.pathname === '/engine/login' || url.pathname === '/engine/login-status') {
        const data = JSON.parse(await body(req))
        return json(res, 200, url.pathname.endsWith('login-status') ? engineLoginStatus(data.engine) : engineLogin(data.engine, REPO))
      }
      if (url.pathname === '/engine/settings') {
        const data = JSON.parse(await body(req))
        if (Object.hasOwn(data, 'taskAction')) {
          if (Object.keys(data).some(k=>!['taskAction','slug','operationId','baseVersion','set','body','create','uploads'].includes(k))) return json(res,400,{ok:false,error:'Некорректный запрос задачи'})
          try { return json(res,200,await taskEditor(REPO,data,FILES)) }
          catch { return json(res,503,{ok:false,error:'Сервис задач не ответил. Черновик сохранён; проверь результат сохранения.'}) }
        }
        // Compatibility with paired phone gateways whose allowlist predates /engine/compact.
        if (['compact', 'compact-status'].includes(data.contextAction)) {
          if (Object.keys(data).some(key => !['contextAction', 'executor', 'target'].includes(key))) return json(res, 400, { error: 'Некорректный запрос сжатия' })
          if (!provider?.compactContext) return json(res, 409, { error: 'Этот режим не умеет сжимать контекст' })
          try { return json(res, 200, data.contextAction === 'compact-status'
            ? await (provider.compactStatus?.() || { ok: true, provider: provider.status() }) : await provider.compactContext(data)) }
          catch (error) { return json(res, error.status || 409, { ok: false, error: error.message }) }
        }
        return json(res, 200, await provider.settings(data))
      }
      if (url.pathname === '/engine/compact') {
        if (!provider?.compactContext) return json(res, 409, { error: 'Этот режим не умеет сжимать контекст' })
        try { return json(res, 200, await provider.compactContext(JSON.parse(await body(req) || '{}'))) }
        catch (error) { return json(res, error.status || 409, { ok: false, error: error.message }) }
      }
      if (url.pathname === '/engine/shift') {
        if (!provider?.shiftState) return json(res, 409, { error: 'Этот режим не ведёт смену писателя' })
        return json(res, 200, await provider.shiftState())
      }
      if (url.pathname === '/engine/shift/release') {
        if (!provider?.releaseShift) return json(res, 409, { error: 'Этот режим не ведёт смену писателя' })
        return json(res, 200, await provider.releaseShift())
      }
      if (url.pathname === '/engine/stop') {
        if (!provider?.stop) return json(res, 409, { error: 'Этот режим не умеет останавливать ход' })
        try { return json(res, 200, await provider.stop()) }
        catch (error) { return json(res, 409, { ok: false, error: error.message }) }
      }
      if (url.pathname === '/engine/open') {
        const { openEngine } = await import('./engine-launch.mjs')
        return json(res, 200, await openEngine(JSON.parse(await body(req))))
      }
      if (url.pathname === '/upload') {
        if (Number(req.headers['content-length'] || 0) > MAX_FILE) return json(res, 413, { ok: false, error: 'файл больше 50 МБ' })
        const name = `${stamp()}-${safeName(decodeURIComponent(req.headers['x-name'] || '')) || 'file'}`
        await mkdir(FILES, { recursive: true })
        const size = await saveTo(req, join(FILES, name))
        return json(res, 200, { ok: true, name, size })
      }
      if (url.pathname === '/otzyvy/upload') {
        if (!otz.vkl) return json(res, 503, { ok: false, error: 'Обратная связь в этой копии не настроена' })
        let rawName = ''
        try { rawName = decodeURIComponent(req.headers['x-name'] || '') } catch {}
        const cl = req.headers['content-length'] != null ? Number(req.headers['content-length']) : undefined
        const check = validateFeedbackFile({ name: rawName, size: Number.isFinite(cl) ? cl : undefined })
        if (!check.ok) return json(res, check.status || 400, { ok: false, error: check.error })
        const id = `${stamp()}-${check.safeName}`
        if (safeFeedbackName(id, 200) !== id) return json(res, 400, { ok: false, error: 'Некорректное имя файла' })
        await mkdir(OTZ_FILES, { recursive: true })
        const dest = join(OTZ_FILES, id)
        const written = await saveFeedbackTo(req, dest, check.limitBytes, `Файл «${check.safeName}» больше лимита ${check.mb} МБ для ${check.label}`)
        if (written <= 0) {
          await unlink(dest).catch(() => {})
          return json(res, 400, { ok: false, error: `Файл «${check.safeName}» пустой` })
        }
        return json(res, 200, { ok: true, id, name: check.safeName, size: written, kind: check.kind })
      }
      if (url.pathname === '/attachments/reference') {
        // Not exposed by mobile-proxy's route allowlist. Only the local window chooses disk paths.
        if (req.headers.origin !== `http://${req.headers.host}` || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return json(res, 403, { ok: false, error: 'Прикрепить по пути можно из окна AllY на этом компьютере' })
        const controller = new AbortController()
        const disconnect = () => { if (!res.writableEnded) controller.abort() }
        res.once('close', disconnect)
        try { return json(res, 200, await references.create(JSON.parse(await body(req)), { signal: controller.signal })) }
        finally { res.off('close', disconnect) }
      }
      // запись с микрофона окна: PCM 16 кГц 16 бит моно, до 10 минут
      if (url.pathname === '/slukh') {
        const MAX = 10 * 60 * 16000 * 2
        if (Number(req.headers['content-length'] || 0) > MAX) return json(res, 413, { ok: false, error: 'запись длиннее 10 минут' })
        const kuski = []
        let n = 0
        for await (const c of req) { n += c.length; if (n > MAX) return json(res, 413, { ok: false, error: 'запись длиннее 10 минут' }); kuski.push(c) }
        const b = Buffer.concat(kuski), nachalo = Date.now()
        const r = await sl.rasshifrovat(new Int16Array(b.buffer, b.byteOffset, b.length >> 1))
        if (!r.ok) otz.sobytie('oshibka', bezPutey('слух: ' + r.error))
        // доходили ли куски, по журналу было не понять
        log(`слух: ${(b.length / 32000).toFixed(1)} с звука, ${r.ok ? 'слов ' + String(r.text || '').split(/\s+/).filter(Boolean).length : 'ошибка ' + r.error}, ${Date.now() - nachalo} мс, ${/Chrome|Electron/i.test(req.headers['user-agent'] || '') ? 'окно' : 'телефон (шлюз не передаёт user-agent)'}`)
        return json(res, 200, r)
      }
      const data = JSON.parse((await body(req)) || '{}')
      if (url.pathname === '/task/feedback') {
        if (!provider?.feedback) return json(res, 409, { error: 'Этот режим пока не передаёт оценки задач' })
        return json(res, 200, await provider.feedback(data))
      }
      // голос: кусок текста (окно режет ответ по предложениям) → mp3 Светланы; ошибка → окно говорит голосом Windows
      if (url.pathname === '/golos') {
        const t = clip(data.text, 1000).trim()
        if (!t) return json(res, 400, { ok: false })
        try {
          const mp3 = await gl.ozvuchit(t)
          res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' })
          return res.end(mp3)
        } catch (e) { return json(res, 502, { ok: false, error: 'голос недоступен: ' + bezPutey(e.message) }) }
      }
      if (url.pathname === '/tasks/plan-order') {
        try { return json(res, 200, reorderTaskPlan(REPO, data.ids, data.revision, provider?.taskBoard?.() || {})) }
        catch (error) { return json(res, 409, { error: error.message }) }
      }
      if (url.pathname === '/tasks/reorder') {
        if (!provider?.reorderTasks) return json(res, 409, { error: 'Порядок поручений недоступен в этом режиме.' })
        if (!Array.isArray(data?.messageIds) || data.messageIds.some(id => typeof id !== 'string' || !/^msg_[a-f0-9]{32}$/.test(id)) ||
            typeof data.revision !== 'string' || !/^[a-f0-9]{64}$/.test(data.revision))
          return json(res, 400, { error: 'Неверный список поручений или версия очереди.' })
        try { return json(res, 200, await provider.reorderTasks(data.messageIds, data.revision)) }
        catch (error) { return json(res, 409, { error: error.message }) }
      }
      if (url.pathname === '/messages/expedite') {
        if (!provider?.expedite) return json(res, 409, { error: 'Отправка вне очереди недоступна' })
        if (typeof data.messageId !== 'string' || !/^msg_[a-f0-9]{32}$/.test(data.messageId)) return json(res, 400, { error: 'Неверный ID сообщения' })
        try { return json(res, 200, await provider.expedite(data.messageId, { interrupt: data.interrupt === true })) }
        catch (error) { return json(res, 409, { error: error.message }) }
      }
      if (url.pathname === '/messages/cancel') {
        if (!provider?.cancelTask) return json(res, 409, { error: 'Удаление из очереди недоступно' })
        if (typeof data.messageId !== 'string' || !/^msg_[a-f0-9]{32}$/.test(data.messageId)) return json(res, 400, { error: 'Неверный ID сообщения' })
        try { return json(res, 200, await provider.cancelTask(data.messageId)) }
        catch (error) { return json(res, 409, { error: error.message }) }
      }
      if (url.pathname === '/say') {
        if (data.clientMessageId !== undefined && (typeof data.clientMessageId !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(data.clientMessageId)))
          return json(res, 400, { error: 'Неверный ID сообщения' })
        if (data.sentAt !== undefined && (!Number.isSafeInteger(data.sentAt) || data.sentAt <= 0 || data.sentAt > 8640000000000000))
          return json(res, 400, { error: 'Неверное время отправки' })
        const sentAt = data.sentAt ?? Date.now()
        // the phone lets 120 000 characters through, the bridge silently kept the first 4 000.
        // Now one limit for both, and a longer text is refused out loud (the phone keeps it in the field), not cut.
        if (String(data.text ?? '').length > MAX_SAY_TEXT) return json(res, 413, { ok: false, error: `Сообщение длиннее ${MAX_SAY_TEXT.toLocaleString('ru-RU')} знаков — раздели на части` })
        const text = String(data.text ?? '').trim()
        const files = await attached(data.files)
        // Mobile proxy deliberately does not forward Origin, so a known token alone grants no mobile disk access.
        if (data.references?.length && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { ok: false, error: 'Ссылки на файлы компьютера отправляются из окна на компьютере' })
        const localFiles = await references.resolve(data.references)
        if (files.length + localFiles.length > 20) return json(res, 400, { ok: false, error: 'Можно отправить до 20 вложений за раз' })
        if (!text && !files.length && !localFiles.length) return json(res, 400, { ok: false })
        // Ответ на вопрос из «Ждёт тебя»: вопрос помечается «ответ получен», а мне в ту же реплику — что сделать
        // с ответом. решённые вопросы висели, пользователь спрашивал повторно.
        let pamyatka = ''
        const mOtv = /^Ответ на твой вопрос «([\s\S]*?)»:/.exec(text)
        const vOtv = mOtv && state.voprosy.find((v) => v.text === mOtv[1])
        if (vOtv) {
          vOtv.otvechen = Date.now()
          sohranitVoprosy()
          pamyatka = `\n\n[окно: это ответ на вопрос id=${vOtv.id}. В этом же ходе: решение — в задача.md и letopisec.py decision; вопрос закрыт — vopros snyat; закрыт частично — vopros zadat с суженным текстом]`
        }
        const content = (files.length
          ? `${text}\n\nВложения из окна (открой их Read):\n${files.map((n) => join(FILES, n)).join('\n')}`.trim()
          : text) + (localFiles.length ? '\n\nЛокальные файлы, которыми пользователь поделился по пути (без загрузки; читай с диска):\n' + localFiles.map(f => JSON.stringify({ path: f.path, name: f.name, size: f.size })).join('\n') : '') + pamyatka
        let receipt
        if (provider) receipt = await provider.enqueue(content, files.filter(name => /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)).map(name => join(FILES, name)),
          provider.status().provider === 'direct' ? { ...data.taskContext, clientMessageId: data.clientMessageId, sentAt } : data.taskContext)
        else if (PUT === 'ochered') { ochered.push(content); razbudit() }
        else await mcp.notification({ method: 'notifications/claude/channel', params: { content, meta: { chat_id: 'okno' } } })
        // id телефона помнит сам мост — иначе при поставщике не-direct (его проверка
        // контекста чужих полей не берёт) запись шла без clientMessageId и пузырь «жду» на телефоне не снимался.
        const clientMessageId = data.clientMessageId || undefined   // формат уже проверен выше (UUID)
        const historyText = text + (localFiles.length ? '\n\n' + localFiles.map(f => `Файл на компьютере (без загрузки): ${f.name} · ${f.size} байт\n\`${f.path}\``).join('\n') : '')
        await remember('ty', historyText, files, null, { sentAt, clientMessageId, ...receipt, ...(receipt?.clientMessageId ? {} : { clientMessageId }) })
        return json(res, 200, { ok: true, sentAt: receipt?.sentAt ?? sentAt,
          ...(receipt?.messageId && { messageId: receipt.messageId, state: receipt.state }) })
      }
      // «Фокус»: закрыть или поправить задачу прямо из окна — без Claude и без лимитов
      if (url.pathname === '/dnevnik') {   // реплика в дневник; пустая — «сел за практику», спутник начинает сам
        // «запомнить: …?» → в «Знаю о тебе» только при da === true (кнопка «Да» в окне), иное — убрать без записи
        const r = data.zapomnit ? await dn.zapomnit(data.zapomnit, data.da === true)
          : data.konec ? await dn.zakonchit() : data.text ? await dn.hod(clip(data.text, 8000)) : await dn.nachat()
        return json(res, r.ok ? 200 : 400, r)
      }
      if (url.pathname === '/fokus') {   // ☆ на странице «Задачи»: в фокус / из фокуса / новый порядок
        const r = await fokusPravka(REPO, { slug: String(data.slug || ''), on: data.on === true, poryadok: data.poryadok })
        return json(res, r.ok ? 200 : 400, r)
      }
      if (url.pathname === '/zadacha') {
        const r = await pravkaZadachi({ слаг: String(data.slug || ''), поле: String(data.pole || ''), значение: clip(data.znach, 300) })
        return json(res, r.ok ? 200 : 400, r)
      }
      if (url.pathname === '/podderzhka/otvet') {
        if (!pod) return json(res, 404, { ok: false })
        return json(res, 200, await pod.otvet(String(data.id || ''), clip(data.text, 8000).trim()))
      }
      // кнопки виджета в окне: «Оставить», «вернуть как было», «Убрать», разрешение источника
      if (url.pathname === '/vidzhet') {
        const imya = String(data.imya || '')
        const r = data.deystvie === 'ostavit' ? await vid.ostavit(imya)
          : data.deystvie === 'otkat' ? await vid.otkat(imya)
          : data.deystvie === 'ubrat' ? await vid.ubrat(imya)
          : data.deystvie === 'razreshit' ? await vid.razreshit(imya, String(data.host || ''), data.da === true)
          : { ok: false }
        return json(res, r.ok ? 200 : 400, r)
      }
      if (url.pathname === '/otzyvy/report') {
        if (!otz.vkl) return json(res, 503, { error: 'Обратная связь в этой копии не настроена' })
        const text = String(data.text || '').trim(), kind = String(data.kind || '')
        if (!text || text.length > 7000 || !['idea','bug','improvement'].includes(kind)) return json(res, 400, { error: 'Выбери тип и напиши сообщение до 7000 символов' })
        const rawFiles = Array.isArray(data.files) ? data.files : []
        const resolved = []
        for (const item of rawFiles) {
          const fid = String(item?.id || '')
          if (!fid || safeFeedbackName(fid, 200) !== fid) return json(res, 400, { error: 'Некорректное имя вложения' })
          const p = join(OTZ_FILES, fid)
          let st
          try { st = await stat(p) } catch { return json(res, 400, { error: 'Загруженное вложение не найдено' }) }
          if (!st.isFile()) return json(res, 400, { error: 'Загруженное вложение не найдено' })
          resolved.push({ path: p, name: safeFeedbackName(item?.name || fid) || fid, size: st.size })
        }
        if (resolved.length) {
          const filesCheck = validateFeedbackFiles(resolved)
          if (!filesCheck.ok) return json(res, filesCheck.status || 400, { error: filesCheck.error })
        }
        const label = { idea: 'Пожелание', bug: 'Ошибка', improvement: 'Моя доработка' }[kind]
        try {
          await otz.otchet(label + '\n\n' + text, '', resolved)
          await Promise.all(resolved.map(f => unlink(f.path).catch(() => {})))
          return json(res, 200, { ok: true })
        } catch (error) {
          return json(res, 502, { error: error?.userMessage || 'Не удалось подтвердить отправку. Автоматического повтора нет.' })
        }
      }
      if (url.pathname === '/otzyvy/soglasie') {
        await otz.soglasie(data.da === true)
        return json(res, 200, await otz.sostoyanie())
      }
      if (url.pathname === '/press') {
        const r = await nazhat(String(data.cmd || ''))
        return json(res, r.ok ? 200 : r.code, r)
      }
      if (url.pathname === '/dokument') {   // владелец убрал документ в архив или вернул
        const d = doki[String(data.put || '')]
        if (!d) return json(res, 404, { oshibka: 'нет такого документа' })
        d.arhiv = !!data.arhiv
        await sohranitDoki(); push('doki', dokSpisok())
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/vopros-snyat') {   // владелец сам убрал вопрос из окна
        state.voprosy = state.voprosy.filter((v) => v.id !== String(data.id || ''))
        sohranitVoprosy()
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/verdict') {
        const id = String(data.id || '')
        const ask = state.asks[id]
        if (!ask) return json(res, 404, { ok: false })
        delete state.asks[id]
        if (id.startsWith('otchet-')) {
          push('asked', { id })
          let text = data.allow ? 'отчёт ушёл разработчикам' : 'владелец не стал отправлять отчёт'
          if (data.allow) try { text = await otz.otchet(ask.preview) } catch (e) { text = 'отчёт не ушёл: ' + e.message }
          push('say', { text })
          return json(res, 200, { ok: true })
        }
        if (provider?.permission) await provider.permission(id, !!data.allow)
        else await mcp.notification({ method: 'notifications/claude/channel/permission', params: { request_id: id, behavior: data.allow ? 'allow' : 'deny' } })
        push('asked', { id })
        return json(res, 200, { ok: true })
      }
    }
    res.writeHead(404); res.end()
  } catch (e) {
    log('ошибка запроса', url.pathname, e.message)
    otz.sobytie('oshibka', bezPutey(`${dlyaOtzyva(url.pathname)}: ${e.message}`))
    json(res, [400, 413].includes(e.status) ? e.status : 500, { ok: false, error: e.message })
  }
})
server.on('error', (e) => {
  log('окно не поднялось:', e.code === 'EADDRINUSE' ? `порт ${PORT} занят (второй мост уже запущен?)` : e.message)
  if (EXTERNAL) { provider.close(); process.exit(1) }
})
server.listen(PORT, HOST, () => log(`окно: http://${HOST}:${PORT}  репо: ${REPO}`))
return server
}
