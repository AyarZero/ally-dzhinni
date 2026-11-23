// Per-executor model and reasoning preferences. Stored locally; no model call.
// OpenCode и Qoder выведены из круга пользователем: их старые сохранённые строки молча отбрасываются.
// DeepSeek Harness: модель применяется overlay-файлом отдельно на каждый ход.
import { TOKENATOR_MODELS, TOKENATOR_RESERVE_DEFAULT } from './tokenator.mjs'
import { AGY_MODELS } from './antigravity-cli.mjs'
// tokenator — не исполнитель маршрута, а модель запасного хода Claude Code (direct-provider, reserveRoute).
export const EXECUTORS = ['codex', 'claude', 'deepseek', 'tokenator', 'antigravity']
const DEFAULT_MODEL = { tokenator: TOKENATOR_RESERVE_DEFAULT }
// Имена ушедших исполнителей: нужны только чтобы старый engine.json не сбрасывал настройки остальных.
const RETIRED = ['opencode', 'qoder']
// Сохранённый ранее псевдоним Claude переводится на ту же модель точной версии, чтобы выбор не потерял галочку.
const CLAUDE_ALIAS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', fable: 'claude-fable-5-2' }
const unalias = (executor, model) => executor === 'claude' && CLAUDE_ALIAS[model] ? CLAUDE_ALIAS[model] : model
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+\[\]-]{0,79}$/
const CODEX_FULL = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
const CODEX_NO_ULTRA = ['low', 'medium', 'high', 'xhigh', 'max']
// Codex `codex debug models`.
export const MODEL_OPTIONS = {
  codex: [['gpt-6.1-sol', 'GPT-6.1-Sol'], ['gpt-6.1-terra', 'GPT-6.1 Terra'], ['gpt-6-astra', 'GPT-6-Astra'],
    ['gpt-6-sol', 'GPT-6-Sol'], ['gpt-6-luna', 'GPT-6-Luna', CODEX_NO_ULTRA],
    ['gpt-6-chat-thinking', 'GPT-6 Chat Thinking', CODEX_NO_ULTRA],
    ['gpt-5.6-sol', 'GPT-5.6-Sol'], ['gpt-5.6-terra', 'GPT-5.6 Terra'], ['gpt-5.6-luna', 'GPT-5.6-Luna', CODEX_NO_ULTRA],
    ['gpt-reserve', 'GPT-Reserve', CODEX_NO_ULTRA]]
    .map(([value, label, reasoning = CODEX_FULL]) => ({ value, label, reasoning })),
  // одна строка на семейство. Псевдоним «opus» и «claude-opus-5-5» сегодня — одна модель,
  // в списке они стояли дублями. Оставлены точные версии: в списке видно, что реально работает.
  // Новая версия вышла — заменить строку здесь (и ALIAS ниже), а не добавлять рядом.
  claude: [['claude-opus-5-5', 'Opus 5.5'], ['claude-sonnet-5-5', 'Sonnet 5.5'],
    ['claude-haiku-5-5', 'Haiku 5.5'], ['claude-fable-5-2', 'Fable 5.2']]
    .map(([value, label]) => ({ value, label }))
    // чужие модели через Агрегатор тем же Claude Code (tokenator.mjs).
    .concat(TOKENATOR_MODELS),
  // Модель применяется через --patch, глубина остаётся в профиле ally.
  deepseek: [['deepseek-flash', 'DeepSeek Flash'], ['deepseek-v4-pro', 'DeepSeek V4 Pro']].map(([value, label]) => ({ value, label })),
  tokenator: TOKENATOR_MODELS,
  antigravity: AGY_MODELS
}
export const REASONING_OPTIONS = {
  codex: CODEX_FULL,
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  deepseek: [],
  tokenator: [], // --effort у Claude Code только для Anthropic; через Агрегатор не передаётся
  antigravity: [] // Уровень уже входит в точное имя модели из agy models.
}

// Levels allowed for a concrete model; unknown or default model gets the network-wide list.
export function reasoningFor(executor, model) {
  const row = model ? MODEL_OPTIONS[executor]?.find(item => item.value === model) : null
  return row?.reasoning || REASONING_OPTIONS[executor] || []
}

export function defaultExecutorSettings() {
  return Object.fromEntries(EXECUTORS.map(executor => [executor,
    { model: DEFAULT_MODEL[executor] ?? null, reasoning: null }]))
}

const clone = value => Object.fromEntries(EXECUTORS.map(executor => [executor,
  { model: unalias(executor, value[executor]?.model) ?? DEFAULT_MODEL[executor] ?? null, reasoning: value[executor]?.reasoning ?? null }]))

export function normalizeExecutorSettings(value, previous = defaultExecutorSettings()) {
  if (value === undefined || value === null) return clone(previous)
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Повреждены настройки моделей')
  const next = clone(previous)
  for (const [executor, row] of Object.entries(value)) {
    if (RETIRED.includes(executor)) continue
    if (!EXECUTORS.includes(executor)) throw new Error('Неизвестная нейросеть в настройках: ' + executor)
    if (row === null) { next[executor] = { model: DEFAULT_MODEL[executor] ?? null, reasoning: null }; continue }
    if (typeof row !== 'object' || Array.isArray(row)) throw new Error('Повреждены настройки модели ' + executor)
    const model = row.model === undefined ? next[executor].model : row.model
    if (model !== null && typeof model !== 'string') throw new Error('Модель ' + executor + ': нужна строка')
    const text = unalias(executor, typeof model === 'string' ? model.trim() : null)
    if (text && !MODEL.test(text)) throw new Error('Модель ' + executor + ': только имя без пробелов, до 80 символов')
    if (executor === 'deepseek' && text && !MODEL_OPTIONS.deepseek.some(row => row.value === text))
      throw new Error('DeepSeek: неизвестная модель ' + text)
    if (executor === 'antigravity' && text && !AGY_MODELS.some(row => row.value === text))
      throw new Error('Antigravity: неизвестная модель ' + text)
    const allowed = reasoningFor(executor, text)
    // An inherited level the new model lacks resets to default instead of rejecting the whole save.
    const inherited = next[executor].reasoning
    const reasoning = row.reasoning === undefined ? (allowed.includes(inherited) ? inherited : null) : row.reasoning
    if (reasoning !== null && reasoning !== '' && !allowed.includes(reasoning))
      throw new Error('Глубина ' + executor + (text ? ' для ' + text : '') + ': ' + (allowed.join(', ') || 'нет уровней'))
    // Запасной принимает только модели агрегатора (OpenRouter); пусто («по умолчанию») — Opus 5.5.
    if (executor === 'tokenator' && text && !text.startsWith('tokenator:')) throw new Error('Запасной: только модель агрегатора (OpenRouter) (tokenator:…)')
    next[executor] = { model: text || DEFAULT_MODEL[executor] || null, reasoning: reasoning || null }
  }
  return next
}

export function executorCatalog(settings) {
  return EXECUTORS.map(id => ({ id, active: true, model: settings[id].model,
    reasoning: settings[id].reasoning, models: MODEL_OPTIONS[id], reasoningOptions: REASONING_OPTIONS[id] }))
}
