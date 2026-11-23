// Шлюз к внешним агрегаторам моделей (OpenRouter и любой Anthropic-совместимый API) через Claude Code CLI.
// Модель вида «tokenator:<id>» идёт через настроенный агрегатор (baseUrl + apiKey), не затрагивая подписку.
// Ключ хранится только локально в окружении или рабочей папке данных; в Git, журнал и окно не попадает.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const TOKENATOR_PREFIX = 'tokenator:'
export const TOKENATOR_URL = 'https://openrouter.ai/api'
export const DEFAULT_AGGREGATOR_URL = 'https://openrouter.ai/api'

// Подборка моделей; любой другой id из каталога агрегатора (например anthropic/claude-3.7-sonnet) можно выбрать или вписать.
export const TOKENATOR_MODELS = [
  ['claude-opus-5.5', 'Claude Opus 5.5 · платно'], ['claude-fable-5.1', 'Claude Fable 5.1 · платно'],
  ['kimi-k3', 'Kimi K3'], ['kimi-k3.1-pro', 'Kimi K3.1 Pro'], ['glm-5.3', 'GLM 5.3'],
  ['deepseek-v4-pro', 'DeepSeek V4 Pro'], ['qwen-3.7-max', 'Qwen 3.7 Max'], ['minimax-m3', 'MiniMax M3'],
  ['gpt-6.1-sol', 'GPT-6.1 Sol'], ['gpt-6-luna', 'GPT-6 Luna'], ['gemini-4-argon', 'Gemini 4 Argon'],
  ['grok-4.7', 'Grok 4.7'], ['claude-sonnet-5.5', 'Claude Sonnet 5.5'],
  ['free-glm-5.3-flash', 'GLM 5.3 Flash · бесплатно'], ['free-gpt-6-astra', 'GPT-6 Astra · бесплатно'],
  ['free-claude-opus-5.5', 'Claude Opus 5.5 · бесплатно'], ['free-gemini-4-argon', 'Gemini 4 Argon · бесплатно']
].map(([id, label]) => ({ value: TOKENATOR_PREFIX + id, label: 'Агрегатор · ' + label, reasoning: [] }))

export const TOKENATOR_RESERVE_DEFAULT = TOKENATOR_PREFIX + 'claude-opus-5.5'

export const isTokenator = model => typeof model === 'string' && model.startsWith(TOKENATOR_PREFIX)
export const tokenatorModel = model => model.slice(TOKENATOR_PREFIX.length)

function aggregatorFile(repo = process.cwd(), env = process.env) {
  const storage = env.DZHINNI_ENGINE_DATA || join(repo, 'projects', 'dzhinni', 'most', '.opencode-data')
  return join(storage, 'aggregator.json')
}

export function readAggregatorConfig({ repo = process.cwd(), env = process.env } = {}) {
  try {
    const file = aggregatorFile(repo, env)
    if (!existsSync(file)) return {}
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return typeof data === 'object' && data ? data : {}
  } catch { return {} }
}

export function saveAggregatorConfig(update = {}, { repo = process.cwd(), env = process.env } = {}) {
  const file = aggregatorFile(repo, env)
  const current = readAggregatorConfig({ repo, env })
  const baseUrl = update.baseUrl !== undefined ? String(update.baseUrl || '').trim() : (current.baseUrl || DEFAULT_AGGREGATOR_URL)
  if (baseUrl && !/^https?:\/\/[A-Za-z0-9._:-]+(\/[^\s]*)?$/i.test(baseUrl)) {
    throw new Error('Некорректный адрес агрегатора (нужен http:// или https:// URL)')
  }
  const kluch = update.clearKey ? '' : (update.kluch !== undefined && String(update.kluch).trim() !== ''
    ? String(update.kluch).trim() : (current.kluch || ''))
  const defaultModel = update.defaultModel !== undefined ? String(update.defaultModel || '').trim() : (current.defaultModel || '')
  if (defaultModel && !/^[A-Za-z0-9][A-Za-z0-9._:/@+\[\]-]{0,79}$/.test(defaultModel)) {
    throw new Error('Некорректный идентификатор модели агрегатора')
  }
  const next = { baseUrl: baseUrl || DEFAULT_AGGREGATOR_URL, kluch, defaultModel, updatedAt: Date.now() }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  return aggregatorPublicStatus({ repo, env })
}

