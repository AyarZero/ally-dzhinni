// «Кэш остыл». — в ШАПКЕ, сразу за «на связи»:
// строка в подвале появлялась и пропадала с каждым ходом.
// Место в шапке занято всегда (min-width), поэтому ни шапка, ни поле ввода не двигаются.
// «кэш тёплый ещё 3:40» — отсчёт от конца последнего ответа Claude (/api/kesh, kesh-uchet.mjs; TTL 1 час),
// после срока — «кэш остыл · ~N тыс.» и две кнопки, которые только вписывают /compact и /new в поле (меню «/» подхватит).
// Ничего не блокирует и не отправляет за пользователя. Для Codex кэша в строке нет: у него свой кэш и свои цифры.
(() => {
  const q = document.getElementById('q'), anchor = document.getElementById('tLink')?.parentElement
  if (!q || !anchor) return
  const strip = document.createElement('span')
  strip.id = 'keshStrip'; strip.setAttribute('role', 'status')
  strip.style.cssText = 'display:inline-block;min-width:16em;white-space:nowrap;text-transform:none;letter-spacing:normal;font-variant-numeric:tabular-nums'
  anchor.after(strip)
  let data = null, loadedAt = 0, loading = false, wasBusy = false
  const state = () => (typeof providerState === 'undefined' ? null : providerState)
  const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0') }
  async function load() {
    if (loading) return
    loading = true
    try { const r = await fetch('/api/kesh?n=1', { cache: 'no-store' }); if (r.ok) { data = await r.json(); loadedAt = Date.now() } } catch {}
    loading = false; render()
  }
  // Вписать команду в поле тем же способом, каким печатает человек: меню «/» откроется само.
  function put(text) {
    q.value = text; q.dispatchEvent(new Event('input', { bubbles: true })); q.focus(); q.setSelectionRange(q.value.length, q.value.length)
  }
  strip.addEventListener('click', event => {
    const button = event.target.closest('button[data-cmd]')
    if (button) put(button.dataset.cmd)
  })
  function render() {
    const p = state(), last = data?.last
    // Нет данных, ход идёт (кэш сейчас читается) или отвечает не Claude — кэша в строке нет.
    if (!p || p.executor !== 'claude' || p.busy || !last || !Number.isFinite(last.expires_at)) { if (strip.innerHTML) strip.innerHTML = ''; strip.title = ''; return }
    const left = last.expires_at - Date.now()
    if (left > 0) { strip.textContent = 'кэш тёплый ещё ' + clock(left); strip.title = 'Пока кэш тёплый, следующее сообщение дешевле: беседа не перечитывается заново'; return }
    const size = Number.isFinite(last.context) && last.context > 0 ? Math.round(last.context / 1000) : 0
    const html = 'кэш остыл' + (size ? ' · ~' + size + ' тыс.' : '') +
      ' <button type="button" class="lnk" data-cmd="/compact" title="Вписать /compact в поле">/compact</button>' +
      ' <button type="button" class="lnk" data-cmd="/new " title="Вписать /new в поле">/new</button>'
    if (strip.innerHTML !== html) strip.innerHTML = html
    strip.title = 'Кэш остыл — следующее сообщение перечитает беседу заново' + (size ? ', ~' + size + ' тыс. токенов' : '')
  }
  setInterval(() => {
    if (document.hidden) return
    const busy = !!state()?.busy
    // Ход закончился — в журнале уже новая строка: подтягиваем отсчёт.
    if (wasBusy && !busy) setTimeout(load, 700)
    wasBusy = busy
    if (Date.now() - loadedAt > 30000) load(); else render()
  }, 1000)
  load()
})()
