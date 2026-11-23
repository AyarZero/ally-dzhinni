import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const script = fileURLToPath(new URL('./dsh-balance.py', import.meta.url))
export async function queryDeepseekBalance(identity = false) {
  const { stdout } = await run('python', [script, ...(identity ? ['--identity'] : [])], { windowsHide: true, timeout: 18000,
    maxBuffer: 16384, env: { ...process.env, PYTHONUTF8: '1' } })
  return JSON.parse(stdout)
}
export function sanitizedWallets(value) {
  if (!Array.isArray(value) || value.length > 2) throw new Error('invalid_balance')
  return value.map(row => {
    if (!['CNY', 'USD'].includes(row.currency)) throw new Error('invalid_currency')
    const out = { currency: row.currency }
    for (const key of ['total', 'toppedUp', 'granted']) {
      if (typeof row[key] !== 'string' || !/^\d+(?:\.\d+)?$/.test(row[key]) || !Number.isFinite(Number(row[key])))
        throw new Error('invalid_amount')
      out[key] = row[key]
    }
    return out
  })
}
export function helperResources({ file, query = queryDeepseekBalance,
  identity = async () => (await queryDeepseekBalance(true)).accountBinding, clock = Date.now } = {}) {
  let saved = null, loaded = false, flight = null, attempted = null
  async function load() {
    if (loaded) return
    loaded = true
    try {
      const row = JSON.parse(await readFile(file, 'utf8'))
      if (Number.isFinite(row.checkedAt) && row.checkedAt > 0 && /^[a-f0-9]{64}$/.test(row.accountBinding))
        saved = { checkedAt: row.checkedAt, wallets: sanitizedWallets(row.wallets), accountBinding: row.accountBinding }
    } catch {}
  }
  const view = error => ({ helpers: [{ id: 'deepseek', name: 'DeepSeek', source: 'deepseek-account-platform',
    status: error ? saved ? 'stale' : 'unavailable' : saved ? 'ready' : 'unknown',
    checkedAt: saved?.checkedAt ?? null, lastAttemptAt: attempted, wallets: saved?.wallets ?? null,
    error: error ? 'Не удалось обновить баланс' : null }] })
  let lastError = null
  return { // Saved amounts only: the phone reads the last successful check without spawning Python.
    async snapshot() { await load(); return saved ? { checkedAt: saved.checkedAt, wallets: saved.wallets } : null },
    async get({ refresh = false } = {}) {
    if (flight) return flight
    flight = (async () => {
      await load()
      let account
      try {
        account = await identity()
        if (!/^[a-f0-9]{64}$/.test(account)) throw new Error('unknown_account')
      } catch { saved = null; lastError = true; return view(true) }
      if (saved && saved.accountBinding !== account) { saved = null; attempted = null; lastError = null }
      const now = clock(), minimum = refresh ? 5000 : lastError ? 15000 : 60000
      if (attempted !== null && now - attempted < minimum) return view(lastError)
      if (!refresh && attempted === null && saved && now - saved.checkedAt < 60000) return view(null)
      attempted = now
      try {
        const result = await query()
        if (result.accountBinding !== account) throw new Error('account_changed')
        const next = { checkedAt: clock(), wallets: sanitizedWallets(result.wallets), accountBinding: account }
        if (!next.wallets.length) throw new Error('missing_wallets')
        // Persist only the allowlisted amounts, never the account response or credentials.
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 })
        await rename(file + '.tmp', file)
        saved = next; lastError = null
      } catch { lastError = true }
      return view(lastError)
    })().finally(() => { flight = null })
    return flight
  } }
}
export const resourceFile = storage => join(storage, 'helper-resources.json')
