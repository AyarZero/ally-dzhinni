// Тихий текстовый ход для фоновых работ («Летописца может разбирать Джинни? А Джинни уже передаёт
// нейросети, которая сейчас доступна»). Летописец (act/scripts/letopisec_backends.py, backend «dzhinni») шлёт текст
// в POST /api/tekst, мост выбирает исполнителя тем же правилом, что и для хода пользователя (Авто, лимиты, запасной Агрегатор),
// и возвращает только текст. В переписку и в беседу пользователя ничего не попадает:
// - Claude — отдельным одиночным процессом, без сессии (thread null), не через живой процесс беседы;
// - Codex — своим сервером (свой пул), сбой не роняет сервер, на котором идёт разговор.
// Одновременно — один такой ход: летописец разбирает по куску, очередь ему не нужна.
import { claudeTurn } from './claude-turn.mjs'
import { codexTurn } from './codex-turn.mjs'
import { dshTurn } from './dsh-turn.mjs'
import { antigravityTurn } from './antigravity-cli.mjs'
import { codexLivePool } from './codex-live.mjs'
import { subscriptionEnv } from './local-executor-probes.mjs'

export const TEKST_MAX = 400000
const fail = (status, message) => Object.assign(new Error(message), { status })

export function tekstHod({ repo, route, settings = () => ({}), timeoutMs = 300000,
  turns = { claude: claudeTurn, codex: codexTurn, deepseek: dshTurn, antigravity: antigravityTurn }, codexPool = null }) {
  let running = false
  let pool = codexPool
  return async function tekst({ prompt, lyogkaya = false } = {}) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw fail(400, 'пустой запрос')
    if (prompt.length > TEKST_MAX) throw fail(413, 'запрос длиннее ' + TEKST_MAX + ' символов')
    if (running) throw fail(429, 'текстовый ход уже идёт')
    const chosen = route()
    if (!chosen?.executor) throw fail(503, 'нет доступной нейросети' + (chosen?.reason ? ': ' + chosen.reason : ''))
    const executor = chosen.executor
    if (!turns[executor]) throw fail(503, 'исполнитель ' + executor + ' не умеет текстовый ход')
    let model = chosen.model || settings()?.[executor]?.model || null
    // Лёгкая работа (разбор летописи) по подписке Claude — на haiku; запасной Агрегатор держит свою модель.
    if (executor === 'claude' && lyogkaya && !chosen.reserve) model = 'haiku'
    running = true
    try {
      const common = { prompt, cwd: repo, thread: null, images: [], readOnly: true, timeout: timeoutMs,
        onEvent: () => {}, onChild: () => {} }
      let text
      if (executor === 'codex') {
        pool ||= codexLivePool({ idleMs: 60e3 })
        model ||= 'gpt-6.1-sol'
        text = await turns.codex({ ...common, model, env: subscriptionEnv(), rpcFactory: pool })
      } else {
        text = await turns[executor]({ ...common, model, live: false })
      }
      text = String(text || '').trim()
      if (!text) throw fail(502, executor + ' ответил пустым текстом')
      return { text, executor, model, reserve: !!chosen.reserve }
    } finally {
      running = false
    }
  }
}
