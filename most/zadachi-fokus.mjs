// «Фокус» и страница «Задачи»: фокус — РУЧНОЙ список главных задач, все задачи — на своей странице.
// Правда задач — задачи/<слаг>/задача.md, свод — pamyat/zadachi.json (его пересобирает синк задач). Фокус хранится
// отдельно: задачи/_фокус.json = { слаги: [...порядок важности], журнал: [...] }.
// Сторож встроен: при каждом чтении фокус сверяется со сводом — закрытые («Готово», «Архив», закрыта) и пропавшие
// задачи выкидываются из файла с записью в журнал, название и статус всегда берутся свежими из свода.
import { readFile, writeFile, rename, readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'

const MAX = 7
const fokusPut = REPO => join(REPO, 'задачи', '_фокус.json')

async function svod(REPO) {
  const s = JSON.parse(await readFile(join(REPO, 'pamyat', 'zadachi.json'), 'utf8'))
  return { sobrano: s['собрано'] || '', vse: Object.values(s['задачи'] || {}) }
}
async function chitat(REPO) {
  try { return JSON.parse(await readFile(fokusPut(REPO), 'utf8')) } catch { return { слаги: [], журнал: [] } }
}
async function pisat(REPO, f) {
  f['журнал'] = (f['журнал'] || []).slice(-50)
  const tmp = fokusPut(REPO) + '.tmp'
  await writeFile(tmp, JSON.stringify(f, null, 1) + '\n', 'utf8')
  await rename(tmp, fokusPut(REPO))
}
const zhivaya = t => t && !t['закрыта'] && !['Готово', 'Архив'].includes(t['статус'])
// В своде часть названий осталась с кавычками YAML («"23 ноября…"») — снимаем их при показе
const bezKavychek = s => String(s || '').replace(/^\s*"(.*)"\s*$/s, '$1')
// Приоритет не показываем
const karta = t => ({ slug: t['слаг'], title: bezKavychek(t['название']), status: t['статус'], area: t['область'] || '',
  proekt: t['проект'] || '', srok: t['срок'] || '', sozdana: t['создана'] || '' })

// Вложения и ссылки задачи — как в Notion видно сразу: картинки, файлы, ссылки.
// Файлы — всё в папке задачи (до двух уровней вглубь), кроме задача.md и служебного «_…».
const KART = /\.(jpe?g|png|webp|gif)$/i
const SSYL = /https?:\/\/[^\s<>()`"'«»\]]+/g
const ssylki = t => [...new Set([...(t['ссылка'] ? [t['ссылка']] : []), ...String(t['тело'] || '').matchAll(SSYL)]
  .map(m => String(Array.isArray(m) ? m[0] : m).replace(/[.,;:!?…]+$/, '')).filter(u => /^https?:\/\//.test(u)))]
async function fajlyZadachi(REPO, slug, glub = 0, pod = '') {
  let out = []
  let spisok = []
  try { spisok = await readdir(join(REPO, 'задачи', slug, pod), { withFileTypes: true }) } catch { return out }
  for (const d of spisok) {
    if (d.name.startsWith('_') || d.name.startsWith('.') || (!pod && d.name === 'задача.md')) continue
    const rel = pod ? pod + '/' + d.name : d.name
    if (d.isDirectory()) { if (glub < 2) out = out.concat(await fajlyZadachi(REPO, slug, glub + 1, rel)) }
    else out.push(rel)
  }
  // .md с PDF-двойником не показываем — пользователю документ PDF-ом
  const est = new Set(out.map(f => f.toLowerCase()))
  return out.filter(f => !(/\.md$/i.test(f) && est.has(f.toLowerCase().replace(/\.md$/, '.pdf')))).sort()
}
let schyot = { t: 0, sobrano: '', m: new Map() }
async function schyotchiki(REPO, zadachi, sobrano) {
  if (sobrano === schyot.sobrano && Date.now() - schyot.t < 120e3) return schyot.m
  const m = new Map()
  await Promise.all(zadachi.map(async t => {
    const f = await fajlyZadachi(REPO, t['слаг'])
    m.set(t['слаг'], { kart: f.filter(x => KART.test(x)).length, fajl: f.filter(x => !KART.test(x)).length, ssyl: ssylki(t).length })
  }))
  schyot = { t: Date.now(), sobrano, m }
  return m
}

// Сторож: вычистить из фокуса закрытое и пропавшее. Возвращает живые карточки в порядке фокуса.
export async function fokusState(REPO) {
  const [{ vse, sobrano }, f] = await Promise.all([svod(REPO), chitat(REPO)])
  const po = new Map(vse.map(t => [t['слаг'], t]))
  const ostalis = [], ubrany = []
  for (const s of f['слаги'] || []) (zhivaya(po.get(s)) ? ostalis : ubrany).push(s)
  if (ubrany.length) {
    f['слаги'] = ostalis
    f['журнал'] = [...(f['журнал'] || []), ...ubrany.map(s => ({ at: new Date().toISOString(), kto: 'сторож',
      chto: `убрала из фокуса «${po.get(s)?.['название'] || s}»: ${po.get(s) ? 'задача ' + (po.get(s)['статус'] || 'закрыта') : 'задачи больше нет'}` }))]
    await pisat(REPO, f)
  }
  return { tasks: ostalis.map(s => karta(po.get(s))), max: MAX, sobrano, ubrany: ubrany.length }
}

// Все живые задачи для страницы «Задачи»: свежие из свода, с пометкой «в фокусе».
export async function zadachiVse(REPO) {
  const [{ vse, sobrano }, f] = await Promise.all([svod(REPO), chitat(REPO)])
  const vf = new Set(f['слаги'] || [])
  const zhivye = vse.filter(zhivaya)
  const sch = await schyotchiki(REPO, zhivye, sobrano)
  return { sobrano, fokus: f['слаги'] || [], max: MAX,
    tasks: zhivye.map(t => ({ ...karta(t), ...(sch.get(t['слаг']) || {}), fokus: vf.has(t['слаг']) })) }
}

// Карточка одной задачи (открыть, как страницу в Notion): свойства, текст, вложения, ссылки
export async function zadachaKarta(REPO, slug) {
  if (!/^[^\\/.][^\\/]*$/.test(String(slug || ''))) return { ok: false, error: 'плохой слаг' }
  const [{ vse }, f] = await Promise.all([svod(REPO), chitat(REPO)])
  const t = vse.find(x => x['слаг'] === slug)
  if (!t) return { ok: false, error: 'нет такой задачи' }
  const fajly = (await fajlyZadachi(REPO, slug)).map(x => 'задачи/' + slug + '/' + x)
  const nid = String(t['notion_id'] || '').replace(/-/g, '')
  return { ok: true, ...karta(t), izmenena: t['изменена'] || '', tip: t['тип'] || '', zakryta: !!t['закрыта'],
    fokus: (f['слаги'] || []).includes(slug), telo: String(t['тело'] || ''), fajly, ssylki: ssylki(t),
    notion: /^[0-9a-f]{32}$/i.test(nid) ? 'https://www.notion.so/' + nid : '', put: 'задачи/' + slug + '/задача.md' }
}

// Ручной выбор: on=true — добавить в конец фокуса, false — убрать; poryadok — новый порядок фокуса целиком.
export async function fokusPravka(REPO, { slug, on, poryadok } = {}) {
  const [{ vse }, f] = await Promise.all([svod(REPO), chitat(REPO)])
  const po = new Map(vse.map(t => [t['слаг'], t]))
  let sl = f['слаги'] || []
  if (Array.isArray(poryadok)) {
    if (poryadok.length !== sl.length || poryadok.some(s => !sl.includes(s))) return { ok: false, error: 'порядок не совпадает с фокусом — обнови страницу' }
    sl = poryadok
  } else {
    if (!po.has(slug)) return { ok: false, error: 'нет такой задачи' }
    if (on) {
      if (!zhivaya(po.get(slug))) return { ok: false, error: 'задача закрыта' }
      if (!sl.includes(slug)) { if (sl.length >= MAX) return { ok: false, error: `в фокусе уже ${MAX} — сначала убери одну` }; sl = [...sl, slug] }
    } else sl = sl.filter(s => s !== slug)
    f['журнал'] = [...(f['журнал'] || []), { at: new Date().toISOString(), kto: 'владелец', chto: `${on ? 'в фокус' : 'из фокуса'}: «${po.get(slug)['название']}»` }]
  }
  f['слаги'] = sl
  await pisat(REPO, f)
  return { ok: true, fokus: sl }
}
