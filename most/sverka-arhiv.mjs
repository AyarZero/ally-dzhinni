// «на сверку» копилось вечно — 204 задачи «неизвестно», engine.json 766 КБ переписывался
// целиком на каждое сохранение, телефон писал «задач для сверки: 201». При старте моста:
//   • «неизвестно» старше 7 дней уезжает из очереди в архив рядом (engine-arhiv.jsonl) — не удаляется;
//   • квитанции, счётчики ходов и сессии задач, которых нет в очереди и которые старше 7 дней, чистятся.
// Ключи сессий без задачи (`claude`, `codex`) и текущая задача не трогаются никогда.
export const SROK_MS = 7 * 864e5

const vozrast = (iso, now) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? now - t : 0 }
const taskOfKey = key => { const i = key.indexOf(':'); return i < 0 ? null : key.slice(i + 1) }

// taskInfo(taskId) → { updatedAt } или null (задачи нет в базе). Возвращает { archived, removed } и меняет saved.
export function prune(saved, { now = Date.now(), taskInfo, srokMs = SROK_MS } = {}) {
  const info = id => { try { return taskInfo(id) } catch { return null } }
  const staroe = id => { const t = info(id); return !t || vozrast(t.updatedAt, now) > srokMs }
  const archived = []
  saved.queue = saved.queue.filter(item => {
    if (item.state !== 'uncertain' || !staroe(item.taskId)) return true
    archived.push({ ...item, archivedAt: new Date(now).toISOString(), receipt: saved.receipts?.[item.id] || null })
    return false
  })
  const zhivye = new Set(saved.queue.map(item => item.taskId))
  if (saved.currentTask?.task_id) zhivye.add(saved.currentTask.task_id)
  const removed = { receipts: 0, taskTurns: 0, localSessions: 0 }
  const lishnee = taskId => taskId && !zhivye.has(taskId) && staroe(taskId)
  for (const [id, r] of Object.entries(saved.receipts || {})) {
    // Квитанция без задачи в очереди: старая по своему времени приёма или по задаче.
    if (zhivye.has(r.taskId)) continue
    if (vozrast(r.receivedAt ? new Date(r.receivedAt).toISOString() : '', now) > srokMs || lishnee(r.taskId)) {
      delete saved.receipts[id]; removed.receipts++
    }
  }
  for (const field of ['taskTurns', 'localSessions']) {
    for (const key of Object.keys(saved[field] || {})) {
      if (lishnee(taskOfKey(key))) { delete saved[field][key]; removed[field]++ }
    }
  }
  return { archived, removed }
}
