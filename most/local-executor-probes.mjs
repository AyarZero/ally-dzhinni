// Metadata only; Claude is not even probed before the user-agreed verification date.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { codexCommand } from './codex-cli.mjs'
import { codexQuota, observation } from '../core/availability-policy.mjs'
import { CLAUDE_RECHECK } from '../core/executor-catalog.mjs'
import { claudeQuota, claudeQuotaFile, readClaudeQuota } from './claude-quota.mjs'
import { DSH_MODEL, dshCredentials, dshInstall } from './dsh-turn.mjs'
import { profileModel } from './dsh-model.mjs'
import { antigravityStatus } from './antigravity-cli.mjs'

// A stray ANTHROPIC_BASE_URL (or custom headers) would send a "subscription" turn to someone else's address;
// the DeepSeek Harness plugin strips them too. Tokenator sets its own address after this, on purpose.
export const SUBSCRIPTION_STRIP = ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_CUSTOM_HEADERS']
export function subscriptionEnv(env = process.env) {
  const value = { ...env }
  for (const key of SUBSCRIPTION_STRIP) delete value[key]
  return value
}
export function claudeCommand(env = process.env) {
  if (env.DZHINNI_CLAUDE_CLI) return /\.m?js$/i.test(env.DZHINNI_CLAUDE_CLI)
    ? [process.execPath, [env.DZHINNI_CLAUDE_CLI]] : [env.DZHINNI_CLAUDE_CLI, []]
  if (process.platform !== 'win32') return ['claude', []]
  const dirs = [
    ...(env.PATH || env.Path || '').split(delimiter),
    env.USERPROFILE ? join(env.USERPROFILE, '.local', 'bin') : '',
    env.APPDATA ? join(env.APPDATA, 'npm') : ''
  ].filter(Boolean)
  for (const folder of dirs) {
    if (existsSync(join(folder, 'claude.exe'))) return [join(folder, 'claude.exe'), []]
    const npmCli = join(folder, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
    if (existsSync(npmCli)) return [process.execPath, [npmCli]]
  }
  throw new Error('Claude Code CLI не найден')
}
export async function probeCodex({ quota, clock = Date.now, codexInstalled = () => { codexCommand(); return true } }) {
  const base = { executor: 'codex', source: 'codex-cli+codex-rpc', observedAt: clock(), service: 'unknown', auth: 'unknown',
    model: { providerID: 'openai', id: 'gpt-6.1-sol' }, modelAvailable: false, quota: { state: 'unknown', windows: [] },
    capabilities: { images: true, tools: true }, reason: 'cli_unknown' }
  let installed = false
  try { installed = !!codexInstalled() } catch { installed = false }
  if (!installed) return observation({ ...base, service: 'unavailable', reason: 'cli_unavailable' })
  try {
    const data = await quota()
    const authenticated = data?.accountType === 'chatgpt' && !data?.authRequired
    const quotaObj = data?.rateLimitError ? { state: 'unknown', windows: [] } : codexQuota(data)
    return observation({ ...base, service: 'available', auth: authenticated ? 'authenticated' : 'required',
      modelAvailable: authenticated, quota: quotaObj,
      reason: authenticated ? (data?.rateLimitError ? 'codex_auth_ok_quota_unknown' : 'codex_rpc_checked') : 'codex_auth_required' })
  } catch (error) {
    const msg = String(error?.message || '')
    if (/auth|login|unauthorized|401/i.test(msg)) {
      return observation({ ...base, service: 'available', auth: 'required', modelAvailable: false, reason: 'codex_auth_required' })
    }
    return observation({ ...base, service: 'available', auth: 'unknown', modelAvailable: false, reason: 'codex_rpc_error' })
  }
}
export function claudeAuth({ repo }) {
  return new Promise(resolve => {
    let command, prefix
    try { [command, prefix] = claudeCommand() } catch { resolve({ available: false, authenticated: false }); return }
    // A cold Claude start next to two other probes took >10 s and showed a false "login required".
    execFile(command, [...prefix, 'auth', 'status', '--json'], { cwd: repo, windowsHide: true, timeout: 30000,
      env: subscriptionEnv(), maxBuffer: 64000 }, (error, out) => {
      try { const data = JSON.parse(out); resolve({ available: !error,
        authenticated: data.loggedIn === true && ['claude.ai', 'oauth'].includes(data.authMethod) }) }
      catch { resolve({ available: !error, authenticated: false }) }
    })
  })
}
export async function probeClaude({ repo, clock = Date.now, claudeStatus = claudeAuth,
  claudeQuotaSnapshot = () => readClaudeQuota(claudeQuotaFile(repo)) }) {
  // The model is whatever the user picks per turn (or the CLI default); the probe does not guess it.
  const base = { executor: 'claude', source: 'claude-cli-status', observedAt: clock(), service: 'unknown', auth: 'unknown',
    model: null, modelAvailable: false, quota: { state: 'unknown', windows: [] },
    capabilities: { images: true, tools: true }, reason: 'verification_06_11_after_14_00' }
  if (clock() < CLAUDE_RECHECK) return observation(base)
  try {
    const data = await claudeStatus({ repo })
    // Quota comes from the CLI's own rate_limit_event of the last turn, valid until its window resets.
    let quota = { state: 'unknown', windows: [] }
    try { quota = claudeQuota(claudeQuotaSnapshot(), clock()) } catch {}
    return observation({ ...base, service: data.available ? 'available' : 'unavailable', auth: data.authenticated ? 'authenticated' : 'required',
      modelAvailable: data.available === true, quota,
      reason: quota.state === 'unknown' ? 'claude_auth_checked_quota_unknown' : 'claude_auth_checked_quota_from_last_turn' })
  } catch { return observation(base) }
}

// DeepSeek Harness: только пути и сохранённый вход, модель не вызывается. Квота подписки мосту
// не отдаётся — остаётся unknown, это не выдумка о «лимитах нет».
export function dshStatus({ env = process.env, install = dshInstall, credentials = dshCredentials, profileExists = existsSync } = {}) {
  try {
    const { profileDir } = install(env)
    return { ready: profileExists(join(profileDir, 'cordis.patch.yml')), loggedIn: !!credentials(env) }
  } catch { return { ready: false, loggedIn: false } }
}
export async function probeDeepseek({ clock = Date.now, status = dshStatus } = {}) {
  const { ready, loggedIn } = status()
  return observation({ executor: 'deepseek', source: 'dsh-headless', observedAt: clock(),
    service: ready ? 'available' : 'unavailable', auth: loggedIn ? 'authenticated' : 'required',
    model: profileModel() ? { ...DSH_MODEL, id: profileModel() } : null, modelAvailable: ready && loggedIn, quota: { state: 'unknown', windows: [] },
    capabilities: { images: false, tools: true },
    reason: !ready ? 'dsh_profile_missing' : loggedIn ? 'dsh_headless_ready' : 'dsh_login_missing' })
}

export async function probeAntigravity({ clock = Date.now, agyStatus = antigravityStatus, agyModel = null } = {}) {
  const model = typeof agyModel === 'function' ? agyModel() : agyModel
  const value = await agyStatus(model ? { model } : undefined)
  const baseQuota = value.quota && ['available','exhausted','unknown'].includes(value.quota.state)
    ? value.quota : { state: 'unknown', windows: [] }
  const quota = Array.isArray(value.quotaGroups) && value.quotaGroups.length
    ? { ...baseQuota, groups: value.quotaGroups } : baseQuota
  return observation({ executor:'antigravity', source:'antigravity-cli-models', observedAt:clock(),
    service:value.installed ? 'available' : 'unavailable', auth:value.authenticated ? 'authenticated' : 'unknown',
    model:null, modelAvailable:value.authenticated, quota,
    capabilities:{images:true,tools:true}, reason:value.authenticated ? (quota.windows?.length ? 'agy_quota_checked' : 'agy_models_checked_quota_unknown') : 'agy_login_or_network_unknown' })
}
