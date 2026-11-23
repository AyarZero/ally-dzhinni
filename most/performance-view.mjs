import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { liveResource } from './live-resource.mjs'

const execute = promisify(execFile)
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))

export async function performanceReport(root, days = 7) {
  // Zero-length period = current read-only measurement, no history scan or Python process.
  // Kept on the existing lazy-loaded route so an active turn need not be interrupted to deploy it.
  if(days===0) return {resourceOnly:true,resource:await liveResource(root)}
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Период должен быть от 1 до 365 дней')
  const result = await execute('python', ['-B', join(root, 'act/scripts/brain_performance.py'), '--root', root, '--days', String(days), '--json'],
    { cwd: root, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1' } })
  return JSON.parse(result.stdout)
}

export function performanceHTML(report) {
  if(report.resourceOnly) return `<!doctype html><meta charset="utf-8"><title>Текущий ресурс Джинни</title><h1>Текущий ресурс</h1><pre>${esc(JSON.stringify(report.resource,null,2))}</pre><a href="/">В Джинни</a>`
  const types = { diagnostic: 'Проверка системы', coding: 'Разработка', review: 'Проверка', research: 'Исследование', writing: 'Тексты', operations: 'Обслуживание', unclassified: 'Не определён' }
  const duration = value => value == null ? 'неизвестно' : Math.round(value / 1000) + ' с'
  const rows = groups => groups.map(group => `<tr><td>${esc(group.engine)}<br><b>${esc(group.model)}</b></td><td>${esc(types[group.task_type] || group.task_type)}</td>
    <td>${group.completed_tasks}</td><td>${group.statuses.successful} / ${group.statuses.failed} / ${group.statuses.interrupted}</td>
    <td>${duration(group.median_duration_ms)}</td><td>${group.quality.accepted} / ${group.quality.rework}<br><small>без оценки: ${group.quality.feedback_unknown}</small></td>
    <td>${Object.entries(group.cost.sums_by_currency).map(([currency, sum]) => esc(sum.toFixed(4) + ' ' + currency)).join('<br>') || 'неизвестно'}<br><small>данные: ${group.cost.known_tasks} из ${group.completed_tasks}</small></td></tr>`).join('')
  const table = groups => groups.length ? `<div class="table"><table><thead><tr><th>Исполнитель / модель</th><th>Тип задачи</th><th>Завершено</th><th>Успех / ошибка / прервано</th><th>Медиана времени</th><th>Принято / переделать</th><th>Расход</th></tr></thead><tbody>${rows(groups)}</tbody></table></div>` : '<p>Завершённых задач с измерениями пока нет.</p>'
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Неделя системы — Джинни</title>
    <style>body{font:16px/1.5 system-ui;background:#101820;color:#e2edf3;margin:32px;max-width:1400px}h1,h2{color:#68d9ef}small{color:#a4b5bd}.table{overflow:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:12px;border-bottom:1px solid #344550;vertical-align:top}th{font-size:13px}a{color:#68d9ef}.notice{padding:16px;border:1px solid #344550;border-radius:8px}pre{white-space:pre-wrap}</style>
    <h1>Неделя системы</h1><p>${esc(report.period.first_date)} — ${esc(report.period.through.slice(0, 10))} · Владивосток</p>
    <p>Основных задач: <b>${report.completed_parent_tasks}</b>. Работ помощников: ${report.completed_helper_tasks}. Переключений: ${report.provider_switches_in_period}.</p>
    <p class="notice">Скорость и успешное завершение не доказывают качество. Оценки «принято» и «переделать» задаёт владелец. Неизвестные расходы не считаются нулевыми. Типы задач, определённые правилами, предварительные. Рейтинг моделей пока не строится.</p>
    <h2>Основные задачи</h2>${table(report.groups)}<h2>Помощники — отдельно</h2>${table(report.helper_groups)}
    <h2>Полнота данных</h2><p>Расход показан со слов исполнителя. Стоимость подписок между задачами не распределяется.</p>
    <p>Помощники учитываются отдельно. Неизвестные показатели не считаются нулевыми. При переделке учитывается последняя оценка результата, а факт доработки сохраняется. Небольшая выборка пока не позволяет надёжно сравнивать модели.</p>
    ${report.diagnostics.warning_samples.length ? '<p>Есть неполные записи: часть данных могла не попасть в отчёт.</p>' : ''}<p><a href="/api/performance?days=7">Исходные показатели JSON</a></p></html>`
}
