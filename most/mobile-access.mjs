/** Local access store for the loopback mobile proxy; never import into browser code. */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const PAIR_MS = 10 * 60 * 1000;
export const COOKIE = '__Host-dzhinni_mobile';
const random = () => randomBytes(32).toString('base64url');
const hash = token => createHash('sha256').update(token).digest('hex');
export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function validOrigin(value) {
  if (typeof value !== 'string') throw new Error('invalid_origin');
  const u = new URL(value);
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
    throw new Error('invalid_origin');
  return u.origin;
}
export function cookieToken(header = '') {
  const values = header.split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE + '='));
  if (values.length !== 1) return '';
  const token = values[0].slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}
export function sessionCookie(token, remove = false) {
  return `${COOKIE}=${remove ? '' : token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${remove ? 0 : SESSION_MS / 1000}`;
}
export function createAccessStore(dataDir, clock = Date.now) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, 'access.json');
  let state;
  try {
    state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.version !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(state.control) || !Array.isArray(state.sessions) || !Array.isArray(state.pairs))
      throw new Error('invalid_access_store');
    if (state.origin) state.origin = validOrigin(state.origin);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read mobile access store');
    state = { version: 1, control: random(), origin: '', sessions: [], pairs: [] };
  }
  function save() {
    const temp = file + '.tmp';
    writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    chmodSync(temp, 0o600); renameSync(temp, file);
  }
  function prune() {
    const now = clock();
    state.sessions = state.sessions.filter(s => s.expiresAt > now);
    state.pairs = state.pairs.filter(s => s.expiresAt > now);
  }
  save();
  return {
    file,
    control: state.control,
    get origin() { return state.origin; },
    status() { prune(); save(); return { origin: state.origin, sessions: state.sessions.length }; },
    setOrigin(value) {
      const origin = validOrigin(value);
      if (origin !== state.origin) { state.pairs = []; state.sessions = []; }
      state.origin = origin; save(); return { origin };
    },
    pair() {
      prune(); if (!state.origin) return null;
      const token = random();
      state.pairs.push({ hash: hash(token), expiresAt: clock() + PAIR_MS });
      state.pairs = state.pairs.slice(-10); save();
      return { url: `${state.origin}/mobile#pair=${token}` };
    },
    authenticated(token) {
      prune(); return !!token && state.sessions.some(s => equalSecret(s.hash, hash(token)));
    },
    exchange(token) {
      prune();
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const index = state.pairs.findIndex(p => equalSecret(p.hash, hash(token)));
      if (index < 0) return null;
      state.pairs.splice(index, 1);
      const session = random();
      state.sessions.push({ hash: hash(session), createdAt: clock(), expiresAt: clock() + SESSION_MS });
      state.sessions = state.sessions.slice(-10); save(); return session;
    },
    logout(token) { state.sessions = state.sessions.filter(s => !equalSecret(s.hash, hash(token))); save(); },
    revoke() { state.sessions = []; state.pairs = []; save(); return { ok: true }; },
  };
}
