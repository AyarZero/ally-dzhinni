// Файлы в переписке («как мне искать файл, который ты сделала? Отправь в окно переписки с
// возможностью скачивания. И всегда делай так»). Джинни прикладывает файл к ответу, окно показывает карточку:
// картинка видна сразу, у любого файла есть «скачать». Отдаём только файлы внутри папки владельца (и папок из
// DZHINNI_SKACHAT_PAPKI через «;»), без секретов и служебного.
import { createReadStream, realpathSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { basename, extname, resolve, sep } from 'node:path'

const TIPY = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.apk': 'application/vnd.android.package-archive',
}
// предпросмотр в окне без скачивания — только безопасные для показа типы (html/svg — только скачать)
const POKAZ = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.webm', '.mov', '.txt', '.md', '.csv'])
const ZAPRET = /[\\/](_?secrets?|\.git|\.ssh|node_modules|\.ally-data|\.opencode-data|\.core-data)([\\/]|$)|\.env($|\.)|\.(pem|key|p12|pfx)$|id_(rsa|ed25519)|[\\/]\.(otzyvy|ally-client|developer-interface|agent-writer)\.json$|[\\/](aggregator|quick-notes)\.json$|[\\/][^\\/]*(token|cookie|credential|client_secret)[^\\/]*$/i

export function korni(repo) {
  const extra = String(process.env.DZHINNI_SKACHAT_PAPKI || '').split(';').map((s) => s.trim()).filter(Boolean)
  return [repo, ...extra].map((p) => {
    const abs = resolve(p)
    try { return realpathSync(abs).toLowerCase() } catch { return abs.toLowerCase() }
  })
}

function insideRoots(candidate, roots) {
  const low = candidate.toLowerCase()
  return roots.some((k) => low === k || low.startsWith(k + sep) || low.startsWith(k + '/'))
}

