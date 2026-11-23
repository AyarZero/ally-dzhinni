// Mobile read model over the same chat/provider. No second task queue or model calls.
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { basename, dirname, join } from 'node:path'
import { qrPng } from './qr.mjs'
import { mobileContextReader } from './mobile-context.mjs'
import { mobileTaskReader } from './mobile-task-catalog.mjs'

const PAIR_TOKEN = /^[A-Za-z0-9_-]{43}$/
const gzipBody = promisify(gzip)
const readContext = mobileContextReader()
const readTasks = mobileTaskReader()

// Saved DeepSeek API balance: the phone must see the same local number as the window's «Помощники» tab.
// The snapshot is a cached file read (helper-resources.mjs); it is not a model call and cannot invent a number.
async function helperSnapshot(helpers) {
  if (!helpers || typeof helpers.snapshot !== 'function') return null
  try { return await helpers.snapshot() } catch { return null }
}

export const MOBILE_DATA = process.env.DZHINNI_MOBILE_DATA || 'D:/Cache/DzhinniMobile'
export const MOBILE_APK = process.env.DZHINNI_MOBILE_APK || 'D:/Cache/DzhinniMobile/releases/dzhinni-0.5.5.apk'
export const MOBILE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
const json = (res, code, value) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
export function mobileState({ provider, state, getChat, zhizn, context, balance = null }) {
  const p = provider?.status() || {}
  // Окно на компе закрыто → срок закрытия моста; телефон считает остаток сам, часы сверяет по заголовку Date.
  const z = zhizn?.status() || null
  return { most: { zakrytieAt: z?.deadline ?? null, zhdyotHod: !!z?.zhdyotHod }, provider: { provider: p.provider, executor: p.executor, busy: !!p.busy, queued: p.queued || 0,
    needsReview: p.needsReview || 0, paused: !!p.paused,
    error: p.error || '', waiting: p.waiting || '', selection: p.selection ? { mode: p.selection.mode } : null,
    context: context ?? p.context ?? null,
    contextPolicy: p.contextPolicy ?? null,
    contextCompaction: p.contextCompaction ? { state: p.contextCompaction.state, requestedAt: p.contextCompaction.requestedAt } : null,
    canCompactContext: p.canCompactContext === true,
    contextCompactionMode: p.contextCompactionMode ?? null,
    compactTarget: p.compactTarget ?? null,
    // без порога автокомпакта телефон делил на окно модели.
    claudeAutoCompactTokens: p.claudeAutoCompactTokens ?? null,
    executorSettings: p.executorSettings ?? null, executorCatalog: p.executorCatalog ?? null,
    capabilities: { queue: true, steer: p.steerLive === true, sentAt: true, stopFlush: p.stopFlush === true, expedite: typeof provider?.expedite === 'function' },
    task: p.task ? { title: p.task.title, status: p.task.status, inputPhase: p.task.inputPhase, model: p.task.model, requested_model: p.task.requested_model,
      startedAt: Date.parse(p.task.started_at) || null, step: p.task.step?.text ? { text: String(p.task.step.text).slice(0, 120), at: p.task.step.at || null } : null,
      // The answer being written right now (claude-draft.mjs): only while the turn runs.
      draft: p.busy && p.task.draft?.text ? { text: String(p.task.draft.text).slice(-4000), at: p.task.draft.at || null } : null } : null,
    availability: (p.availability || []).map(row => ({ executor: row.executor, auth: row.observation?.auth, observedAt: row.observation?.observedAt ?? null,
      quota: row.observation?.quota ?? { state: 'unknown' } })),
    // Saved DeepSeek API balance: money, not a subscription quota; empty list = nothing checked yet.
    helpers: balance ? [{ id: 'deepseek', name: 'DeepSeek', status: 'ready', checkedAt: balance.checkedAt, wallets: balance.wallets }] : [] },
    chat: getChat().slice(-300).map(m => {
      const delivery = m.messageId ? provider?.delivery?.(m.messageId) || null : null
      const review = ['uncertain', 'parked'].includes(delivery?.phase)
      const waiting = ['prepared', 'sending', 'running'].includes(delivery?.phase)
      const received = delivery?.state === 'received' || delivery?.receivedAt > 0
      // Older Android versions treat every unreceived delivery as a waiting card.
      // Only a live queue item may create one; terminal history keeps its real receipt
      // state without inventing receivedAt or offering a resend.
      return { who: m.who, text: m.text, at: m.at,
        ...(m.sentAt ? { sentAt: m.sentAt } : {}), files: m.files || [], ...(m.engine ? { engine: m.engine } : {}),
        ...(m.messageId ? { messageId: m.messageId, clientMessageId: m.clientMessageId,
          delivery: waiting || received ? delivery : null, ...(review ? { review: delivery.phase } : {}) }
          : m.clientMessageId ? { clientMessageId: m.clientMessageId } : {}) }
    })
      .sort((a, b) => (a.sentAt || a.at || 0) - (b.sentAt || b.at || 0)),
    // помощники и фоновые дела работают — телефон писал «На связи».
    processes: Object.values(state?.processes || {}).filter(q => Number(q?.progress) < 100 && !q?.stoit)
      .sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 5)
      .map(q => ({ id: String(q.id || ''), name: String(q.name || q.id || '').slice(0, 80), progress: Number(q.progress) || 0 })),
    questions: (state.voprosy || []).filter(q => !q.otvechen).map(q => ({ id: q.id, text: q.text })).slice(-10),
    asks: Object.values(state.asks || {}).map(q => ({ id: q.id, tool: q.tool, what: q.what })).slice(-10) }
}
export async function mobileControl(action, payload = {}) {
  const config = JSON.parse(await readFile(join(MOBILE_DATA, 'access.json'), 'utf8'))
  const response = await fetch('http://127.0.0.1:8800/local/' + action, { method: 'POST',
    headers: { 'x-mobile-control': config.control, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(3000) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'Мобильный вход не отвечает')
  return value
}
export async function mobileRoutes({ req, res, url, HERE, REPO, provider, state, getChat, zhizn, helpers = null, apk = MOBILE_APK, control = mobileControl, qr = qrPng }) {
  const assets = { '/mobile': ['mobile.html', 'text/html'], '/mobile/': ['mobile.html', 'text/html'],
    '/mobile/connect': ['mobile-connect.html', 'text/html'],
    '/mobile-connect.js': ['mobile-connect.js', 'text/javascript'], '/mobile.css': ['mobile.css', 'text/css'],
    '/mobile/qr': ['mobile-qr.html', 'text/html'], '/mobile/qr.js': ['mobile-qr.js', 'text/javascript'] }
  if (req.method === 'GET' && assets[url.pathname]) {
    const [file, type] = assets[url.pathname]
    res.writeHead(200, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store',
      'content-security-policy': MOBILE_CSP, 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' })
    res.end(await readFile(join(HERE, file))); return true
  }
  // «/» в поле ввода телефона: тот же список, что в окне на компе.
  if (req.method === 'GET' && url.pathname === '/mobile/komandy') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(provider?.commands ? provider.commands() : { at: null, list: [] })); return true
  }
  if (req.method === 'GET' && url.pathname === '/mobile/state') {
    const before = provider?.status() || {}
    const measured = await readContext(REPO, before)
    const after = provider?.status() || {}
    const context = after.executor === before.executor && after.threadId === before.threadId ? measured : null
    const balance = await helperSnapshot(helpers)
    const value = {...mobileState({ provider, state, getChat, zhizn, context, balance }), taskCatalog: await readTasks(REPO)}, data = JSON.stringify(value)
    // 338 КБ на опрос. Tokenator's synthetic observedAt is Date.now() on every read.
    const stable = value.provider.executorSettings?.claude?.model?.startsWith('tokenator:')
      ? { ...value, provider: { ...value.provider, availability: value.provider.availability.map(row =>
        row.executor === 'claude' ? { ...row, observedAt: null } : row) } } : value
    // Weak validator: identity/gzip and synthetic freshness share the same meaningful state.
    const tag = 'W/"' + createHash('sha256').update(JSON.stringify(stable)).digest('hex') + '"'
    const unchanged = req.headers['if-none-match'] === tag
    const compressed = !unchanged && String(req.headers['accept-encoding'] || '').split(',').some(part => {
      const [encoding, ...parameters] = part.trim().split(';')
      return encoding.toLowerCase() === 'gzip' && !parameters.some(p => /^\s*q\s*=\s*0(?:\.0*)?\s*$/i.test(p))
    })
    const body = unchanged ? undefined : compressed ? await gzipBody(data) : data
    res.writeHead(unchanged ? 304 : 200, { 'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store', etag: tag, vary: 'Accept-Encoding',
      ...(compressed ? { 'content-encoding': 'gzip' } : {}), 'x-content-type-options': 'nosniff' })
    res.end(body); return true
  }
  const release = /^\/mobile\/releases\/(dzhinni-[0-9]+\.[0-9]+\.[0-9]+\.apk)$/.exec(req.url || '')
  if (['GET', 'HEAD'].includes(req.method) && (url.pathname === '/mobile/app.apk' || release)) {
    const file = release ? join(dirname(apk), release[1]) : apk
    try { const info = await stat(file); res.writeHead(200, { 'content-type': 'application/vnd.android.package-archive',
      'content-disposition': `attachment; filename="${basename(file)}"`, 'content-length': info.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      if (req.method === 'HEAD') res.end()
      else { const stream = createReadStream(file); stream.once('error', () => res.destroy()); res.once('close', () => stream.destroy()); stream.pipe(res) } }
    catch { json(res, release ? 404 : 503, { error: 'Сборка приложения ещё не готова' }) }
    return true
  }
  if (req.method === 'POST' && ['/mobile/pair', '/mobile/revoke', '/mobile/status'].includes(url.pathname)) {
    if (req.headers['x-dzhinni'] !== '1') { json(res, 403, { error: 'Нужен локальный вход' }); return true }
    try { json(res, 200, await control(url.pathname.slice(8))) }
    catch { json(res, 503, { error: 'Мобильный вход ещё не запущен на ноутбуке' }) }
    return true
  }
  if (req.method === 'POST' && url.pathname === '/mobile/qr') {
    if (req.headers['x-dzhinni'] !== '1') { json(res, 403, { error: 'Нужен локальный вход' }); return true }
    try {
      const pair = await control('pair')
      const token = String(pair?.url || '').split('#pair=')[1] || ''
      if (!PAIR_TOKEN.test(token)) { json(res, 503, { error: 'Ссылка подключения ещё не готова' }); return true }
      const link = new URL(pair.url).origin + '/mobile/qr#pair=' + token
      const png = await qr(link)
      json(res, 200, { link, png: Buffer.from(png).toString('base64'), expiresIn: 600 })
    } catch (error) {
      json(res, 503, { error: error?.message || 'QR-код недоступен' })
    }
    return true
  }
  return false
}
