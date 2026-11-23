import { createHash } from 'node:crypto'

export const queueRevision = queue => createHash('sha256')
  .update(JSON.stringify(queue.map(item => [item.id, item.state]))).digest('hex')

export function orderedQueue(queue, messageIds, revision) {
  const pending = queue.filter(item => item.state === 'prepared')
  if (revision !== queueRevision(queue)) throw new Error('Очередь изменилась. Проверь новый порядок и повтори перенос.')
  if (!Array.isArray(messageIds) || messageIds.length !== pending.length ||
      new Set(messageIds).size !== pending.length || messageIds.some(id => !pending.some(item => item.id === id)))
    throw new Error('Можно менять порядок только всех ожидающих поручений.')
  const byId = new Map(pending.map(item => [item.id, item]))
  let index = 0
  return queue.map(item => item.state === 'prepared' ? byId.get(messageIds[index++]) : item)
}

export function taskBoardSnapshot(saved, store, locked) {
  const tasks = store.list().filter(task => task.requestKey.startsWith('msg:'))
  const byId = new Map(tasks.map(task => [task.taskId, task]))
  const describe = (task, item) => ({
    messageId: item?.id || task.requestKey.slice(4), taskId: item?.taskId || task.taskId,
    title: ((item?.content || task?.userRequest || task?.goal || 'Без названия')
      .split(/(?:^|\n\n)Вложения из окна|\n\n\[окно:/)[0].trim() || 'Сообщение с вложениями').slice(0, 500),
    state: item?.state || task.state, createdAt: task?.createdAt || null,
    executor: item?.ticket?.executor || item?.assigned || task?.attempts?.at(-1)?.executor || null,
    continues: !!item?.continueOf,
  })
  const items = saved.queue.map(item => describe(byId.get(item.taskId), item))
  const pending = items.filter(item => item.state === 'prepared')
  const queueIds = new Set(saved.queue.map(item => item.taskId))
  const answered = tasks.filter(task => task.state === 'completed' && !queueIds.has(task.taskId))
  return { revision: queueRevision(saved.queue), canReorder: !locked && pending.length > 1,
    running: items.filter(item => item.state === 'sending'), pending,
    review: [...items.filter(item => !['prepared', 'sending'].includes(item.state)),
      ...tasks.filter(task => task.state !== 'completed' && !queueIds.has(task.taskId)).map(task => describe(task))],
    answeredArchive: answered.slice().reverse().map(task => describe(task)),
    answered: answered.slice(-20).reverse().map(task => describe(task)), answeredTotal: answered.length }
}