export function aggregatorPublicStatus({ repo = process.cwd(), env = process.env } = {}) {
  const cfg = readAggregatorConfig({ repo, env })
  let hasKey = false, mask = '', source = 'none'
  try {
    const k = tokenatorKey({ env, repo })
    hasKey = !!k
    mask = k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-3)}` : 'настроен'
    source = (env.OPENROUTER_API_KEY || env.AGGREGATOR_API_KEY || env.TOKENATOR_API_KEY) ? 'env' : (cfg.kluch ? 'local' : 'file')
  } catch {}
  return {
    configured: hasKey,
    keyMask: mask,
    source,
    baseUrl: cfg.baseUrl || env.AGGREGATOR_BASE_URL || env.OPENROUTER_BASE_URL || DEFAULT_AGGREGATOR_URL,
    defaultModel: cfg.defaultModel || ''
  }
}

export function tokenatorKey({ env = process.env, repo = process.cwd() } = {}) {
  for (const k of [env.OPENROUTER_API_KEY, env.AGGREGATOR_API_KEY, env.TOKENATOR_API_KEY]) {
    if (typeof k === 'string' && k.trim()) return k.trim()
  }
  const cfg = readAggregatorConfig({ repo, env })
  if (typeof cfg.kluch === 'string' && cfg.kluch.trim()) return cfg.kluch.trim()
  throw new Error('Агрегатор (OpenRouter): настрой API-ключ в онбординге или окружении OPENROUTER_API_KEY')
}

export function tokenatorEnv(base, model, key, customBaseUrl) {
  const id = tokenatorModel(model)
  const env = { ...base }
  delete env.ANTHROPIC_API_KEY
  const url = customBaseUrl || env.AGGREGATOR_BASE_URL || env.OPENROUTER_BASE_URL || TOKENATOR_URL
  return { ...env, ANTHROPIC_BASE_URL: url, ANTHROPIC_AUTH_TOKEN: key, ANTHROPIC_MODEL: id,
    ANTHROPIC_SMALL_FAST_MODEL: id, ANTHROPIC_DEFAULT_HAIKU_MODEL: id, ANTHROPIC_DEFAULT_SONNET_MODEL: id,
    ANTHROPIC_DEFAULT_OPUS_MODEL: id, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DZHINNI_TOKENATOR: id }
}

export const tokenatorJournal = repo => join(repo, 'act', 'analytics', 'tokenator_zhurnal.jsonl')

export async function logTokenatorTurn(repo, row) {
  const file = tokenatorJournal(repo)
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, JSON.stringify({ at: new Date().toISOString(), source: 'dzhinni', ...row }) + '\n', 'utf8')
}

export async function testAggregatorConnection({ baseUrl, kluch, repo = process.cwd(), env = process.env } = {}) {
  const cfg = readAggregatorConfig({ repo, env })
  const rawUrl = String(baseUrl || cfg.baseUrl || env.AGGREGATOR_BASE_URL || env.OPENROUTER_BASE_URL || DEFAULT_AGGREGATOR_URL).trim()
  let parsed
  try { parsed = new URL(rawUrl) } catch { return { ok: false, status: 0, error: 'Некорректный адрес агрегатора' } }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, status: 0, error: 'Некорректный адрес агрегатора (нужен http:// или https://)' }
  }
  let key = typeof kluch === 'string' && kluch.trim() ? kluch.trim() : ''
  if (!key) { try { key = tokenatorKey({ repo, env }) } catch { key = '' } }
  if (!key) return { ok: false, status: 0, error: 'Сначала введи и сохрани API-ключ агрегатора' }
  const cleanBase = rawUrl.replace(/\/+$/, '')
  const endpoints = cleanBase.endsWith('/v1')
    ? [`${cleanBase}/models`]
    : [`${cleanBase}/v1/models`, `${cleanBase}/models`]
  const headers = { authorization: `Bearer ${key}`, 'x-api-key': key }
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const response = await fetch(endpoints[i], { method: 'GET', headers, signal: AbortSignal.timeout(12000) })
      if (response.status === 404 && i < endpoints.length - 1) continue
      if (response.status === 401 || response.status === 403) {
        return { ok: false, status: response.status, error: 'Ключ отклонён сервером агрегатора (проверь ключ)' }
      }
      if (!response.ok) {
        return { ok: false, status: response.status, error: `Сервер агрегатора вернул ошибку ${response.status}` }
      }
      const payload = await response.json().catch(() => ({}))
      const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
      const ids = list.map(item => (typeof item === 'string' ? item : item?.id || item?.name || '')).filter(Boolean)
      return { ok: true, status: response.status, count: ids.length, sample: ids.slice(0, 5) }
    } catch (error) {
      return { ok: false, status: 0, error: error?.message || 'Не удалось связаться с агрегатором' }
    }
  }
  return { ok: false, status: 404, error: 'Эндпоинт моделей не найден' }
}
