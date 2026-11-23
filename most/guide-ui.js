// Embedded interactive AllY Guide & Version Archive modal inside the main window.
(() => {
  if (typeof document === 'undefined' || !document.createElement) return;
  let dialog = null;

  function currentTheme() {
    const t = document.documentElement?.dataset?.theme;
    return t || 'graphite';
  }

  function injectStyles() {
    if (document.getElementById('guide-dialog-styles')) return;
    const st = document.createElement('style');
    st.id = 'guide-dialog-styles';
    st.textContent = `
      .guide-dialog{box-sizing:border-box;width:min(1560px,calc(100vw - 24px));height:min(92vh,980px);max-width:none;max-height:none;padding:0;border-radius:16px;border:1px solid var(--line);background:var(--surface);color:var(--ink);box-shadow:0 24px 100px #0009;font-family:system-ui,sans-serif;overflow:hidden}
      .guide-dialog[open]{display:flex;flex-direction:column}
      .guide-dialog::backdrop{background:#0009;backdrop-filter:blur(4px)}
      .gd-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px;border-bottom:1px solid var(--line);background:var(--surface);flex:none}
      .gd-head h2{margin:0;font:600 16px/1.25 system-ui,sans-serif;color:var(--ink)}
      .gd-close{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--dim);flex:none}
      .gd-close:hover{color:var(--ink);border-color:var(--accent);background:color-mix(in srgb,var(--ink) 5%,transparent)}
      .gd-close:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
      #guideFrame{flex:1;min-height:0;width:100%;border:0;background:var(--bg);display:block}
    `;
    document.head.append(st);
  }

  function syncIframeTheme(theme) {
    const frame = dialog?.querySelector('#guideFrame');
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ type: 'ally-theme', theme: theme || currentTheme() }, location.origin);
    } catch {}
  }

  function openAllYGuide(opts = {}) {
    injectStyles();
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'guideDialog';
      dialog.className = 'guide-dialog';
      dialog.setAttribute('aria-labelledby', 'gdTitle');
      dialog.innerHTML = `
        <div class="gd-head">
          <h2 id="gdTitle">Справка и свод версий AllY</h2>
          <button type="button" class="gd-close" id="gdClose" aria-label="Закрыть"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <iframe id="guideFrame" title="Справка и свод версий AllY"></iframe>`;
      document.body.append(dialog);
      dialog.querySelector('#gdClose').onclick = () => dialog.close();
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    }
    const frame = dialog.querySelector('#guideFrame');
    const qs = new URLSearchParams({ embedded: '1', theme: currentTheme() });
    if (opts.tab) qs.set('tab', opts.tab);
    if (opts.lang) qs.set('lang', opts.lang);
    const targetSrc = '/guide?' + qs.toString();
    if (!frame.getAttribute('src') || opts.tab || opts.lang) {
      frame.setAttribute('src', targetSrc);
    } else {
      syncIframeTheme(currentTheme());
    }
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  }

  document.addEventListener('dzhinni-theme-change', () => syncIframeTheme(currentTheme()));
  window.addEventListener('message', ev => {
    if (ev.origin !== location.origin) return;
    if (ev.data?.type === 'ally-guide-title' && typeof ev.data.title === 'string') {
      const t = dialog?.querySelector('#gdTitle');
      if (t) t.textContent = ev.data.title;
    }
  });
  window.openAllYGuide = openAllYGuide;
})();
