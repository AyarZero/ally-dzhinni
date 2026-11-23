// Metadata-only adapters. Never call a turn, generate, prompt or credential-list endpoints.
import { codexRpc } from './codex-rpc.mjs'
import { probeCodex, probeClaude, probeDeepseek, probeAntigravity } from './local-executor-probes.mjs'

export async function quotaMetadata({ repo, rpc = codexRpc({ cwd: repo }) }) {
  try {
    const { account } = await rpc.request('account/read', { refreshToken: false })
    if (!account?.type) return { accountType: null, authRequired: true }
    try {
      const limits = await rpc.request('account/rateLimits/read')
      return { accountType: account.type, ...limits }
    } catch (error) {
      const msg = String(error?.message || '')
      if (/auth|login|unauthorized|401/i.test(msg)) return { accountType: null, authRequired: true, rateLimitError: msg }
      return { accountType: account.type, rateLimitError: msg }
    }
  } finally { rpc.close() }
}

export async function refreshExecutors({ registry, enabledExecutors = ['codex', 'claude', 'deepseek', 'antigravity'], ...options }) {
  let limits
  const quota = () => limits ??= Promise.resolve().then(() => options.quota ? options.quota() : quotaMetadata(options))
  const shared = { ...options, quota }
  const probes = { codex: probeCodex, claude: probeClaude, deepseek: probeDeepseek, antigravity: probeAntigravity }
  const results = await Promise.allSettled(enabledExecutors.map(id => probes[id](shared)))
  const samples = results.map(result => {
    if (result.status !== 'fulfilled') throw new Error('Некорректные параметры metadata-проверки')
    return result.value
  })
  for (const sample of samples) registry.observe(sample)
  return registry.list()
}
