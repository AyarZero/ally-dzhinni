// Bridge-side task core: real TaskStore/registry/controller + writer lease.
// One bridge instance owns one stable lease ID. Probes are metadata-only.
import { execFile } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { TaskStore } from '../core/task-store.mjs'
import { ExecutorRegistry } from '../core/executor-registry.mjs'
import { TaskController } from '../core/task-controller.mjs'
import { refreshExecutors } from './executor-probes.mjs'
import { MAX_AGE_MS } from '../core/availability-policy.mjs'
import { ExecutorSelection } from './executor-selection.mjs'
import { ROUTE_ORDER } from './task-router.mjs'

const python = () => process.env.DZHINNI_PYTHON || 'python'
// The three engines were re-probed in the path of every turn once the
// last check was older than a minute. Now a check up to 15 minutes old
// lets the turn go while a new one runs in the background; a quota or login failure of the turn is handled as before.
export const DISPATCH_MAX_AGE_MS = 15 * 60e3

function shiftRunner(root) {
  return args => new Promise((resolvePromise, reject) => {
    execFile(python(), [join(root, 'act', 'scripts', 'agent_shift.py'), ...args, '--root', root],
      { cwd: root, windowsHide: true, timeout: 15000 }, (error, stdout) => {
        const line = String(stdout || '').trim().split('\n').pop()
        let value
        try { value = JSON.parse(line) } catch { reject(error || new Error('agent_shift: нет JSON')); return }
        // exit 2 = occupied, 1 = error; the JSON still explains both.
        if (error && error.code !== 1 && error.code !== 2) reject(error)
        else resolvePromise(value)
      })
  })
}

export class TaskCore {
  constructor({ repo, db = join(repo, 'projects', 'dzhinni', '.core-data', 'tasks.sqlite'),
    agent = 'codex', session, shift, probes = {}, clock = Date.now, direct = false }) {
    this.repo = repo; this.db = db; this.agent = agent; this.clock = clock
    // Префикс «qoder-bridge-» — историческое имя служебного идентификатора смены писателя. НЕ менять: по нему
    // мост узнаёт свою же действующую смену в agent_shift после перезапуска (живые данные).
    this.session = session || 'qoder-bridge-' + createHash('sha1').update(resolve(db)).digest('hex').slice(0, 12)
    this.shift = shift || shiftRunner(repo)
    this.probes = probes; this.leaseHeld = false; this.lastRefresh = 0; this.last = null
    // Direct mode can speak without the folder: both enabled engines take a read-only sandbox.
    this.readOnlyFallback = direct
    // Claude Code is selectable by hand; it joins the auto order only after a live check.
    // Порядок «Авто» тот же, что у маршрутизатора (task-router ROUTE_ORDER): ядро решает само, когда
    // сведения маршрутизатора устарели, и раньше шло по другому списку (Codex первым).
    this.enabledExecutors = ['codex', 'claude', 'deepseek', 'antigravity']
    this.selection = new ExecutorSelection(join(dirname(db), 'selection.json'),
      { executors: this.enabledExecutors, order: ROUTE_ORDER })
    this.store = new TaskStore({ file: db, workspace: repo })
    this.registry = new ExecutorRegistry(this.store, { clock })
    this.controller = new TaskController({ store: this.store, registry: this.registry,
      executors: Object.fromEntries(this.enabledExecutors.map(id => [id, () => {}])), clock,
      writer: async () => {
        const state = await this.shiftState()
        return state.ours ? { allowed: true } : { allowed: false, owner: state.writer?.agent || state.status }
      } })
    // Dispatch accepts the background-refreshed observation (DISPATCH_MAX_AGE_MS), not only the last minute's.
    const options = this.selection.options.bind(this.selection)
    this.selection.options = () => ({ maxAgeMs: DISPATCH_MAX_AGE_MS, ...options() })
    Object.defineProperty(this.controller, 'requirements', { get: () => this.selection.options() })
  }

  close() { try { this.store.close() } catch {} }

  async refresh() {
    const rows = await refreshExecutors({ registry: this.registry, repo: this.repo, clock: this.clock, ...this.probes,
      enabledExecutors: this.enabledExecutors })
    this.lastRefresh = this.clock()
    return rows
  }

