/**
 * Слух Джинни: расшифровка речи на компьютере владельца, без интернета.
 * GigaAM v3 с пунктуацией (Сбер, MIT, 170 МБ) через sherpa-onnx: на процессоре 10 с речи ≈ 1 с работы, точность на
 * русском как у Whisper large-v3. Модель лежит в
 * most/.modeli/giga-am-v3 (её качает установщик). Окно присылает PCM 16 кГц, 16 бит, моно.
 * Расшифровка идёт в отдельном потоке: 10 минут речи — это минута работы, и мост на это время не должен вставать
 * (канал, окно и разрешения живут в главном потоке).
 */
import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

const SR = 16000
const KUSOK = 20 * SR // GigaAM учили на коротких фразах: длинную запись режем по паузам на куски до 20 с
const FAILY = ['encoder.int8.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt']

// где резать: самое тихое место (окно 0,1 с) между 12-й и 20-й секундой куска
export function narezat(a) {
  const out = []
  let s = 0
  while (a.length - s > KUSOK) {
    const ot = s + 12 * SR, okno = SR / 10
    let luchshe = s + KUSOK, min = Infinity
    for (let i = ot; i + okno <= s + KUSOK; i += okno / 2) {
      let e = 0
      for (let j = i; j < i + okno; j++) e += a[j] * a[j]
      if (e < min) { min = e; luchshe = i + okno / 2 }
    }
    out.push(a.subarray(s, luchshe))
    s = luchshe
  }
  if (a.length - s > SR / 5) out.push(a.subarray(s))
  return out
}

// поток-расшифровщик: держит модель в памяти, принимает Int16 PCM, отвечает текстом
if (!isMainThread && workerData?.slukh) {
  const papka = workerData.slukh
  let rasp
  try {
    const so = createRequire(import.meta.url)('sherpa-onnx-node')
    rasp = new so.OfflineRecognizer({
      featConfig: { sampleRate: SR, featureDim: 80 },
      modelConfig: {
        transducer: { encoder: join(papka, FAILY[0]), decoder: join(papka, FAILY[1]), joiner: join(papka, FAILY[2]) },
        tokens: join(papka, FAILY[3]), modelType: 'nemo_transducer', numThreads: 4, provider: 'cpu', debug: 0,
      },
    })
    parentPort.postMessage({ gotov: true })
  } catch (e) { parentPort.postMessage({ gotov: false, error: e.message }) }
  parentPort.on('message', ({ id, pcm }) => {
    try {
      const a = new Float32Array(pcm.length)
      for (let i = 0; i < pcm.length; i++) a[i] = pcm[i] / 32768
      const t0 = Date.now(), chasti = []
      for (const k of narezat(a)) {
        const s = rasp.createStream()
        s.acceptWaveform({ sampleRate: SR, samples: k })
        rasp.decode(s)
        const t = rasp.getResult(s).text.trim()
        if (t) chasti.push(t)
      }
      parentPort.postMessage({ id, ok: true, text: chasti.join(' '), sek: (Date.now() - t0) / 1000, dlina: a.length / SR })
    } catch (e) { parentPort.postMessage({ id, ok: false, error: e.message }) }
  })
}

export function slukh({ papka, log }) {
  let rab = null, oshibka = '', seq = 0
  const zhdut = new Map()
  async function gotov() {
    if (rab) return rab.gotov
    try { for (const f of FAILY) await access(join(papka, f)) } catch { oshibka = 'модель слуха не установлена'; return false }
    const w = new Worker(new URL(import.meta.url), { workerData: { slukh: papka } })
    w.unref()
    // не запустился — поток гасим и больше не пробуем до перезапуска моста: иначе каждый запрос плодит новый поток
    rab = { w, gotov: new Promise((ok) => w.once('message', (m) => { if (!m.gotov) { oshibka = 'слух не запустился: ' + m.error; log(oshibka); w.terminate(); rab = { gotov: Promise.resolve(false) } } ok(!!m.gotov) })) }
    w.on('message', (m) => { if (m.id && zhdut.has(m.id)) { zhdut.get(m.id)(m); zhdut.delete(m.id) } })
    w.on('error', (e) => { oshibka = 'слух упал: ' + e.message; log(oshibka); rab = null; for (const f of zhdut.values()) f({ ok: false, error: oshibka }); zhdut.clear() })
    return rab.gotov
  }

  // pcm — Int16 моно 16 кГц
  async function rasshifrovat(pcm) {
    if (!(await gotov())) return { ok: false, error: oshibka }
    const id = ++seq, kopiya = Int16Array.from(pcm)
    return new Promise((ok) => { zhdut.set(id, ok); rab.w.postMessage({ id, pcm: kopiya }, [kopiya.buffer]) })
  }

  return { rasshifrovat, gotov, sostoyanie: async () => { const est = await gotov(); return { est, oshibka: est ? '' : oshibka } }, stop: () => rab?.w?.terminate() }
}
