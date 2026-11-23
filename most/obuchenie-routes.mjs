import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}
const raw = (res, value) => {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(value)
}
const page = (res, value, type) => {
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; img-src 'self' https://proninlearn.ru data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'"
  })
  res.end(value)
}

// Курсы для вкладки «Обучение». Данные лежат вне маршрутов: obuchenie/index.json и obuchenie/<id>/kurs.json.
export async function obuchenieRoutes({ req, res, url, HERE }) {
  const path = url.pathname
  const isPage = path === '/obuchenie' || path === '/obuchenie.js' || path === '/obuchenie.css'
  const isApi = path === '/api/obuchenie' || path.startsWith('/api/obuchenie/')
  if (!isPage && !isApi) return false
  if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'Метод не поддерживается' }); return true }
  try {
    if (path === '/obuchenie') {
      const value = await readFile(join(HERE, 'obuchenie.html'))
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self'; img-src 'self' https://proninlearn.ru data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'"
      })
      res.end(value)
      return true
    }
    if (path === '/obuchenie.js') return page(res, await readFile(join(HERE, 'obuchenie.js')), 'text/javascript; charset=utf-8'), true
    if (path === '/obuchenie.css') return page(res, await readFile(join(HERE, 'obuchenie.css')), 'text/css; charset=utf-8'), true
    if (path === '/api/obuchenie/image') {
      const src = url.searchParams.get('src') || ''
      if (!src.startsWith('https://proninlearn.ru/')) { json(res, 400, { error: 'Неверный адрес картинки' }); return true }
      try {
        const upstream = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0' } })
        if (!upstream.ok) { json(res, 502, { error: 'Картинка не отдалась' }); return true }
        if (new URL(upstream.url).hostname !== 'proninlearn.ru') { json(res, 403, { error: 'Неверный адрес картинки' }); return true }
        const type = upstream.headers.get('content-type') || ''
        if (!type.startsWith('image/')) { json(res, 415, { error: 'Это не картинка' }); return true }
        const bytes = Buffer.from(await upstream.arrayBuffer())
        if (bytes.length > 20 * 1024 * 1024) { json(res, 413, { error: 'Картинка слишком большая' }); return true }
        res.writeHead(200, { 'content-type': type, 'content-length': bytes.length, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' })
        res.end(bytes)
        return true
      } catch {
        json(res, 502, { error: 'Картинка не отдалась' }); return true
      }
    }
    if (req.headers['x-dzhinni'] !== '1') { json(res, 403, { error: 'Запрос только из AllY' }); return true }
    const base = resolve(join(HERE, 'obuchenie'))
    if (path === '/api/obuchenie') {
      return raw(res, await readFile(join(base, 'index.json'), 'utf8')), true
    }
    const id = path.slice('/api/obuchenie/'.length)
    if (!/^[a-z0-9-]{1,64}$/.test(id)) { json(res, 400, { error: 'Неверный код курса' }); return true }
    const file = resolve(join(base, id, 'kurs.json'))
    if (!file.startsWith(base + sep)) { json(res, 403, { error: 'Неверный путь' }); return true }
    return raw(res, await readFile(file, 'utf8')), true
  } catch (error) {
    if (error && error.code === 'ENOENT') { json(res, 404, { error: 'Курс не найден' }); return true }
    json(res, 500, { error: 'Не удалось прочитать курс' })
    return true
  }
}
