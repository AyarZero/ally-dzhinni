// Local appearance changes never call a provider or rebuild the conversation.
(() => {
  const key='dzhinni-desktop-theme', themes=['teal','graphite','midnight','noir','light']
  function apply(value,persist=false) {
    const theme=themes.includes(value)?value:'graphite'
    document.documentElement.dataset.theme=theme
    if(persist) { try { localStorage.setItem(key,theme) } catch {} }
    const choice=document.getElementById('desktopTheme'); if(choice) choice.value=theme
    const meta=document.querySelector('meta[name="theme-color"]')
    if(meta) meta.content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    document.dispatchEvent(new Event('dzhinni-theme-change'))
  }
  document.addEventListener('DOMContentLoaded',()=>{
    apply(document.documentElement.dataset.theme)
    document.getElementById('desktopTheme')?.addEventListener('change',event=>apply(event.target.value,true))
  })
  window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue)})
})();

// One live activity block inside each chat view; never invent progress percentages or ETA.
(() => {
 let pendingAt=0,firstBusyAt=0,taskId=''
 const duration=ms=>{const seconds=Math.max(0,Math.floor(ms/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}
 function paint(){
  if(typeof providerState==='undefined'||typeof hodL==='undefined')return
  const p=providerState,now=Date.now(),task=p.task||{},connected=document.getElementById('dLink')?.classList.contains('on')
  if(p.busy){const key=task.attempt_id||task.task_id;if(taskId!==key||!firstBusyAt){taskId=key;firstBusyAt=Date.parse(task.started_at)||now}pendingAt=0}
  if(pendingAt&&typeof chat!=='undefined'&&chat.some(m=>m.who==='ya'&&m.at>=pendingAt))pendingAt=0
  const active=p.busy||p.queued>0||pendingAt>0
  const since=p.busy?firstBusyAt:pendingAt||Date.parse(task.started_at)||now
  const latest=[...hodL].reverse().find(h=>!h.konec&&h.at>=since)
  let title=p.busy?'Думаю…':p.queued?'Сообщение в очереди':'Отправляю сообщение…'
  let step=p.busy?(latest?.text||'Исполнитель получил задачу и работает.'):p.waiting||'Передаю сообщение на ноутбук.'
  if(p.busy&&task.inputPhase==='starting'){title='Запускаю исполнителя…';step='Сообщение на компьютере. Жду подтверждения приёма исполнителем.'}
  if(step.length>=175)step=step.slice(0,170).replace(/\s+\S*$/,'')+'…'
  let clock=duration(now-since)
  if(!connected&&active){title='Связь прервалась';step='Проверяю соединение. Состояние работы временно неизвестно.'}
  else if(p.queued&&!p.busy){step=p.waiting||'Жду доступную нейросеть.';clock='В очереди: '+p.queued+'.'}
  const feedItems=p.busy?hodL.filter(h=>!h.konec&&h.at>=since).slice(-20).reverse():hodL.filter(h=>!h.konec&&h.text).slice(-5).reverse()
  const fmtTime=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  for(const node of document.querySelectorAll('.chat-activity')){
   const inRail=Boolean(node.closest('.chat-presence'))
   const showIdle=inRail&&!active&&feedItems.length>0
   const showIdleHint=inRail&&!active&&!feedItems.length
   node.hidden=!(active||inRail)
   node.dataset.state=!connected&&active?'stopped':active?'active':'idle'
   let top=node.querySelector('.activity-top')
   if(inRail&&!top){
    top=document.createElement('div');top.className='activity-top'
    const heading=node.querySelector('.activity-heading'),clk=node.querySelector('.activity-clock')
    if(heading)top.append(heading)
    if(clk)top.append(clk)
    node.prepend(top)
   }
   if(top)top.hidden=showIdleHint
   const label=node.querySelector('[data-activity-title]');if(label.textContent!==title)label.textContent=title
   const stepEl=node.querySelector('.activity-step')
   stepEl.textContent=String(step).slice(0,500)
   stepEl.title=step
   stepEl.hidden=inRail&&(showIdleHint||showIdle||(p.busy&&feedItems.length>0&&connected))
   node.title=active?(title+(latest?' · обновление '+duration(now-latest.at)+' назад':'')):'Последние шаги работы'
   node.querySelector('.activity-clock').textContent=clock
   let stop=node.querySelector('.activity-stop')
   if(!stop){
    stop=document.createElement('button')
    stop.type='button';stop.className='activity-stop';stop.innerHTML='<span class="stop-icon" aria-hidden="true"></span>';stop.setAttribute('aria-label','Остановить текущий ход')
    stop.title='Прервать текущий ход и передать накопленные сообщения. Прерванный запрос не повторяется.'
    ;(top||node).append(stop)
    stop.onclick=async()=>{
     if(stop.disabled)return
     stop.disabled=true;stop.setAttribute('aria-label','Останавливаю текущий ход')
     try{
      const response=await fetch('/engine/stop',{method:'POST',headers:{'content-type':'application/json','x-dzhinni':'1'},body:'{}'})
      const value=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(value.error||'действие не выполнено')
      stop.disabled=false;stop.setAttribute('aria-label','Остановить текущий ход')
      paint()
     }catch(error){
      stop.disabled=false;stop.setAttribute('aria-label','Остановить текущий ход')
      const line=node.querySelector('.activity-step');if(line){line.hidden=false;line.textContent='Не получилось остановить: '+error.message}
     }
    }
   }else if(top&&stop.parentElement!==top){top.append(stop)}
   stop.hidden=!p.busy
   if(!p.busy){stop.disabled=false;stop.setAttribute('aria-label','Остановить текущий ход')}
   if(inRail){
    let feed=node.querySelector('.activity-feed')
    if(!feed){feed=document.createElement('div');feed.className='activity-feed';node.append(feed)}
    const sig=showIdleHint?'__idle_hint__':feedItems.map(h=>h.at+':'+h.text).join('|')
    if(feed.dataset.sig!==sig){
     feed.dataset.sig=sig
     feed.innerHTML=showIdleHint
      ?'<div class="activity-idle-hint">Шаги работы появятся здесь во время ответа</div>'
      :feedItems.map((h,i)=>`<div class="activity-feed-item${i===0?' latest':''}"><b>${fmtTime(h.at)}</b>${String(h.text||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>`).join('')
    }
    feed.hidden=!feedItems.length&&!showIdleHint
   }
  }
 }
 window.updateChatActivity=paint
 window.jinnyChatDeliveryStarted=()=>{pendingAt=Date.now();paint()}
 window.jinnyChatDeliveryFailed=()=>{pendingAt=0;paint()}
 document.addEventListener('DOMContentLoaded',()=>{
  paint();setInterval(()=>{if(!document.hidden&&document.hasFocus?.()!==false)paint()},1000)
 })
})();

// Executor controls live inside the window; starting Dzhinni needs no provider dialog.
(() => {
  const get = id => document.getElementById(id)
  const names = { direct: 'Джинни', codex: 'Codex', claude: 'Claude Code', deepseek: 'DeepSeek Harness', antigravity: 'Antigravity', tokenator: 'Запасной · Агрегатор (когда у всех кончились лимиты)' }
  let current, initialized = false, timer, saving = false, catalog = []
  const request = async (path, data) => {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify(data) })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || 'Действие не выполнено')
    return value
  }
  const showError = error => { get('codexError').hidden = false; get('codexError').textContent = error.message }
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
  // Model and reasoning depth per network; the server owns the lists and validation.
  function renderExecutorModels(p) {
    catalog = Array.isArray(p.executorCatalog) ? p.executorCatalog : []
    const box = get('executorModels')
    if (!catalog.length) { box.hidden = true; return }
    box.hidden = false
    const signature = JSON.stringify(catalog.map(row => [row.id, row.reasoningOptions]))
    if (box.dataset.signature !== signature) {
      box.dataset.signature = signature
      // A full select, not input+datalist: datalist hides every model except the one already typed.
      box.innerHTML = '<hr><b>Модель и глубина рассуждений</b>' + catalog.map(row => `<div class="executor-pick" data-executor="${esc(row.id)}">
        <label>${esc(names[row.id] || row.id)}
          <select id="model-${esc(row.id)}" style="width:100%"></select>
        </label>
        <label>глубина рассуждений
          <select id="reasoning-${esc(row.id)}" style="width:100%"></select>
        </label>
      </div>`).join('') + '<div class="controls"><button class="hb" id="modelsSave">Сохранить модели</button></div><small id="modelsStatus" role="status" aria-live="polite">Применяется к следующей задаче этой нейросети. «По умолчанию» — выбор самой программы.</small>'
      for (const row of catalog) get('model-' + row.id).onchange = () => fillLevels(row, get('reasoning-' + row.id).value)
      get('modelsSave').onclick = async () => {
        if (saving) return
        saving = true; get('modelsSave').disabled = true
        try {
          const executorSettings = Object.fromEntries(catalog.map(row => [row.id, {
            model: get('model-' + row.id).value || null, reasoning: get('reasoning-' + row.id).value || null }]))
          const value = await request('/engine/settings', { executorSettings })
          get('modelsStatus').textContent = 'Сохранено. Применится к следующей задаче.'
          window.renderEngine(value.status || value)
        } catch (error) { showError(error); get('modelsStatus').textContent = 'Не сохранено: ' + error.message }
        finally { saving = false; get('modelsSave').disabled = false }
      }
    }
    if (box.contains(document.activeElement) || saving) return
    for (const row of catalog) {
      const model = get('model-' + row.id), models = row.models || []
      // A saved name outside the known list stays selectable instead of silently turning into default.
      const extra = row.model && !models.some(item => item.value === row.model) ? [{ value: row.model, label: row.model + ' · своя' }] : []
      const listHtml = '<option value="">по умолчанию</option>' + [...models, ...extra]
        .map(item => `<option value="${esc(item.value)}">${esc(item.label || item.value)}</option>`).join('')
      if (model.dataset.filled !== listHtml) { model.dataset.filled = listHtml; model.innerHTML = listHtml }
      model.value = row.model || ''
      fillLevels(row, row.reasoning || '')
    }
  }
  // Levels depend on the chosen model (e.g. Codex Luna has no ultra); the server repeats this check.
  function fillLevels(row, wanted) {
    const chosen = get('model-' + row.id).value, select = get('reasoning-' + row.id)
    const levels = (row.models || []).find(item => item.value === chosen)?.reasoning || row.reasoningOptions || []
    if (select.dataset.filled !== levels.join(',')) {
      select.dataset.filled = levels.join(',')
      select.innerHTML = '<option value="">по умолчанию</option>' + levels.map(level => `<option value="${esc(level)}">${esc(level)}</option>`).join('')
    }
    select.value = levels.includes(wanted) ? wanted : ''
  }
  function initialize() {
    if (initialized) return
    initialized = true
    const controls = document.createElement('div')
    controls.id = 'legacyEngineControls'
    controls.innerHTML = `<hr><div class="controls"><label>Исполнитель <select id="engineChoice"><option value="codex">Codex напрямую</option><option value="claude">Claude Code напрямую</option></select></label><button class="hb" id="engineOpen">Открыть</button></div>
      <div class="controls"><a id="enginePhone" target="_blank" rel="noopener noreferrer" hidden>Та же сессия на телефоне</a></div>
      <div id="engineConnections"></div><div class="controls"><button class="hb" id="engineClaudeLogin">Войти в Claude</button></div><pre id="engineLogin" hidden></pre><a id="engineAuthLink" target="_blank" rel="noopener noreferrer" hidden>Продолжить вход в браузере</a>`
    get('codexBar').append(controls)
    const selector = document.createElement('div')
    selector.id = 'directEngineControls'
    selector.hidden = true
    selector.innerHTML = `<hr><div class="controls"><label>Главная нейросеть <select id="executorChoice"><option value="codex">Codex · без автозамены</option><option value="claude">Claude Code · без автозамены</option><option value="deepseek">DeepSeek Harness · без автозамены</option><option value="auto">Авто · по доступности</option></select></label><button class="hb" id="executorApply">Назначить главной</button></div><small id="executorSelection" role="status" aria-live="polite"></small><small>«Авто»: по порядку доступности, без лимитов — следующий, у всех нет — запасной агрегатор (модель ниже). Ручной выбор сохраняется для следующих задач; если выбранная недоступна, очередь ждёт. Разовое назначение: «claude: …», «codex: …» или «deepseek: …».</small><div id="executorModels" hidden></div><small id="engineShift" role="status" aria-live="polite"></small><div class="controls"><button class="hb" id="shiftRelease">Снять чужую смену</button></div><div class="controls"><button class="hb" id="phoneQrOpen">Подключить телефон</button></div><div id="phoneQr" hidden><img id="phoneQrImg" width="220" height="220" alt="QR-код для подключения телефона"><small id="phoneQrText" role="status" aria-live="polite"></small></div>`
    get('codexBar').append(selector)
    const agyOption=document.createElement('option');agyOption.value='antigravity';agyOption.textContent='Antigravity · без автозамены';get('executorChoice').append(agyOption)
    get('executorApply').onclick = async () => {
      if (saving) return
      saving = true; get('executorApply').disabled = true
      try {
        const value = await request('/engine/settings', { mode: get('executorChoice').value })
        window.renderEngine(value.status || value)
      } catch (error) { showError(error) }
      finally { saving = false; get('executorApply').disabled = false }
    }
    get('shiftRelease').onclick = async () => {
      if (saving) return
      saving = true; get('shiftRelease').disabled = true
      try {
        const state = await request('/engine/shift', {})
        if (state.status === 'free') { get('engineShift').textContent = 'Смена свободна: папку никто не держит.'; return }
        if (state.ours) { get('engineShift').textContent = 'Папку держит сама Джинни: снимать нечего.'; return }
        const w = state.writer || {}
        const since = w.acquired_at ? new Date(w.acquired_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
        const freed = await request('/engine/shift/release', {})
        get('engineShift').textContent = freed.released
          ? 'Сняла смену ' + (w.agent || '') + (since ? ' от ' + since : '') + '. Следующее сообщение сможет писать.'
          : 'Не получилось снять: ' + (freed.error || 'неизвестно')
        if (freed.provider) window.renderEngine(freed.provider)
      } catch (error) { showError(error) }
      finally { saving = false; get('shiftRelease').disabled = false }
    }
    get('phoneQrOpen').onclick = async () => {
      if (saving) return
      saving = true; get('phoneQrOpen').disabled = true
      try {
        const value = await request('/mobile/qr', {})
        get('phoneQrImg').src = 'data:image/png;base64,' + value.png
        get('phoneQr').hidden = false
        get('phoneQrText').textContent = 'Наведите камеру телефона на код и откройте Джинни. Код действует ' + Math.round((value.expiresIn || 600) / 60) + ' мин. ' + value.link
      } catch (error) { showError(error) }
      finally { saving = false; get('phoneQrOpen').disabled = false }
    }
    const taskControls = document.createElement('div')
    taskControls.innerHTML = '<hr><div id="engineTask"></div><div class="controls"><button class="hb" id="taskAccepted" hidden>Результат устраивает</button><button class="hb" id="taskRework" hidden>Нужна переделка</button><a href="/performance?days=7" target="_blank" rel="noopener">Неделя системы</a></div><small id="taskFeedbackStatus"></small>'
    get('codexBar').append(taskControls)
    for (const [id, feedback] of [['taskAccepted', 'accepted'], ['taskRework', 'rework']]) get(id).onclick = async () => {
      try { await request('/task/feedback', { taskId: current.task?.task_id, feedback }); get('taskFeedbackStatus').textContent = 'Оценка сохранена в летописи' } catch (error) { showError(error) }
    }
    get('engineOpen').onclick = () => request('/engine/open', { engine: get('engineChoice').value }).catch(showError)
    for (const engine of ['claude']) get('engineClaudeLogin').onclick = async () => {
      try {
        const update = value => {
          get('engineLogin').hidden = false; get('engineLogin').textContent = value.error || value.text || 'Открываю вход…'
          const link = value.text?.match(/https:\/\/[^\s<>"\x1b]+/g)?.find(url => /(?:claude|anthropic)\./i.test(url))
          get('engineAuthLink').hidden = !link
          if (link) get('engineAuthLink').href = link
        }
        update(await request('/engine/login', { engine }))
        clearInterval(timer)
        timer = setInterval(async () => {
          try { const value = await request('/engine/login-status', { engine }); update(value); if (!value.running) clearInterval(timer) } catch (error) { clearInterval(timer); showError(error) }
        }, 2000)
      } catch (error) { showError(error) }
    }
  }
  window.renderEngine = p => {
    if (!p) return
    initialize(); current = p
    const engine = p.provider, name = names[engine] || engine, codex = engine === 'codex'
    const task = p.task, model = task?.model
    const modelName = typeof model === 'string' ? model : model ? [model.providerID, model.id].filter(Boolean).join(' / ') : ''
    const requested = task?.requested_model
    const requestedName = typeof requested === 'string' ? requested : requested ? [requested.providerID, requested.id].filter(Boolean).join(' / ') : ''
    const routeLine = task?.route?.executor ? (task.route.source === 'user' ? ' · назначено тобой: ' : ' · маршрут выбрала Джинни: ') + task.route.executor + ' · ' + task.route.reason : ''
    get('engineTask').textContent = task ? (task.status === 'running' ? 'Сейчас: ' : 'Последняя задача: ') + task.title + routeLine + (modelName ? ' · ' + modelName : requestedName ? ' · запрошена ' + requestedName : '') : 'Измерения появятся после следующей задачи'
    for (const id of ['taskAccepted', 'taskRework']) get(id).hidden = !task || task.status === 'running'
    if (get('codexMenu')) get('codexMenu').hidden = true
    const direct = engine === 'direct'
    get('directEngineControls').hidden = !direct
    get('legacyEngineControls').hidden = direct
    if (!direct) paintComposerEngine(null)
    if (direct) {
      const executor = typeof p.executor === 'string' ? p.executor : p.executor?.engine
      const actual = names[executor] || executor || 'ожидание'
      const mode = p.selection?.mode || 'auto'
      if (!get('directEngineControls').contains(document.activeElement) && !saving) get('executorChoice').value = mode
      const order = (p.selection?.autoOrder || []).map(id => names[id] || id).join(' → ')
      const autoLabel = 'Авто' + (order ? ' · ' + order : ' · по доступности')
      get('executorChoice').querySelector('option[value="auto"]').textContent = autoLabel
      const selected = mode === 'auto' ? 'не закреплена (' + autoLabel + ')' : names[mode] || mode
      get('executorSelection').textContent = 'Главная нейросеть: ' + selected + '. ' + (p.busy ? 'Сейчас отвечает: ' + actual + '. Изменения применяются после текущего ответа.' : 'Активного хода нет.') + (p.waiting ? ' · ' + p.waiting : '')
      renderExecutorModels(p)
      paintComposerEngine(p)
      // 
      const short = value => String(value).replace(/ Code$/, '')
      const main = mode === 'auto' ? 'авто' : short(names[mode] || mode)
      // Проект стоит справа на той же строке отдельным полем (resurs.js, #projectName) — пользователь .
      get('providerName').textContent = 'Главная: ' + main + (p.busy && short(actual) !== main ? ' · сейчас: ' + short(actual) : '')
      get('q').placeholder = 'Напиши Джинни'
      get('tLink').textContent = ''; get('tLink').hidden = true
      const queued = typeof p.queued === 'number' ? p.queued : typeof p.queueLength === 'number' ? p.queueLength : null
      // Чужая смена — не повод молчать: показываем, кто держит папку и что этот ход читает без записи.
      const holder = p.writer
      const shiftText = [p.waiting || '', holder
        ? (p.readOnly ? 'Папка занята: ' : 'Папку держит ') + (holder.agent || '?') + (holder.session ? ' · ' + holder.session : '')
          + (holder.acquired_at ? ' с ' + new Date(holder.acquired_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
        : ''].filter(Boolean).join(' ')
      if (shiftText) get('engineShift').textContent = shiftText
      const state = p.core?.status
      get('codexStatus').textContent = (p.error ? 'Требуется внимание' : p.busy ? actual + ' выполняет задачу' : 'Текущий исполнитель: ' + actual) + (state ? ' · ' + state : '') + (queued !== null ? ' · в очереди: ' + queued : '')
      const error = [p.error, p.login?.error].filter(Boolean).join('\n')
      get('codexError').hidden = !error; get('codexError').textContent = error
      for (const id of ['codexLogin', 'codexDevice']) get(id).hidden = true
      get('codexLogin').disabled = !!p.login?.running; get('codexDevice').disabled = !!p.login?.running
      get('codexCheck').hidden = false; get('codexCheck').textContent = 'Проверить связь'
      get('codexRetry').hidden = !p.paused; get('codexRetry').disabled = !!p.busy
      get('codexRetry').textContent = 'Сверить состояние'
      const text = p.login?.text || ''
      get('codexLoginText').hidden = !text; get('codexLoginText').textContent = text
      get('codexLoginLink').hidden = true
      return
    }
    if (document.activeElement !== get('engineChoice')) get('engineChoice').value = engine
    get('providerName').textContent = 'работает на ' + name
    get('q').placeholder = 'Напиши Джинни — сообщение уйдёт в твою сессию ' + name
    get('tLink').textContent = ''; get('tLink').hidden = true
    const resume = p.autoResumeAt ? ' · авто-возврат в ' + new Date(p.autoResumeAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''
    get('codexStatus').textContent = (engine === 'claude' ? 'Канал Claude Code' : !p.installed ? name + ' недоступен' : !p.authenticated ? 'Нужен вход в ' + name : p.error ? 'Требуется внимание' : p.busy ? name + ' работает' : name + ' готова к работе') + resume
    get('codexLogin').hidden = !codex; get('codexDevice').hidden = !codex
    get('codexLogin').disabled = !!p.login?.running; get('codexDevice').disabled = !!p.login?.running
    get('codexCheck').hidden = engine === 'claude'; get('codexCheck').textContent = 'Проверить связь'
    get('codexRetry').hidden = !p.paused; get('codexRetry').disabled = p.busy
    get('codexRetry').textContent = p.core ? 'Сверить состояние' : 'Повторить'
    const text = p.login?.text || ''; get('codexLoginText').hidden = !text; get('codexLoginText').textContent = text
    const link = codex && text.match(/https:\/\/(?:[\w-]+\.)*(?:openai\.com|chatgpt\.com)\/[\w/?=&.%-]*/i)?.[0]
    get('codexLoginLink').hidden = !link; if (link) get('codexLoginLink').href = link
    const error = [p.error, p.login?.error].filter(Boolean).join('\n'); get('codexError').hidden = !error; get('codexError').textContent = error
    get('enginePhone').hidden = !p.phoneURL; if (p.phoneURL) get('enginePhone').href = p.phoneURL
    const connections = (p.integrations || []).map(item => item.name + ': ' + (item.connections?.length ? item.connections.map(connection => connection.status === 'needs_auth' ? 'нужен вход' : connection.status || 'подключено').join(', ') : 'не подключено'))
    get('engineConnections').textContent = connections.join(' · ')
  }

  // Выбор нейросети и модели в поле ввода — та же шторка, что в Android:
  // кнопка показывает закреплённую сеть, внутри — сеть → её модели → глубина рассуждений.
  const isUserInterface=()=>typeof document!=='undefined'&&document.documentElement?.dataset?.interface==='user'
  const NET_ROWS=[['auto','Авто'],['claude','Claude'],['codex','Codex'],['deepseek','DeepSeek'],['antigravity','Antigravity'],['tokenator','Агрегатор']]
  const netTitle=id=>id==='tokenator'&&isUserInterface()?'OpenRouter / Агрегатор':(NET_ROWS.find(row=>row[0]===id)||[,''])[1]
  let sheet=null,sheetNet=null,sheetProvider=null,sheetStatus=''
  const catalogRow=id=>catalog.find(row=>row.id===id)||null
  function modelOf(executor){const row=catalogRow(executor);return row?.model||''}
  function modelLabel(executor,value){const item=(catalogRow(executor)?.models||[]).find(model=>model.value===value);const raw=item?.label||value;return isUserInterface()?String(raw).replace(/^Агрегатор · /,'Агрегатор · '):raw}
  function chosenNet(p){
    const mode=p?.selection?.mode||'auto'
    if(mode==='claude'&&String(modelOf('claude')).startsWith('tokenator:'))return 'tokenator'
    return NET_ROWS.some(row=>row[0]===mode)?mode:'auto'
  }
  function netNote(id){
    if(id==='auto')return isUserInterface()?'Сама выбирает доступную: Claude → Codex → DeepSeek → Агрегатор':'Сама выбирает доступную: Claude → Codex → DeepSeek → Агрегатор'
    if(id==='tokenator'){
      const value=String(modelOf('claude')).startsWith('tokenator:')?modelOf('claude'):modelOf('tokenator')
      return (isUserInterface()?'Любой агрегатор моделей (OpenRouter и др.)':'Чужие модели через Claude Code')+(value?' · '+modelLabel('claude',value).replace(/^(?:Агрегатор|Агрегатор) · /,'').replace(/ · платно$/,''):'')
    }
    const value=modelOf(id)
    return !value||String(value).startsWith('tokenator:')?'Модель по умолчанию':'Модель: '+modelLabel(id,value)
  }
  function allowedDepths(executor,value){
    const row=catalogRow(executor);if(!row)return []
    if(value){const item=(row.models||[]).find(model=>model.value===value);if(item&&Array.isArray(item.reasoning))return item.reasoning}
    return Array.isArray(row.reasoningOptions)?row.reasoningOptions:[]
  }
  const currentDepth=executor=>catalogRow(executor)?.reasoning||''
  const depthTitle=level=>({low:'Низкий',medium:'Средний',high:'Высокий',xhigh:'Очень высокий',max:'Максимум',ultra:'Ультра'}[level]||level)
  const depthNote=level=>level==='low'?'Быстро и экономно':level==='medium'?'Обычная работа':level==='high'?'Сложные задачи':['xhigh','max','ultra'].includes(level)?'Дольше думает, сильнее расходует лимиты':''
  function firstTokenator(){
    for(const row of [catalogRow('claude'),catalogRow('tokenator')])for(const item of (row?.models||[]))if(String(item.value).startsWith('tokenator:'))return item.value
    return ''
  }
  function paintComposerEngine(p){
    const button=get('bEngine');if(!button)return
    const direct=p?.provider==='direct'
    button.hidden=!direct
    if(!direct)return
    const id=chosenNet(p),executor=id==='tokenator'?'claude':id,value=modelOf(executor)
    const short=id==='auto'?'Авто':netTitle(id)
    const actual=typeof p.executor==='string'?p.executor:p.executor?.engine
    const active=p.busy&&actual?actual:id
    const activeExecutor=active==='tokenator'?'claude':active
    const taskModel=typeof p.task?.model==='string'?p.task.model:p.task?.model?.id
    const displayedModel=p.busy&&taskModel?taskModel:modelOf(activeExecutor)
    const label=active==='auto'?'Авто':netTitle(active)
    button.textContent=label+(displayedModel?' · '+modelLabel(activeExecutor,displayedModel):'')+' ▾'
    button.setAttribute('aria-label','Сейчас: '+button.textContent.replace(/ ▾$/,'')+'. Выбрать нейросеть и модель')
    button.setAttribute?.('data-pinned',id==='auto'?'0':'1')
    button.dataset.network=active
    button.title=(p.busy?'Сейчас отвечает: ':'Выбрана: ')+label+(displayedModel?' · '+modelLabel(activeExecutor,displayedModel):'')+(active!==id?' · Следующий ответ: '+short:'')+'. Нажми, чтобы изменить выбор.'
    if(sheet?.open&&!saving){sheetProvider=p;renderSheet()}
  }
  function rowHtml(title,note,mark,attrs){
    return '<button type="button" class="es-row" '+attrs+'><span class="es-text"><b>'+esc(title)+'</b>'+(note?'<small>'+esc(note)+'</small>':'')+'</span>'+
      (mark==='tick'?'<span class="es-tick">✓</span>':mark==='arrow'?'<span class="es-arrow">›</span>':'')+'</button>'
  }
  function makeSheet(){
    if(sheet)return sheet
    sheet=document.createElement('dialog');sheet.id='engineSheet';sheet.className='engine-sheet'
    sheet.setAttribute('aria-labelledby','engineSheetTitle')
    sheet.innerHTML='<div class="es-head"><button type="button" id="esBack" aria-label="Назад" hidden>‹</button><h2 id="engineSheetTitle">Нейросеть и модель</h2><button type="button" id="esClose" aria-label="Закрыть">✕</button></div><div class="es-body" id="esBody"></div><p class="es-note" id="esNote">Выбор действует со следующего ответа и не прерывает текущий.</p>'
    document.body.append(sheet)
    sheet.querySelector('#esClose').onclick=()=>sheet.close()
    sheet.querySelector('#esBack').onclick=()=>{sheetNet=null;sheetStatus='';renderSheet()}
    sheet.addEventListener('close',()=>{sheetNet=null;sheetStatus=''})
    return sheet
  }
  function renderSheet(){
    if(!sheet||!sheetProvider)return
    const p=sheetProvider,chosen=chosenNet(p),body=sheet.querySelector('#esBody'),note=sheet.querySelector('#esNote')
    sheet.querySelector('#esBack').hidden=sheetNet===null
    sheet.querySelector('#engineSheetTitle').textContent=sheetNet?netTitle(sheetNet):'Нейросеть и модель'
    const list=[]
    if(sheetNet===null){
      for(const [id,name] of NET_ROWS)list.push(rowHtml(netTitle(id),netNote(id),id===chosen?'tick':'arrow','data-net="'+id+'"'))
      list.push(rowHtml('Подключить нейросети · Онбординг','Проверка CLI и настройка агрегатора (OpenRouter и др.)','arrow','data-onboard="1"'))
    }else{
      const net=sheetNet,executor=net==='tokenator'?'claude':net,current=modelOf(executor),tok=net==='tokenator'
      const models=(catalogRow(executor)?.models||[]).filter(item=>String(item.value).startsWith('tokenator:')===tok)
      if(!models.length)list.push('<div class="es-sec">Список моделей придёт с компьютера после обновления связи.</div>')
      if(!tok)list.push(rowHtml('По умолчанию','Как решит сама нейросеть',!current?'tick':'','data-model=""'))
      for(const item of models)list.push(rowHtml(item.label||item.value,item.value,item.value===current?'tick':'','data-model="'+esc(item.value)+'"'))
      const levels=tok?[]:allowedDepths(executor,current||null)
      if(levels.length){
        list.push('<div class="es-sec">Уровень рассуждений</div>')
        list.push(rowHtml('По умолчанию','Как решит сама модель',!currentDepth(executor)?'tick':'','data-depth=""'))
        for(const level of levels)list.push(rowHtml(depthTitle(level),depthNote(level),currentDepth(executor)===level?'tick':'','data-depth="'+esc(level)+'"'))
      }
    }
    body.innerHTML=list.join('')
    body.querySelectorAll('[data-net]').forEach(node=>node.onclick=()=>pickNet(node.dataset.net))
    body.querySelectorAll('[data-onboard]').forEach(node=>node.onclick=()=>{sheet.close();window.openAllYOnboarding?.()})
    body.querySelectorAll('[data-model]').forEach(node=>node.onclick=()=>pickModel(node.dataset.model))
    body.querySelectorAll('[data-depth]').forEach(node=>node.onclick=()=>pickDepth(node.dataset.depth))
    note.textContent=sheetStatus||'Выбор действует со следующего ответа и не прерывает текущий.'
    note.classList.toggle('err',!!sheetStatus)
  }
  async function saveSheet(body){
    if(saving)return false
    saving=true;sheetStatus=''
    try{
      const value=await request('/engine/settings',body)
      // Release the guard before repainting: otherwise the panel select and the model lists stay on the old value.
      saving=false
      sheetProvider=value.status||value
      window.renderEngine(sheetProvider)
      return true
    }catch(error){saving=false;sheetStatus='Не сохранилось: '+(error.message||'нет связи');renderSheet();return false}
  }
  async function pickNet(id){
    if(!sheetProvider)return
    if(saving)return
    if(id==='auto'){if(await saveSheet({mode:'auto'}))sheet.close();return}
    sheetNet=id;sheetStatus='';renderSheet()
  }
  async function pickModel(value){
    if(!sheetProvider||!sheetNet)return
    const net=sheetNet,executor=net==='tokenator'?'claude':net,edit={model:value||null}
    if(!allowedDepths(executor,value||null).includes(currentDepth(executor)))edit.reasoning=null
    const settings={[executor]:edit}
    if(net==='tokenator'&&value)settings.tokenator={model:value}
    const body={executorSettings:settings}
    if((sheetProvider.selection?.mode||'auto')!==executor)body.mode=executor
    if(await saveSheet(body)){sheet.close();get('q').focus({preventScroll:true})}
  }
  async function pickDepth(value){
    if(!sheetProvider||!sheetNet)return
    const executor=sheetNet==='tokenator'?'claude':sheetNet
    if(await saveSheet({executorSettings:{[executor]:{reasoning:value||null}}}))renderSheet()
  }
  function positionSheet(){
    if(!sheet)return
    const btn=get('bEngine');if(!btn)return
    const r=btn.getBoundingClientRect()
    const right=Math.max(12,window.innerWidth-r.right)
    const bottom=Math.max(12,window.innerHeight-r.top+8)
    Object.assign(sheet.style,{position:'fixed',inset:`auto ${right}px ${bottom}px auto`,margin:'0',width:'min(380px, calc(100vw - 24px))',maxHeight:`min(520px, ${Math.max(240,r.top-20)}px)`})
  }
  function openSheet(){
    if(!current||current.provider!=='direct')return
    const dialog=makeSheet()
    if(dialog.open){dialog.close();return}
    sheetProvider=current;sheetNet=null;sheetStatus=''
    renderSheet();positionSheet()
    dialog.showModal()
  }
  window.addEventListener('resize',()=>{if(sheet?.open)positionSheet()})
  document.addEventListener('pointerdown',e=>{if(sheet?.open&&e.target===sheet)sheet.close()})
  get('bEngine').onclick=openSheet
})()

// Browser entry loaded before okno.js. Composer is shared via chat-composer.js.
/* голос: ответы вслух и диктовка */
let voiceOn=false;try{voiceOn=localStorage.getItem('dzh-voice')==='1'}catch{}
const pickVoice=()=>{const v=speechSynthesis.getVoices().filter(v=>/^ru/i.test(v.lang));return v.find(v=>/svetlana|dariya|natural/i.test(v.name))||v.find(v=>/female|irina/i.test(v.name))||v[0]};
/* голос: нейроголос «Светлана» через мост (golos.mjs), по предложениям — первое звучит, пока готовится следующее;
 сервис не ответил — дочитывает голос Windows */
let golosGen=0,aud=null;
function stopGolos(){golosGen++;if(aud){aud.pause();aud=null}if('speechSynthesis'in window)speechSynthesis.cancel();golosPlaying=false;faza()}
const kuskiG=t=>{const fr=String(t).replace(/[*_`#>|]/g,' ').replace(/\s+/g,' ').trim().match(/[^.!?…]+[.!?…]*\s*/g)||[];const out=[];let k='';for(const f of fr){if(k&&(k+f).length>300){out.push(k.trim());k=''}k+=f}if(k.trim())out.push(k.trim());return out};
const zvuk=t=>fetch('/golos',{method:'POST',headers:{'x-dzhinni':'1','content-type':'application/json'},body:JSON.stringify({text:t})}).then(r=>{if(!r.ok)throw new Error('голос');return r.blob()}).then(b=>URL.createObjectURL(b));
const igrat=(url,g)=>new Promise(ok=>{if(g!==golosGen){URL.revokeObjectURL(url);return ok()}const player=aud=new Audio(url);let ended=false;
 const done=()=>{if(ended)return;ended=true;URL.revokeObjectURL(url);if(aud===player)aud=null;if(g===golosGen){golosPlaying=false;faza()}ok()};
 player.onplaying=()=>{if(!ended&&g===golosGen){golosPlaying=true;faza()}};player.onended=player.onpause=player.onerror=done;player.play().catch(done)});
async function speak(t){if(!voiceOn)return;stopGolos();const g=golosGen,ks=kuskiG(t);let next=ks.length?zvuk(ks[0]):null;
 for(let i=0;i<ks.length;i++){let url;try{url=await next}catch{if(g===golosGen)speakWin(ks.slice(i).join(' '));return}
  if(g!==golosGen){URL.revokeObjectURL(url);return}next=i+1<ks.length?zvuk(ks[i+1]):null;next?.catch(()=>{});await igrat(url,g)}}
function speakWin(t){if(!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t),g=golosGen;u.lang='ru-RU';const v=pickVoice();if(v)u.voice=v;u.rate=1.05;
 const active=value=>{if(g===golosGen){golosPlaying=value;faza()}};u.onstart=u.onresume=()=>active(true);u.onend=u.onerror=u.onpause=()=>active(false);speechSynthesis.speak(u)}
