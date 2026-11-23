// Политика контекста беседы: пороги предупреждения и сжатия, окно модели, причина сжатия.
// Бывший qoder-context.mjs; разбор «context_usage_ratio» Qoder удалён вместе с ним.
const finite = value => typeof value === 'number' && Number.isFinite(value)
const positiveInt = value => Number.isSafeInteger(value) && value > 0

export function defaultContextPolicy(env = process.env) {
  return { warnAt: 70, compactAt: 85, strategy: 'reset',
    maxTurns: Number(env.DZHINNI_MAX_TASK_TURNS) || 3, windowTokens: {} }
}

export function normalizeContextPolicy(input, base = defaultContextPolicy()) {
  const value = input === undefined ? {} : input
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Настройки контекста: нужен объект')
  const warnAt = value.warnAt === undefined ? base.warnAt : value.warnAt
  const compactAt = value.compactAt === undefined ? base.compactAt : value.compactAt
  const maxTurns = value.maxTurns === undefined ? base.maxTurns : value.maxTurns
  if (!finite(warnAt) || !finite(compactAt) || !(warnAt > 0 && warnAt < compactAt && compactAt < 100))
    throw new Error('Пороги контекста: нужно 0 < warnAt < compactAt < 100')
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1) throw new Error('maxTurns: целое число не меньше 1')
  const strategy = value.strategy === undefined ? base.strategy : value.strategy
  if (!['reset', 'summarize', 'ask'].includes(strategy))
    throw new Error('strategy: reset, summarize или ask')
  const rawWindow = value.windowTokens === undefined ? base.windowTokens : value.windowTokens
  if (!rawWindow || typeof rawWindow !== 'object' || Array.isArray(rawWindow))
    throw new Error('windowTokens: нужен объект «модель → размер окна»')
  const windowTokens = {}
  for (const [model, size] of Object.entries(rawWindow)) {
    if (size === null) { windowTokens[model] = null; continue }
    if (!positiveInt(size)) throw new Error(`windowTokens.${model}: целое число больше 0 или null`)
    windowTokens[model] = size
  }
  return { warnAt, compactAt, strategy, maxTurns, windowTokens }
}

export function windowForModel(policy, model) {
  const table = policy?.windowTokens || {}
  if (!model) return null
  if (positiveInt(table[model])) return table[model]
  const key = Object.keys(table).find(name => name.toLowerCase() === String(model).toLowerCase())
  return key && positiveInt(table[key]) ? table[key] : null
}

export function unknownContext() {
  return { usedTokens: null, windowTokens: null, percent: null, source: 'unknown',
    windowSource: 'unknown', at: null, model: null }
}

export function contextLevel(context, policy) {
  if (!context || context.source === 'unknown' || !finite(context.percent)) return null
  if (context.percent >= policy.compactAt) return 'compact'
  if (context.percent >= policy.warnAt) return 'warn'
  return null
}

export function measuredForSession(context, sessionId) {
  return !!(context && sessionId && context.sessionId === sessionId &&
    context.source !== 'unknown' && finite(context.percent))
}

// `selfCompacts`: the engine keeps one conversation session and compacts it itself (Claude, Codex — conversation.mjs);
// a cap on turns of one task would throw that session away.
export function compactReasonFor({ context, policy, sessionId, taskId, compactions, turnNo, selfCompacts = false }) {
  if (turnNo > policy.maxTurns && !selfCompacts) return 'turn_cap'
  const hit = measuredForSession(context, sessionId) && policy.strategy === 'reset' &&
    contextLevel(context, policy) === 'compact' && !compactions?.[taskId]
  return hit ? 'threshold' : null
}
