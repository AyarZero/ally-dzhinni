// Заставка AllY: vesica piscis — два круга сходятся, в пересечении точка (Codex , zastavka_1411;
// подпись AllY — ).
'use strict'

const {
  app, BrowserWindow, screen, systemPreferences,
} = require('electron')
const http = require('http')
const { performance } = require('perf_hooks')

const HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'">
<title>AllY</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #0b0f14;
    color: #fff;
    font-family: system-ui, sans-serif;
  }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    user-select: none;
  }
  svg {
    display: block;
    width: min(360px, 72vw, 65vh);
    height: auto;
    overflow: visible;
  }
  .ring {
    fill: none;
    stroke: #fff;
    stroke-width: 1.6;
    opacity: 0;
    transform-box: view-box;
    transform-origin: center;
  }
  .left { transform: translateX(-50px); }
  .right { transform: translateX(50px); }
  .point { fill: #fff; opacity: 0; }
  .name {
    margin: 12px 0 0;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: .18em;
  }
  .hint {
    min-height: 20px;
    margin: 10px 20px 0;
    color: #fff;
    opacity: .55;
    font-size: 12px;
    text-align: center;
  }
  .run .left {
    animation: left 1050ms cubic-bezier(.4,0,.2,1) both;
  }
  .run .right {
    animation: right 1050ms cubic-bezier(.4,0,.2,1) both;
  }
  .run .point {
    animation: point 300ms ease-out 800ms both;
  }
  @keyframes left {
    0% { opacity: 0; transform: translateX(-50px); }
    20% { opacity: 1; }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes right {
    0% { opacity: 0; transform: translateX(50px); }
    20% { opacity: 1; }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes point {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring, .point {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }
</style>
</head>
<body>
  <svg viewBox="0 0 420 280" role="img"
       aria-label="Два пересекающихся круга и точка в центре">
    <circle class="ring left" cx="170" cy="140" r="80"/>
    <circle class="ring right" cx="250" cy="140" r="80"/>
    <circle class="point" cx="210" cy="140" r="4"/>
  </svg>
  <div class="name">AllY</div>
  <div class="hint" id="hint" role="status">Запускаюсь</div>
</body>
</html>`

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

// След заставки рядом со следом запуска (main.js): какой именно шаг ждёт окно.
const sled = t => {
  try {
    require('node:fs').appendFileSync(require('node:path').join(app.getPath('userData'), 'startup.log'),
      `${new Date().toISOString()} ${t}\n`)
  } catch {}
}

function createStartup(icon) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const win = new BrowserWindow({
    ...display.workArea,
    title: 'AllY',
    icon,
    frame: false,
    show: false,
    backgroundColor: '#0b0f14',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })

  win.setMenu(null)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  let shownAt = 0
  let released = false
  let cancelled = false
  let hintTimer = null
  let reduced = false

  try {
    reduced = Boolean(
      systemPreferences.getAnimationSettings?.().prefersReducedMotion
    )
  } catch {}

  win.on('closed', () => {
    clearTimeout(hintTimer)
    if (!released) {
      cancelled = true
      app.quit()
    }
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      win.close()
    }
  })

  const ready = new Promise((resolve, reject) => {
    win.once('closed', () => reject(new Error('Запуск отменён')))
    win.once('ready-to-show', async () => {
      try {
        if (win.isDestroyed()) throw new Error('Запуск отменён')
        win.show()
        shownAt = performance.now()
        reduced = reduced || await win.webContents.executeJavaScript(
          "matchMedia('(prefers-reduced-motion: reduce)').matches"
        )
        await win.webContents.executeJavaScript(
          "document.body.classList.add('run'); true"
        )
        hintTimer = setTimeout(() => {
          if (!win.isDestroyed()) {
            win.webContents.executeJavaScript(
              "document.getElementById('hint').textContent = " +
              "'Жду локальный мост…'; true"
            ).catch(() => {})
          }
        }, 8000)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
    const fs = require('fs')
    const path = require('path')
    const videoHtml = path.join(__dirname, 'startup.html')
    const videoFile = path.join(__dirname, 'ally-intro-flow-enhanced-full.webm')
    if (fs.existsSync(videoHtml) && fs.existsSync(videoFile)) {
      win.loadFile(videoHtml).catch(() =>
        win.loadURL(
          'data:text/html;charset=utf-8,' + encodeURIComponent(HTML)
        ).catch(reject)
      )
    } else {
      win.loadURL(
        'data:text/html;charset=utf-8,' + encodeURIComponent(HTML)
      ).catch(reject)
    }
  })

  function close() {
    released = true
    clearTimeout(hintTimer)
    if (!win.isDestroyed()) win.destroy()
  }

  async function waitForPage(address, timeoutMs = 15000) {
    const deadline = performance.now() + timeoutMs
    while (!win.isDestroyed() && performance.now() < deadline) {
      const ok = await new Promise(resolve => {
        const req = http.get(address, { timeout: 1500 }, res => {
          const html = String(res.headers['content-type'] || '')
            .toLowerCase().includes('text/html')
          res.resume()
          resolve(res.statusCode === 200 && html)
        })
        req.once('timeout', () => req.destroy())
        req.once('error', () => resolve(false))
      })
      if (ok) return true
      await pause(350)
    }
    return false
  }

  async function present(main) {
    // Подписки устанавливаются до main.loadURL().
    const painted = new Promise((resolve, reject) => {
      let frameReady = false
      let domReady = false
      let checking = false

      const timeout = setTimeout(
        () => finish(new Error('Окно AllY не отрисовалось за 30 секунд.')),
        30000
      )

      function cleanup() {
        clearTimeout(timeout)
        main.removeListener('ready-to-show', onFrame)
        main.removeListener('closed', onClosed)
        main.webContents.removeListener('dom-ready', onDom)
        main.webContents.removeListener('did-finish-load', check)
      }

      function finish(error) {
        cleanup()
        if (error) reject(error)
        else resolve()
      }

      function onClosed() {
        finish(new Error('Окно закрыто'))
        close()
        app.quit()
      }

      function onFrame() {
        frameReady = true
        sled('present: ready-to-show')
        check()
      }

      function onDom() {
        domReady = true
        sled('present: dom-ready')
        check()
      }

      async function check() {
        if (!frameReady || !domReady || checking || main.isDestroyed()) return
        checking = true
        try {
          const ok = await main.webContents.executeJavaScript(
            "new Promise(resolve => requestAnimationFrame(() => " +
            "requestAnimationFrame(() => resolve(" +
            "Boolean(document.getElementById('q'))))))"
          )
          sled('present: q=' + ok + ' frame=' + frameReady + ' dom=' + domReady)
          if (ok) finish()
        } catch (error) {
          sled('present: check ошибка ' + (error?.message || error))
          // Штатная повторная загрузка страницы может ещё идти.
        } finally {
          checking = false
        }
      }

      main.once('ready-to-show', onFrame)
      main.once('closed', onClosed)
      main.webContents.on('dom-ready', onDom)
      main.webContents.on('did-finish-load', check)
    })

    await Promise.all([ready, painted])
    if (win.isDestroyed() || main.isDestroyed()) return

    if (!reduced) {
      const isVideoIntro = await win.webContents
        .executeJavaScript('Boolean(window.__allyIntroMode)')
        .catch(() => false)
      if (isVideoIntro) {
        const deadline = shownAt + 11000
        while (performance.now() < deadline) {
          if (win.isDestroyed() || main.isDestroyed()) return
          const done = await win.webContents
            .executeJavaScript('Boolean(window.__allyIntroDone)')
            .catch(() => true)
          if (done) break
          await pause(120)
        }
      } else {
        await pause(Math.max(0, 1200 - (performance.now() - shownAt)))
      }
    }
    if (win.isDestroyed() || main.isDestroyed()) return

    const hadFocus = win.isFocused()
    main.setBounds(win.getBounds())
    main.maximize()
    main.showInactive()
    if (hadFocus) win.moveTop()

    // Даём развёрнутому окну отрисовать новый размер под заставкой.
    // у скрытого/неперерисованного окна requestAnimationFrame может не сработать вовсе,
    // и заставка «Жду локальный мост…» висела навсегда при живом мосте. Ждём не дольше 800 мс.
    await Promise.race([
      main.webContents.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => " +
        "requestAnimationFrame(() => resolve(true))))"
      ).catch(() => {}),
      pause(800),
    ])

    if (!reduced) {
      const began = performance.now()
      while (!win.isDestroyed() && !main.isDestroyed()) {
        const t = Math.min(1, (performance.now() - began) / 280)
        const eased = 1 - Math.pow(1 - t, 3)
        win.setOpacity(1 - eased)
        if (t === 1) break
        await pause(16)
      }
    }

    const giveFocus = !win.isDestroyed() && !main.isDestroyed() &&
      hadFocus && (win.isFocused() || main.isFocused())

    close()
    if (giveFocus && !main.isDestroyed()) main.focus()
  }

  return {
    ready,
    waitForPage,
    present,
    close,
    get cancelled() { return cancelled },
    focus() {
      if (win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    },
  }
}

module.exports = { createStartup }
