// Stage 3: one task, one safe external action, explicit handoff between executors.
// Pure orchestration over TaskStore + ExecutorRegistry. It sends nothing itself:
// executors are injected adapters, probes and agent_shift stay the caller's responsibility.
import { requireThat } from './task-contract.mjs'

const LIVE = ['prepared', 'sending', 'running']
const OPEN = [...LIVE, 'uncertain']

export class TaskController {
  constructor({ store, registry, executors, writer = null, clock = Date.now, requirements = {}, log = () => {} }) {
    requireThat(store && registry && executors, 'INVALID_INPUT', 'Нужны store, registry и адаптеры исполнителей')
    this.store = store; this.registry = registry; this.executors = executors
    this.writer = writer; this.clock = clock; this.requirements = requirements; this.log = log
  }

  submit(input) {
    return this.store.create(input)
  }

  openAttempt(task) {
    return task.attempts.find(attempt => OPEN.includes(attempt.state)) || null
  }

  decision(task, options = {}) {
    const active = this.openAttempt(task)
    return this.registry.select({ ...this.requirements, ...options, images: task.constraints.images === true || this.requirements.images === true, now: this.clock(),
      activeAttempt: active ? { state: active.state, executor: active.executor } : undefined })
  }

  async status(taskId) {
    const task = this.store.get(taskId)
    const active = this.openAttempt(task)
    const decision = this.decision(task)
    const reason = active ? decision.reason : decision.action === 'select' ? decision.reason : decision.reason
    return { taskId, state: task.state, revision: task.revision, checkpoint: task.checkpoint,
      executor: active?.executor ?? null, attemptId: active?.attemptId ?? null, attemptState: active?.state ?? null,
      decision, paused: decision.action === 'wait' && !LIVE.includes(active?.state), reason }
  }

  // Reserves one dispatch on disk; never starts a second call while an attempt is unresolved.
  // readOnly lets the caller speak while a foreign writer holds the folder: the adapter is expected
  // to run without writes, so the gate protects only what this call cannot touch.
  async prepare(taskId, { readOnly = false, ...options } = {}) {
    let task = this.store.get(taskId)
    if (['completed', 'failed'].includes(task.state)) return { action: 'done', state: task.state, executor: null }
    const active = this.openAttempt(task)
    if (active) {
      const keep = LIVE.includes(active.state)
      return { action: keep ? 'keep' : 'wait', executor: active.executor, attemptId: active.attemptId,
        reason: keep ? 'active_attempt' : 'reconcile_required' }
    }
    if (this.writer && !readOnly) {
      const permission = await this.writer()
      if (!permission || permission.allowed !== true) {
        return { action: 'wait', reason: 'writer_busy', detail: permission?.owner ?? null }
      }
    }
    const decision = this.decision(task, options)
    if (decision.action !== 'select') return { action: 'wait', reason: decision.reason, candidates: decision.candidates }
    const executor = decision.executor
    const ordinal = task.attempts.length + 1
    const started = this.store.begin(taskId, {
      commandId: `begin:${taskId}:${ordinal}`, expectedRevision: task.revision, executor,
      requestedModel: this.registry.row(executor).observation?.model ?? null })
    const claim = this.store.claimDispatch(taskId, started.attemptId, {
      commandId: `dispatch:${started.deliveryId}`, expectedRevision: started.task.revision })
    // Delivery is claimed on disk before the call; a replayed claim never authorizes a repeat.
    if (!claim.dispatchAllowed) return { action: 'wait', reason: 'dispatch_not_allowed', executor, attemptId: started.attemptId }
    task = this.store.get(taskId)
    return { action: 'dispatch', executor, attemptId: started.attemptId, deliveryId: started.deliveryId, task, readOnly }
  }

  async step(taskId, options = {}) {
    const prepared = await this.prepare(taskId, options)
    if (prepared.action !== 'dispatch') return prepared
    const attempt = { attemptId: prepared.attemptId, deliveryId: prepared.deliveryId, executor: prepared.executor }
    const adapter = this.executors[prepared.executor]
    if (typeof adapter !== 'function') return this.failed(taskId, attempt, { kind: 'adapter_missing', stoppedConfirmed: true })
    let result
    try {
      result = await adapter({ task: prepared.task, attempt, readOnly: prepared.readOnly === true })
    } catch (error) {
      return this.failed(taskId, attempt, error)
    }
    // Invalid adapter output must not leave the attempt running without an explanation.
    try { return this.succeeded(taskId, attempt, result) }
    catch (error) { return this.finishUncertain(taskId, attempt, 'invalid_adapter_result: ' + error.message) }
  }

