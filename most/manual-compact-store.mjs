// Compensate a failed write after any snapshots already queued by other state changes.
export async function saveCompactRequest(requests, key, request, persist) {
  requests[key] = request
  try { await persist() }
  catch {
    if (requests[key] === request) delete requests[key]
    try { await persist() }
    catch {
      const error = new Error('Результат сохранения неизвестен. Проверь состояние перед повтором.')
      error.status = 503; throw error
    }
    throw new Error('Запрос сжатия не сохранён. Можно попробовать ещё раз.')
  }
}
