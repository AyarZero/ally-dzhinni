// «Что я о тебе знаю»: память о человеке растёт каждый день — это то, что нельзя скопировать, и
// человек должен видеть этот рост КОНКРЕТНО, а не числом. Разбираем `pamyat/znaet-tebya.md` на разделы и строки,
// для каждой строки помним, когда она появилась, — так видно, что нового за неделю. Раз в неделю Джинни сама
// показывает отчёт: что узнала и как это уже помогает (подсказка уходит в инструкции сессии).
// Строка таблицы с номером или пункт списка = одна вещь; «Что могло устареть» и ниже — история, не счёт.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const DEN = 86400e3
const kluch = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function razobrat(txt) {
  const telo = txt.replace(/^---[\s\S]*?\n---/, '')
  const razdely = []
  let tek = null
  for (const l of telo.split('\n')) {
    const h = l.match(/^##\s+(.+)/)
    if (h) {
      if (/^Что могло устареть/i.test(h[1].trim())) break
      tek = { t: h[1].trim(), stroki: [] }
      razdely.push(tek)
      continue
    }
    const r = l.match(/^\|\s*\d+\s*\|([^|]*)\|([^|]*)/)
    const p = l.match(/^\s*[-*]\s+(\S.*)/)
    if (!r && !p) continue
    if (!tek) { tek = { t: 'Разное', stroki: [] }; razdely.push(tek) }
    tek.stroki.push(r ? { chto: r[1].trim(), otkuda: r[2].trim() } : { chto: p[1].trim(), otkuda: '' })
  }
  return razdely.filter((r) => r.stroki.length)
}
export const poschitat = (txt) => razobrat(txt).reduce((s, r) => s + r.stroki.length, 0)

export async function znayu({ fail, istoriya, seychas = Date.now() }) {
  let txt
  try { txt = await readFile(fail, 'utf8') } catch { return null }
  const razdely = razobrat(txt)
  const vsego = razdely.reduce((s, r) => s + r.stroki.length, 0)
  const den = new Date(seychas).toISOString().slice(0, 10)
  let ist = { dni: {}, pervyy: {}, otchet: '' }
  try { ist = { ...ist, ...JSON.parse(await readFile(istoriya, 'utf8')) } } catch {}
  let izmeneno = ist.dni[den] !== vsego
  for (const r of razdely) for (const s of r.stroki) {
    const k = kluch(s.chto)
    if (!ist.pervyy[k]) { ist.pervyy[k] = den; izmeneno = true }
    s.s = ist.pervyy[k]
  }
  ist.dni[den] = vsego
  if (izmeneno) {
    ist.dni = Object.fromEntries(Object.entries(ist.dni).sort().slice(-90))
    await writeFile(istoriya, JSON.stringify(ist), 'utf8').catch(() => {})
  }
  const nedelyu = new Date(seychas - 7 * DEN).toISOString().slice(0, 10)
  // узнанное в самый первый день — это знакомство, оно не «новое за неделю», иначе новым было бы всё подряд
  const pervyyDen = Object.keys(ist.dni).sort()[0]
  for (const r of razdely) for (const s of r.stroki) s.novoe = s.s > nedelyu && s.s > pervyyDen
  const novoe = razdely.flatMap((r) => r.stroki.filter((s) => s.novoe).map((s) => ({ ...s, razdel: r.t })))
  return { vsego, zaNedelyu: novoe.length, razdely, novoe, otchet: ist.otchet }
}

// Мост дневник → «Знаю о тебе» ----------
// Строка, на которую человек ответил «да», ложится в свой раздел ВЫШЕ «Что могло устареть», с датой и источником.
// Сюда зовут только после явного «да»: проверка — у вызывающего (dnevnik.mjs → zapomnit).
export const RAZDELY = ['Кто ты и зачем', 'Куда идёшь', 'Как ты устроен в работе']
const USTAR = /^##\s+Что могло устареть/i
const skelet = (den) => `---\nобновлено: ${den}\n---\n# Что Джинни знает о тебе\n\n` +
  RAZDELY.map((r) => `## ${r}\n`).join('\n') + '\n## Что могло устареть\n\n## История становления\n'

// разделы файла, куда можно дописывать (до «Что могло устареть»), — в том числе пока пустые
export function razdelyFaila(txt) {
  const out = []
  for (const l of String(txt || '').split(/\r?\n/)) {
    if (USTAR.test(l)) break
    const h = l.match(/^##\s+(.+)/)
    if (h) out.push(h[1].trim())
  }
  return out.length ? out : RAZDELY
}

export async function dopisat({ fail, razdel, chto, otkuda = 'дневник', seychas = Date.now() }) {
  chto = String(chto || '').replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
  if (!chto) return { ok: false, error: 'пусто' }
  const den = new Date(seychas).toISOString().slice(0, 10)
  let txt
  try { txt = await readFile(fail, 'utf8') } catch { txt = skelet(den) }
  if (razobrat(txt).some((r) => r.stroki.some((s) => kluch(s.chto) === kluch(chto)))) return { ok: true, uzhe: true }
  const eol = txt.includes('\r\n') ? '\r\n' : '\n'
  const L = txt.split(/\r?\n/)
  let konec = L.findIndex((l) => USTAR.test(l))
  if (konec < 0) konec = L.length
  let h = -1
  for (let i = 0; i < konec; i++) {
    const m = L[i].match(/^##\s+(.+)/)
    if (m && kluch(m[1]) === kluch(String(razdel || ''))) h = i
  }
  if (h < 0) {   // раздела нет — свой «Из дневника», но всё равно выше «Что могло устареть»
    const nazv = 'Из дневника'
    h = L.findIndex((l, i) => i < konec && kluch(l) === kluch('## ' + nazv))
    if (h < 0) { L.splice(konec, 0, '## ' + nazv, ''); h = konec; konec += 2 }
  }
  let end = h + 1
  while (end < konec && !/^#{1,2}\s/.test(L[end])) end++
  let last = end - 1
  while (last > h && !L[last].trim()) last--
  const nomer = Math.max(0, ...L.map((l) => +(l.match(/^\|\s*(\d+)\s*\|/) || [])[1] || 0)) + 1
  const otm = `${otkuda}, ${den}`
  let nov
  if (/^\s*[-*]\s+/.test(L[last])) nov = [`- ${chto} (${otm})`]
  else if (/^\|/.test(L[last])) {
    const yacheek = L[last].replace(/^\||\|\s*$/g, '').split('|').length
    nov = [yacheek <= 3 ? `| ${nomer} | ${chto} (${otm}) | ✅ |` : `| ${nomer} | ${chto} | ${otm} | ✅ |`]
  } else nov = ['', '| # | Что знаю | Откуда | Сверка |', '|---|---|---|---|', `| ${nomer} | ${chto} | ${otm} | ✅ |`, '']
  L.splice(last + 1, 0, ...nov)
  txt = L.join(eol).replace(/^(---[\s\S]*?\nобновлено:[ \t]*)[^\r\n]*/, `$1${den}`)
  await mkdir(dirname(fail), { recursive: true })
  await writeFile(fail + '.tmp', txt, 'utf8')
  await rename(fail + '.tmp', fail)
  return { ok: true, razdel: L[h].replace(/^##\s+/, '').trim(), nomer }
}

// Подсказка в инструкции сессии: раз в неделю показать отчёт. Неделя считается от прошлого отчёта или от знакомства.
export async function otchetNedeli({ fail, istoriya, seychas = Date.now() }) {
  const z = await znayu({ fail, istoriya, seychas })
  if (!z || !z.novoe.length) return ''
  let ist
  try { ist = JSON.parse(await readFile(istoriya, 'utf8')) } catch { return '' }
  const ot = ist.otchet || Object.keys(ist.dni).sort()[0]
  if (seychas - Date.parse(ot) < 7 * DEN) return ''
  ist.otchet = new Date(seychas).toISOString().slice(0, 10)
  await writeFile(istoriya, JSON.stringify(ist), 'utf8').catch(() => {})
  return '\n\nОТЧЁТ НЕДЕЛИ (один раз, после первого сообщения владельца в этом разговоре): за неделю ты узнала о нём ' +
    `${z.novoe.length} нового — ${z.novoe.slice(0, 15).map((s) => `«${s.chto}»`).join(', ')}. Покажи это инструментом ` +
    'panel с заголовком «Неделя: что я узнала о тебе»: по строке на новое и рядом — как это уже помогает в его делах, ' +
    'конкретно, на примерах из этой недели. Без лести и общих слов; не знаешь, чем помогло, — так и скажи и спроси.'
}
