// Durable execution records for one workspace; not a dispatcher or an agent-writer lock.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { requireThat, text, canonical, requestData, checkpointData, emptyCheckpoint } from './task-contract.mjs'
import { AVAILABILITY_SCHEMA } from './executor-registry.mjs'

const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
const now = () => new Date().toISOString()
const decode = value => JSON.parse(value)
const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE tasks (task_id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL,
 request_hash TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL,
 checkpoint TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE attempts (attempt_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(task_id),
 executor TEXT NOT NULL, requested_model TEXT, actual_model TEXT, session_id TEXT,
 delivery_id TEXT UNIQUE NOT NULL, state TEXT NOT NULL, reason TEXT,
 started_at TEXT NOT NULL, ended_at TEXT, slot INTEGER NOT NULL DEFAULT 1);
CREATE UNIQUE INDEX one_unresolved_attempt ON attempts(slot)
 WHERE state IN ('prepared','sending','running','uncertain');
CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, command_id TEXT UNIQUE NOT NULL,
 task_id TEXT NOT NULL REFERENCES tasks(task_id), kind TEXT NOT NULL, input_hash TEXT NOT NULL,
 at TEXT NOT NULL, data TEXT NOT NULL, result TEXT NOT NULL);
PRAGMA user_version=1;`

// An uncertain attempt blocks only its own task: later messages are independent,
// and the direct runner serializes turns anyway. Only a live attempt holds the slot.
const MIGRATION_3 = `
DROP INDEX IF EXISTS one_unresolved_attempt;
DROP INDEX IF EXISTS one_live_attempt;
CREATE UNIQUE INDEX one_live_attempt ON attempts(slot) WHERE state IN ('prepared','sending','running');
PRAGMA user_version=3;`

export class TaskStore {
  constructor({ file, workspace, readOnly = false }) {
    text(file, 'file'); this.readOnly = readOnly
    if (!readOnly) mkdirSync(dirname(resolve(file)), { recursive: true })
    this.db = new DatabaseSync(resolve(file), { readOnly })
    try {
      this.db.exec('PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON;')
      if (!readOnly) this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
      this.transaction(() => {
        const version = this.db.prepare('PRAGMA user_version').get().user_version
        requireThat([1,2,3].includes(version) || (!readOnly && version === 0), 'SCHEMA_VERSION', 'Неизвестная версия хранилища')
        if (!version) {
          text(workspace, 'workspace'); this.db.exec(SCHEMA)
          this.db.prepare('INSERT INTO meta VALUES (?,?)').run('workspace', resolve(workspace))
        }
        this.workspace = this.db.prepare('SELECT value FROM meta WHERE key=?').get('workspace')?.value
        requireThat(typeof this.workspace === 'string', 'CORRUPT_STORE', 'Нет workspace')
        requireThat(!workspace || resolve(workspace) === this.workspace, 'WRONG_WORKSPACE', 'Хранилище другой рабочей папки')
        if (version < 2 && !readOnly) this.db.exec(AVAILABILITY_SCHEMA)
        if (version < 3 && !readOnly) this.db.exec(MIGRATION_3)
      }, readOnly)
    } catch (error) { this.db.close(); throw error }
  }
  close() { this.db.close() }
  transaction(work, read = false) {
    if (this.inTransaction && read) return work()
    requireThat(!this.inTransaction, 'TRANSACTION_ACTIVE', 'Вложенная запись запрещена')
    requireThat(read || !this.readOnly, 'READ_ONLY', 'Хранилище открыто только для чтения')
    this.db.exec(read ? 'BEGIN' : 'BEGIN IMMEDIATE')
    this.inTransaction = true
    try { const result = work(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
    finally { this.inTransaction = false }
  }
  row(taskId) {
    const row = this.db.prepare('SELECT * FROM tasks WHERE task_id=?').get(text(taskId, 'taskId', 200))
    requireThat(row, 'NOT_FOUND', 'Задача не найдена'); return row
  }
  attempt(taskId, attemptId) {
    const row = this.db.prepare('SELECT * FROM attempts WHERE task_id=? AND attempt_id=?').get(taskId, attemptId)
    requireThat(row, 'NOT_FOUND', 'Попытка не найдена'); return row
  }
  get(taskId) {
    return this.transaction(() => this.snapshot(taskId), true)
  }
  snapshot(taskId) {
    const row = this.row(taskId)
    return { taskId: row.task_id, requestKey: row.request_key, workspace: this.workspace,
      ...decode(row.payload), state: row.state, checkpoint: decode(row.checkpoint), revision: row.revision,
      createdAt: row.created_at, updatedAt: row.updated_at,
      attempts: this.db.prepare('SELECT * FROM attempts WHERE task_id=? ORDER BY rowid').all(taskId).map(a => ({
        attemptId: a.attempt_id, executor: a.executor, requestedModel: decode(a.requested_model),
        actualModel: decode(a.actual_model), usage: null, cost: null, costCurrency: null,
        sessionId: a.session_id, deliveryId: a.delivery_id,
        state: a.state, reason: a.reason, startedAt: a.started_at, endedAt: a.ended_at,
      })) }
  }
  list() {
    return this.transaction(() => this.db.prepare('SELECT task_id FROM tasks ORDER BY rowid').all()
      .map(row => this.get(row.task_id)), true)
  }
  events(taskId) {
    this.row(taskId)
    return this.db.prepare('SELECT * FROM events WHERE task_id=? ORDER BY seq').all(taskId).map(row => ({
      seq: row.seq, commandId: row.command_id, kind: row.kind, at: row.at, data: decode(row.data),
    }))
  }
  event(commandId, taskId, kind, input, result, data = input) {
    this.db.prepare('INSERT INTO events(command_id,task_id,kind,input_hash,at,data,result) VALUES (?,?,?,?,?,?,?)')
      .run(commandId, taskId, kind, digest(input), now(), canonical(data), canonical(result))
  }
  replay(commandId, taskId, kind, input) {
    text(commandId, 'commandId', 200)
    const old = this.db.prepare('SELECT * FROM events WHERE command_id=?').get(commandId)
    if (!old) return null
    requireThat(old.task_id === taskId && old.kind === kind && old.input_hash === digest(input),
      'IDEMPOTENCY_CONFLICT', 'ID команды уже использован для другого действия')
    return { ...decode(old.result), replayed: true }
  }
  create({ requestKey, commandId, ...input }) {
    text(requestKey, 'requestKey', 500); text(commandId, 'commandId', 200)
    const payload = requestData(input), fingerprint = digest(payload)
    return this.transaction(() => {
      const old = this.db.prepare('SELECT * FROM tasks WHERE request_key=?').get(requestKey)
      if (old) {
        requireThat(old.request_hash === fingerprint, 'IDEMPOTENCY_CONFLICT', 'Сообщение с этим ID уже имеет другой текст')
        const replay = this.replay(commandId, old.task_id, 'task.created', payload)
        if (!replay) this.event(commandId, old.task_id, 'task.created', payload, { taskId: old.task_id })
        return { task: this.get(old.task_id), replayed: true }
      }
      requireThat(!this.db.prepare('SELECT 1 FROM events WHERE command_id=?').get(commandId),
        'IDEMPOTENCY_CONFLICT', 'ID команды уже использован')
      const taskId = randomUUID(), at = now()
      this.db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?)').run(taskId, requestKey, fingerprint,
        canonical(payload), 'queued', canonical(emptyCheckpoint()), 0, at, at)
      this.event(commandId, taskId, 'task.created', payload, { taskId })
      return { task: this.get(taskId), replayed: false }
    })
  }
  change(taskId, { commandId, expectedRevision }, kind, input, work) {
    return this.transaction(() => {
      const repeated = this.replay(commandId, taskId, kind, input)
      if (repeated) return { ...repeated, task: this.get(taskId) }
      const task = this.row(taskId)
      requireThat(Number.isInteger(expectedRevision) && expectedRevision === task.revision,
        'STALE_REVISION', 'Состояние задачи изменилось; перечитай его')
      const result = work(task) ?? {}
      this.db.prepare('UPDATE tasks SET revision=revision+1,updated_at=? WHERE task_id=?').run(now(), taskId)
      // полная точка продолжения живёт в tasks.checkpoint; в журнал — её хэш (14 616 событий до 54 КБ
      // раздули базу до 150 МБ). Сверка повтора команды идёт по input_hash — он считается от полного входа, как раньше.
      const data = kind === 'task.checkpoint' ? { attemptId: input.attemptId, checkpointHash: digest(input.checkpoint) } : input
      this.event(commandId, taskId, kind, input, result, data)
      return { ...result, task: this.get(taskId), replayed: false }
    })
  }
  begin(taskId, { executor, requestedModel = null, sessionId = null, ...command }) {
    text(executor, 'executor', 100); canonical(requestedModel)
    if (sessionId !== null) text(sessionId, 'sessionId', 500)
    return this.change(taskId, command, 'attempt.prepared', { executor, requestedModel, sessionId }, task => {
      requireThat(['queued','waiting_provider','handoff_pending'].includes(task.state), 'INVALID_STATE', 'Задача не готова к новой попытке')
      // A live attempt anywhere forbids a second executor. An uncertain attempt only blocks
      // its own task (no replay) — later messages are independent and must not be silenced.
      requireThat(!this.db.prepare(`SELECT 1 FROM attempts WHERE state IN ('prepared','sending','running')
        OR (state='uncertain' AND task_id=?)`).get(taskId),
        'ATTEMPT_ACTIVE', 'Предыдущая попытка ещё не разрешена; второго исполнителя не запускаем')
      requireThat(!decode(task.checkpoint).unknownOutcomes.length, 'UNCERTAIN', 'Есть неизвестные исходы действий')
      const attemptId = randomUUID(), deliveryId = randomUUID()
      this.db.prepare(`INSERT INTO attempts(attempt_id,task_id,executor,requested_model,actual_model,session_id,
        delivery_id,state,started_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(attemptId, taskId, executor, canonical(requestedModel), 'null', sessionId, deliveryId, 'prepared', now())
      this.db.prepare("UPDATE tasks SET state='running' WHERE task_id=?").run(taskId)
      return { attemptId, deliveryId }
    })
  }
  claimDispatch(taskId, attemptId, command) {
    const result = this.change(taskId, command, 'attempt.sending', { attemptId }, () => {
      const attempt = this.attempt(taskId, attemptId)
      requireThat(attempt.state === 'prepared', 'INVALID_STATE', 'Отправка уже начата; повтор запрещён')
      this.db.prepare("UPDATE attempts SET state='sending' WHERE attempt_id=?").run(attemptId)
      return { attemptId, deliveryId: attempt.delivery_id }
    })
    // A replayed receipt is never permission to call an executor a second time.
    return { ...result, dispatchAllowed: !result.replayed }
  }
  acknowledge(taskId, attemptId, { sessionId, actualModel = null, ...command }) {
    text(sessionId, 'sessionId', 500); canonical(actualModel)
    return this.change(taskId, command, 'attempt.acknowledged', { attemptId, sessionId, actualModel }, () => {
      requireThat(this.attempt(taskId, attemptId).state === 'sending', 'INVALID_STATE', 'Нет ожидаемой отправки')
      this.db.prepare("UPDATE attempts SET state='running',session_id=?,actual_model=? WHERE attempt_id=?")
        .run(sessionId, canonical(actualModel), attemptId)
      return { attemptId }
    })
  }
  checkpoint(taskId, attemptId, { checkpoint, ...command }) {
    return this.change(taskId, command, 'task.checkpoint', { attemptId, checkpoint }, task => {
      requireThat(['prepared','sending','running'].includes(this.attempt(taskId, attemptId).state),
        'INVALID_STATE', 'Эта попытка не может обновить точку продолжения')
      const value = checkpointData(checkpoint, decode(task.checkpoint))
      this.db.prepare('UPDATE tasks SET checkpoint=? WHERE task_id=?').run(canonical(value), taskId)
      return { attemptId }
    })
  }
  finish(taskId, attemptId, { outcome, reason, stoppedConfirmed = false, ...command }) {
    text(reason, 'reason'); requireThat(['completed','provider_blocked','failed','uncertain'].includes(outcome),
      'INVALID_INPUT', 'Неизвестный исход попытки')
    return this.change(taskId, command, 'attempt.finished', { attemptId, outcome, reason, stoppedConfirmed }, task => {
      const attempt = this.attempt(taskId, attemptId)
      requireThat(['prepared','sending','running'].includes(attempt.state), 'INVALID_STATE', 'Попытка уже остановлена; нужна явная сверка')
      requireThat(outcome === 'uncertain' || stoppedConfirmed === true, 'STOP_UNCONFIRMED', 'Остановка исполнителя не подтверждена')
      requireThat(outcome !== 'completed' || attempt.state === 'running', 'INVALID_STATE', 'Нет подтверждённого начала выполнения')
      requireThat(outcome === 'uncertain' || !decode(task.checkpoint).unknownOutcomes.length,
        'UNCERTAIN', 'Нужна сверка неизвестных исходов')
      const state = { completed: 'completed', provider_blocked: 'waiting_provider', failed: 'failed', uncertain: 'uncertain' }[outcome]
      this.db.prepare('UPDATE attempts SET state=?,reason=?,ended_at=? WHERE attempt_id=?')
        .run(outcome === 'provider_blocked' ? 'stopped' : state, reason, outcome === 'uncertain' ? null : now(), attemptId)
      this.db.prepare('UPDATE tasks SET state=? WHERE task_id=?').run(state, taskId)
      return { attemptId }
    })
  }
  attachInput(taskId, parentTaskId, attemptId, command) {
    return this.change(taskId, command, 'input.attached', { parentTaskId, attemptId }, task => {
      requireThat(taskId !== parentTaskId && task.state === 'queued', 'INVALID_STATE', 'Сообщение уже передано')
      requireThat(!this.db.prepare('SELECT 1 FROM attempts WHERE task_id=?').get(taskId), 'INVALID_STATE', 'У сообщения уже была попытка')
      requireThat(['sending', 'running'].includes(this.attempt(parentTaskId, attemptId).state), 'INVALID_STATE', 'Ход уже завершён')
      this.db.prepare('UPDATE tasks SET state=? WHERE task_id=?').run('running', taskId)
    })
  }
  finishInput(taskId, { outcome, notAccepted = false, ...command }) {
    requireThat(['completed', 'uncertain', 'queued'].includes(outcome), 'INVALID_INPUT', 'Неверный исход доставки')
    return this.change(taskId, command, 'input.finished', { outcome, notAccepted }, task => {
      requireThat(task.state === 'running', 'INVALID_STATE', 'Сообщение не передаётся')
      const linked = this.db.prepare("SELECT data FROM events WHERE task_id=? AND kind='input.attached' ORDER BY seq DESC LIMIT 1").get(taskId)
      requireThat(linked, 'INVALID_STATE', 'Нет связи с ходом')
      const { parentTaskId, attemptId } = decode(linked.data)
      const parent = this.attempt(parentTaskId, attemptId)
      requireThat(outcome !== 'completed' || parent.state === 'completed', 'INVALID_STATE', 'Нет подтверждённого результата')
      requireThat(outcome !== 'queued' || notAccepted, 'UNCERTAIN', 'Нет подтверждённого отказа доставки')
      this.db.prepare('UPDATE tasks SET state=? WHERE task_id=?').run(outcome, taskId)
    })
  }
  reconcile(taskId, attemptId, { resolution, evidence, checkpoint, stoppedConfirmed, ...command }) {
    text(evidence, 'evidence')
    requireThat(['completed','not_sent','stopped'].includes(resolution) && stoppedConfirmed === true,
      'INVALID_INPUT', 'Нужны результат сверки и подтверждённая остановка')
    return this.change(taskId, command, 'attempt.reconciled', { attemptId, resolution, evidence, checkpoint, stoppedConfirmed }, task => {
      requireThat(['sending','running','uncertain'].includes(this.attempt(taskId, attemptId).state),
        'INVALID_STATE', 'Сверка этой попытки не требуется')
      const value = checkpointData(checkpoint, decode(task.checkpoint))
      requireThat(!value.unknownOutcomes.length, 'UNCERTAIN', 'Сверка не разрешила неизвестные исходы')
      this.db.prepare('UPDATE attempts SET state=?,reason=?,ended_at=? WHERE attempt_id=?')
        .run(resolution === 'completed' ? 'completed' : 'stopped', evidence, now(), attemptId)
      this.db.prepare('UPDATE tasks SET state=?,checkpoint=? WHERE task_id=?')
        .run(resolution === 'completed' ? 'completed' : 'handoff_pending', canonical(value), taskId)
      return { attemptId }
    })
  }
}
