// Чтение .istoriya.jsonl: строка JSON на реплику; битая строка пропускается, а не обнуляет чат.
export function readHistory(raw, limit = 300) {
  const out = []
  for (const line of String(raw || '').split('\n')) {
    if (!line.trim()) continue
    try { const m = JSON.parse(line); if (m && typeof m === 'object' && !Array.isArray(m)) out.push(m) } catch {}
  }
  return out.slice(-limit)
}
