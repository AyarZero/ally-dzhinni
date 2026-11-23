// DeepSeek Harness (dsh) как исполнитель моста: один ход = один запуск `dsh --profile ally --json`.
// Вход — подписка пользователя: профиль ally читает сохранённый вход из $DSH_HOME/.credentials.yaml
// (patches/profiles/ally/cordis.patch.yml), а не ключ API. Поток событий: session, status, text,
// thinking, tool_call, tool_result, final — проверено на 0.2.2-rc.3.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { modelOverlay } from './dsh-model.mjs'

export const DSH_PROFILE = process.env.DZHINNI_DSH_PROFILE || 'ally'
export const DSH_MODEL = { providerID: 'deepseek-account', id: process.env.DZHINNI_DSH_MODEL || 'deepseek-v4-pro' }
// Read-only ход моста (чужая смена писателя) = песочница read-only; иначе полный доступ, как у Claude Code.
const PRESETS = { read: 'read-only', full: 'danger-full-access' }

export function dshHome(env = process.env) {
  return env.DSH_HOME || join(env.USERPROFILE || homedir(), '.dsh')
}

// Где стоит приложение и его CLI. Только проверка путей: модель не вызывается.
export function dshInstall(env = process.env) {
  const local = env.LOCALAPPDATA || ''
  const candidates = [env.DZHINNI_DSH_EXE, local && join(local, 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe'),
    env.ProgramFiles && join(env.ProgramFiles, 'DeepSeek Harness', 'DeepSeek Harness.exe'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'DeepSeek Harness', 'DeepSeek Harness.exe'),
    'D:\\Programs\\Deepseek\\DeepSeek Harness.exe'].filter(Boolean)
  const exe = candidates.find(path => existsSync(path))
  if (!exe) throw new Error('DeepSeek Harness не найден: укажи путь в DZHINNI_DSH_EXE')
  const asar = join(dirname(exe), 'resources', 'app.asar')
  const bin = env.DZHINNI_DSH_BIN ||
    join(asar, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  // Обычный Node не видит внутрь app.asar (это архив): проверяем сам архив, а путь в нём знает Electron.
  if (!existsSync(asar)) throw new Error('app.asar DeepSeek Harness не найден рядом с приложением: ' + asar)
  const profileDir = join(dshHome(env), 'profiles', DSH_PROFILE)
  return { exe, bin, profile: DSH_PROFILE, profileDir }
}

export function dshCredentials(env = process.env) {
  const file = join(dshHome(env), '.credentials.yaml')
  try {
    // Файл читается как текст: нужен только факт сохранённого входа, значения не разбираются.
    return readFileSync(file, 'utf8').includes('deepseek-account-platform/default') ? file : null
  } catch { return null }
}

// Окно Harness запускает CLI своим же Node; переменные профиля окна мосту не нужны и мешают.
export function dshEnv(env = process.env) {
  const out = { ...env, ELECTRON_RUN_AS_NODE: '1', PYTHONUTF8: '1' }
  for (const key of ['DSH_PROFILE', 'DSH_PROFILE_DIR', 'DSH_INSTALL_DIR', 'DSH_NODE_EXECUTABLE', 'DSH_PROFILE_NAME']) delete out[key]
  // Касперский подменяет HTTPS DeepSeek своим сертификатом; Node его не доверяет → «transport failed».
  // Тот же обход, что ChatGPT сделал для окна Harness (сертификаты): доверяем корню Касперского.
  if (!out.NODE_EXTRA_CA_CERTS) {
    const ca = join(dshHome(env), 'kaspersky-ca.pem')
    if (existsSync(ca)) out.NODE_EXTRA_CA_CERTS = ca
  }
  return out
}

export function dshArgs({ prompt, thread = null, readOnly = false, patch = null }) {
  return ['--profile', DSH_PROFILE, ...(patch ? ['--patch', patch] : []), '--json', '--approval-policy', 'never',
    '--permission-mode', readOnly ? PRESETS.read : PRESETS.full,
    ...(thread ? ['--session-id', thread] : []), prompt]
}

function withAttachments(prompt, images) {
  if (!images?.length) return prompt
  return prompt + '\n\n[Вложения владельца — открой каждое инструментом read]\n' + images.map(path => '- ' + path).join('\n')
}

// Структурированные коды, не текст модели: текст никогда не решает вопрос о лимите.
// Исчерпанный баланс DeepSeek даёт запись «остывание» на 30 минут, а не вечную блокировку:
// у моста нет способа узнать время сброса квоты аккаунта, и постоянный блок запер бы ходы навсегда.
export function dshFailure({ code = null, status = null } = {}) {
  if (status === 401 || code === 'MISSING_CREDENTIAL' || code === 'AUTHENTICATION' || code === 'AUTH') return { kind: 'authentication', status }
  if (status === 429 || code === 'RATE_LIMITED' || code === 'RATE_LIMIT') return { kind: 'rate_limited', status }
  if (code === 'QUOTA_EXHAUSTED' || code === 'INSUFFICIENT_BALANCE') return { kind: 'rate_limited', status, retryAfterMs: 30 * 60e3 }
  return { kind: 'transport_unknown', status }
}

const MISSING_SESSION = /unknown (?:session|id)|no stored session|сессия не найдена/i

// usage шага dsh (верблюжьи ключи) → ключи моста (conversation.mjs, kesh-uchet.mjs).
export function dshUsage(usage = {}) {
  const number = value => Number.isFinite(value) ? value : 0
  return { input_tokens: number(usage.inputTokens), output_tokens: number(usage.outputTokens),
    cache_read_input_tokens: number(usage.cacheReadTokens), cache_write_input_tokens: number(usage.cacheWriteTokens),
    total_tokens: number(usage.totalTokens) }
}

function addUsage(sum, next) {
  const out = { ...sum }
  for (const [key, value] of Object.entries(next || {})) out[key] = (Number(out[key]) || 0) + (Number(value) || 0)
  return out
}

export async function dshTurn(args) {
  if (args.images?.length) throw new Error('DeepSeek Flash и Pro: просмотр изображений не подключён. Нужен исполнитель с поддержкой картинок.')
  const overlay = modelOverlay(args.model, args.env)
  try { return await dshTurnWithFallback({ ...args, patch: overlay.file, configuredModel: overlay.model }) }
  finally { overlay.dispose() }
}

async function dshTurnWithFallback(args) {
  try {
    return await dshTurnOnce(args)
  } catch (error) {
    // Сессия на диске не нашлась (другой каталог, сброс профиля): новый ход с краем переписки, как у Claude.
    if (!args.thread || error?.dsh?.missingSession !== true) throw error
    let tail = ''
    try { tail = String(await args.resumeFallback?.() || '').slice(-4000) } catch {}
    try { args.onEvent?.({ type: 'dsh.resume_missing', thread_id: args.thread }) } catch {}
    const notice = '[Служебное примечание моста Джинни, не слова владельца: прежняя сессия DeepSeek не найдена, продолжаю в новой.' +
      (tail ? ' Ниже край прежней переписки.]\n' + tail : ']')
    return dshTurnOnce({ ...args, thread: null, prompt: args.prompt + '\n\n' + notice })
  }
}

function dshTurnOnce({ prompt, cwd, thread = null, images = [], readOnly = false, patch = null, configuredModel = null,
  onEvent = () => {}, onChild = () => {}, timeout = null, env = process.env }) {
  return new Promise((resolve, reject) => {
    let install
    try { install = dshInstall(env) } catch (error) { reject(error); return }
    const text = withAttachments(prompt, images)
    let child
    try {
      child = spawn(install.exe, [install.bin, ...dshArgs({ prompt: text, thread, readOnly, patch })], {
        cwd, env: dshEnv(env), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) { reject(error); return }
    let sessionId = thread || null, finalText = '', texts = [], stderr = '', failure = null, usage = {}, settled = false
    const emit = value => { try { onEvent(value) } catch {} }
    const finish = (error) => {
      if (settled) return
      settled = true
      if (error) {
        if (process.env.DZHINNI_DSH_DEBUG) console.error('[dsh-turn] ' + error.message + ' | ' + JSON.stringify(error.dsh || {}))
        reject(error)
      }
      else {
        const answer = String(finalText || texts.filter(Boolean).join('\n\n')).trim()
        if (!answer) reject(new Error('DeepSeek завершил ход без текста ответа'))
        else resolve(answer)
      }
    }
    createInterface({ input: child.stdout }).on('line', raw => {
      let event
      try { event = JSON.parse(String(raw).replace(/^\uFEFF/, '')) } catch { return }
      if (!event || typeof event !== 'object') return
      if (event.type === 'session' && event.sessionId) {
        if (sessionId !== event.sessionId) emit({ type: 'thread.started', thread_id: event.sessionId })
        sessionId = event.sessionId
        return
      }
      if (event.type === 'status') {
        if (event.phase === 'turn_start') emit({ type: 'local.input_ready' })
        if (event.phase === 'step_end' && event.usage) usage = addUsage(usage, dshUsage(event.usage))
        return
      }
      if (event.type === 'thinking') return
      if (event.type === 'text' && event.text) {
        texts.push(event.text)
        emit({ type: 'item.completed', item: { id: 'dsh-text-' + texts.length, type: 'agent_message', text: event.text, phase: 'final' } })
        return
      }
      if (event.type === 'tool_call') {
        emit({ type: 'item.started', item: { id: event.callId, type: 'tool_call', name: event.tool, input: event.input || {} } })
        return
      }
      if (event.type === 'tool_result') {
        emit({ type: 'item.completed', item: { id: event.callId, type: 'tool_result', status: event.status } })
        return
      }
      if (event.type === 'final') {
        if (typeof event.text === 'string') finalText = event.text
        if (event.sessionId) sessionId = event.sessionId
        const reason = event.reason || {}
        if (reason.kind && reason.kind !== 'completed') {
          failure = Object.assign(new Error(reason.error?.message || 'Ход DeepSeek оборвался: ' + reason.kind),
            { dsh: { failure: dshFailure({ code: reason.error?.code, status: reason.error?.status }),
              code: reason.error?.code ?? null, missingSession: MISSING_SESSION.test(String(reason.error?.message || '')) } })
        }
        emit({ type: 'local.usage', actualModel: configuredModel, modelSource: 'dsh-config-overlay', usage })
        emit({ type: 'turn.completed', usage })
        return
      }
      if (event.type === 'error') {
        const error = Object.assign(new Error(event.message || 'Ошибка DeepSeek'), { dsh: { failure: dshFailure({ code: event.code }) } })
        failure ||= error
      }
    })
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000) })
    child.once('error', error => finish(error))
    child.once('close', (code, signal) => {
      if (failure) { finish(failure); return }
      if (code !== 0) {
        const missing = MISSING_SESSION.test(stderr)
        finish(Object.assign(new Error('DeepSeek завершил ход с кодом ' + code + (signal ? ' (' + signal + ')' : '') + (stderr.trim() ? ': ' + stderr.trim().slice(-300) : '')),
          { dsh: { failure: dshFailure({}), missingSession: missing } }))
        return
      }
      finish(null)
    })
    try { onChild(child) } catch {}
    const idle = Number(env.DZHINNI_DSH_IDLE_MIN) * 60e3 || (timeout > 0 ? timeout : 0)
    if (idle > 0) {
      const timer = setTimeout(() => {
        const error = Object.assign(new Error('DeepSeek не ответил вовремя: ' + Math.round(idle / 60e3) + ' мин без событий'),
          { dsh: { failure: { kind: 'no_response' }, stoppedConfirmed: true } })
        try { child.kill() } catch {}
        finish(error)
      }, idle)
      timer.unref?.()
      child.once('close', () => clearTimeout(timer))
    }
  })
}
