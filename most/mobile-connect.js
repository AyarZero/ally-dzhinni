// Shared by the in-window QR dialog and the old standalone connection page.
// Keep names scoped: the desktop page already owns its own post/get helpers.
(() => {
  const get = id => document.getElementById(id), dialog = get('mobileDialog')
  let expires = 0, timer = null, generation = 0
  const post = async action => {
    const r = await fetch('/mobile/' + action, { method: 'POST', headers: { 'x-dzhinni': '1' }, cache: 'no-store' })
    const value = await r.json(); if (!r.ok) throw new Error(value.error || 'Не удалось создать QR-код'); return value
  }
  function clear() {
    clearInterval(timer); timer = null; expires = 0
    get('link').value = ''
    if (get('qrImage')) { get('qrImage').hidden = true; get('qrImage').removeAttribute('src') }
  }
  function tick() {
    const remaining = Math.max(0, Math.ceil((expires - Date.now()) / 1000))
    if (!remaining) { clear(); get('status').textContent = 'Код истёк. Нажми «Обновить QR-код».'; return }
    get('status').textContent = `Код действует ещё ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
  }
  async function create() {
    const request = ++generation
    clear(); get('create').disabled = true; get('message').textContent = ''; get('status').textContent = 'Готовлю QR-код…'
    try {
      const value = await post('qr'); if (request !== generation) return
      const url = new URL(value.link)
      if (url.protocol !== 'https:' || !/^#pair=[A-Za-z0-9_-]{43}$/.test(url.hash) || !value.png) throw new Error('Не удалось получить QR-код')
      get('link').value = url.origin + '/mobile' + url.hash
      get('apkLink').href = url.origin + '/mobile/app.apk'
      if (get('qrImage')) { get('qrImage').src = 'data:image/png;base64,' + value.png; get('qrImage').hidden = false }
      expires = Date.now() + (Number(value.expiresIn) || 600) * 1000; tick(); timer = setInterval(tick, 1000)
    } catch (error) { if (request === generation) get('status').textContent = error.message }
    finally { if (request === generation) get('create').disabled = false }
  }
  get('create').onclick = create
  get('copy').onclick = async () => {
    if (!get('link').value) return
    try { await navigator.clipboard.writeText(get('link').value); get('message').textContent = 'Ссылка скопирована.' }
    catch { get('link').select(); get('message').textContent = 'Выделенная ссылка готова для копирования.' }
  }
  if (dialog) {
    get('bPhone').onclick = () => { dialog.showModal(); void create() }
    get('closePhone').onclick = () => dialog.close()
    dialog.addEventListener('close', () => { generation++; clear(); get('create').disabled = false })
  } else {
    if (get('revoke')) get('revoke').onclick = async () => {
      try { await post('revoke'); generation++; clear(); get('status').textContent = 'Все подключения телефонов отключены.' }
      catch (error) { get('message').textContent = error.message }
    }
    void create()
  }
})()
