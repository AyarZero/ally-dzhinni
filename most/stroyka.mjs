// «Навыки → Стройка»: видеть, как идёт перевод библиотеки книг и курсов в навыки.
// Правда — сводная задача `задачи/mehaniki-marshrut-svodnaya/задача.md`: 12 сфер, реестр 47 источников, 8 этапов.
// Ручные слои пилотов (умения, задачи) — в `stroyka.json` рядом с задачей. Сырьё — расшифровки в `_files`
// папок memory/3. Resources, которых ещё нет в модулях механик. Счёт живой, кэш 10 минут.
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const TASK = ['задачи', 'mehaniki-marshrut-svodnaya']
const SLOI = ['Сфера', 'Направления', 'Умения', 'Задачи', 'Механики']
let cache = null

const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim())

export function razbor(md) {
  const sfery = [], istochniki = [], etapy = [], hod = []
  let etap = null, razdel = ''
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith('## ')) { razdel = line.slice(3).trim(); etap = null; continue }   // сам заголовок — не шаг хода
    const st = line.match(/^### (\d+)\. (.+)$/)
    if (st) { etap = { n: +st[1], imya: st[2].trim(), punkty: [] }; etapy.push(etap); continue }
    if (line.startsWith('### ')) etap = null
    const box = line.match(/^- \[( |x)\] (.+)$/i)
    if (box && etap) etap.punkty.push({ gotovo: box[1] !== ' ', text: box[2].replace(/`/g, '') })
    if (razdel === 'Ход' && line.trim() && !line.startsWith('**Следующий')) hod.push(line.replace(/^- /, '').replace(/\*\*|`/g, '').trim())
    if (!/^\| \[( |x)\] \|/i.test(line)) continue
    const c = cells(line), prinyato = /x/i.test(c[0])
    if (/^S\d\d$/.test(c[1])) {
      // кривая строка таблицы не должна ронять всю «Стройку»
      const [sfera, napr] = (c[4] || '').split('→').map(s => s.trim())
      istochniki.push({ id: c[1], imya: c[2], kartochek: +(c[3] || '').replace(/\D/g, '') || 0, sfera, napr: napr || '', put: c[5] || '', status: c[6] || '', prinyato })
    } else if (c.length === 4) sfery.push({ imya: c[1], napravleniya: c[2], opora: c[3], obzor: prinyato })
  }
  return { sfery, istochniki, etapy, hod: hod.slice(-3) }
}

