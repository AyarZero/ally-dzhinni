// Canonical subtasks of the existing Windows task; no provider calls or delivery mutations.
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export const planPath = repo => join(repo, 'задачи/dzhinni-prilozhenie-windows/поручения.md')
const block = /```dzhinni-tasks\r?\n([\s\S]*?)\r?\n```/
const hash = text => createHash('sha256').update(text).digest('hex')

function readPlan(repo) {
  let text
  try { text = readFileSync(planPath(repo), 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; throw e }
  const match = text.match(block)
  if (!match) throw new Error('В плане поручений отсутствует блок задач.')
  const data = JSON.parse(match[1])
  if (!Array.isArray(data.cards) || !Array.isArray(data.reviewedMessages) ||
      new Set(data.cards.map(c => c.id)).size !== data.cards.length ||
      data.cards.some(c => !/^[a-z0-9-]+$/.test(c.id) || !c.title || !c.description || !c.acceptance ||
        !['active', 'deferred', 'done'].includes(c.status) || (c.status === 'done' && !c.evidence)))
    throw new Error('План поручений повреждён; сохранение запрещено.')
  return { text, data, revision: hash(text) }
}

export function taskPlanSnapshot(repo, delivery = {}) {
  const plan = readPlan(repo)
  if (!plan) return null
  const items = [...(delivery.running || []), ...(delivery.pending || []), ...(delivery.review || []), ...(delivery.answeredArchive || delivery.answered || [])]
  const known = new Set(plan.data.reviewedMessages)
  return { ...plan.data, revision: plan.revision, canReorder: plan.data.cards.filter(c => c.status !== 'done').length > 1,
    untriaged: items.filter(item => !known.has(item.messageId)), source: 'задачи/dzhinni-prilozhenie-windows/поручения.md' }
}

export function reorderTaskPlan(repo, ids, revision, delivery = {}) {
  const plan = readPlan(repo)
  if (!plan || revision !== plan.revision) throw new Error('План изменился. Обнови список перед переносом.')
  const active = plan.data.cards.filter(c => c.status !== 'done')
  if (!Array.isArray(ids) || ids.length !== active.length || new Set(ids).size !== active.length ||
      ids.some(id => !active.some(c => c.id === id))) throw new Error('Можно переставлять только все актуальные задачи.')
  const byId = new Map(active.map(c => [c.id, c]))
  let index = 0
  plan.data.cards = plan.data.cards.map(c => c.status !== 'done' ? byId.get(ids[index++]) : c)
  const next = plan.text.replace(block, '```dzhinni-tasks\n' + JSON.stringify(plan.data, null, 2) + '\n```')
  const path = planPath(repo), temp = path + '.' + randomUUID() + '.tmp'
  // Synchronous compare/write serializes requests in this process; recheck external edits before rename.
  try {
    writeFileSync(temp, next, { encoding: 'utf8', flag: 'wx' })
    if (hash(readFileSync(path, 'utf8')) !== revision) throw new Error('План изменился. Обнови список перед переносом.')
    renameSync(temp, path)
  } finally { try { unlinkSync(temp) } catch (e) { if (e.code !== 'ENOENT') throw e } }
  return taskPlanSnapshot(repo, delivery)
}