  async ensureFresh() {
    const rows = this.registry.list().filter(row => this.enabledExecutors.includes(row.executor))
    const age = row => !row.observation ? Infinity : this.clock() - row.observation.observedAt
    if (!rows.some(row => age(row) > MAX_AGE_MS)) return
    const run = this.refreshing ||= this.refresh().finally(() => { this.refreshing = null })
    // The turn waits only when nothing usable is known. One engine whose check keeps failing (no
    // observation at all) must not make every turn wait for the whole 17 s check; it stays ineligible meanwhile.
    if (!rows.length || rows.every(row => age(row) > DISPATCH_MAX_AGE_MS)) await run
    else run.catch(() => {})
  }

  // Route decision for a new message; never sends work and never changes router.json.
  async route() {
    await this.ensureFresh()
    const decision = this.registry.select({ ...this.selection.options(), now: this.clock() })
    this.remember({ action: decision.action, executor: decision.executor, reason: decision.reason })
    return decision
  }

  // executorHint only labels the reservation: the lease must name the engine that will write.
  async acquire(executorHint = this.agent) {
    // A cached flag is not a lease: another process may have released/replaced the file.
    const state = await this.shiftState()
    const status = { status: state.status, reservation: state.writer }
    if (status.status === 'busy') {
      if (state.ours) {
        this.leaseAgent = status.reservation.agent
        this.leaseHeld = true
        return { allowed: true, inherited: true }
      }
      this.remember({ action: 'wait', reason: 'writer_busy', owner: status.reservation?.agent ?? null })
      return { allowed: false, owner: status.reservation?.agent ?? null, writer: status.reservation ?? null }
    }
    if (status.status !== 'free') {
      this.remember({ action: 'wait', reason: 'writer_corrupt' })
      return { allowed: false, owner: 'corrupt' }
    }
    const leaseAgent = this.enabledExecutors.includes(executorHint) ? executorHint : this.agent
    const result = await this.shift(['acquire', '--agent', leaseAgent,
      '--session', this.session, '--scope', 'dzhinni task ' + this.session])
    if (result.acquired === true) { this.leaseAgent = leaseAgent; this.leaseHeld = true; return { allowed: true, inherited: false } }
    this.remember({ action: 'wait', reason: 'writer_busy', owner: result.reservation?.agent ?? 'busy' })
    return { allowed: false, owner: result.reservation?.agent ?? 'busy', writer: result.reservation ?? null }
  }

  // Who holds the folder right now — for the window, without taking anything.
  async shiftState() {
    this.leaseHeld = false; this.leaseAgent = undefined
    const status = await this.shift(['status'])
    const ours = status.status === 'busy' && status.reservation?.session === this.session &&
      typeof status.reservation?.agent === 'string'
    this.leaseHeld = ours
    if (ours) this.leaseAgent = status.reservation.agent
    return { status: status.status, writer: status.reservation ?? null, error: status.error ?? null,
      ours }
  }

  // Snapshot for the prompt, taken immediately before starting the executor.
  async executorLease() {
    const state = await this.shiftState()
    return { ...state, lease: state.ours ? { agent: state.writer.agent, session: this.session } : null }
  }

  // The owner asked to clear someone else's forgotten shift from the window. Only a human action calls this.
  async releaseForeign() {
    const state = await this.shiftState()
    if (state.status === 'free') return { status: 'free', skipped: true }
    if (state.status !== 'busy' || !state.writer?.session) return { status: state.status, error: state.error ?? 'нечего снимать' }
    this.leaseHeld = false; this.leaseAgent = undefined
    let result
    try { result = await this.shift(['release', '--session', state.writer.session, '--force']) }
    finally { await this.shiftState() }
    if (result.released === true) this.remember({ action: 'shift_released', owner: state.writer.agent, freed: state.writer.session })
    return result
  }

  async release() {
    const state = await this.shiftState()
    if (!state.ours) return { status: state.status, skipped: true }
    this.leaseHeld = false; this.leaseAgent = undefined
    // Reconcile even a missing file or an ambiguous release; never repeat the release blindly.
    try { return await this.shift(['release', '--session', this.session]) }
    finally { await this.shiftState() }
  }

  remember(patch) { this.last = { ...(this.last || {}), ...patch, at: new Date().toISOString() } }