// Где курс уже упомянут: каталог механик и модули из него. Совпадение — по имени папки без номера в начале.
async function ugeVMehanikah(REPO) {
  let text = ''
  try {
    const cat = await readFile(join(REPO, 'pamyat', 'mehaniki.md'), 'utf8')
    text = cat
    const puti = [...cat.matchAll(/· `(skills\/[^`]+\.md)`/g)].map(m => m[1])
    for (const put of puti) {
      try { text += '\n' + await readFile(join(REPO, put), 'utf8') } catch {}
    }
  } catch {}
  return text.toLowerCase()
}

const klyuch = imya => imya.replace(/^\d+(\.\d+)?\.?\s*/, '').split(/ — | - |\. | \(/)[0].trim().toLowerCase()
// Папки-сборники: их имя есть в любом каталоге, судим по имени каждого файла
const OBSHCHIE = new Set(['книги', 'видео', 'статьи', 'обучение', 'курсы', 'мышление', 'аналитика', 'автоматизация', 'масштабирование',
  'эксперты', 'запуски', 'лекции', 'блок', 'темы', 'продукты мастеров', 'лид-магниты', 'жизнь предпринимателя', 'деньги', 'личный бренд'])
const pohozhe = (k, v) => k.length >= 8 && !OBSHCHIE.has(k) && !/^блок \d/.test(k) && !/^\d/.test(k) && v.includes(k)

async function syrye(REPO) {
  const RES = join(REPO, 'memory', '3. Resources')
  const gruppy = new Map(), nedelya = Date.now() - 7 * 864e5
  let spisok = []
  try { spisok = await readdir(RES, { recursive: true }) } catch {}
  for (const put of spisok) {
    const p = put.replace(/\\/g, '/')
    const i = p.indexOf('/_files/')
    if (i < 0 || !p.endsWith('.md')) continue
    const kto = p.slice(0, i)
    if (!gruppy.has(kto)) gruppy.set(kto, { put: kto, imya: kto.split('/').at(-1), fajlov: 0, svezhih: 0, files: [] })
    const g = gruppy.get(kto); g.fajlov++; g.files.push(p)
  }
  const v = await ugeVMehanikah(REPO)
  await Promise.all([...gruppy.values()].map(async g => {
    const vsya = pohozhe(klyuch(g.imya), v) || pohozhe(g.imya.toLowerCase(), v)
    g.razobrano = 0
    for (const f of g.files) {
      try { if ((await stat(join(RES, f))).mtimeMs > nedelya) g.svezhih++ } catch {}
      const stem = f.split('/').at(-1).replace(/\.md$/, '').replace(/\s*\[\d+\]$/, '')
      if (vsya || pohozhe(klyuch(stem), v)) g.razobrano++
    }
    delete g.files
  }))
  // Сначала то, где больше всего неразобранного
  const kursy = [...gruppy.values()].sort((a, b) => (b.fajlov - b.razobrano) - (a.fajlov - a.razobrano))
  let rasshifrovka = null
  try {
    const r = JSON.parse(await readFile(join(REPO, 'projects', 'dzhinni', 'most', '.processy', 'rasshifrovka-vsego-zapasa.json'), 'utf8'))
    rasshifrovka = { gotovo: r.gotovo, vsego: r.vsego, note: r.note || '', at: r.at }
  } catch {}
  return { kursy, rasshifrovka }
}

export async function stroykaState(REPO, { svezho = false } = {}) {
  if (!svezho && cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.data
  const md = await readFile(join(REPO, ...TASK, 'задача.md'), 'utf8')
  let ruchnoe = {}
  try { ruchnoe = JSON.parse(await readFile(join(REPO, ...TASK, 'stroyka.json'), 'utf8')) } catch {}
  const { sfery, istochniki, etapy, hod } = razbor(md)
  const piloty = ruchnoe['пилоты'] || {}
  const out = {
    sloi: SLOI,
    nazvanie: (md.match(/^название:\s*"?(.+?)"?\s*$/m) || [])[1] || '',
    put: TASK.join('/') + '/задача.md',
    vsego: { istochnikov: istochniki.length, kartochek: istochniki.reduce((s, x) => s + x.kartochek, 0) },
    sfery: sfery.map(s => {
      const svoi = istochniki.filter(x => x.sfera === s.imya)
      const napr = [...new Set(svoi.map(x => x.napr).filter(Boolean))]
      const pilot = piloty[s.imya] || null
      const kartochek = svoi.reduce((sum, x) => sum + x.kartochek, 0)
      // Слой: 2 — принято, 1 — черновик (есть, не принято), 0 — пусто
      const sloi = [s.obzor ? 2 : 1, napr.length ? 1 : 0, pilot?.['умений'] ? 1 : 0, pilot?.['задач'] ? 1 : 0, kartochek ? 1 : 0]
      return { ...s, napr, istochnikov: svoi.length, kartochek, pilot, sloi,
        istochniki: svoi.map(({ id, imya, kartochek, napr, status }) => ({ id, imya, kartochek, napr, status })) }
    }),
    etapy: etapy.map(e => ({ n: e.n, imya: e.imya, gotovo: e.punkty.filter(p => p.gotovo).length, vsego: e.punkty.length, punkty: e.punkty })),
    hod,
    ...(await syrye(REPO)),
  }
  cache = { at: Date.now(), data: out }
  return out
}
