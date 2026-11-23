// Окно AllY на Electron: своя программа со своим Chromium, без WebView2 и Edge.
// Ждёт мост (../most/server.mjs) на 127.0.0.1:8798 и показывает его страницу.
// ярлык на панели задач запускает Dzhinni.exe напрямую, без переменной DZHINNI_PORT;
// прежнее умолчание 8794 показывало «Жду локальный мост…» навсегда — теперь умолчание совпадает с живым мостом.
const { app, BrowserWindow, dialog, session, shell } = require('electron')
const net = require('net')
const path = require('path')
const clientRuntime = require('./client-runtime.cjs')(__dirname)
const { createStartup } = require('./startup')

const PORT = clientRuntime.port
const ADRES = `http://127.0.0.1:${PORT}`
const ZNACHOK = path.join(__dirname, 'dzhinni.ico')
const RAZRESHENO = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'notifications'])
const previewOrigins = new Set()

app.setName('AllY')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Папка данных окна прежняя («Джинни»): тема, черновик и вход окна переживают переименование.
// Вторая копия на этом же компьютере (проба клиентской на 8795) — свои данные и своя группа на панели задач,
// иначе замок одного окна погасит её как повторный запуск первой.
app.setPath('userData', path.join(app.getPath('appData'), PORT === 8794 ? 'Джинни' : `Джинни-${PORT}`))
app.setAppUserModelId(PORT === 8794 ? 'AllY.Dzhinni.Okno' : `AllY.Dzhinni.Okno.${PORT}`)

// второе окно не плодим: повторный запуск поднимает первое
if (!app.requestSingleInstanceLock()) app.quit()

let okno = null
let startup = null

// След запуска: без него «Жду локальный мост…» на экране ничего не говорит о том, где именно ждём.
const sled = (t) => {
  try {
    require('fs').appendFileSync(path.join(app.getPath('userData'), 'startup.log'),
      `${new Date().toISOString()} ${t}\n`)
  } catch {}
}

function oshibkaStarta(error) {
  if (startup?.cancelled || (okno && okno.isDestroyed())) return
  dialog.showErrorBox('AllY', error instanceof Error ? error.message : String(error))
  startup?.close()
  app.quit()
}

function mostZhiv(sekund = 60) {
  const konec = Date.now() + sekund * 1000
  return new Promise((resolve) => {
    const proba = () => {
      const s = net.connect(PORT, '127.0.0.1')
      s.once('connect', () => { s.destroy(); resolve(true) })
      s.once('error', () => {
        s.destroy()
        if (Date.now() > konec) resolve(false)
        else setTimeout(proba, 500)
      })
    }
    proba()
  })
}

function svoya(url) {
  try { return new URL(url).origin === ADRES } catch { return false }
}
function svoyaRamka(url) {
  try { return svoya(url) || previewOrigins.has(new URL(url).origin) } catch { return false }
}

// свои виджеты (/vidzhet/…) пишет нейросеть — им ни микрофона, ни буфера обмена, даже если песочница даст сбой
const vidzhet = (url) => { try { return new URL(url).pathname.startsWith('/vidzhet/') } catch { return true } }

function razresheniya() {
  const ses = session.defaultSession
  // Only the local build endpoint can authorize a disposable client origin.
  ses.webRequest.onHeadersReceived({ urls: [ADRES + '/api/developer/preview'] }, (details, callback) => {
    const header = Object.entries(details.responseHeaders || {}).find(([key]) => key.toLowerCase() === 'x-ally-preview-origin')?.[1]?.[0]
    if (details.statusCode === 200 && header) try {
      const url = new URL(header), port = Number(url.port)
      if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && port >= 22000 && port < 37000 && url.origin === header) previewOrigins.add(url.origin)
    } catch {}
    callback({})
  })
  // камера не нужна никогда; из «media» — только звук
  const bezKamery = (perm, det) => perm !== 'media' || !(det?.mediaTypes || []).includes('video') && det?.mediaType !== 'video'
  ses.setPermissionRequestHandler((wc, perm, cb, det) => cb(svoyaRamka(det.requestingUrl) && !vidzhet(det.requestingUrl) && RAZRESHENO.has(perm) && bezKamery(perm, det)))
  ses.setPermissionCheckHandler((wc, perm, origin, det) => svoyaRamka(origin) && !vidzhet(det.requestingUrl || origin) && RAZRESHENO.has(perm) && bezKamery(perm, det))
}

