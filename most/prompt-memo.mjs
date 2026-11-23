// Какой пакет правил уже видел ЖИВОЙ процесс Claude.
// Пакет правил, сдачи файлов, смены и оценки нужен модели один раз за жизнь процесса: он остаётся в её истории.
// Повторять его в каждом ходе — платить за ~800 знаков при каждом сообщении. Память держится за ПРОЦЕССОМ (pid):
// новый процесс (перезапуск моста, resume, обрыв), сжатие беседы или смена смысла пакета — и пакет снова полный.
import { claudeLive } from './claude-live.mjs'

export function packetMemo({ pool = claudeLive } = {}) {
  const seen = new Map()
  // pid живого процесса, который ведёт эту сессию (не запасного); null — процесса нет (ход на отдельном запуске).
  const pidOf = session => pool.sessions?.().find(row => row.session === session && !row.spare)?.pid ?? null
  return {
    warm(session, key) {
      const memo = seen.get(session), pid = pidOf(session)
      return !!(session && key && memo && pid != null && memo.pid === pid && memo.key === key)
    },
    // Вызывать ПОСЛЕ хода: тогда процесс уже записан за сессией (claude-live release).
    remember(session, key) {
      const pid = pidOf(session)
      if (session && key && pid != null) seen.set(session, { pid, key }); else if (session) seen.delete(session)
    },
    forget(session) { seen.delete(session) },
    size: () => seen.size,
  }
}

export const defaultPacketMemo = packetMemo()