  succeeded(taskId, attempt, result) {
    requireThat(result && typeof result === 'object', 'INVALID_INPUT', 'Адаптер не вернул результат')
    // Without a session the store cannot prove the turn really started; keep it uncertain.
    if (typeof result.sessionId !== 'string' || !result.sessionId.trim()) {
      return this.finishUncertain(taskId, attempt, 'missing_session', result)
    }
    const current = this.store.get(taskId).attempts.find(value => value.attemptId === attempt.attemptId)
    if (current?.state === 'running') requireThat(current.sessionId === result.sessionId,
      'INVALID_INPUT', 'Завершение относится к другой сессии')
    else this.store.acknowledge(taskId, attempt.attemptId, { commandId: `ack:${attempt.attemptId}`,
      expectedRevision: this.store.get(taskId).revision, sessionId: result.sessionId,
      actualModel: result.actualModel ?? null })
    if (result.checkpoint) this.checkpointOrDrop(taskId, attempt.attemptId, result.checkpoint)
    this.store.finish(taskId, attempt.attemptId, { commandId: `finish:${attempt.attemptId}`,
      expectedRevision: this.store.get(taskId).revision, outcome: 'completed',
      reason: result.reason ?? 'executor_reported_completed', stoppedConfirmed: true })
    return { action: 'completed', executor: attempt.executor, attemptId: attempt.attemptId, sessionId: result.sessionId }
  }

  // A malformed or oversized checkpoint must never keep an attempt open: closing
  // the attempt matters more than the step ledger.
  checkpointOrDrop(taskId, attemptId, checkpoint) {
    try {
      this.store.checkpoint(taskId, attemptId, { commandId: `checkpoint:${attemptId}`,
        expectedRevision: this.store.get(taskId).revision, checkpoint })
    } catch (error) {
      if (error?.code !== 'INVALID_INPUT') throw error
      this.log('checkpoint rejected: ' + error.message)
    }
  }

  failed(taskId, attempt, error) {
    const failure = error?.failure ?? error ?? {}
    const checkpoint = failure.checkpoint ?? null
    const block = this.registry.failure(attempt.executor, failure, this.clock(),
      `block:${attempt.attemptId}`)
    const blockKind = failure.kind === 'quota_exhausted' ? 'quota' : failure.kind === 'authentication' ? 'auth'
      : ['rate_limited', 'service_transient', 'no_response'].includes(failure.kind) || failure.status === 429 ? 'cooldown' : null
    const blocked = blockKind !== null && Array.isArray(block?.blocks) && block.blocks.some(item => item.kind === blockKind)
    const kind = failure.kind ?? 'unknown'
    const stopped = failure.stoppedConfirmed === true
    let outcome = ['quota_exhausted', 'authentication', 'rate_limited', 'service_transient', 'no_response'].includes(kind) ||
      failure.status === 429 ? 'provider_blocked'
      : kind === 'policy_refusal' ? 'failed'
      : 'uncertain'
    // A structured quota/auth/rate signal is not enough without a confirmed stop.
    if (!stopped && outcome !== 'uncertain') outcome = 'uncertain'
    if (checkpoint?.unknownOutcomes?.length) outcome = 'uncertain'
    const reason = failure.reason ?? error?.message ?? kind
    if (checkpoint && ['provider_blocked', 'uncertain'].includes(outcome))
      this.checkpointOrDrop(taskId, attempt.attemptId, checkpoint)
    if (outcome === 'uncertain') return this.finishUncertain(taskId, attempt, reason)
    const finished = this.store.finish(taskId, attempt.attemptId, { commandId: `finish:${attempt.attemptId}`,
      expectedRevision: this.store.get(taskId).revision, outcome, reason, stoppedConfirmed: stopped })
    return { action: outcome === 'provider_blocked' ? 'handoff' : 'stopped', executor: attempt.executor,
      attemptId: attempt.attemptId, reason, kind, blocked, state: finished.task.state }
  }

  finishUncertain(taskId, attempt, reason, extra = {}) {
    if (extra.checkpoint) this.checkpointOrDrop(taskId, attempt.attemptId, extra.checkpoint)
    this.store.finish(taskId, attempt.attemptId, { commandId: `finish:${attempt.attemptId}`,
      expectedRevision: this.store.get(taskId).revision, outcome: 'uncertain', reason, stoppedConfirmed: false })
    return { action: 'uncertain', executor: attempt.executor, attemptId: attempt.attemptId, reason }
  }

  reconcile(taskId, attemptId, input) {
    return this.store.reconcile(taskId, attemptId, input)
  }
}
