// Stored in the same SQLite database as tasks; no network or model access.
import { randomUUID } from 'node:crypto'
import { canonical, requireThat, text } from './task-contract.mjs'
import { EXECUTORS, executorId, observation, failureBlock, resolvedBlock, selectExecutor } from './availability-policy.mjs'

export const AVAILABILITY_SCHEMA = `
CREATE TABLE executor_status(executor TEXT PRIMARY KEY, observation TEXT, blocks TEXT NOT NULL, revision INTEGER NOT NULL);
CREATE TABLE executor_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, command_id TEXT UNIQUE NOT NULL,
 executor TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, data TEXT NOT NULL);
PRAGMA user_version=2;`

export class ExecutorRegistry {
  constructor(store, { clock = Date.now } = {}) {
    this.store = store; this.db = store.db; this.clock = clock
    requireThat(this.db.prepare('PRAGMA user_version').get().user_version >= 2,
      'SCHEMA_UPGRADE_REQUIRED', 'Открой хранилище на запись для обновления реестра')
  }
  row(executor) {
    executorId(executor)
    const row = this.db.prepare('SELECT * FROM executor_status WHERE executor=?').get(executor)
    return { executor, observation: row?.observation ? JSON.parse(row.observation) : null,
      blocks: row?.blocks ? JSON.parse(row.blocks) : [], revision: row?.revision ?? 0 }
  }
  // view: read-only lens for routing ( — a Tokenator model makes Claude Code independent
  // of the Anthropic subscription). It never changes the stored rows, revisions or blocks.
  list() {
    const rows = this.store.transaction(() => EXECUTORS.map(id => this.row(id)), true)
    return this.view ? rows.map(row => this.view(row)) : rows
  }
  select(options) { return selectExecutor(this.list(), options) }
  change(executor, commandId, kind, at, data, update) {
    executorId(executor); text(commandId, 'commandId', 200)
    requireThat(Number.isSafeInteger(at) && at > 0 && at <= this.clock(), 'INVALID_INPUT', 'Неверное время события')
    const serialized = canonical(data)
    return this.store.transaction(() => {
      const old = this.db.prepare('SELECT * FROM executor_events WHERE command_id=?').get(commandId)
      if (old) {
        requireThat(old.executor === executor && old.kind === kind && old.at === at && old.data === serialized,
          'IDEMPOTENCY_CONFLICT', 'ID события уже использован')
        return { ...this.row(executor), replayed: true }
      }
      const row = this.row(executor), next = update(row)
      this.db.prepare(`INSERT INTO executor_status VALUES (?,?,?,?) ON CONFLICT(executor) DO UPDATE SET
        observation=excluded.observation,blocks=excluded.blocks,revision=excluded.revision`)
        .run(executor, next.observation ? canonical(next.observation) : null, canonical(next.blocks), row.revision + 1)
      this.db.prepare('INSERT INTO executor_events(command_id,executor,kind,at,data) VALUES (?,?,?,?,?)')
        .run(commandId, executor, kind, at, serialized)
      return { ...this.row(executor), replayed: false }
    })
  }
  observe(input, commandId = randomUUID()) {
    const sample = observation(input)
    return this.change(sample.executor, commandId, 'observed', sample.observedAt, sample, row => {
      requireThat(!row.observation || sample.observedAt >= row.observation.observedAt, 'STALE_OBSERVATION', 'Получен устаревший статус')
      requireThat(!row.observation || sample.observedAt !== row.observation.observedAt || canonical(sample) === canonical(row.observation),
        'STALE_OBSERVATION', 'Противоречащие статусы с одинаковым временем')
      return { observation: sample, blocks: row.blocks.filter(block => !resolvedBlock(block, sample)) }
    })
  }
  failure(executor, failure, at, commandId = randomUUID()) {
    const block = failureBlock(failure, at)
    if (!block) return { ...this.row(executor), recorded: false } // no raw provider error stored
    return this.change(executor, commandId, 'blocked', at, block, row => {
      const previous = row.blocks.find(item => item.kind === block.kind)
      requireThat(!previous || at >= previous.at, 'STALE_OBSERVATION', 'Получена устаревшая ошибка')
      // A newer verified quota probe may already have resolved a late-delivered error.
      return { observation: row.observation, blocks: [...row.blocks.filter(item => item.kind !== block.kind),
        ...(resolvedBlock(block, row.observation) ? [] : [block])] }
    })
  }
  confirmRecovery(executor, { kind, evidence, at, commandId = randomUUID(), source }) {
    requireThat(['quota','auth'].includes(kind) && source === 'user-confirmation', 'INVALID_INPUT', 'Нужно явное подтверждение восстановления')
    text(evidence, 'evidence', 1000)
    return this.change(executor, commandId, 'recovery.confirmed', at, { kind, evidence, source }, row => {
      requireThat(row.blocks.some(block => block.kind === kind && at > block.at), 'INVALID_STATE', 'Нет более ранней блокировки этого типа')
      return { observation: row.observation, blocks: row.blocks.filter(block => block.kind !== kind) }
    })
  }
  events() {
    return this.db.prepare('SELECT seq,command_id,executor,kind,at,data FROM executor_events ORDER BY seq').all()
      .map(row => ({ seq: row.seq, commandId: row.command_id, executor: row.executor, kind: row.kind, at: row.at, data: JSON.parse(row.data) }))
  }
}
