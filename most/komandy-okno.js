// «/» в поле ввода окна, как в приложении Claude. Список — /api/komandy (komandy-claude.mjs):
// свои команды Джинни и команды, которые прислал сам Claude. Буквы сужают список, ↑↓ выбирают,
// Enter — отправить команду, Tab — подставить и дописать, Esc — закрыть.
(() => {
  const q = document.getElementById('q'), form = document.getElementById('f')
  if (!q || !form) return
  const css = document.createElement('style')
  css.textContent = '#cmdMenu{position:fixed;left:24px;right:24px;max-width:720px;max-height:min(46vh,380px);overflow:auto;z-index:20;' +
    'background:var(--surface-raised,#1b222c);color:var(--ink,#e8eef5);border:1px solid var(--line,#2a3440);border-radius:10px;' +
    'box-shadow:0 8px 28px rgba(0,0,0,.35);padding:4px;font-size:14px}' +
    '#cmdMenu[hidden]{display:none}#cmdMenu .ci{display:flex;gap:10px;align-items:baseline;padding:7px 10px;border-radius:7px;cursor:pointer}' +
    '#cmdMenu .ci.on{background:rgba(var(--accent-rgb,77,163,255),.18)}#cmdMenu .cn{font-weight:600;white-space:nowrap}' +
    '#cmdMenu .ch{color:var(--faint,#8a96a3);white-space:nowrap}#cmdMenu .cd{color:var(--dim,#aab4bf);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
    '#cmdMenu .cs{margin-left:auto;color:var(--faint,#8a96a3);font-size:12px;white-space:nowrap}' +
    '#cmdMenu .ce{padding:8px 10px;color:var(--dim,#aab4bf)}@media (max-width:720px){#cmdMenu{left:16px;right:16px}}'
  document.head.appendChild(css)
  const menu = document.createElement('div')
  menu.id = 'cmdMenu'; menu.hidden = true; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', 'Команды')
  document.body.appendChild(menu)
  let list = [], loadedAt = 0, shown = [], pick = 0
  const load = async () => {
    if (Date.now() - loadedAt < 30000 && list.length) return
    try { const r = await fetch('/api/komandy', { cache: 'no-store' }); const d = await r.json(); list = Array.isArray(d.list) ? d.list : []; loadedAt = Date.now() } catch {}
  }
  const token = () => { const m = /^\/([^\s]*)$/.exec(q.value); return m && q.selectionStart === q.value.length ? m[1].toLowerCase() : null }
  const match = (row, t) => {
    const names = [row.name, ...(row.aliases || [])].map(v => String(v).toLowerCase())
    if (!t) return 2
    if (names.some(n => n.startsWith(t))) return 3
    if (names.some(n => n.includes(t))) return 2
    return String(row.description || '').toLowerCase().includes(t) ? 1 : 0
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const place = () => { const f = document.querySelector('footer'); menu.style.bottom = ((f ? f.offsetHeight : 70) + 6) + 'px' }
  const close = () => { menu.hidden = true; shown = [] }
  function render() {
    const t = token()
    if (t === null) { close(); return }
    shown = list.map((row, i) => ({ row, w: match(row, t), i })).filter(x => x.w > 0).sort((a, b) => b.w - a.w || a.i - b.i).map(x => x.row)
    pick = Math.min(pick, Math.max(0, shown.length - 1))
    menu.innerHTML = shown.length ? shown.map((row, i) => `<div class="ci${i === pick ? ' on' : ''}" role="option" data-i="${i}">` +
      // только команда и короткое описание по-русски — без подсказок аргументов и пометки источника.
      `<span class="cn">/${esc(row.name)}</span><span class="cd">${esc(row.description || '')}</span></div>`).join('')
      : '<div class="ce">Такой команды нет — сообщение уйдёт обычным текстом</div>'
    place(); menu.hidden = false
    menu.querySelector('.ci.on')?.scrollIntoView({ block: 'nearest' })
  }
  function choose(send) {
    const row = shown[pick]
    if (!row) return false
    q.value = '/' + row.name + (send ? '' : ' ')
    q.dispatchEvent(new Event('input', { bubbles: true }))
    close()
    if (send) form.requestSubmit(); else { q.focus(); q.setSelectionRange(q.value.length, q.value.length) }
    return true
  }
  q.addEventListener('input', async () => { if (token() === null) { close(); return } await load(); pick = 0; render() })
  // Захват: срабатывает раньше обработчика Enter в okno.js, пока список открыт.
  q.addEventListener('keydown', e => {
    if (menu.hidden) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopImmediatePropagation()
      if (shown.length) { pick = (pick + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length; render() }
    } else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      if (!shown.length) { close(); return }
      e.preventDefault(); e.stopImmediatePropagation(); choose(e.key === 'Enter')
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close() }
  }, true)
  menu.addEventListener('mousedown', e => {
    const el = e.target.closest('.ci'); if (!el) return
    e.preventDefault(); pick = Number(el.dataset.i); choose(true)
  })
  q.addEventListener('blur', () => setTimeout(close, 150))
  window.addEventListener('resize', () => { if (!menu.hidden) place() })
})()
