document.addEventListener('DOMContentLoaded', () => {
  const board = document.getElementById('taskBoard')
  if (!board) return
  const groups = document.getElementById('taskGroups'), answered = document.getElementById('taskAnsweredRows')
  const notice = document.getElementById('taskNotice'), refreshButton = document.getElementById('taskRefresh')
  const expanded = document.createElement('details'), summary = document.createElement('summary')
  expanded.id = 'taskExpanded'; summary.id = 'taskSummary'; summary.textContent = 'Читаю поручения…'
  summary.style.cssText = 'cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:8px 0'
  expanded.append(summary, ...Array.from(board.childNodes)); board.append(expanded)
  let snapshot = null, loading = false, savingOrder = false, dragging = null, signature = '', readVersion = 0
  // ошибка ЧТЕНИЯ — опрос продолжается с паузой 15 с; неподтверждённый ПЕРЕНОС ждёт ручного «Обновить»
  let retryAt = 0, moveUnconfirmed = false
  const labels = { sending: 'В работе', prepared: 'Ожидает', uncertain: 'Нужна сверка', parked: 'Отложено', completed: 'Ответ получен' }
  const announce = (text, error = false) => { notice.textContent = text; notice.dataset.error = String(error) }
  async function request(path, data) {
    const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(10000), ...(data && {
      method: 'POST', headers: { 'x-dzhinni': '1', 'content-type': 'application/json' }, body: JSON.stringify(data),
    }) })
    if (response.status === 404) throw new Error('Мост ещё не обновлён. Список заработает после безопасного перезапуска, когда закончится очередь.')
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || 'Мост не подтвердил действие.')
    return value
  }
  function rows(items, movable = false) {
    const list = document.createElement('ol'); list.className = 'task-list'
    items.forEach((item, index) => {
      const row = document.createElement('li'); row.className = 'task-card'; row.dataset.message = item.messageId || item.id
      const text = document.createElement('div'); text.className = 'task-text'; text.textContent = item.title
      if (item.description) { const detail = document.createElement('p'); detail.className = 'task-detail'; detail.textContent = item.description; text.append(detail) }
      if (item.acceptance) { const criteria = document.createElement('small'); criteria.className = 'task-meta'; criteria.textContent = 'Готово, когда: ' + item.acceptance; text.append(criteria) }
      if (item.evidence) { const proof = document.createElement('small'); proof.className = 'task-meta'; proof.textContent = 'Подтверждение: ' + item.evidence; text.append(proof) }
      const meta = document.createElement('small'); meta.className = 'task-meta'
      meta.textContent = [movable ? (index + 1) + ' · приоритет' + (item.status === 'deferred' ? ' · позже' : '') : ({active:'Нужно сделать',deferred:'Позже',done:'Выполнено'})[item.status] || labels[item.state] || 'Состояние неизвестно',
        item.executor, item.continues ? 'продолжение разговора' : ''].filter(Boolean).join(' · ')
      text.append(meta)
      if (movable) {
        const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'task-handle'
        handle.textContent = '↕'; handle.title = 'Перетащи поручение; для клавиатуры — кнопки вверх и вниз'
        handle.setAttribute('aria-label', 'Переместить: ' + item.title)
        handle.disabled = savingOrder || !canMove(); handle.draggable = !handle.disabled
        row.append(handle)
        const moves = document.createElement('div'); moves.className = 'task-moves'
        for (const [delta, label, icon] of [[-1, 'Выше', '↑'], [1, 'Ниже', '↓']]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = icon
          button.dataset.move = delta; button.setAttribute('aria-label', label + ': ' + item.title)
          button.disabled = savingOrder || !canMove() || index + delta < 0 || index + delta >= items.length
          moves.append(button)
        }
        row.append(text, moves)
      } else row.append(text)
      list.append(row)
    })
    return list
  }
  const plan = () => snapshot?.plan
  const pendingItems = () => plan() ? plan().cards.filter(c => c.status !== 'done') : snapshot.pending
  const canMove = () => plan() ? plan().canReorder : snapshot.canReorder
  const itemId = item => item.messageId || item.id
  function render() {
    if (!snapshot || dragging) return
    const nextSignature = JSON.stringify([snapshot, savingOrder])
    if (signature === nextSignature) return
    signature = nextSignature
    const pending = pendingItems(), current = plan() ? pending[0] : snapshot.running[0] || pending[0]
    const others = Math.max(0, pending.length + (plan() ? 0 : snapshot.running.length) - 1)
    summary.textContent = current ? current.title + (others ? ' · ещё ' + others : '') : 'Активных поручений нет'
    summary.title = summary.textContent
    const focused = board.contains(document.activeElement) ? document.activeElement : null
    const focusId = focused?.closest('[data-message]')?.dataset.message, focusMove = focused?.dataset.move
    const scrollBox = board.closest('.panel'), scroll = scrollBox.scrollTop
    groups.replaceChildren()
    if (plan()) {
      document.querySelector('#taskAnswered summary').firstChild.textContent = 'Подтверждённые части работы · '
      const tasks = rows(pendingItems(), true); tasks.dataset.group = 'pending'
      const heading = document.createElement('h3'); heading.textContent = 'Порядок работы · ' + pendingItems().length
      groups.append(heading, tasks)
      if (plan().untriaged.length) {
        const heading = document.createElement('h3'); heading.textContent = 'Новые сообщения: ещё не разобраны · ' + plan().untriaged.length
        groups.append(heading, rows(plan().untriaged))
      }
      answered.replaceChildren(rows(plan().cards.filter(c => c.status === 'done')))
      document.getElementById('taskAnsweredCount').textContent = plan().cards.filter(c => c.status === 'done').length
      const history = document.createElement('details'), title = document.createElement('summary')
      title.textContent = 'Журнал доставки сообщений · ' + (snapshot.running.length + snapshot.pending.length + snapshot.review.length) + ' / ответов: ' + snapshot.answeredTotal
      const help = document.createElement('p'); help.className = 'task-help'
      help.textContent = 'Технические статусы сообщений не определяют готовность задач. Неподтверждённые отправки сохранены для сверки; перенос карточки меняет приоритет плана.'
      history.append(title, help)
      for (const [key, label] of [['running','Сейчас'],['pending','Отправка ожидается'],['review','Исход требует сверки'],['answered','Последние ответы']]) {
        const h = document.createElement('h3'); h.textContent = label
        history.append(h, rows(key === 'answered' ? snapshot.answeredArchive || snapshot.answered : snapshot[key]))
      }
      groups.append(history)
    } else {
      for (const [key, title] of [['running', 'Сейчас'], ['pending', 'Дальше'], ['review', 'Требуют внимания']]) {
        const heading = document.createElement('h3'); heading.textContent = title + ' · ' + snapshot[key].length
        const list = rows(snapshot[key], key === 'pending'); list.dataset.group = key
        groups.append(heading, list)
        if (!snapshot[key].length) {
          const empty = document.createElement('p'); empty.className = 'task-help'
          empty.textContent = key === 'pending' ? 'Ожидающих поручений нет.' : key === 'running' ? 'Сейчас ничего не выполняется.' : 'Неподтверждённых результатов нет.'
          groups.append(empty)
        }
      }
      answered.replaceChildren(rows(snapshot.answered))
      document.getElementById('taskAnsweredCount').textContent = snapshot.answered.length + ' из ' + snapshot.answeredTotal
    }
    if (focusId) {
      const row = [...groups.querySelectorAll('[data-message]')].find(el => el.dataset.message === focusId)
      const control = focusMove ? row?.querySelector('[data-move="' + focusMove + '"]') : row?.querySelector('.task-handle')
      if (control && !control.disabled) control.focus({ preventScroll: true })
    }
    scrollBox.scrollTop = scroll
  }
  async function load(manual = false) {
    if (loading || savingOrder || dragging) return
    const version = ++readVersion
    loading = true; refreshButton.disabled = true
    try {
      const value = await request('/api/task-board')
      if (version !== readVersion) return
      snapshot = value; render(); retryAt = 0; if (manual) moveUnconfirmed = false
      announce(plan() ? (manual ? 'Список обновлён.' : 'Задачи разобраны. Перетаскивай за ↕: номера меняются сверху вниз. Приоритеты сохраняются. Новые сообщения разбираются отдельно.') : snapshot.paused ? 'Очередь приостановлена. Порядок можно изменить, но запуск требует сверки в меню «Нейросети».' : snapshot.waiting || (manual ? 'Список обновлён.' : 'Порядок ожидания сохранён на компьютере.'))
    } catch (error) {
      if (version !== readVersion) return
      announce(error.message || 'Связь потеряна. Показан последний полученный список.', true); retryAt = Date.now() + 15000
      if (snapshot) { snapshot.canReorder = false; if (plan()) plan().canReorder = false; render() }
    } finally { loading = false; refreshButton.disabled = false }
  }
  async function move(messageId, beforeId) {
    if (!snapshot || !canMove() || savingOrder) return
    const ids = pendingItems().map(itemId), next = ids.filter(id => id !== messageId)
    if (!ids.includes(messageId) || (beforeId !== null && !next.includes(beforeId))) return
    next.splice(beforeId === null ? next.length : next.indexOf(beforeId), 0, messageId)
    if (next.every((id, i) => id === ids[i])) return
    readVersion++; savingOrder = true; render(); announce('Сохраняю порядок…')
    try {
      if (plan()) snapshot.plan = await request('/tasks/plan-order', { ids: next, revision: plan().revision })
      else snapshot = await request('/tasks/reorder', { messageIds: next, revision: snapshot.revision })
      announce('Порядок сохранён. Текущий ответ не прерывается.')
    } catch (error) {
      announce('Перенос не подтверждён: ' + error.message + ' Нажми «Обновить список» для сверки.', true); moveUnconfirmed = true
      snapshot.canReorder = false; if (plan()) plan().canReorder = false
    } finally { savingOrder = false; render() }
  }
  groups.addEventListener('click', event => {
    const button = event.target.closest('[data-move]'), row = button?.closest('[data-message]')
    if (!button || button.disabled || document.body.classList.contains('edit')) return
    const ids = pendingItems().map(itemId), index = ids.indexOf(row.dataset.message)
    void move(row.dataset.message, Number(button.dataset.move) < 0 ? ids[index - 1] : ids[index + 2] || null)
  })
  groups.addEventListener('dragstart', event => {
    const handle = event.target.closest('.task-handle')
    if (!handle || handle.disabled || document.body.classList.contains('edit')) { event.preventDefault(); return }
    readVersion++; dragging = handle.closest('[data-message]').dataset.message
    event.dataTransfer.setData('application/x-dzhinni-task', dragging); event.dataTransfer.effectAllowed = 'move'
    handle.closest('.task-card').classList.add('task-dragging'); event.stopPropagation()
  })
  groups.addEventListener('dragover', event => {
    const target = event.target.closest('[data-group="pending"] [data-message]')
    if (!dragging || !target || target.dataset.message === dragging) return
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'
    groups.querySelectorAll('.task-drop').forEach(el => el.classList.remove('task-drop')); target.classList.add('task-drop')
  })
  const endDrag = () => { dragging = null; groups.querySelectorAll('.task-dragging,.task-drop').forEach(el => el.classList.remove('task-dragging', 'task-drop')) }
  groups.addEventListener('drop', event => {
    const target = event.target.closest('[data-group="pending"] [data-message]'), id = dragging
    if (!id || !target) return
    event.preventDefault(); event.stopPropagation(); endDrag()
    const ids = pendingItems().map(itemId), from = ids.indexOf(id), to = ids.indexOf(target.dataset.message)
    if (from !== to) void move(id, from < to ? ids[to + 1] || null : ids[to])
  })
  groups.addEventListener('dragend', () => { endDrag(); render() })
  refreshButton.onclick = () => load(true)
  void load()
  setInterval(() => { if (!document.hidden && board.getClientRects().length && !moveUnconfirmed && Date.now() >= retryAt) void load() }, 3000)
})

