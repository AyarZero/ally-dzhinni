// First-circle routing: Jinny herself assigns each task to an available subordinate.
// Only confirmed data is used: fresh registry observations (capabilities, quota windows),
// the task class, and the owner's explicit words. Reasoning depth, model quality and other
// unobserved traits are never stated as facts; when nothing is confirmed, the router says so.
import { classifyTask } from './chronicle-bridge.mjs'

// Claude Code главный, Codex второй; в Auto Claude
// допускается после живой проверки (claudeVerified). Запасной — Агрегатор (direct-provider, reserveRoute).
export const ROUTE_ORDER = ['claude', 'codex', 'deepseek']
export const DIRECT_EXECUTORS = [...ROUTE_ORDER, 'antigravity']
export const ASSIGN_PREFIX = /^\s*(codex|claude|deepseek|dsh|antigravity|agy)\s*:\s*/i
const ASSIGN_ALIAS = { dsh: 'deepseek', agy: 'antigravity' }

// candidates: [{ executor, eligible, reason, quota, observation }] from the registry.
// assigned: owner directive already stripped from content at enqueue (or the raw «codex: …» prefix here).
export function routeTask({ content = '', images = [], candidates = [], preference = 'auto', order = ROUTE_ORDER, assigned = null }) {
  const text = String(content), hasImages = (images?.length ?? 0) > 0
  const kind = classifyTask(text)
  const byId = Object.fromEntries(candidates.map(row => [row.executor, row]))
  // Antigravity добавляется вручную; в автоматическую смену ведущей пока не входит.
  const eligible = candidates.filter(row => row.eligible && order.includes(row.executor))
  // 1. The owner's explicit word beats every other rule for this one turn.
  const match = ASSIGN_PREFIX.exec(text)
  const want = (assigned ?? (match ? (ASSIGN_ALIAS[match[1].toLowerCase()] || match[1].toLowerCase()) : null))
  if (want) {
    const row = byId[want]
    if (row?.eligible) return { executor: want, source: 'user', reason: 'назначено тобой в сообщении',
      stripPrefix: match && !assigned ? true : undefined, taskType: kind.task_type }
    return { executor: null, source: 'user', taskType: kind.task_type,
      reason: `Ты назначил ${want}, но он недоступен (${row?.reason ?? 'нет свежих данных'})`,
      action: ownerAction(row) }
  }
  // 2. A manual global choice is respected; it is not delegation and is never rewritten silently.
  if (preference !== 'auto') {
    const row = byId[preference]
    if (row?.eligible) return { executor: preference, source: 'manual', reason: 'глобальный выбор в окне', taskType: kind.task_type }
    return { executor: null, source: 'manual', taskType: kind.task_type,
      reason: `Выбранный исполнитель ${preference} недоступен (${row?.reason ?? 'нет свежих данных'})`,
      action: ownerAction(row) }
  }
  // 3. Auto: Jinny decides among confirmed-eligible subordinates.
  if (!eligible.length) return { executor: null, source: 'jinny', taskType: kind.task_type,
    reason: 'Нет доступного исполнителя по свежим данным' +
      (candidates.length ? ': ' + candidates.map(row => `${row.executor} — ${row.reason ?? 'status_unknown'}`).join('; ') : ''),
    action: [...new Set(candidates.map(ownerAction))].join(' ') || undefined }
  if (hasImages) {
    const withImages = eligible.filter(row => row.observation?.capabilities?.images === true)
    if (!withImages.length) return { executor: null, source: 'jinny', taskType: kind.task_type,
      reason: 'В задаче картинки, но ни один исполнитель не подтвердил их поддержку свежими данными',
      action: 'Действие: убери картинки из сообщения или подожди, пока исполнитель подтвердит поддержку.' }
    return pick(withImages, order, kind.task_type, hasImages)
  }
  return pick(eligible, order, kind.task_type, hasImages)
}

// решает порядок, а не «чья квота свежее». Исчерпанные и почти пустые уже отсеяны
// eligibility; «квота неизвестна» у главного не повод отдать ход второму (раньше Codex обходил Claude так).
function pick(rows, order, taskType, hasImages) {
  const rank = id => order.includes(id) ? order.indexOf(id) : order.length
  const chosen = [...rows].sort((a, b) => rank(a.executor) - rank(b.executor))[0]
  const model = chosen.observation?.model?.id
  const place = rank(chosen.executor) === 0 ? 'главный доступен' : 'главный недоступен — следующий по порядку'
  return { executor: chosen.executor, source: 'jinny', taskType,
    reason: `${place}${model ? ', модель ' + model : ''}, класс задачи «${taskType}»${hasImages ? ', поддержаны картинки' : ''}; глубина рассуждений данными не подтверждена` }
}

function ownerAction(row) {
  const reason = row?.reason ?? 'status_unknown'
  if (reason === 'images_unsupported') return 'Действие: этот исполнитель не читает картинки — переключись на Antigravity, Codex или Claude, либо отправь сообщение без картинки.'
  if (reason === 'budget_low') return 'Действие: бюджет исчерпан до заданного порога — ход не начат; дождись сброса квоты или пополни и проверь связь.'
  if (reason.startsWith('blocked_quota') || reason === 'quota_exhausted') {
    return row?.executor === 'codex'
      ? 'Действие: дождись сброса квоты (время — в «Ресурсах») или проверь подписку ChatGPT.'
      : 'Действие: дождись сброса квоты (время — в «Ресурсах») или переключи нейросеть.'
  }
  if (reason.startsWith('blocked_auth') || reason.startsWith('auth_')) return 'Действие: войди в исполнителя — раздел «Нейросети», кнопка входа.'
  if (reason.startsWith('service_')) return 'Действие: проверь, что CLI исполнителя установлен и запускается на ноутбуке.'
  if (reason === 'status_stale' || reason === 'status_unknown') return 'Действие: нажми «Проверить связь» в разделе «Нейросети».'
  if (reason === 'refresh_required') return 'Действие: нажми «Проверить связь» в разделе «Нейросети» — нужны свежие данные.'
  return 'Действие: открой раздел «Нейросети» и проверь состояние исполнителей.'
}
