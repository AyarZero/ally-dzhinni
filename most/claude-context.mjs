// Claude Code context footprint from its own stream.
// assistant.message.usage carries real counters of the latest request; the window size comes
// from result.modelUsage[model].contextWindow and is remembered per model for later turns.
// Helper (sub-agent) events have their own context and never count as the lead's.
const positiveInt = value => Number.isSafeInteger(value) && value > 0
const counter = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

export function claudeUsedTokens(usage) {
  if (!usage || typeof usage !== 'object') return null
  const used = counter(usage.input_tokens) + counter(usage.cache_read_input_tokens) + counter(usage.cache_creation_input_tokens)
  return used > 0 ? used : null
}

function windowFor(windows, model) {
  if (!model) return null
  if (positiveInt(windows[model])) return windows[model]
  const key = Object.keys(windows).find(name => name.toLowerCase() === model.toLowerCase() ||
    name.replace(/\[.*\]$/, '') === model.replace(/\[.*\]$/, ''))
  return key && positiveInt(windows[key]) ? windows[key] : null
}

function shape(usedTokens, windowTokens, windowSource, model, at) {
  return { usedTokens, windowTokens, percent: usedTokens && windowTokens ? Math.min(100, usedTokens / windowTokens * 100) : null,
    source: 'measured', windowSource, at, model }
}

// → { context, windows }: next measurement (or the previous one) and the updated window table.
export function claudeContextStep(raw, { previous = null, windows = {}, configuredWindow = null, at = Date.now() } = {}) {
  const table = { ...windows }
  if (!raw || typeof raw !== 'object' || raw.parent_tool_use_id) return { context: previous, windows: table }
  if (raw.type === 'result' && raw.modelUsage && typeof raw.modelUsage === 'object') {
    for (const [model, row] of Object.entries(raw.modelUsage)) if (positiveInt(row?.contextWindow)) table[model] = row.contextWindow
    if (previous?.usedTokens && !previous.windowTokens) {
      const size = positiveInt(configuredWindow) ? configuredWindow : windowFor(table, previous.model)
      if (size) return { context: shape(previous.usedTokens, size, positiveInt(configuredWindow) ? 'config' : 'model', previous.model, previous.at), windows: table }
    }
    return { context: previous, windows: table }
  }
  if (raw.type !== 'assistant') return { context: previous, windows: table }
  const used = claudeUsedTokens(raw.message?.usage)
  if (!used) return { context: previous, windows: table }
  const model = typeof raw.message?.model === 'string' ? raw.message.model : previous?.model || null
  const configured = positiveInt(configuredWindow) ? configuredWindow : null
  const size = configured || windowFor(table, model)
  return { context: shape(used, size, configured ? 'config' : size ? 'model' : 'unknown', model, at), windows: table }
}
