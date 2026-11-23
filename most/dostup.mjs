// Доступ Джинни: какая ступень открыта у этой копии — открыто / регистрация / ключ.
// Пропуск выдаёт наш привратник (подпись ed25519), здесь он только ПРОВЕРЯЕТСЯ — без интернета.
// Ключа подписи в копии нет и быть не может: только открытый, им подделку не сделать.
// Что на какой ступени — stupeni.json рядом (данные, правятся без кода).
import { createHash, createPublicKey, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { cpus, hostname, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const STUPENI = ['otkryto', 'registraciya', 'kluch']
const DEN = 86400e3
const ZAPAS_DNEY = 14 // столько пропуск живёт после срока, если интернета нет

// Открытый ключ привратника — константой, не из окружения: иначе клиент подложит свой и подпишет себе «ключ».
// Пока ЗАГЛУШКА: настоящий появится вместе с выдачей в привратнике. Настоящий замок — на сервере
// (модули по ключу выдаёт только привратник), клиентская проверка лишь показывает ступень.
const KLUCH_PRIVRATNIKA = ''

const b64 = (s) => Buffer.from(s, 'base64url')

// Отпечаток компьютера: имя машины, пользователь и процессор — без реестра и без личных данных наружу.
export function otpechatok() {
  const syroe = [hostname(), userInfo().username, cpus()[0]?.model || ''].join('|')
  return createHash('sha256').update(syroe).digest('hex').slice(0, 32)
}

export function dostup({ papka = HERE, log = () => {}, kluch = KLUCH_PRIVRATNIKA, seychas = () => Date.now() } = {}) {
  const FAIL = join(papka, '.propusk.json')
  const karta = JSON.parse(readFileSync(join(HERE, 'stupeni.json'), 'utf8'))
  let pub = null
  try { if (kluch) pub = createPublicKey(kluch) } catch (e) { log('ключ привратника испорчен:', e.message) }

  // Разобрать и проверить пропуск. Любая неувязка = ступень «открыто», причина — в ответе.
  function razobrat(propusk) {
    if (!propusk) return { stupen: 'otkryto', pochemu: 'пропуска нет' }
    if (!pub) return { stupen: 'otkryto', pochemu: 'ключ привратника не задан' }
    let d
    try {
      if (!verify(null, b64(propusk.dannye), pub, b64(propusk.podpis))) return { stupen: 'otkryto', pochemu: 'подпись не сходится' }
      d = JSON.parse(b64(propusk.dannye).toString('utf8'))
    } catch { return { stupen: 'otkryto', pochemu: 'пропуск испорчен' } }
    if (!STUPENI.includes(d?.stupen)) return { stupen: 'otkryto', pochemu: 'неизвестная ступень' }
    if (d.otpechatok !== otpechatok()) return { stupen: 'otkryto', pochemu: 'пропуск с другого компьютера' }
    const t = seychas()
    const srok = Date.parse(d.do)
    if (!(srok > 0)) return { stupen: 'otkryto', pochemu: 'нет срока' }
    if (t > srok + ZAPAS_DNEY * DEN) return { stupen: 'otkryto', pochemu: 'срок вышел', byla: d.stupen }
    return { stupen: d.stupen, tarif: d.tarif || null, do: d.do, obnovit: t > srok - 7 * DEN, kto: d.kto || null }
  }

  let tek = { stupen: 'otkryto', pochemu: 'не проверялось' }
  async function proverit() {
    let p = null
    try { p = JSON.parse(await readFile(FAIL, 'utf8')) } catch {}
    tek = razobrat(p)
    if (p && tek.pochemu) log('доступ:', tek.pochemu)
    return tek
  }

  // Положить пропуск, пришедший от привратника. Чужой или битый — не кладём.
  async function polozhit(propusk) {
    const r = razobrat(propusk)
    if (r.pochemu) return r
    await writeFile(FAIL, JSON.stringify(propusk), 'utf8')
    tek = r
    return r
  }

  const uroven = (s) => STUPENI.indexOf(s)
  // Открыта ли возможность. Неизвестную считаем открытой: замок ставим явно, а не по забывчивости.
  const mozhno = (v) => uroven(tek.stupen) >= uroven(karta.vozmozhnosti[v]?.stupen || 'otkryto')
  const svodka = () => ({
    ...tek,
    otpechatok: otpechatok(),
    vozmozhnosti: Object.fromEntries(Object.entries(karta.vozmozhnosti).map(([k, v]) => [k, { ...v, otkryta: mozhno(k) }])),
  })

  return { proverit, polozhit, mozhno, svodka, get stupen() { return tek.stupen } }
}
