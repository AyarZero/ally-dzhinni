// Interactive first-run onboarding wizard: interface overview, 6 AI networks, and lead selection.
(() => {
  if (typeof document === 'undefined' || !document.createElement) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const DONE_KEY = 'ally-onboarding-v1-done', WIDE_KEY = 'ally-onboarding-wide-v1';

  const getData = () => (typeof window !== 'undefined' && window.ALLY_ONBOARDING_DATA) || { WIDGETS: [], NETWORKS: [] };
  const getStore = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const setStore = (key, val) => { try { localStorage.setItem(key, val); } catch {} };

  let dialog = null, step = 1, activeNet = 'claude', checking = false, wideMode = getStore(WIDE_KEY) === '1';
  let aggState = { configured: false, baseUrl: 'https://openrouter.ai/api', defaultModel: '', keyMask: '' };
  let qoderState = { installed: false, authenticated: false }, loginPolls = new Map(), loginMessages = new Map(), aggTestMsg = '';

  function netStatus(id) {
    if (id === 'aggregator') {
      return aggState.configured ? { cls: 'ok', text: 'Ключ задан ✓' } : { cls: 'off', text: 'Ключ не задан' };
    }
    if (id === 'qoder') {
      if (qoderState.installed && qoderState.authenticated) return { cls: 'ok', text: 'Подключено ✓' };
      return qoderState.installed ? { cls: 'warn', text: 'Нужен вход' } : { cls: 'off', text: 'Не установлен' };
    }
    const p = typeof providerState !== 'undefined' ? providerState : null;
    const obs = (p?.availability || []).find(r => r.executor === id)?.observation;
    if (!obs || obs.service === 'unavailable') return { cls: 'off', text: 'Не установлено' };
    if (obs.auth === 'authenticated') return { cls: 'ok', text: 'Подключено ✓' };
    if (obs.service === 'available') return { cls: 'warn', text: obs.auth === 'unknown' ? 'Проверь вход' : 'Нужен вход' };
    return { cls: 'off', text: 'Не проверено' };
  }

  function injectStyles() {
    if (document.getElementById('onboarding-styles')) return;
    const st = document.createElement('style');
    st.id = 'onboarding-styles';
    st.textContent = `
      .onboarding-dialog{box-sizing:border-box;width:min(960px,calc(100vw - 28px));max-height:92vh;overflow:auto;padding:26px 28px;border-radius:18px;border:1px solid var(--line);background:var(--surface);color:var(--ink);box-shadow:0 24px 100px #0009;font-family:system-ui,sans-serif;transition:width .22s cubic-bezier(.22,1,.36,1)}
      .onboarding-dialog.ob-wide{width:min(1640px,calc(100vw - 24px));max-height:94vh;padding:28px 36px}
      .onboarding-dialog::backdrop{background:#0009;backdrop-filter:blur(4px)}
      .onboarding-dialog [hidden]{display:none!important}
      .ob-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
      .ob-head-actions{display:flex;align-items:center;gap:8px;flex:none}
      #obTitle{margin:0;font:600 19px/1.25 system-ui,sans-serif;color:var(--ink);outline:none}
      .ob-expand{min-height:36px;padding:6px 12px;font-size:12.5px}
      .ob-expand[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);background:rgba(var(--accent-rgb),.1)}
      .ob-close{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--dim);flex:none}
      .ob-close:hover{color:var(--ink);border-color:var(--accent);background:color-mix(in srgb,var(--ink) 5%,transparent)}
      .ob-close:focus-visible,.ob-step-tab:focus-visible,.ob-tile:focus-visible,.ob-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
      .ob-stepper{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 18px}
      .ob-step-tab{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:9px;min-height:42px;padding:8px 14px;border-radius:11px;border:1px solid var(--line);background:color-mix(in srgb,var(--ink) 3%,var(--bg));font:500 13.5px/1.2 system-ui,sans-serif;color:var(--dim)}
      .ob-step-tab.on{border-color:var(--accent);color:var(--ink);background:rgba(var(--accent-rgb),.1)}
      .ob-step-tab b{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--line);color:var(--ink);font:600 12px/1 system-ui,sans-serif;flex:none}
      .ob-step-tab.on b{background:var(--accent);color:var(--on-accent)}
      .ob-step-tab span{line-height:1.2}
      .ob-widgets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      .onboarding-dialog.ob-wide .ob-widgets{gap:18px}
      .ob-wcard{padding:18px 20px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--ink) 3%,var(--bg))}
      .onboarding-dialog.ob-wide .ob-wcard{padding:22px 24px}
      .ob-wcard h3{margin:0 0 9px;font:600 14.5px/1.3 system-ui,sans-serif;color:var(--ink);display:flex;align-items:center;gap:8px}
      .ob-wcard h3>span:first-child{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;line-height:1;flex:none;color:var(--accent)}
      .ob-wcard p{margin:0;font:13.5px/1.6 system-ui,sans-serif;color:var(--dim)}
      .ob-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
      .ob-grid{display:grid;grid-template-columns:236px minmax(0,1fr);gap:18px;align-items:start}
      .onboarding-dialog.ob-wide .ob-grid{grid-template-columns:268px minmax(0,1fr);gap:24px}
      .ob-nav{display:flex;flex-direction:column;gap:8px}
      .ob-tile{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:5px;padding:11px 13px;border-radius:10px;border:1px solid var(--line);background:color-mix(in srgb,var(--ink) 2%,var(--bg))}
      .ob-tile.on{border-color:var(--accent);background:rgba(var(--accent-rgb),.1)}
      .ob-tile-top{display:flex;align-items:center;justify-content:space-between;gap:6px;font:600 13px/1.25 system-ui,sans-serif;color:var(--ink)}
      .ob-tile small{font:11.5px/1.3 system-ui,sans-serif;color:var(--dim)}
      .ob-badge{font:600 10.5px/1 system-ui,sans-serif;padding:3px 7px;border-radius:999px;white-space:nowrap}
      .ob-badge.ok{color:var(--green);background:color-mix(in srgb,var(--green) 15%,transparent);border:1px solid color-mix(in srgb,var(--green) 40%,transparent)}
      .ob-badge.warn{color:var(--amber);background:color-mix(in srgb,var(--amber) 15%,transparent);border:1px solid color-mix(in srgb,var(--amber) 40%,transparent)}
      .ob-badge.off{color:var(--dim);background:color-mix(in srgb,var(--ink) 7%,transparent);border:1px solid var(--line)}
      .ob-detail{border:1px solid var(--line);border-radius:14px;padding:22px 26px;max-height:58vh;overflow-y:auto;background:color-mix(in srgb,var(--ink) 2%,var(--bg));font:14px/1.68 system-ui,sans-serif;color:var(--dim)}
      .onboarding-dialog.ob-wide .ob-detail{max-height:74vh;padding:28px 36px;font-size:15px;line-height:1.75}
      .ob-detail h3{margin:0 0 12px;font:600 16.5px/1.35 system-ui,sans-serif;color:var(--ink)}
      .onboarding-dialog.ob-wide .ob-detail h3{font-size:19px;margin-bottom:14px}
      .ob-detail>p{margin:0 0 14px;line-height:1.65}
      .onboarding-dialog.ob-wide .ob-detail>*, .onboarding-dialog.ob-wide .ob-form{max-width:none;width:100%;box-sizing:border-box}
      .ob-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0 18px}
      .ob-cost{font-size:12.5px;line-height:1.45;color:var(--ink);background:color-mix(in srgb,var(--ink) 6%,transparent);border:1px solid var(--line);border-radius:8px;padding:7px 11px}
      .ob-link{color:var(--accent);text-decoration:none;font:500 13px/1.3 system-ui,sans-serif}.ob-link:hover{text-decoration:underline}
      .ob-guide{margin:14px 0 18px;padding-left:22px;display:grid;gap:11px;color:var(--ink);font-size:13.5px;line-height:1.62}
      .onboarding-dialog.ob-wide .ob-guide{font-size:14.5px;line-height:1.7;gap:13px}
      .ob-tip{margin-top:16px;padding:12px 14px;border-left:2px solid var(--accent);border-radius:8px;background:color-mix(in srgb,var(--accent) 8%,transparent);font-size:13px;line-height:1.55;color:var(--ink)}
      .ob-step{margin:16px 0}.ob-step small{display:block;color:var(--ink);margin-bottom:7px;font-size:12.5px;line-height:1.45}.ob-step .kod{width:100%;box-sizing:border-box}
      .ob-form{display:grid;gap:16px;margin-top:16px}
      .ob-form label{display:grid;gap:7px;font-size:13px;color:var(--ink)}
      .ob-form input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:13.5px system-ui,sans-serif}
      .ob-presets,.ob-actions,.ob-footer{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
      .ob-presets{margin:14px 0 16px}.ob-actions{margin-top:14px}.ob-footer{margin-top:20px;padding-top:14px;border-top:1px solid var(--line);justify-content:space-between}
      .ob-btn{all:unset;box-sizing:border-box;min-height:38px;padding:8px 16px;border-radius:10px;font:500 13px/1.2 system-ui,sans-serif;cursor:pointer;border:1px solid var(--line);background:var(--surface-raised,var(--surface));color:var(--ink);text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
      .ob-btn:hover{border-color:var(--accent)}
      .ob-btn.ghost{background:transparent;border-color:color-mix(in srgb,var(--line) 60%,transparent);color:var(--dim);font-weight:400}
      .ob-btn.ghost:hover{color:var(--ink);border-color:var(--line);background:color-mix(in srgb,var(--ink) 4%,transparent)}
      .ob-btn.primary{border-color:var(--accent);color:var(--accent)}
      .ob-btn.solid{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:600}
      .ob-status{margin:8px 0;font:13px/1.55 system-ui,sans-serif;color:var(--dim)}
      .ob-lead-list{display:grid;gap:10px;margin:12px 0}
      .ob-lead-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--ink) 2%,var(--bg))}
      @media(max-width:640px){.ob-widgets,.ob-grid,.ob-stepper{grid-template-columns:1fr}.ob-nav{flex-direction:row;flex-wrap:wrap}.ob-tile{flex:1 1 140px}}
    `;
    document.head.append(st);
  }

  async function loadStatus() {
    try {
      const r = await fetch('/api/onboarding/status');
      if (r.ok) {
        const data = await r.json();
        if (data.aggregator) aggState = data.aggregator;
        if (data.qoder) qoderState = data.qoder;
      }
    } catch {}
  }

  function pollLogin(engine) {
    if (loginPolls.has(engine)) return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch('/engine/login-status', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify({ engine }) });
        const st = await r.json();
        loginMessages.set(engine, st);
        if (!st.running) {
          clearInterval(timer);
          loginPolls.delete(engine);
          void refreshAllConnections();
        }
        renderDialog();
      } catch {
        clearInterval(timer);
        loginPolls.delete(engine);
      }
    }, 1500);
    loginPolls.set(engine, timer);
  }

  function renderStep1(body) {
    const { WIDGETS = [] } = getData();
    body.innerHTML = `<div class="ob-widgets">${WIDGETS.map(w => `
      <section class="ob-wcard">
        <h3><span>${esc(w.icon)}</span><span>${esc(w.title)}</span></h3>
        <p>${esc(w.text)}</p>
      </section>`).join('')}</div>`;
  }

  function renderStep2(body) {
    const { NETWORKS = [] } = getData();
    const readyCount = NETWORKS.filter(n => netStatus(n.id).cls === 'ok').length;
    const net = NETWORKS.find(n => n.id === activeNet) || NETWORKS[0];
    if (!net) { body.innerHTML = '<p class="ob-status">Список сетей недоступен.</p>'; return; }
    const st = netStatus(net.id);
    const loginInfo = loginMessages.get(net.id);
    const metaHtml = `
      <div class="ob-meta">
        ${net.costNote ? `<span class="ob-cost">${esc(net.costNote)}</span>` : ''}
        ${net.link ? `<a class="ob-link" href="${esc(net.link.url)}" target="_blank" rel="noopener noreferrer">${esc(net.link.label)} ↗</a>` : ''}
      </div>
      ${Array.isArray(net.guide) && net.guide.length ? `<ol class="ob-guide">${net.guide.map(item => `<li>${esc(item)}</li>`).join('')}</ol>` : ''}`;
    const tipHtml = net.tip ? `<div class="ob-tip">${esc(net.tip)}</div>` : '';

    const detailHtml = net.isAggregator ? `
      <h3>${esc(net.title)}</h3>
      <p>${esc(net.summary)}</p>
      ${metaHtml}
      <div class="ob-presets">
        <button type="button" class="ob-btn" data-preset="https://openrouter.ai/api">OpenRouter</button>
        <button type="button" class="ob-btn" data-preset="">Свой шлюз</button>
      </div>
      <div class="ob-form">
        <label>Шлюз агрегатора (Base URL)
          <input type="url" id="obAggUrl" value="${esc(aggState.baseUrl || 'https://openrouter.ai/api')}" placeholder="https://openrouter.ai/api">
        </label>
        <label>API-ключ (хранится только локально на компьютере)
          <input type="password" id="obAggKey" value="" placeholder="${aggState.configured ? 'Ключ сохранён (' + esc(aggState.keyMask) + ') — введи новый для замены' : 'sk-or-v1-...'}">
        </label>
        <label>Модель по умолчанию (примеры: anthropic/claude-sonnet-4, google/gemini-2.5-pro, openai/gpt-4.1)
          <input type="text" id="obAggModel" value="${esc(aggState.defaultModel || '')}" placeholder="anthropic/claude-sonnet-4">
        </label>
        <div class="ob-actions">
          <button type="button" class="ob-btn primary" id="obAggSave">Сохранить</button>
          <button type="button" class="ob-btn" id="obAggTest">Проверить связь (бесплатно)</button>
          ${aggState.configured ? '<button type="button" class="ob-btn" id="obAggClear">Удалить ключ</button>' : ''}
          <span class="ob-status" id="obAggNotice" role="status" aria-live="polite">${esc(aggTestMsg)}</span>
        </div>
      </div>
      ${tipHtml}` : `
      <h3>${esc(net.title)}</h3>
      <p>${esc(net.summary)}</p>
      ${metaHtml}
      ${(net.steps || []).map(s => `<div class="ob-step"><small>${esc(s.label)}</small><div class="kod"><pre>${esc(s.cmd)}</pre><button type="button" class="lnk kop">копировать</button></div></div>`).join('')}
      <div class="ob-actions">
        ${net.canLogin ? `<button type="button" class="ob-btn primary" data-ob-login="${esc(net.id)}">${esc(net.loginLabel)}</button>` : ''}
        <button type="button" class="ob-btn" data-ob-check="1">Проверить подключение</button>
        ${loginInfo?.url ? `<a class="ob-btn" href="${esc(loginInfo.url)}" target="_blank" rel="noopener">Открыть ссылку входа</a>` : ''}
      </div>
      ${loginInfo ? `<p class="ob-status">${esc(loginInfo.error || (loginInfo.running ? 'Ожидаю завершения входа в браузере…' : 'Авторизация завершена, статус обновлён.'))}</p>` : ''}
      ${tipHtml}`;

    body.innerHTML = `
      <div class="ob-toolbar">
        <span class="ob-status">Подключено: <b>${readyCount}</b> из ${NETWORKS.length}</span>
        <button type="button" class="ob-btn" id="obRefreshBtn">${checking ? 'Проверяю CLI…' : 'Проверить все подключения'}</button>
      </div>
      <div class="ob-grid">
        <div class="ob-nav">${NETWORKS.map(n => {
          const badge = netStatus(n.id);
          return `<button type="button" class="ob-tile ${n.id === net.id ? 'on' : ''}" data-pick-net="${esc(n.id)}">
            <span class="ob-tile-top"><span>${esc(n.short)}</span><span class="ob-badge ${badge.cls}">${esc(badge.text)}</span></span>
            <small>${esc(n.sub)}</small>
          </button>`;
        }).join('')}</div>
        <div class="ob-detail" data-badge="${esc(st.cls)}">${detailHtml}</div>
      </div>`;

    body.querySelectorAll('[data-pick-net]').forEach(btn => btn.onclick = () => { activeNet = btn.dataset.pickNet; renderDialog(); });
    const refBtn = body.querySelector('#obRefreshBtn');
    if (refBtn) refBtn.onclick = refreshAllConnections;
    body.querySelectorAll('[data-ob-check]').forEach(btn => btn.onclick = refreshAllConnections);

    body.querySelectorAll('[data-ob-login]').forEach(btn => btn.onclick = async () => {
      const engine = btn.dataset.obLogin;
      btn.disabled = true;
      try {
        const r = await fetch('/engine/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify({ engine }) });
        const stRes = await r.json();
        loginMessages.set(engine, stRes);
        if (stRes.running) pollLogin(engine);
        renderDialog();
      } catch (e) {
        loginMessages.set(engine, { running: false, error: e.message });
        renderDialog();
      }
    });

    body.querySelectorAll('[data-preset]').forEach(btn => btn.onclick = () => {
      const urlEl = body.querySelector('#obAggUrl');
      if (!urlEl) return;
      urlEl.value = btn.dataset.preset;
      urlEl.focus();
    });

    const saveBtn = body.querySelector('#obAggSave');
    if (saveBtn) saveBtn.onclick = async () => {
      const notice = body.querySelector('#obAggNotice');
      saveBtn.disabled = true;
      if (notice) notice.textContent = 'Сохраняю…';
      try {
        const payload = {
          baseUrl: body.querySelector('#obAggUrl')?.value?.trim() || 'https://openrouter.ai/api',
          kluch: body.querySelector('#obAggKey')?.value?.trim() || undefined,
          defaultModel: body.querySelector('#obAggModel')?.value?.trim() || ''
        };
        const r = await fetch('/api/aggregator', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify(payload) });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || 'Не удалось сохранить настройки');
        aggState = j.aggregator;
        aggTestMsg = 'Сохранено локально ✓';
        if (j.provider && typeof renderProvider === 'function') renderProvider(j.provider);
        if (j.provider && typeof window.renderEngine === 'function') window.renderEngine(j.provider);
        renderDialog();
      } catch (e) {
        if (notice) notice.textContent = 'Ошибка: ' + e.message;
      } finally { saveBtn.disabled = false; }
    };

    const testBtn = body.querySelector('#obAggTest');
    if (testBtn) testBtn.onclick = async () => {
      const notice = body.querySelector('#obAggNotice');
      testBtn.disabled = true;
      if (notice) notice.textContent = 'Проверяю доступ к /models…';
      try {
        const payload = {
          baseUrl: body.querySelector('#obAggUrl')?.value?.trim() || aggState.baseUrl,
          kluch: body.querySelector('#obAggKey')?.value?.trim() || undefined
        };
        const r = await fetch('/api/aggregator/test', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify(payload) });
        const j = await r.json();
        aggTestMsg = j.ok ? `Связь подтверждена ✓ (моделей: ${j.count ?? 0})` : ('Ошибка: ' + (j.error || 'проверка не прошла'));
        renderDialog();
      } catch (e) {
        aggTestMsg = 'Ошибка: ' + e.message;
        renderDialog();
      } finally { testBtn.disabled = false; }
    };

    const clearBtn = body.querySelector('#obAggClear');
    if (clearBtn) clearBtn.onclick = async () => {
      clearBtn.disabled = true;
      try {
        const r = await fetch('/api/aggregator', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify({ clearKey: true }) });
        const j = await r.json();
        if (r.ok && j.ok) { aggState = j.aggregator; aggTestMsg = 'Ключ удалён'; renderDialog(); }
      } finally { clearBtn.disabled = false; }
    };
  }

  function renderStep3(body) {
    const { NETWORKS = [] } = getData();
    const p = typeof providerState !== 'undefined' ? providerState : null;
    const currentMode = p?.selection?.mode || p?.executor || 'auto';
    const ready = NETWORKS.filter(n => n.id !== 'qoder' && netStatus(n.id).cls === 'ok');
    if (!ready.length) {
      body.innerHTML = `<div class="ob-detail"><p>Пока не подключено ни одной ведущей нейросети. Подключи хотя бы одну (или агрегатор API), чтобы AllY могла отвечать.</p><div class="ob-actions"><button type="button" class="ob-btn primary" id="obBackToNets">Вернуться к подключению</button></div></div>`;
      const backBtn = body.querySelector('#obBackToNets');
      if (backBtn) backBtn.onclick = () => { step = 2; renderDialog(); };
      return;
    }
    const leadMap = new Map();
    leadMap.set('auto', { id: 'auto', title: 'Авто (рекомендуется)', sub: 'Выбирает доступную подключённую нейросеть по приоритету' });
    for (const n of ready) {
      const leadId = n.id === 'aggregator' ? 'claude' : n.id;
      if (!leadMap.has(leadId)) {
        leadMap.set(leadId, { id: leadId, title: n.short, sub: n.sub });
      } else if (n.id === 'aggregator') {
        const cur = leadMap.get(leadId);
        leadMap.set(leadId, { id: leadId, title: `${cur.title} · Агрегатор API`, sub: `${cur.sub} / OpenRouter` });
      }
    }
    const choices = [...leadMap.values()];
    body.innerHTML = `<p class="ob-status">Выбери, кто будет вести диалог по умолчанию:</p><div class="ob-lead-list">${choices.map(c => `
      <div class="ob-lead-row">
        <div><b>${esc(c.title)}</b><div class="ob-status">${esc(c.sub)}</div></div>
        <button type="button" class="ob-btn ${currentMode === c.id ? 'solid' : 'primary'}" data-set-lead="${esc(c.id)}">${currentMode === c.id ? 'Выбрана ✓' : 'Выбрать'}</button>
      </div>`).join('')}</div>`;
    body.querySelectorAll('[data-set-lead]').forEach(btn => btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await fetch('/engine/settings', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: JSON.stringify({ mode: btn.dataset.setLead }) });
        const prov = await r.json();
        if (r.ok && prov && typeof renderProvider === 'function') renderProvider(prov);
        renderDialog();
      } finally { btn.disabled = false; }
    });
  }

  function renderDialog() {
    if (!dialog) return;
    dialog.querySelectorAll('[data-ob-step]').forEach(tab => tab.classList.toggle('on', Number(tab.dataset.obStep) === step));
    const body = dialog.querySelector('#obBody');
    if (!body) return;
    if (step === 1) renderStep1(body);
    else if (step === 2) renderStep2(body);
    else renderStep3(body);
    const prev = dialog.querySelector('#obPrev'), next = dialog.querySelector('#obNext'), finish = dialog.querySelector('#obFinish');
    if (prev) prev.hidden = step === 1;
    if (next) next.hidden = step === 3;
    if (finish) finish.hidden = step !== 3;
  }

  async function refreshAllConnections() {
    if (checking) return;
    checking = true;
    renderDialog();
    try {
      const [provRes] = await Promise.all([
        fetch('/codex/status', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dzhinni': '1' }, body: '{}' }).then(r => r.ok ? r.json() : null).catch(() => null),
        loadStatus()
      ]);
      if (provRes && typeof renderProvider === 'function') renderProvider(provRes);
    } finally {
      checking = false;
      renderDialog();
    }
  }

  async function openOnboarding() {
    injectStyles();
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'onboardingDialog';
      dialog.className = 'onboarding-dialog' + (wideMode ? ' ob-wide' : '');
      dialog.setAttribute('aria-labelledby', 'obTitle');
      dialog.innerHTML = `
        <div class="ob-head">
          <h2 id="obTitle" tabindex="-1">Знакомство с AllY · Быстрый старт</h2>
          <div class="ob-head-actions">
            <button type="button" class="ob-btn ghost ob-expand" id="obExpand" aria-pressed="false" title="Режим чтения · развернуть шире">⤢ Режим чтения</button>
            <button type="button" class="ob-close" id="obClose" aria-label="Закрыть"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
        </div>
        <div class="ob-stepper">
          <button type="button" class="ob-step-tab" data-ob-step="1"><b>1</b><span>Интерфейс</span></button>
          <button type="button" class="ob-step-tab" data-ob-step="2"><b>2</b><span>Нейросети</span></button>
          <button type="button" class="ob-step-tab" data-ob-step="3"><b>3</b><span>Старт</span></button>
        </div>
        <div id="obBody"></div>
        <div class="ob-footer">
          <button type="button" class="ob-btn ghost" id="obLater">Настрою позже</button>
          <div class="ob-actions" style="margin:0">
            <button type="button" class="ob-btn" id="obPrev">← Назад</button>
            <button type="button" class="ob-btn primary" id="obNext">Далее →</button>
            <button type="button" class="ob-btn solid" id="obFinish" hidden>Начать работу в AllY</button>
          </div>
        </div>`;
      document.body.append(dialog);
      const applyWide = () => {
        dialog.className = 'onboarding-dialog' + (wideMode ? ' ob-wide' : '');
        const exp = dialog.querySelector('#obExpand');
        if (exp) {
          exp.textContent = wideMode ? '⤡ Обычный вид' : '⤢ Режим чтения';
          exp.setAttribute('aria-pressed', String(wideMode));
          exp.title = wideMode ? 'Вернуть стандартную ширину' : 'Режим чтения · развернуть шире';
        }
      };
      applyWide();
      const closeDone = focusInput => {
        setStore(DONE_KEY, '1');
        dialog.close();
        if (focusInput) (document.getElementById('q') || document.getElementById('msg'))?.focus?.();
      };
      dialog.querySelector('#obExpand').onclick = () => { wideMode = !wideMode; setStore(WIDE_KEY, wideMode ? '1' : '0'); applyWide(); };
      dialog.querySelector('#obClose').onclick = () => dialog.close();
      dialog.querySelector('#obLater').onclick = () => closeDone(false);
      dialog.querySelector('#obFinish').onclick = () => closeDone(true);
      dialog.querySelector('#obPrev').onclick = () => { if (step > 1) { step--; renderDialog(); } };
      dialog.querySelector('#obNext').onclick = () => { if (step < 3) { step++; renderDialog(); } };
      dialog.querySelectorAll('[data-ob-step]').forEach(t => t.onclick = () => { step = Number(t.dataset.obStep); renderDialog(); });
      dialog.addEventListener('click', e => {
        const kop = e.target?.closest?.('.kop');
        if (!kop) return;
        const pre = kop.closest('.kod')?.querySelector('pre');
        const text = pre?.textContent || '';
        if (!text) return;
        try { navigator.clipboard?.writeText?.(text); } catch {}
        kop.textContent = 'Скопировано ✓';
        setTimeout(() => { kop.textContent = 'копировать'; }, 1500);
      });
    }
    await loadStatus();
    renderDialog();
    if (!dialog.open) { dialog.showModal(); dialog.querySelector('#obTitle')?.focus(); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const isClient = document.documentElement?.dataset?.client === 'true' || document.body?.dataset?.client === 'true';
    const freshReset = typeof window !== 'undefined' && !!window.__allyFreshReset;
    if (!isClient || (!freshReset && getStore(DONE_KEY))) return;
    setTimeout(async () => {
      if ((!freshReset && getStore(DONE_KEY)) || dialog?.open) return;
      await loadStatus();
      const p = typeof providerState !== 'undefined' && providerState?.availability ? providerState : await fetch('/api/provider').then(r => r.ok ? r.json() : null).catch(() => null);
      const hasAuth = (p?.availability || []).some(r => r.observation?.auth === 'authenticated') || aggState.configured;
      if (!hasAuth || freshReset) void openOnboarding();
    }, 900);
  });

  window.openAllYOnboarding = openOnboarding;
})();
