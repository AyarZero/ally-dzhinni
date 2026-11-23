/** Restricted loopback gateway. TLS must terminate at the configured HTTPS tunnel. */
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Transform, pipeline } from 'node:stream';
import { createAccessStore, cookieToken, sessionCookie, equalSecret } from './mobile-access.mjs';

const MOBILE_APK = process.env.DZHINNI_MOBILE_APK || 'D:/Cache/DzhinniMobile/releases/dzhinni-0.5.5.apk';

// The QR page is public on purpose: the phone opens it before it has any session; the token stays in the fragment.
const ASSETS = new Set(['/mobile', '/mobile/', '/mobile.css', '/mobile/qr', '/mobile/qr.js', '/znachok.png', '/mobile/app.apk']);
const POSTS = new Set(['/say', '/upload', '/slukh', '/engine/settings', '/engine/stop', '/messages/expedite']);
const CONTROL = new Set(['status', 'pair', 'revoke', 'origin']);
const MB = 1024 * 1024;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function respond(res, status, body) {
  if (res.headersSent) { res.destroy(); return; }
  // Close JSON responses: rejected/short-circuited POST bodies must never poison a reused socket.
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', connection: 'close' });
  res.end(JSON.stringify(body));
}
async function jsonBody(req, max = 16384) {
  const chunks = []; let count = 0;
  for await (const chunk of req) {
    count += chunk.length;
    if (count > max) { const error = new Error('body_limit'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { const error = new Error('invalid_json'); error.status = 400; throw error; }
}
function allowedGet(path) {
  // /fajl/<base64url пути> — файл, который Джинни приложила к ответу (📎); что можно отдать, решает мост (skachat.mjs)
  return ASSETS.has(path) || path === '/mobile/state' || path === '/mobile/komandy' || path === '/api/slukh'
    // Плашка «кэш остыл» на телефоне: только чтение и только этот точный адрес — другой n или любая приписка не проходят.
    || path === '/api/kesh?n=1' || /^\/f\/[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(path)
    || /^\/fajl\/[A-Za-z0-9_-]{1,1400}$/.test(path);
}
export const REQUEST_MS = 60000, IDLE_MS = 60000;
export async function createMobileProxy({ host = '127.0.0.1', port = 8800, upstream = 'http://127.0.0.1:8798', dataDir = 'D:/Cache/DzhinniMobile', clock = Date.now, apk = MOBILE_APK } = {}) {
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('Mobile proxy must bind loopback');
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(target.hostname) || target.username || target.password || target.pathname !== '/' || target.search || target.hash)
    throw new Error('Upstream must be a plain HTTP loopback origin');
  const access = createAccessStore(dataDir, clock);
  // неверные попытки входа считаются по адресу — 20 чужих в минуту больше не запирают пользователя.
  // Общий потолок оставлен с запасом: ключ 256 бит, перебор бесполезен, потолок — от залпа.
  const badAttempts = new Map();
  const visitor = req => String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').slice(0, 64);
  const recentBad = now => { let all = 0; for (const [key, times] of badAttempts) { const fresh = times.filter(t => t > now - 60000);
    if (fresh.length) { badAttempts.set(key, fresh); all += fresh.length } else badAttempts.delete(key) } return all };
  const server = http.createServer(async (req, res) => {
    res.setHeader('content-security-policy', CSP);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    // Raw, exact request paths only: encoded aliases, query strings and traversal never reach upstream.
    const path = req.url || '';
    // 50 МБ по мобильной сети не успевали за общие 60 с. /upload ограничен только
    // бездействием сокета (server.setTimeout ниже), остальное — прежними 60 с на весь запрос.
    if (path !== '/upload') { const cap = setTimeout(() => req.destroy(), REQUEST_MS); req.once('close', () => clearTimeout(cap)); res.once('finish', () => clearTimeout(cap)) }
    try {
      if (path.startsWith('/local/')) {
        if (!equalSecret(req.headers['x-mobile-control'], access.control)) return respond(res, 403, { error: 'forbidden' });
        const action = path.slice(7);
        if (req.method !== 'POST' || !CONTROL.has(action)) return respond(res, 404, { error: 'not_found' });
        const body = await jsonBody(req);
        if (action === 'status') return respond(res, 200, access.status());
        if (action === 'revoke') return respond(res, 200, access.revoke());
        if (action === 'origin') {
          try { return respond(res, 200, access.setOrigin(body.origin)); }
          catch { return respond(res, 400, { error: 'invalid_origin' }); }
        }
        const pair = access.pair();
        return respond(res, pair ? 200 : 503, pair || { error: 'origin_not_ready' });
      }
      const release = /^\/mobile\/releases\/(dzhinni-[0-9]+\.[0-9]+\.[0-9]+\.apk)$/.exec(path);
      if (['GET', 'HEAD'].includes(req.method) && (path === '/mobile/app.apk' || release)) {
        const file = release ? join(dirname(apk), release[1]) : apk;
        let info; try { info = statSync(file); } catch { return respond(res, release ? 404 : 503, { error: 'apk_not_ready' }); }
        res.writeHead(200, { 'content-type': 'application/vnd.android.package-archive',
          'content-disposition': `attachment; filename="${basename(file)}"`, 'content-length': info.size, 'cache-control': 'no-store' });
        if (req.method === 'HEAD') res.end();
        else { const stream = createReadStream(file).once('error', () => res.destroy()); res.once('close', () => stream.destroy()); stream.pipe(res); } // 5.8: обрыв закрывает файл
        return;
      }
      if (req.method === 'POST') {
        if (req.headers['x-dzhinni'] !== '1' || (req.headers.origin !== undefined && req.headers.origin !== access.origin))
          return respond(res, 403, { error: 'csrf' });
      }
      const token = cookieToken(req.headers.cookie);
      const authenticated = access.authenticated(token);
      if (req.method === 'POST' && path === '/mobile/auth') {
        if (authenticated) { req.resume(); return respond(res, 200, { ok: true }); }
        const who = visitor(req), all = recentBad(clock());
        if ((badAttempts.get(who)?.length || 0) >= 20 || all >= 300) { req.resume(); res.setHeader('retry-after', '60'); return respond(res, 429, { error: 'rate_limited' }); }
        const body = await jsonBody(req);
        const session = access.exchange(body.token);
        if (!session) { badAttempts.set(who, [...(badAttempts.get(who) || []), clock()]); return respond(res, 401, { error: 'invalid_pair' }); }
        res.setHeader('set-cookie', sessionCookie(session));
        return respond(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/mobile/logout') {
        if (token) access.logout(token);
        req.resume(); res.setHeader('set-cookie', sessionCookie('', true));
        return respond(res, 200, { ok: true });
      }
      if (!(req.method === 'GET' && allowedGet(path)) && !(req.method === 'POST' && POSTS.has(path)))
        return respond(res, 404, { error: 'not_found' });
      if (!(req.method === 'GET' && ASSETS.has(path)) && !authenticated)
        return respond(res, 401, { error: 'unauthorized' });
      const max = path === '/upload' ? 50 * MB : MB;
      if (req.headers['content-length'] !== undefined && (!/^\d+$/.test(req.headers['content-length']) || Number(req.headers['content-length']) > max))
        return respond(res, 413, { error: 'body_limit' });
      const headers = {};
      // 338 КБ на опрос. Preserve conditional requests and gzip end to end.
      for (const key of ['x-dzhinni', 'x-name', 'content-type', 'if-none-match', 'accept-encoding'])
        if (req.headers[key] !== undefined) headers[key] = req.headers[key];
      const outgoing = http.request({ hostname: target.hostname.replace(/^\[|\]$/g, ''), port: target.port || 80,
        method: req.method, path, headers, timeout: path === '/slukh' ? 90000 : 30000 }, incoming => { // 5.6: слух дольше, но под потолком Cloudflare 100 с
        // No automatic redirects, upstream cookies, auth headers or tunnel metadata.
        if (incoming.statusCode >= 300 && incoming.statusCode < 400 && incoming.statusCode !== 304) {
          incoming.resume(); return respond(res, 502, { error: 'upstream_redirect_blocked' });
        }
        for (const key of ['content-type', 'content-length', 'content-disposition', 'etag', 'last-modified', 'content-encoding', 'vary'])
          if (incoming.headers[key] !== undefined) res.setHeader(key, incoming.headers[key]);
        res.setHeader('cache-control', path === '/mobile/state' ? 'no-store' : 'private, no-cache');
        res.writeHead(incoming.statusCode || 502);
        pipeline(incoming, res, () => {});
      });
      let count = 0;
      const limiter = new Transform({ transform(chunk, encoding, callback) {
        count += chunk.length;
        if (count > max) {
          respond(res, 413, { error: 'body_limit' });
          callback(new Error('body_limit'));
        } else callback(null, chunk);
      } });
      outgoing.on('timeout', () => outgoing.destroy(new Error('timeout')));
      outgoing.on('error', () => { if (!res.writableEnded) respond(res, 502, { error: 'upstream_unavailable' }); });
      req.on('aborted', () => outgoing.destroy());
      res.on('close', () => { if (!res.writableFinished) outgoing.destroy(); });
      // Preserve request streaming (especially uploads), without retries or buffering the file.
      pipeline(req, limiter, outgoing, () => {});
    } catch (error) { respond(res, error.status || 400, { error: error.status === 413 ? 'body_limit' : 'bad_request' }); }
  });
  server.requestTimeout = 0; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.setTimeout(IDLE_MS, socket => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, accessFile: access.file, address: server.address(), close: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections();
  }) };
}