function sozdatOkno() {
  okno = new BrowserWindow({
    title: 'AllY',
    icon: ZNACHOK,
    backgroundColor: '#0b0f14',
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false },
  })
  okno.setMenu(null)
  startup.present(okno).then(() => sled('заставка закрыта, окно показано'))
    .catch(error => { sled('present ошибка: ' + (error?.message || error)); oshibkaStarta(error) })
  okno.webContents.on('did-finish-load', () => sled('страница загружена'))
  okno.webContents.on('did-fail-load', (e, code, opis, url, main) => { if (main) sled('страница не загрузилась: ' + code + ' ' + opis) })
  // чужие ссылки — в обычный браузер, не внутрь окна
  // наружу — только веб-адреса: file:, ms-msdt: и прочие схемы запускают программы на компьютере
  const naruzhu = (url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url) }
  okno.webContents.setWindowOpenHandler(({ url }) => { naruzhu(url); return { action: 'deny' } })
  okno.webContents.on('will-navigate', (e, url) => { if (!svoya(url)) { e.preventDefault(); naruzhu(url) } })
  // виджет в своей рамке не уходит на чужой адрес — иначе унесёт данные в строке адреса
  okno.webContents.on('will-frame-navigate', (e) => { if (!e.isMainFrame && !svoyaRamka(e.url) && !/^about:/.test(e.url)) e.preventDefault() })
  // мост перезапустили — страница отвалилась: ждём и подгружаем снова
  okno.webContents.on('did-fail-load', async (e, kod, opis, url, glavnyj) => {
    if (!glavnyj) return
    if (await mostZhiv(30)) okno.loadURL(ADRES)
  })
  okno.loadURL(ADRES)
  storozh(okno)
  pulsMosta(okno)
}

// 
// Окно трое суток без перезапуска держало ядро на 100% и зависло. Сторож страницы:
// - раз в минуту меряет процессор и память страницы, раз в час пишет в журнал (следующий раз будет что смотреть);
// - 5 минут подряд выше 60% ядра — страница перезагружается (переписка живёт в мосте, черновик поля сохраняем);
// - страница старше суток, окно не в фокусе 10+ минут и поле пустое — тихая перезагрузка, чистит накопленное.
const ZHURNAL = path.join(app.getPath('userData'), 'storozh.log')
function zapis(t) { try { require('fs').appendFileSync(ZHURNAL, `${new Date().toISOString()} ${t}\n`) } catch {} }
function storozh(win) {
  let goryacho = 0, zagruzheno = Date.now(), vneFokusa = 0, minuta = 0
  win.webContents.on('did-finish-load', () => { zagruzheno = Date.now(); goryacho = 0 })
  win.on('focus', () => { vneFokusa = 0 })
  const chernovik = () => win.webContents.executeJavaScript("(document.getElementById('q')||{}).value||''").catch(() => '')
  const perezagruzit = async (pochemu) => {
    const tekst = await Promise.race([chernovik(), new Promise(r => setTimeout(() => r(''), 2000))])
    zapis(`перезагружаю страницу: ${pochemu}`)
    if (tekst) win.webContents.once('did-finish-load', () => win.webContents.executeJavaScript(
      `(()=>{const q=document.getElementById('q');if(q&&!q.value){q.value=${JSON.stringify(tekst)};q.dispatchEvent(new Event('input'))}})()`).catch(() => {}))
    win.webContents.reload()
  }
  setInterval(async () => {
    if (win.isDestroyed()) return
    minuta++
    const pid = win.webContents.getOSProcessId()
    const m = app.getAppMetrics().find(x => x.pid === pid)
    const cpu = m?.cpu?.percentCPUUsage ?? 0, mb = Math.round((m?.memory?.workingSetSize || 0) / 1024)
    if (minuta % 60 === 0) zapis(`страница: процессор ${cpu.toFixed(0)}%, память ${mb} МБ, работает ${Math.round((Date.now() - zagruzheno) / 36e5)} ч`)
    goryacho = cpu > 60 ? goryacho + 1 : 0
    vneFokusa = win.isFocused() ? 0 : vneFokusa + 1
    if (goryacho >= 5) return perezagruzit(`процессор ${cpu.toFixed(0)}% пять минут подряд, память ${mb} МБ`)
    if (Date.now() - zagruzheno > 24 * 36e5 && vneFokusa >= 10 && !(await chernovik())) perezagruzit('страница старше суток, окно не в фокусе — чистка')
  }, 60e3)
}

