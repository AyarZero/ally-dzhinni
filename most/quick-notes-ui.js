// Owner quick notes drawer triggered by header bug button without interrupting active turns.
(() => {
  if (typeof document === 'undefined' || !document.createElement) return;
  const isClientMode = () => document.documentElement?.dataset?.client === 'true'
    || document.documentElement?.dataset?.interface === 'user'
    || document.body?.dataset?.client === 'true';

  const DRAFT_KEY = 'ally-quick-note-draft';
  const LABELS = { note: 'Заметка', bug: 'Баг', task: 'Задача' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtTime = iso => {
    try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  let drawer = null, notes = [], activeKind = 'note';

  function injectStyles() {
    if (document.getElementById('quick-notes-styles')) return;
    const st = document.createElement('style');
    st.id = 'quick-notes-styles';
    st.textContent = `
      #quickNotes{position:fixed;top:0;right:0;bottom:0;z-index:42;width:min(480px,100vw);display:flex;flex-direction:column;background:var(--surface);border-left:1px solid var(--line);transform:translateX(100%);transition:transform .35s cubic-bezier(.6,0,.2,1);font-family:system-ui,sans-serif}
      #quickNotes.open{transform:none;box-shadow:-20px 0 60px rgba(0,0,0,.6)}
      #quickNotes .ph{text-transform:none;letter-spacing:0;font:600 16px/1.3 system-ui,sans-serif;color:var(--ink);display:flex;align-items:center;justify-content:space-between;padding:16px 20px;margin:0;border-bottom:1px solid var(--line)}
      #quickNotes .ob{padding:16px 18px 24px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:12px}
      #qnText{display:block;box-sizing:border-box;width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font:13.5px/1.5 system-ui,sans-serif;min-height:110px;margin:0;resize:vertical}
      #qnText:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent)}
      .qn-list{display:flex;flex-direction:column;gap:8px;margin-top:4px}
      .qn-item{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
      .qn-item-body{flex:1;min-width:0;font:13px/1.45 system-ui,sans-serif;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
      .qn-meta{display:flex;align-items:center;gap:8px;margin-bottom:4px;font:500 11px/1.2 system-ui,sans-serif;color:var(--dim)}
      .qn-tag{padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--accent);font-weight:600}
      .qn-del{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;color:var(--dim);flex:none}
      .qn-del:hover{color:#ff5a7a;background:rgba(255,90,122,.14)}
    `;
    document.head.append(st);
  }

  function ensureDrawer() {
    if (drawer) return drawer;
    injectStyles();
    drawer = document.createElement('aside');
    drawer.id = 'quickNotes';
    drawer.innerHTML = `<div class="ph"><span class="otz-title">Быстрые заметки</span><small><button type="button" class="hb otz-close" id="bQnX" aria-label="Закрыть"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></small></div><div class="ob" id="qnBody"></div>`;
    document.body.append(drawer);
    drawer.querySelector('#bQnX').onclick = () => drawer.classList.remove('open');
    return drawer;
  }

  function render() {
    const body = ensureDrawer().querySelector('#qnBody');
    let draft = '';
    try { draft = localStorage.getItem(DRAFT_KEY) || ''; } catch {}
    const itemsHtml = notes.length
      ? notes.slice().reverse().map(n => `<div class="qn-item"><div class="qn-item-body"><div class="qn-meta"><span class="qn-tag">${esc(LABELS[n.kind] || 'Заметка')}</span><span>${esc(fmtTime(n.at))}</span></div><div>${esc(n.text)}</div></div><button type="button" class="qn-del" data-qn-del="${esc(n.id)}" title="Удалить заметку" aria-label="Удалить заметку"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`).join('')
      : '<div class="otz-note" style="margin:0">Пока заметок нет.</div>';

    body.innerHTML = `
      <section class="otz-card">
        <h4>Записать без остановки хода</h4>
        <div class="otz-kinds" role="radiogroup" aria-label="Тип записи">
          ${Object.entries(LABELS).map(([k, lbl]) => `<button type="button" class="otz-kind-btn ${activeKind === k ? 'on' : ''}" data-qn-kind="${esc(k)}">${esc(lbl)}</button>`).join('')}
        </div>
        <textarea id="qnText" maxlength="7000" placeholder="Запиши мысль, баг или задачу — текущий ход продолжится без прерывания…">${esc(draft)}</textarea>
        <p class="otz-note">Сохраняется в локальный файл memory/_meta/BYSTRYE_ZAMETKI.md.</p>
        <button type="button" class="otz-btn solid" id="qnSaveBtn">Сохранить заметку</button>
        <p class="otz-note" id="qnStatus" role="status"></p>
      </section>
      <section class="otz-card">
        <h4>Сохранённые (${notes.length})</h4>
        <div class="qn-list">${itemsHtml}</div>
      </section>`;

    const ta = body.querySelector('#qnText'), status = body.querySelector('#qnStatus'), saveBtn = body.querySelector('#qnSaveBtn');
    ta.oninput = () => { try { localStorage.setItem(DRAFT_KEY, ta.value); } catch {} };
    body.querySelectorAll('[data-qn-kind]').forEach(btn => btn.onclick = () => {
      activeKind = btn.dataset.qnKind;
      body.querySelectorAll('[data-qn-kind]').forEach(b => b.classList.toggle('on', b === btn));
    });
    saveBtn.onclick = async () => {
      const text = ta.value.trim();
      if (!text || saveBtn.disabled) return;
      saveBtn.disabled = true; status.textContent = 'Сохраняю…';
      try {
        const res = await fetch('/api/quick-notes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify({ kind: activeKind, text }) });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Не удалось сохранить');
        notes = data.notes || [];
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        render();
        const st = body.querySelector('#qnStatus');
        if (st) st.textContent = 'Сохранено ✓';
      } catch (e) { status.textContent = 'Ошибка: ' + e.message; saveBtn.disabled = false; }
    };
    body.querySelectorAll('[data-qn-del]').forEach(btn => btn.onclick = async () => {
      btn.disabled = true;
      try {
        const res = await fetch('/api/quick-notes/delete', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify({ id: btn.dataset.qnDel }) });
        const data = await res.json();
        if (res.ok && data.ok) { notes = data.notes || []; render(); }
      } catch { btn.disabled = false; }
    });
  }

  window.openQuickNotes = async () => {
    if (isClientMode()) return;
    ensureDrawer().classList.add('open');
    try {
      const r = await fetch('/api/quick-notes');
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.notes)) notes = j.notes; }
    } catch {}
    render();
    ensureDrawer().querySelector('#qnText')?.focus();
  };
})();
