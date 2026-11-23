// Local control-plane preference. Never opens a window or calls a model.
import { readFileSync } from 'node:fs'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { EXECUTORS as FIRST_CIRCLE, AUTO_ORDER, CLAUDE_RECHECK } from '../core/executor-catalog.mjs'
export class ExecutorSelection {
  constructor(file, { executors = FIRST_CIRCLE, order = AUTO_ORDER } = {}) {
    this.executors = executors; this.order = order
    this.file = file; this.value = { version: 1, mode: 'auto', claudeVerifiedAt: null }
    // битый selection.json ронял мост на старте — теперь «авто» с предупреждением, файл перепишет save()
    this.warning = null
    try { const value = JSON.parse(readFileSync(file, 'utf8')); this.validate(value); this.value = value }
    catch (error) {
      if (error.code !== 'ENOENT') {
        this.warning = 'Настройка выбора исполнителя повреждена — включён режим «авто»: ' + error.message
        console.error(this.warning)
      }
    }
    this.writes = Promise.resolve()
  }
  validate(value) {
    if (value.version !== 1 || !['auto', ...this.executors].includes(value.mode) ||
      value.claudeVerifiedAt != null && (!Number.isSafeInteger(value.claudeVerifiedAt) || value.claudeVerifiedAt < CLAUDE_RECHECK)) {
      throw new Error('Повреждена настройка выбора исполнителя')
    }
  }
  async save(patch) {
    this.writes = this.writes.catch(() => {}).then(async () => {
      const next = { ...this.value, ...patch }; this.validate(next)
      await mkdir(dirname(this.file), { recursive: true }); await writeFile(this.file + '.tmp', JSON.stringify(next)); await rename(this.file + '.tmp', this.file)
      this.value = next; this.warning = null
    })
    await this.writes
    return this.status()
  }
  options() { return { preference: this.value.mode, order: this.order, claudeVerified: !!this.value.claudeVerifiedAt } }
  status() { return { ...this.value, autoOrder: this.order, claudeRecheckAt: CLAUDE_RECHECK,
    ranking: 'configured_priority_and_fresh_availability', ...(this.warning ? { warning: this.warning } : {}) } }
}