  // Creates the durable task, acquires the lease and claims delivery before an external call.
  async begin({ messageId, content, goal, rules = ['coordination/CORE.md'], constraints = {} }) {
    let taskId = null
    try {
      const key = 'msg:' + messageId
      const { task } = this.controller.submit({ requestKey: key, commandId: 'create:' + key,
        userRequest: content, goal: goal || String(content).slice(0, 500),
        acceptance: ['Ответ исполнителя получен'], rules,
        constraints: { ...constraints, paidApiBudget: 0 } })
      taskId = task.taskId
      await this.ensureFresh()
      const decision = this.controller.decision(task)
      const lease = await this.acquire(decision.executor || this.agent)
      let readOnly = false, writer = null
      if (!lease.allowed) {
        if (!this.readOnlyFallback) return { action: 'wait', reason: 'writer_busy', owner: lease.owner, taskId }
        readOnly = true; writer = lease.writer
      }
      const prepared = await this.controller.prepare(task.taskId, { readOnly })
      if (prepared.action !== 'dispatch') {
        // Keep the lease while an attempt still owns the workspace.
        if (!readOnly && !['active_attempt', 'reconcile_required'].includes(prepared.reason)) await this.release()
        return { action: 'wait', reason: prepared.reason, taskId: task.taskId, readOnly, writer }
      }
      this.remember({ action: 'dispatch', executor: prepared.executor, taskId: task.taskId, readOnly,
        owner: writer?.agent ?? null })
      return { ...prepared, taskId: task.taskId, readOnly, writer }
    } catch (error) {
      // Another unresolved attempt (possibly from a crash) blocks a second executor.
      if (['ATTEMPT_ACTIVE', 'UNCERTAIN', 'INVALID_STATE'].includes(error.code)) {
        this.remember({ action: 'wait', reason: 'active_attempt_elsewhere', taskId })
        return { action: 'wait', reason: 'active_attempt_elsewhere', taskId }
      }
      await this.release()
      throw error
    }
  }

  // route (optional): the first circle's per-task assignment. It never changes the saved selection;
  // it only labels this dispatch, with the runner keeping the global mode untouched.
  async resume(taskId, route = null) {
    const mark = [Date.now()]
    this.timing = mark
    await this.ensureFresh(); mark.push(Date.now())
    const current = this.store.get(taskId)
    const override = route?.executor ? { preference: route.executor,
      routedBy: route.source === 'jinny' ? 'jinny' : route.source === 'user' ? 'user' : undefined } : {}
    const decision = this.controller.decision(current, override)
    mark.push(Date.now())
    const lease = await this.acquire(decision.executor || this.agent); mark.push(Date.now())
    let readOnly = false, writer = null
    if (!lease.allowed) {
      if (!this.readOnlyFallback) return { action: 'wait', reason: 'writer_busy', owner: lease.owner, taskId }
      readOnly = true; writer = lease.writer
    }
    try {
      const prepared = await this.controller.prepare(taskId, { readOnly, ...override }); mark.push(Date.now())
      if (prepared.action !== 'dispatch') {
        if (!readOnly && !['active_attempt', 'reconcile_required'].includes(prepared.reason)) await this.release()
        return { ...prepared, action: 'wait', taskId, readOnly, writer }
      }
      this.remember({ action: 'dispatch', executor: prepared.executor, taskId, readOnly, owner: writer?.agent ?? null })
      return { ...prepared, taskId, readOnly, writer }
    } catch (error) {
      if (['ATTEMPT_ACTIVE', 'UNCERTAIN', 'INVALID_STATE'].includes(error.code)) {
        this.remember({ action: 'wait', reason: 'active_attempt_elsewhere', taskId })
        return { action: 'wait', reason: 'active_attempt_elsewhere', taskId }
      }
      await this.release(); throw error
    }
  }

  async complete(ticket, { sessionId, actualModel = null, checkpoint = null, reason } = {}) {
    try {
      const result = this.controller.succeeded(ticket.taskId,
        { attemptId: ticket.attemptId, executor: ticket.executor },
        { sessionId, actualModel, checkpoint, reason })
      this.remember({ ...result, taskId: ticket.taskId })
      return result
    } finally { await this.release() }
  }

  async fail(ticket, failure) {
    const result = this.controller.failed(ticket.taskId,
      { attemptId: ticket.attemptId, executor: ticket.executor }, failure)
    this.remember({ ...result, taskId: ticket.taskId })
    // An uncertain turn may still be alive; the lease is released only after a confirmed stop.
    if (result.action !== 'uncertain' || failure?.stoppedConfirmed === true) await this.release()
    return result
  }

  status() { return { ...this.last, writerLeasePolicy: 'verified-file-v1' } }
  async setSelection(mode) { await this.selection.save({ mode }); return this.selection.status() }
  selectionStatus() { return this.selection.status() }
}
