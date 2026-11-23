// Pure subscription eligibility policy. Never sends a prompt or authorizes replay.
import { requireThat, text } from './task-contract.mjs'
import { EXECUTORS, AUTO_ORDER, CLAUDE_RECHECK } from './executor-catalog.mjs'
export { EXECUTORS }
export const MAX_AGE_MS = 60000
// R-05: a turn does not start on the last 10% of a measured budget. Unknown stays unknown.
// Запас 10% снят:
// исполнитель стоит только на настоящем нуле (quota_exhausted или 0% остатка). Порог можно передать явно.
export const BUDGET_FLOOR_PERCENT = 0
const positive = n => Number.isSafeInteger(n) && n > 0
const percent = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100
export const executorId = id => { requireThat(EXECUTORS.includes(id), 'INVALID_EXECUTOR', 'Исполнитель не входит в первый вариант'); return id }

// Percent of the tightest confirmed window; null means unmeasured.
export function remainingPercent(quota) {
  if (!quota) return null
  const windows = Array.isArray(quota.windows) ? quota.windows.filter(win => percent(win?.usedPercent)) : []
  return windows.length ? Math.max(0, 100 - Math.max(...windows.map(win => win.usedPercent))) : null
}

export function observation(input) {
  executorId(input.executor)
  requireThat(positive(input.observedAt), 'INVALID_INPUT', 'Нужно время наблюдения')
  const sources = { codex: ['codex-cli+codex-rpc'], claude: ['claude-cli-status'], deepseek: ['dsh-headless'], antigravity: ['antigravity-cli-models'] }
  requireThat(Object.values(sources).flat().includes(input.source), 'INVALID_INPUT', 'Неизвестный источник статуса')
  requireThat(sources[input.executor].includes(input.source), 'INVALID_INPUT', 'Источник другого исполнителя')
  requireThat(['available','unavailable','unknown'].includes(input.service) &&
    ['authenticated','required','unknown'].includes(input.auth), 'INVALID_INPUT', 'Неверный статус подключения')
  requireThat(['available','exhausted','unknown'].includes(input.quota?.state), 'INVALID_INPUT', 'Неверный статус квоты')
  const windows = input.quota.windows ?? []
  requireThat(Array.isArray(windows) && windows.length <= 2, 'INVALID_INPUT', 'Неверные окна квот')
  const cleanWindows = windows.map(win => {
    requireThat(['primary','secondary'].includes(win.id) && percent(win.usedPercent), 'INVALID_INPUT', 'Неверное окно квоты')
    return { id: win.id, usedPercent: win.usedPercent, resetAt: positive(win.resetAt) ? win.resetAt : null }
  })
  requireThat(new Set(cleanWindows.map(w => w.id)).size === cleanWindows.length, 'INVALID_INPUT', 'Дубли окон квоты')
  requireThat(input.executor !== 'codex' || input.quota.state !== 'available' || cleanWindows.length === 2 &&
    cleanWindows.every(win => win.usedPercent < 100), 'INVALID_INPUT', 'Доступность требует полных неизрасходованных квот')
  const model = input.model == null ? null : { providerID: text(input.model.providerID, 'providerID', 100), id: text(input.model.id, 'modelId', 200) }
  if (input.executor === 'codex') requireThat(model?.providerID === 'openai', 'INVALID_INPUT', 'Нужен OAuth OpenAI')
  return { executor: input.executor, observedAt: input.observedAt, source: input.source,
    service: input.service, auth: input.auth, model, modelAvailable: input.modelAvailable === true,
    accountBinding: input.executor === 'codex' ? 'single-user-assumption' : 'not-applicable',
    quota: { state: input.quota.state, windows: cleanWindows, ...(Array.isArray(input.quota.groups) ? { groups: input.quota.groups } : {}) },
    capabilities: { images: input.capabilities?.images === true, tools: input.capabilities?.tools === true },
    reason: text(input.reason, 'reason', 200) }
}

export function codexQuota(data) {
  const bucket = data?.rateLimitsByLimitId?.codex ?? data?.rateLimits
  const windows = ['primary','secondary'].flatMap(id => percent(bucket?.[id]?.usedPercent) ? [{
    id, usedPercent: bucket[id].usedPercent,
    resetAt: positive(bucket[id].resetsAt) ? bucket[id].resetsAt * 1000 : null,
  }] : [])
  if (data?.accountType !== 'chatgpt' || bucket?.limitId && bucket.limitId !== 'codex') return { state: 'unknown', windows: [] }
  if (data.ordinaryUsageAllowed === false || bucket?.spendControlReached === true || bucket?.rateLimitReachedType ||
    windows.some(win => win.usedPercent >= 100)) return { state: 'exhausted', windows }
  return { state: data.ordinaryUsageAllowed === true && windows.length === 2 ? 'available' : 'unknown', windows }
}

export function failureBlock(failure, at) {
  requireThat(positive(at), 'INVALID_INPUT', 'Нужно время ошибки')
  requireThat(failure && typeof failure === 'object', 'INVALID_INPUT', 'Нужен структурированный сигнал ошибки')
  const detail = { source: 'adapter',
    errorCode:Number.isSafeInteger(failure.errorCode) ? failure.errorCode : null }
  // Structured kind must come from the adapter. Never match arbitrary model text for quota claims.
  const kind = failure.kind
  if (kind === 'policy_refusal' || kind === 'transport_unknown') return null
  if (kind === 'quota_exhausted') return { kind: 'quota', at, until: positive(failure.resetAt) ? failure.resetAt : null, ...detail }
  if (kind === 'authentication' || failure.status === 401) return { kind: 'auth', at, until: null, ...detail }
  if (['rate_limited','service_transient'].includes(kind) || failure.status === 429) {
    const wait = positive(failure.retryAfterMs) ? Math.min(failure.retryAfterMs, 86400000) : 60000
    return { kind: 'cooldown', at, until: at + wait, ...detail }
  }
  // No answer at all is a self-observed stall, not provider text: cool the executor down briefly,
  // then let the next request retry it instead of waiting for a manual reset.
  if (kind === 'no_response') return { kind: 'cooldown', at, until: at + (positive(failure.retryAfterMs) ? failure.retryAfterMs : 300000), ...detail }
  return null // 403/5xx/timeout alone are not proof of exhausted subscription or stopped tools.
}

