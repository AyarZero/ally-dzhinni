/**
 * Голос Джинни: нейроголос Microsoft «Светлана» (тот же, что читает вслух в Edge) через msedge-tts, без Python
 * и без ключей. Окно шлёт текст, мост отвечает mp3. Нужен интернет; нет его — окно говорит голосом Windows.
 * Дария в бесплатном сервисе недоступна, Дмитрий тоже — остаётся Светлана.
 * Длинный ответ режем по предложениям на куски до 600 знаков: окно начинает говорить после первого, не ждёт всё.
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export const GOLOS = 'ru-RU-SvetlanaNeural'
const KUSOK = 600

export function kuski(t) {
  const fr = String(t).replace(/[*_`#>|]/g, ' ').replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*\s*/g) || []
  const out = []
  let k = ''
  for (const f of fr) {
    if (k && (k + f).length > KUSOK) { out.push(k.trim()); k = '' }
    k += f
  }
  if (k.trim()) out.push(k.trim())
  return out
}

// msedge-tts вставляет текст в SSML как есть: «&» или «<» ломали разметку, голос обрывался
export const dlyaSsml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function golos({ log }) {
  async function ozvuchit(tekst, { skorost = '+5%' } = {}) {
    const tts = new MsEdgeTTS()
    try {
      await tts.setMetadata(GOLOS, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      const { audioStream } = tts.toStream(dlyaSsml(tekst), { rate: skorost })
      const ch = []
      await new Promise((ok, no) => {
        const t = setTimeout(() => no(new Error('голос не ответил за 20 с')), 20000)
        audioStream.on('data', (d) => ch.push(d))
        audioStream.on('end', () => { clearTimeout(t); ok() })
        audioStream.on('error', (e) => { clearTimeout(t); no(e) })
      })
      return Buffer.concat(ch)
    } catch (e) { log('голос: ' + e.message); throw e } finally { try { tts.close() } catch {} }
  }
  return { ozvuchit, kuski }
}