// а мост в 01:58 получил «закрыта» от страницы
// (pagehide), больше ни одного «жива» не услышал и в 02:42 закрылся — сообщения до утра не уходили.
// Теперь жизнь окна подтверждает САМА программа, а не страница: её таймер не замедляется в фоне и не зависит
// от того, работает ли скрипт страницы. «Закрыта» — только когда окно действительно уничтожено.
// Мост пропал при живом окне — страница сама попросит, а программа поднимает задачу планировщика.
function pulsMosta(win) {
  const poslat = (put) => new Promise((ok) => {
    const req = require('http').request({ host: '127.0.0.1', port: PORT, path: put, method: 'POST',
      headers: { 'x-dzhinni': '1', 'content-length': 0 }, timeout: 5000 }, (res) => { res.resume(); ok(res.statusCode) })
    req.on('error', () => ok(0)); req.on('timeout', () => { req.destroy(); ok(0) }); req.end()
  })
  let podnimayu = 0
  const puls = async () => {
    if (win.isDestroyed()) return
    if (await poslat('/api/okno/zhiva')) return
    // мост не отвечает: раз в 2 минуты пробуем поднять его, окно потом само подгрузит страницу
    if (Date.now() - podnimayu < 120e3) return
    podnimayu = Date.now()
    zapis('мост не отвечает при открытом окне — запускаю задачу планировщика')
    clientRuntime.start()
    if (await mostZhiv(60) && !win.isDestroyed()) win.loadURL(ADRES)
  }
  puls(); const t = setInterval(puls, 20e3)
  win.on('closed', () => { clearInterval(t); poslat('/api/okno/zakryta') })
}

app.on('second-instance', () => {
  if (!okno || !okno.isVisible()) {
    startup?.focus()
    return
  }
  if (okno.isMinimized()) okno.restore()
  okno.focus()
})

// Задача планировщика, которая поднимает сам мост (engine-server.mjs на 8798).

// Запуск с панели задач идёт прямо в exe, без launch-engine.ps1 — мост может быть не поднят.
// Поднимаем его сами и ждём: иначе окно минуту смотрит в закрытый порт.
function podnyatMost() { clientRuntime.start() }

app.whenReady().then(async () => {
  sled('whenReady, порт ' + PORT)
  razresheniya()
  startup = createStartup(ZNACHOK)
  try {
    await startup.ready
    sled('заставка готова')
    let zhiv = await mostZhiv(1)
    if (!zhiv) { podnyatMost(); zhiv = await mostZhiv(60) }
    sled('мост ' + (zhiv ? 'отвечает' : 'не отвечает'))
    if (!zhiv) throw new Error('Мост Джинни не поднялся за минуту.')
    const stranica = await startup.waitForPage(ADRES)
    sled('страница ' + (stranica ? 'отвечает' : 'не отвечает'))
    if (!stranica) {
      throw new Error('Порт моста открыт, но страница AllY пока не отвечает. Закрой это сообщение и запусти AllY ещё раз.')
    }
    sled('создаю окно')
    sozdatOkno()
  } catch (error) {
    sled('ошибка старта: ' + (error?.message || error))
    oshibkaStarta(error)
  }
}).catch(oshibkaStarta)

app.on('window-all-closed', () => app.quit())