export function resolvedBlock(block, sample) {
  if (!block || !sample || sample.observedAt <= block.at) return false
  const ready = sample.service === 'available' && sample.auth === 'authenticated'
  if (!ready) return false
  // A cached login record cannot prove an already rejected credential was renewed.
  if (block.kind === 'auth') return false
  if (block.kind === 'cooldown') return sample.observedAt >= block.until
  // Claude CLI never reports quota as 'available' (its state stays 'unknown'), so a quota block on it never lifted:
  // the 5-hour limit hit at 00:20 (reset 04:00) still blocked every message at 09:00. For Claude the
  // reset time from the rejection is the proof; without one, a fresh login check 5 hours later (one session window).
  if (block.kind === 'quota' && sample.executor === 'claude') {
    return positive(block.until) ? sample.observedAt >= block.until : sample.observedAt >= block.at + 5 * 3600000
  }
  return block.kind === 'quota' && sample.quota.state === 'available' && sample.executor === 'codex' && sample.modelAvailable
}

export function eligibility(record, { now = Date.now(), maxAgeMs = MAX_AGE_MS, images = false, tools = false,
  preference = 'auto', claudeVerified = false, budgetFloorPercent = BUDGET_FLOOR_PERCENT } = {}) {
  const sample = record?.observation
  if (!sample) return { eligible: false, reason: 'status_unknown', quota: 'unknown' }
  if (sample.executor === 'claude' && (!claudeVerified && preference !== 'claude' || now < CLAUDE_RECHECK)) {
    return { eligible: false, reason: 'claude_verification_pending', quota: sample.quota.state }
  }
  if (!positive(now) || !positive(maxAgeMs) || sample.observedAt > now || now - sample.observedAt > maxAgeMs) {
    return { eligible: false, reason: 'status_stale', quota: sample.quota.state }
  }
  const block = (record.blocks ?? []).filter(item => !resolvedBlock(item, sample))
    .sort((a,b) => ['quota','auth','cooldown'].indexOf(a.kind) - ['quota','auth','cooldown'].indexOf(b.kind))[0]
  if (block) return { eligible: false,
    reason: block.kind === 'cooldown' && now >= block.until ? 'refresh_required' : 'blocked_' + block.kind,
    quota: block.kind === 'quota' ? 'exhausted' : sample.quota.state }
  if (sample.service !== 'available') return { eligible: false, reason: 'service_' + sample.service, quota: sample.quota.state }
  if (sample.auth !== 'authenticated') return { eligible: false, reason: 'auth_' + sample.auth, quota: sample.quota.state }
  if (images && !sample.capabilities.images) return { eligible: false, reason: 'images_unsupported', quota: sample.quota.state }
  if (tools && !sample.capabilities.tools) return { eligible: false, reason: 'tools_unsupported', quota: sample.quota.state }
  if (sample.quota.state === 'exhausted') return { eligible: false, reason: 'quota_exhausted', quota: 'exhausted' }
  const left = remainingPercent(sample.quota)
  if (left !== null && percent(budgetFloorPercent) && left <= budgetFloorPercent) {
    return { eligible: false, reason: 'budget_low', quota: sample.quota.state, remainingPercent: left }
  }
  if (sample.executor === 'codex' && (!sample.modelAvailable || sample.quota.state !== 'available')) {
    return { eligible: false, reason: sample.modelAvailable ? 'quota_unknown' : 'model_unavailable', quota: sample.quota.state }
  }
  return { eligible: true, reason: sample.quota.state === 'unknown' ? 'logged_in_quota_unknown' : 'metadata_available', quota: sample.quota.state }
}

export function selectExecutor(records, options = {}) {
  const candidates = EXECUTORS.map(executor => ({ executor, ...eligibility(records.find(row => row.executor === executor), options) }))
  if (options.activeAttempt) {
    const { state, executor } = options.activeAttempt
    return { action: ['prepared','sending','running'].includes(state) ? 'keep' : 'wait', executor,
      reason: state === 'uncertain' ? 'reconcile_required' : 'existing_attempt', candidates }
  }
  const preference = options.preference ?? 'auto'
  requireThat(['auto', ...EXECUTORS].includes(preference), 'INVALID_INPUT', 'Неизвестный режим исполнителя')
  const order = preference === 'auto' ? options.order ?? AUTO_ORDER : [preference]
  const candidate = order.map(id => candidates.find(row => row.executor === id)).find(row => row?.eligible)
  const routed = options.routedBy === 'jinny' ? 'jinny_routed' : options.routedBy === 'user' ? 'user_assigned' : null
  return { action: candidate ? 'select' : 'wait', executor: candidate?.executor ?? null,
    reason: candidate ? preference !== 'auto' ? routed ?? 'manual_selection' : candidate.executor === order[0] ? 'primary_available' : 'primary_unavailable'
      : preference === 'auto' ? 'no_eligible_executor' : 'manual_executor_unavailable', candidates }
}
