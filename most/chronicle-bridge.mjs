import { spawn } from 'node:child_process'
import { join } from 'node:path'

export function classifyTask(text = '') {
  if (text.startsWith('[Проверка системы]')) return { task_type: 'diagnostic', task_type_source: 'diagnostic_probe' }
  const value = text.toLowerCase()
  for (const [type, pattern] of [
    ['operations', /сертификат|сервер|депло|служб|перезапуск|лимит|хук|летопис/],
    ['review', /провер|аудит|ревью|оцен/],
    ['coding', /код|приложени|функци|баг|рефактор|реализ|разработ/],
    ['research', /исслед|изучи|найди|поищи|сравни/],
    ['writing', /напиши|сценар|текст|письмо|пост/],
  ]) if (pattern.test(value)) return { task_type: type, task_type_source: 'rules/v1' }
  return { task_type: 'unclassified', task_type_source: 'rules/v1' }
}

// Existing chronicle is the only store. No independent transcript or metrics database.
export function chronicleBridge({ root, start = spawn, engine = 'claude', onError = () => {} }) {
  let writes = Promise.resolve(), lastError = ''
  function record(payload) {
    const data = { engine, occurred_at: new Date().toISOString(), ...payload }
    const next = writes.catch(() => {}).then(() => new Promise((resolve, reject) => {
      const child = start('python', ['-B', join(root, 'act/scripts/letopisec.py'), 'capture-event'],
        { cwd: root, windowsHide: true, shell: false, env: { ...process.env, ALLY_LETOPISEC_ROOT: root, PYTHONUTF8: '1' }, stdio: ['pipe', 'pipe', 'pipe'] })
      let out = '', err = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('Летописец не завершил запись за 15 секунд')) }, 15000)
      child.stdout.on('data', value => { out = (out + value).slice(-10000) })
      child.stderr.on('data', value => { err = (err + value).slice(-1000) })
      child.stdin.on('error', () => {})
      child.once('error', failure => { clearTimeout(timer); reject(failure) })
      child.once('close', code => {
        clearTimeout(timer)
        try {
          const result = JSON.parse(out)
          if (code !== 0 || result.status === 'error') throw new Error(result.error || err || 'Ошибка записи летописца')
          lastError = ''; resolve(result)
        } catch (error) { reject(error) }
      })
      child.stdin.end(JSON.stringify(data))
    }))
    writes = next
    return next
  }
  async function safeRecord(payload) {
    try { return await record(payload) }
    catch (error) { lastError = error.message; onError(lastError); return { status: 'error', error: lastError } }
  }
  return { record, safeRecord, status: () => ({ error: lastError }), flush: () => writes.catch(() => {}) }
}

export function usageOf(message) {
  const tokens = message.tokens || message.usage || {}
  // Claude CLI names the cache cache_read_input_tokens / cache_creation_input_tokens, Codex — cached_input_tokens;
  // only the old names were read and the cache of every Claude turn was written as null.
  return { input_tokens: tokens.input ?? tokens.input_tokens ?? null, output_tokens: tokens.output ?? tokens.output_tokens ?? null,
    cache_read_tokens: tokens.cache?.read ?? tokens.cache_read_tokens ?? tokens.cache_read_input_tokens ?? tokens.cached_input_tokens ?? null,
    cache_write_tokens: tokens.cache?.write ?? tokens.cache_write_tokens ?? tokens.cache_creation_input_tokens ?? null }
}

// Нулевые счётчики входа и выхода — заглушка CLI, а не замер: в летопись идёт «неизвестно», не нули.
export function turnUsageOf(message) {
  const usage = usageOf(message)
  if (usage.input_tokens === 0 && usage.output_tokens === 0) return Object.fromEntries(Object.keys(usage).map(key => [key, null]))
  return usage
}
