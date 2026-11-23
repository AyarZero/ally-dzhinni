/**
 * Отзывы разработчикам — модуль моста клиентской Джинни.
 *
 * Включается только в клиентской сборке: адрес приёмника приходит в DZHINNI_OTZYVY (most/mcp.json клиента).
 * У владельца проекта переменной нет — модуль молчит.
 *
 * Три слоя (задачи/dzhinni-yadro-na-github, п. 6):
 * - сам: события (запуск, этап знакомства, новый навык, ошибка) копятся в очереди и раз в сутки уходят на сервер;
 * - полусам: отчёт «отправить разработчикам» — только после «да» владельца, текст он видел;
 * - ответы разработчиков приходят в ящик, мост спрашивает его, пока окно открыто.
 * Ничего не уходит без согласия; очередь видна в окне («что отправляется»). Содержания жизни человека в событиях нет.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const SUTKI = 24 * 3600 * 1000
const clip = (s, n) => String(s ?? '').slice(0, n)

export function otzyvy({ here, repo, versiya, log, naOtvet }) {
  const adres = (process.env.DZHINNI_OTZYVY || '').replace(/\/$/, '')
  const FAIL = join(here, '.otzyvy.json')
  // soglasie: null — не спрашивали, true/false — ответ владельца; ochered — что уйдёт; bylo — когда ушло
  let s = { soglasie: null, id: '', kluch: '', ochered: [], bylo: 0, otvety: [], videl: 0 }
  let gotov = (async () => { try { s = { ...s, ...JSON.parse(await readFile(FAIL, 'utf8')) } } catch {} })()
  const sohranit = () => writeFile(FAIL, JSON.stringify(s), 'utf8').catch((e) => log('отзывы не записались:', e.message))

  async function zapros(put, metod = 'GET', telo) {
    const r = await fetch(adres + put, {
      method: metod,
      headers: { 'content-type': 'application/json', ...(s.id ? { authorization: `Bearer ${s.id}:${s.kluch}` } : {}) },
      body: telo ? JSON.stringify(telo) : undefined,
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) throw new Error(`сервер ответил ${r.status}`)
    return r.json()
  }
  // одна запись на копию, даже если отправка и отчёт пришли разом
  let zapis = null
  function zapisatsya() {
    if (s.id) return Promise.resolve()
    zapis ??= zapros('/zapis', 'POST', { versiya })
      .then((d) => { s.id = d.id; s.kluch = d.kluch; return sohranit() })
      .finally(() => { zapis = null })
    return zapis
  }

  // событие: вид из белого списка сервера, chto — коротко и без личного
  async function sobytie(vid, chto = '') {
    if (!adres) return
    await gotov
    if (s.soglasie !== true) return
    s.ochered = [...s.ochered, { vid, at: Date.now(), chto: clip(chto, 300) }].slice(-500)
    sohranit()
  }

  // отправка одна за раз: вторая дождётся первой, иначе пакет уйдёт дважды
  let shlyu = Promise.resolve()
  function otpravit(sila = false) {
    shlyu = shlyu.then(() => otpravitSeychas(sila))
    return shlyu
  }
  async function otpravitSeychas(sila) {
    await gotov
    if (!adres || s.soglasie !== true || !s.ochered.length) return
    if (!sila && Date.now() - s.bylo < SUTKI) return
    try {
      await zapisatsya()
      const paket = s.ochered.slice(0, 300)
      await zapros('/sobytiya', 'POST', { versiya, sobytiya: paket })
      s.ochered = s.ochered.slice(paket.length)
      s.bylo = Date.now()
      await sohranit()
    } catch (e) { log('события не ушли:', e.message) }
  }

  async function otchet(text, kontekst = '', files = []) {
    await gotov
    if (!adres) return 'отправка отчётов в этой копии выключена'
    await zapisatsya()
    const uploaded = []
    for (const file of files) {
      const data = await readFile(file.path)
      const r = await fetch(adres + '/otchet-file', {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-name': encodeURIComponent(file.name),
          authorization: `Bearer ${s.id}:${s.kluch}`
        },
        body: data,
        signal: AbortSignal.timeout(60000)
      })
      if (!r.ok) {
        const userMessage = r.status === 404 || r.status === 413
          ? 'Сервер отзывов пока не принимает вложения этого размера (нужно обновление сервера) — попробуй отправить текстом.'
          : `Сервер отзывов отклонил файл (${r.status}).`
        throw Object.assign(new Error(`сервер ответил ${r.status}`), { userMessage })
      }
      const resData = await r.json()
      if (!resData?.ok || !resData.file?.id) {
        throw Object.assign(new Error('неверный ответ сервера'), { userMessage: 'Сервер не подтвердил загрузку вложения.' })
      }
      uploaded.push(resData.file)
    }
    await zapros('/otchet', 'POST', {
      text: clip(text, 8000),
      kontekst: clip(kontekst, 2000),
      ...(uploaded.length ? { files: uploaded } : {})
    })
    return 'отчёт ушёл разработчикам'
  }

  async function yashchik() {
    await gotov
    if (!adres || !s.id) return
    try {
      const posle = s.otvety.at(-1)?.at || 0
      const d = await zapros(`/yashchik?posle=${posle}`)
      if (!d.otvety?.length) return
      s.otvety = [...s.otvety, ...d.otvety].slice(-100)
      await sohranit()
      for (const o of d.otvety) naOtvet(o)
    } catch (e) { log('ящик не открылся:', e.message) }
  }

  // новый навык: сравниваем папки .claude/skills с прошлым разом (только имя навыка)
  let navyki = null
  async function smotretNavyki() {
    try {
      const est = (await readdir(join(repo, '.claude', 'skills'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
      if (navyki) for (const n of est) if (!navyki.includes(n)) sobytie('navyk', n)
      navyki = est
    } catch {}
  }

  async function soglasie(da) {
    await gotov
    s.soglasie = !!da
    if (!da) s.ochered = []
    await sohranit()
    if (da) { await sobytie('soglasie', 'да'); otpravit(true) }
  }

  async function sostoyanie() {
    await gotov
    return { vkl: !!adres, soglasie: s.soglasie, ochered: s.ochered.slice(-100), bylo: s.bylo, otvety: s.otvety.slice(-30) }
  }

  if (adres) {
    gotov.then(() => sobytie('zapusk', versiya))
    smotretNavyki()
    setInterval(smotretNavyki, 10 * 60 * 1000).unref()
    setInterval(() => otpravit(), 60 * 60 * 1000).unref()
    setInterval(yashchik, 10 * 60 * 1000).unref()
    setTimeout(() => { otpravit(); yashchik() }, 30 * 1000).unref()
  }
  return { vkl: !!adres, sobytie, otpravit, otchet, yashchik, soglasie, sostoyanie }
}
