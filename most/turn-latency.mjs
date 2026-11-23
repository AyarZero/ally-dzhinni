// One observation per stage; no text, prompts or credentials in the timing journal.
export function turnLatency(onSignal, clock = Date.now) {
  const started = clock(), seen = new Set()
  return (stage, extra = {}) => {
    if (seen.has(stage)) return
    seen.add(stage)
    try { onSignal({ type: 'local.latency', stage, elapsed_ms: Math.max(0, clock() - started), ...extra }) } catch {}
  }
}
