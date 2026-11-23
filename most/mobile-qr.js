// The pairing token stays in the fragment: it never reaches the server, logs or Referer.
const get = id => document.getElementById(id)
const match = /^#pair=([A-Za-z0-9_-]{43})$/.exec(location.hash)
if (!match) {
  get('qrNote').textContent = 'В этой ссылке нет кода подключения. Получите новый QR-код в окне Джинни на ноутбуке.'
} else {
  const token = match[1], origin = location.origin
  const open = get('qrOpen')
  open.href = 'dzhinni://connect?origin=' + encodeURIComponent(origin) + '&token=' + encodeURIComponent(token)
  open.hidden = false
  const web = get('qrWeb')
  web.href = origin + '/mobile#pair=' + token
  web.hidden = false
  get('qrApk').href = origin + '/mobile/app.apk'
  get('qrNote').textContent = 'Код готов. Нажмите «Открыть Джинни» — телефон подключится к беседе на ноутбуке.'
}