/** Можно ли отдать файл: путь внутри разрешённых корней, тип известен, не секрет. → полный путь или null */
export function razreshit(repo, put) {
  const chistyy = String(put || '').trim().replace(/^[`'"«]+|[`'"»]+$/g, '')
  if (!chistyy) return null
  const roots = korni(repo)
  const polnyy = resolve(repo, chistyy)
  let checked = polnyy
  try { checked = realpathSync(polnyy) } catch {}
  if (!insideRoots(polnyy, roots) || !insideRoots(checked, roots)) return null
  if (ZAPRET.test(polnyy) || ZAPRET.test(checked) || !TIPY[extname(polnyy.toLowerCase())]) return null
  return polnyy
}

// Телефон: мобильный шлюз
// пропускает только точные пути без «?», поэтому путь к файлу едет в адресе кодом base64url: GET /fajl/<код>.
export const FAJL_PUT = /^\/fajl\/([A-Za-z0-9_-]{1,1400})$/
export const kodPuti = (put) => Buffer.from(String(put), 'utf8').toString('base64url')

/** GET /api/skachat?put=…[&dl=1] и GET /fajl/<base64url пути> (всегда «скачать») — отдать файл потоком. true, если запрос наш. */
export async function skachat(req, res, url, repo) {
  const kod = req.method === 'GET' ? FAJL_PUT.exec(url.pathname) : null
  if (req.method !== 'GET' || (url.pathname !== '/api/skachat' && !kod)) return false
  const polnyy = razreshit(repo, kod ? Buffer.from(kod[1], 'base64url').toString('utf8') : url.searchParams.get('put'))
  const otvet = (kod, tekst) => { res.writeHead(kod, { 'content-type': 'text/plain; charset=utf-8' }); res.end(tekst) }
  if (!polnyy) { otvet(403, 'этот файл окно не отдаёт'); return true }
  let st, realPolnyy
  try { realPolnyy = await realpath(polnyy); st = await stat(realPolnyy) } catch { otvet(404, 'файла нет'); return true }
  if (!insideRoots(realPolnyy, korni(repo)) || ZAPRET.test(realPolnyy)) { otvet(403, 'этот файл окно не отдаёт'); return true }
  if (!st.isFile()) { otvet(404, 'это не файл'); return true }
  const ext = extname(realPolnyy).toLowerCase()
  const imya = encodeURIComponent(basename(realPolnyy))
  const dl = Boolean(kod) || url.searchParams.get('dl') === '1' || !POKAZ.has(ext)
  res.writeHead(200, {
    'content-type': TIPY[ext], 'content-length': st.size, 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-disposition': `${dl ? 'attachment' : 'inline'}; filename*=UTF-8''${imya}`,
  })
  createReadStream(realPolnyy).on('error', () => res.destroy()).pipe(res)
  return true
}

/** * Карточка «📎 …md» становится PDF с тем же именем, если он есть; иначе карточки нет вовсе. */
export function bezMd(text, est = () => false) {
  return String(text).split('\n').flatMap((line) => {
    const m = /^📎\s*(.+?\.md)\s*$/i.exec(line)
    if (!m) return [line]
    const pdf = m[1].replace(/\.md$/i, '.pdf')
    return est(pdf) ? ['📎 ' + pdf] : []
  }).join('\n')
}

/** сборки AllY выдаются карточками, даже если исполнитель написал URL. */
export function apkKartochkami(text, est = () => false, releaseOrigin = '') {
  const cards = new Set(), lines = []; let fence = null
  const target = value => {
    let name
    try {
      let path = value
      if (/^https?:\/\//i.test(value)) {
        const url = new URL(value)
        if (!releaseOrigin || url.origin !== new URL(releaseOrigin).origin) return null
        path = url.pathname
      }
      const match = /^(?:\/mobile\/releases\/|projects\/dzhinni\/android\/vypuski\/)(dzhinni-\d+\.\d+\.\d+\.apk)$/i.exec(path)
      if (!match) return null
      name = 'projects/dzhinni/android/vypuski/' + match[1]
    } catch { return null }
    return est(name) ? name : null
  }
  for (const line of String(text).split('\n')) {
    if (fence) {
      if (new RegExp('^ {0,3}' + fence.char + '{' + fence.length + ',}\\s*$').test(line)) fence = null
      lines.push(line); continue
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (opening) { fence = { char: opening[1][0], length: opening[1].length }; lines.push(line); continue }
    if (/^(?: {4}|\t)/.test(line)) { lines.push(line); continue }
    const card = /^\s*📎\s*(.+\.apk)\s*$/i.exec(line)
    if (card && target(card[1])) { cards.add(target(card[1])); continue }
    const direct = target(line.trim())
    if (direct) { cards.add(direct); continue }
    const changed = line.split(/(`+[^`]*`+)/g).map((part, i) => i % 2 ? part : part.replace(
      /\[([^\]\n]*)\]\((https?:\/\/[^\s)]+|\/mobile\/releases\/[^\s)]+|projects\/dzhinni\/android\/vypuski\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g,
      (whole, label, markdown, bare, offset) => {
        const value = (markdown || bare).replace(/[.,!;]+$/, ''), path = target(value)
        if (!path) return whole
        cards.add(path)
        const alone = !(part.slice(0, offset) + part.slice(offset + whole.length)).trim()
        return (label || (alone ? '' : path.split('/').at(-1))) + (markdown ? '' : bare.slice(value.length))
      })).join('')
    if (changed.trim()) lines.push(changed)
    else if (!line.trim()) lines.push(line)
  }
  return [...lines, ...Array.from(cards, path => '📎 ' + path)].join('\n')
}

/** skazat({fajly}) → строки «📎 путь» в конце ответа; окно рисует из них карточки */
export function prilozhit(text, fajly) {
  const spisok = (Array.isArray(fajly) ? fajly : []).map((f) => String(f).trim()).filter(Boolean).slice(0, 10)
  return spisok.length ? `${text}\n${spisok.map((f) => '📎 ' + f).join('\n')}` : text
}
