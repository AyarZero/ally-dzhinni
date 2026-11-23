// Presentation only: these strings never decide routing, quota or replay safety.
const names = { claude: 'Claude', codex: 'Codex', tokenator: 'Агрегатор', antigravity: 'Antigravity', deepseek: 'DeepSeek' }
const nameOf = executor => names[executor] || 'нейросети'

export function resetTime(at) {
  return new Intl.DateTimeFormat('ru-RU', { 
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(at)
}

export function quotaNotice(rows) {
  const lines = rows.map(({ executor, until }) => `${nameOf(executor)} — ${Number.isFinite(until)
    ? 'лимит обновится ' + resetTime(until) : 'время обновления лимита пока неизвестно'}.`)
  return 'Лимиты исчерпаны.\n\n' + lines.join('\n') +
    '\n\nМожешь писать дальше: сообщения остаются в очереди на компьютере. После обновления лимита прочитаю накопленное и продолжу.'
}

export function interruptedNotice({ executor, message = '', failure, sameSession = false }) {
  // Codex can send an English quota error before the metadata refresh catches up.
  // Translate its presentation without promoting this text into a quota observation.
  if (failure?.kind === 'quota_exhausted' || /you[’']ve hit your usage limit/i.test(message)) {
    return `Лимит ${nameOf(executor)} исчерпан.\n\n` +
      (Number.isFinite(failure?.resetAt) ? 'Обновится ' + resetTime(failure.resetAt) + '.'
        : 'Время обновления уточняется.') +
      '\n\nХод остановлен. Перед продолжением сверю, что успела выполнить, чтобы не повторить сделанное.'
  }
  const reason = /не ответил вовремя|без единого события/i.test(message)
    ? 'Слишком долго не было ответа от нейросети.'
    : 'Не удалось подтвердить завершение работы.'
  return `Ход прервался.\n\n${reason}\n\n` +
    'Напиши «продолжай» — сначала сверю результат, затем продолжу' + (sameSession ? ' в той же беседе.' : '.')
}
