// Bridge-owned direct executors. Their sessions/queues never touch the legacy 8796 window.
import { ownTree } from './derevo.mjs'
import { readFile } from 'node:fs/promises'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { codexTurn } from './codex-turn.mjs'
import { claudeTurn, warmClaude, TURN_CLOCK_STOP } from './claude-turn.mjs'
import { dshTurn } from './dsh-turn.mjs'
import { antigravityTurn, antigravityWindowTokens, AGY_CONTEXT_LIMIT } from './antigravity-cli.mjs'
import { subscriptionEnv } from './local-executor-probes.mjs'
import { taskPrompt } from './task-context.mjs'
import { chronicleBridge, classifyTask, turnUsageOf } from './chronicle-bridge.mjs'
import { localProgress } from './local-progress.mjs'
import { localReplies } from './local-replies.mjs'
import { interruptedNotice } from './turn-notice.mjs'
import { defaultContextPolicy, windowForModel, compactReasonFor } from './context-policy.mjs'
import { defaultExecutorSettings } from './executor-settings.mjs'
import { claudeQuotaFile, saveClaudeQuota } from './claude-quota.mjs'
import { claudeContextStep } from './claude-context.mjs'
import { toolSteps } from './tool-steps.mjs'
import { claudeDraft } from './claude-draft.mjs'
import { zapisatOcenku } from './ocenki.mjs'
import { keshJournal, keshFile } from './kesh-uchet.mjs'
import { defaultPacketMemo } from './prompt-memo.mjs'
import { rawCommand, parseCommand, claudeCommandsFrom } from './komandy-claude.mjs'
import { conversationSession, askedFresh, conversationAfterTurn, readConversationEdge, conversationNote, chronicleBrief, claudeSessionSaved, CONTINUES as CONTINUES_TALK } from './conversation.mjs'

export const nativeLocalTurns = { codex: args => codexTurn({ ...args, model: args.model || 'gpt-6.1-sol', env: subscriptionEnv() }),
  // Claude stays alive between turns of one conversation (claude-live.mjs); DZHINNI_CLAUDE_LIVE=0 returns to a process per turn.
  claude: args => claudeTurn({ ...args, live: process.env.DZHINNI_CLAUDE_LIVE !== '0' }),
  // DeepSeek Harness: один процесс на ход, --json; беседа продолжается --session-id (dsh-turn.mjs).
  deepseek: args => dshTurn(args), antigravity: args => antigravityTurn(args) }
export function addUsage(sum, next) {
  const out = { ...sum }
  for (const [key, value] of Object.entries(next || {})) {
    out[key] = typeof value === 'number' ? (typeof out[key] === 'number' ? out[key] : 0) + value : (out[key] ?? value)
  }
  return out
}
export async function runLocalTask({ repo, storage, core, item, saved, persist, say, hod, emit,
  turns = nativeLocalTurns, onChild = () => {}, inputs = [item], packetMemo = defaultPacketMemo }) {
  const content = inputs.map(value => value.content).join('\n\n--- Следующее сообщение владельца ---\n\n')
  const images = inputs.flatMap(value => value.images || [])
  const ticket = item.ticket, executor = ticket.executor, started = Date.now()
  // «/compact» и команды Claude: одно сообщение-команда уходит в сессию беседы как есть, без обёртки моста.
  const commandText = inputs.length === 1 && executor === 'claude' ? rawCommand(inputs[0]?.content, saved.claudeCommands?.list) : null
  const commandName = commandText ? parseCommand(commandText).name : null
  // A read-only turn is how Jinny speaks while someone else holds the folder; it must not write.
  let readOnly = ticket.readOnly === true
  const noStartMs = Number(process.env.DZHINNI_NO_START_MS) || 120000
  const journal = chronicleBridge({ root: repo, engine: executor })
  saved.localSessions ||= {}
  // Один контекст на задачу: возобновление общей сессии тянет весь прежний диалог в цену хода.
  const sessionKey = executor + ':' + ticket.taskId
  // Долгая переделка одной задачи тоже уплотняется: после N возобновлений следующий ход
  // начинается с чистого контекста и края переписки, а не растёт до предела окна.
  const policy = saved.contextPolicy || defaultContextPolicy()
  saved.contextPolicy = policy
  saved.taskTurns ||= {}
  const turnNo = (saved.taskTurns[sessionKey] || 0) + 1
  saved.taskTurns[sessionKey] = turnNo
  // Модель и глубина берутся из сохранённого выбора; умолчание повторяет прежнее поведение.
  const choices = saved.executorSettings || defaultExecutorSettings()
  saved.executorSettings = choices
  // Запасной ход (direct-provider reserveFor): Claude Code на модели агрегатора (OpenRouter), а не по подписке.
  const reserve = executor === 'claude' && item.route?.reserve === true && typeof item.route.model === 'string'
  const choice = reserve ? { model: item.route.model, reasoning: null } : choices[executor] || { model: null, reasoning: null }
  const model = choice.model || undefined
  const reasoning = choice.reasoning || undefined
  const progress = localProgress({ core, ticket })
  let sessionId = saved.localSessions[sessionKey] || null, actualModel = null, child = null, usage = {}, lastResult = null, stopRequested = false, replyDelivered = false, cliTurnEnded = false
  // A message sent during the previous turn is a continuation, not a new context:
  // it resumes that completed task's session at the next step. An unfinished task is not resumed.
  if (!sessionId && item.continueOf) {
    try {
      if (core.store.get(item.continueOf).state === 'completed') {
        sessionId = saved.localSessions[executor + ':' + item.continueOf] || null
        if (sessionId) saved.localSessions[sessionKey] = sessionId
      }
    } catch {}
  }
  // One conversation of Jinny (conversation.mjs): a new message continues the same engine's session of the talk
  // while it is warm and small; otherwise a fresh session gets the conversation packet. Tokenator reserve is its own line.
  const talkExecutor = reserve ? 'tokenator' : executor
  let talkReason = null
  // «новая беседа …» в начале сообщения: ни сессию задачи, ни сессию беседы не продолжаем.
  // Метка <storage>/novaya-beseda.flag — Джинни сама начинает новую беседу по просьбе пользователя («начни новую беседу»):
  // следующее сообщение идёт в свежую сессию, метка снимается.
  const flag = join(storage, 'novaya-beseda.flag')
  let flagged = false
  try { if (existsSync(flag)) { unlinkSync(flag); flagged = true } } catch {}
  const fresh = flagged || askedFresh(inputs[0]?.content)
  if (fresh) { sessionId = null; delete saved.localSessions[sessionKey] }
  // прерывает ход, а новое сообщение уходило в новую сессию Claude.
  // Продолжение незавершённой задачи тоже берёт сессию беседы: в беседе остаются только сессии
  // успешных ходов и ходов, прерванных самим пользователем; сбойная сессия оттуда снята (catch ниже).
  if (!sessionId) {
    const pick = conversationSession(saved.conversation, { executor: talkExecutor, fresh,
      exists: talkExecutor === 'claude' && process.env.DZHINNI_SESSION_CHECK !== '0' ? id => claudeSessionSaved(repo, id) : null })
    talkReason = pick.reason
    if (pick.session) { sessionId = pick.session; saved.localSessions[sessionKey] = sessionId }
  }
  // A phone request between turns also belongs to the continuing conversation's session.
  const parentSessionKey = Object.entries(saved.contextCompactionRequests || {}).find(([key, row]) =>
    key.startsWith(executor + ':') && row.sessionId === sessionId)?.[0] || (item.continueOf ? executor + ':' + item.continueOf : null)
  const manual = parentSessionKey ? saved.contextCompactionRequests?.[parentSessionKey] : null
  const manualCompact = false // Manual button uses native thread/compact/start; never reset a session.
  // Claude и Codex сжимают свою сессию сами (selfCompacts), замера заполнения у моста для порога нет:
  // остаются ручное сжатие и потолок ходов.
  const contextOwner = manualCompact ? manual.taskId : ticket.taskId
  const sessionBeforeCompact = sessionId, recordBeforeCompact = saved.contextCompactions?.[contextOwner]
  const compactReason = manualCompact ? 'manual' : compactReasonFor({ context: null, policy, sessionId,
    taskId: contextOwner, compactions: saved.contextCompactions, turnNo, selfCompacts: CONTINUES_TALK.has(talkExecutor) })
  const compact = compactReason !== null
  const compactContext = null
  if (compact) {
    delete saved.localSessions[sessionKey]
    if (manualCompact) {
      delete saved.contextCompactionRequests[parentSessionKey]
      delete saved.localSessions[parentSessionKey]
    }
    sessionId = null
    if (compactReason === 'threshold' || compactReason === 'manual') {
      saved.contextCompactions ||= {}
      saved.contextCompactions[contextOwner] = { at: Date.now(), reason: compactReason, context: compactContext }
    }
  }
  let sawStart = false, abandoned = false, watchdog = null, abortNoStart = null
  const ocenki = []
  let releaseOrigin = ''
  try { releaseOrigin = JSON.parse((await readFile(join(process.env.DZHINNI_MOBILE_DATA || 'D:/Cache/DzhinniMobile', 'access.json'), 'utf8')).replace(/^\uFEFF/, '')).origin || '' } catch {}
  const replies = localReplies({ say, releaseOrigin, onOcenka: value => ocenki.push(value), fileExists: p => existsSync(join(repo, p)),
    onHold: () => hod({ text: 'Сторож языка задержал реплику без русских букв', at: Date.now() }) })
  const steps = toolSteps()
  // The answer as it is being written (claude-draft.mjs); the window and the phone show it as a growing bubble.
  const drafts = claudeDraft()
  let draftTimer = null
  const setDraft = text => {
    saved.currentTask = { ...saved.currentTask, draft: text ? { text, at: Date.now() } : null }
    if (!text) { clearTimeout(draftTimer); draftTimer = null; emit(); return }
    if (draftTimer) return
    draftTimer = setTimeout(() => { draftTimer = null; emit() }, 250)
  }
  const received = (evidence = 'executor_output') => {
    if (saved.currentTask?.attempt_id === ticket.attemptId) saved.currentTask.inputPhase = 'accepted'
    for (const input of inputs) {
      const receipt = saved.receipts?.[input.id]
      if (receipt && !receipt.receivedAt) {
        receipt.receivedAt = Date.now(); receipt.receivedEvidence = evidence
        void persist().catch(() => {}); emit()
      }
    }
  }
  const base = () => ({ session_id: sessionId || 'pending:' + item.id, task_id: ticket.taskId,
    attempt_id: ticket.attemptId, model: actualModel, ...classifyTask(item.content) })
  saved.currentTask = { ...base(), requested_model: core.registry.row(executor).observation?.model ?? null,
    route: item.route ?? null, continued_from: item.continueOf ?? null,
    // «Запускаю Claude…» only for a fresh session;
    // a resumed one is 'continuing' — the window and the phone show the usual work line.
    title: item.content.slice(0, 180), status: 'running', inputPhase: sessionId ? 'continuing' : 'starting', started_at: new Date(started).toISOString() }
  if (compact) void journal.safeRecord({ ...base(), event_type: 'context.compacted', message_id: item.id + ':compact',
    reason: compactReason, turns: turnNo - 1, context: compactContext, compacted_task_id: contextOwner,
    policy: { warnAt: policy.warnAt, compactAt: policy.compactAt, strategy: policy.strategy, maxTurns: policy.maxTurns } })
  // A session the turn resumed is on disk by definition (Claude found it).
  const resumedFrom = sessionId
  // Учёт кэша (kesh-uchet.mjs): откуда взялся процесс этого хода и было ли сжатие.
  const keshLog = keshJournal(keshFile(storage))
  let processReused = null, compactSeen = false, keshFrom = started, compactedTurn = commandName === 'compact'
  try { await persist() }
  catch (error) {
    // No new session was launched: keep an accepted manual request available for the next turn.
    if (manualCompact) {
      saved.contextCompactionRequests[parentSessionKey] = manual
      saved.localSessions[parentSessionKey] = manual.sessionId
      saved.localSessions[sessionKey] = sessionBeforeCompact
      if (recordBeforeCompact === undefined) delete saved.contextCompactions[contextOwner]
      else saved.contextCompactions[contextOwner] = recordBeforeCompact
      // No executor started, so close this failed preparation rather than leave a phantom active attempt.
      try {
        core.store.finish(ticket.taskId, ticket.attemptId, { commandId: `compact-preparation:${ticket.attemptId}`,
          expectedRevision: core.store.get(ticket.taskId).revision, outcome: 'uncertain', reason: 'compact_preparation_not_saved', stoppedConfirmed: true })
      } catch {}
    }
    throw error
  }
  emit()
  try {
    // Возобновлённая сессия уже держит свой диалог. Хвост истории нужен только новой задаче,
    // иначе тот же текст уезжает в оплату второй раз поверх контекста сессии.
    const resumedSession = !!sessionId
    const history = sessionId ? '' : await readConversationEdge(storage)
    // A fresh session also gets the chronicler's brief: yesterday's decisions and «где остановились», not only the chat edge.
    const brief = sessionId ? '' : await chronicleBrief(repo, { state: executor !== 'claude' }).catch(() => '')
    const selection = core.selectionStatus?.() || null
    // В «Авто» ведущая — та, кому Джинни отдала ход (главный недоступен → ведёт следующий по порядку);
    // разовое назначение «codex: …» ведущей не делает.
    const mainExecutor = selection ? (selection.mode !== 'auto' ? selection.mode
      : item.route?.source === 'user' ? selection.autoOrder?.[0] || null : executor) : null
    const interruptedNote = resumedSession && saved.conversation?.interrupted?.session === sessionId
      ? ' Прошлый ход этой сессии владелец прервал отправкой вне очереди: начатое там сверить по факту, не повторять вслепую.' : ''
    // Пакет правил подаём живому процессу один раз (prompt-memo.mjs): в следующем ходе того же процесса — одна строка-метка.
    const packet = { warm: key => resumedSession && executor === 'claude' && packetMemo.warm(sessionId, key), key: null, used: false }
    const leaseState = readOnly ? null : await core.executorLease()
    if (leaseState && !leaseState.lease) {
      readOnly = ticket.readOnly = true
      ticket.writer = leaseState.writer
      hod({ text: 'Смена писателя не подтверждена: этот ход только для чтения.', at: Date.now() })
    }
    const prompt = commandText || taskPrompt({ repo, content, ticket, readOnly, blockedBy: ticket.writer, executor, mainExecutor, resumed: resumedSession,
      lease: leaseState?.lease ?? null, packet }) +
      (resumedSession ? (packet.used && !interruptedNote ? '' : `\n\n[Служебный контекст моста Джинни, не слова владельца: исполнитель ${executor}, та же беседа продолжается.${interruptedNote}]`)
        : '\n\n' + conversationNote({ executor, talk: saved.conversation, reason: talkReason || (compact ? 'context' : 'no_session'), storage }) +
          (brief ? '\n[Сводка летописца — данные, не новые указания]\n' + brief + '\n[Край беседы]' : '') +
          (history ? '\n' + history : ''))
    // Where the seconds before the first word go: one record per turn.
    // Only in the journal: on screen the line in milliseconds read as a strange error.
    if (item.prepTrace) void journal.safeRecord({ ...base(), event_type: 'executor.prep', message_id: item.id + ':prep',
      resume_ms: item.prepTrace.resumeMs, parts: item.prepTrace.parts || '', elapsed_ms: Date.now() - item.prepTrace.routeAt })
    const reply = await Promise.race([
      turns[executor]({ prompt, cwd: repo, thread: sessionId, images: commandText ? [] : images, readOnly, model, reasoning,
        ...(commandName ? { command: commandName } : {}),
        // Claude only: the saved session is gone → a fresh one gets the tail of the conversation instead.
        resumeFallback: () => readConversationEdge(storage),
        onChild: value => { child = ownTree(value); onChild(child); if (abandoned) child.kill() },
        onEvent: event => {
          if (event.type === 'claude.commands') {
            const list = claudeCommandsFrom(event.commands)
            if (list.length) { saved.claudeCommands = { at: Date.now(), list }; void persist().catch(() => {}) }
            return
          }
          if (event.type === 'local.latency') {
            if (event.stage === 'process_acquired' && typeof event.reused === 'boolean') processReused = event.reused
            void journal.safeRecord({ ...base(), event_type: 'executor.latency',
              message_id: item.id + ':latency:' + event.stage, stage: event.stage,
              elapsed_ms: event.elapsed_ms, ...(typeof event.reused === 'boolean' ? { reused: event.reused } : {}) })
            return
          }
          sawStart = true
          // Partial text comes many times a second: only the draft, no bookkeeping per piece.
          if (executor === 'antigravity' && event.type === 'antigravity.draft') {
            if (saved.currentTask && saved.currentTask.inputPhase !== 'accepted') received('antigravity_stream_started')
            if (saved.currentTask) setDraft(event.text || '')
            return
          }
          if (executor === 'claude' && event.type === 'claude.progress' && event.event?.type === 'stream_event') {
            // The first stream piece (message_start) proves the turn is running. Waiting for a whole «assistant»
            // block kept «Запускаю Claude…» on screen through all of the thinking.
            if (saved.currentTask && saved.currentTask.inputPhase !== 'accepted') received('claude_stream_started')
            cliTurnEnded = false   // поток идёт — ход CLI не закончен
            const draft = drafts.event(event.event)
            if (draft !== undefined && saved.currentTask) setDraft(draft)
            return
          }
          if (event.type === 'thread.started') {
            sessionId = event.thread_id; saved.localSessions[sessionKey] = sessionId
            if (compact && parentSessionKey) saved.localSessions[parentSessionKey] = sessionId
            void persist().catch(() => {})
            const task = core.store.get(ticket.taskId), attempt = task.attempts.find(row => row.attemptId === ticket.attemptId)
            if (attempt.state === 'sending') core.store.acknowledge(task.taskId, ticket.attemptId, {
              commandId: `local-ack:${ticket.attemptId}`, expectedRevision: task.revision, sessionId, actualModel })
            void journal.safeRecord({ ...base(), event_type: 'message', role: 'user', message_id: item.id, text: item.content })
            void journal.safeRecord({ ...base(), event_type: 'task.started', message_id: item.id, status: 'running' })
          }
          if (event.type === 'claude.resume_missing') hod({ text: 'Прежняя сессия Claude не найдена — продолжаю в новой с краем переписки', at: Date.now() })
          // Messages sent during a Claude turn give one result each; the turn's usage is their sum
          //.
          if (event.type === 'local.usage') {
            actualModel = event.actualModel; usage = addUsage(usage, event.usage || {})
            if (executor === 'antigravity') {
              const stepUsage = event.usage || {}
              const usedTokens = Number(stepUsage.context_tokens) || ((Number(stepUsage.input_tokens) || 0) + (Number(stepUsage.cache_read_tokens) || 0))
              const windowTokens = Math.min(antigravityWindowTokens(actualModel?.id || model), AGY_CONTEXT_LIMIT)
              if (usedTokens > 0 && windowTokens > 0) {
                saved.antigravityContext = { usedTokens, windowTokens, percent: (usedTokens / windowTokens) * 100,
                  source: 'measured', windowSource: 'config', at: Date.now(), model: actualModel?.id || model || null,
                  taskId: ticket.taskId, sessionId: sessionId || null }
                emit()
              }
            }
          }
          // turn/start acknowledges the input; thread/start only allocates a session.
          // Do not wait for the first reasoning token to acknowledge an accepted turn.
          if (executor === 'codex' && event.type === 'local.input_ready') {
            saved.currentTask.inputPhase = 'accepted'; received('codex_turn_accepted')
          }
          if (executor === 'claude' && event.type === 'local.input_ready' && event.evidence === 'claude_user_echo') {
            received('claude_user_echo')
          }
          if (['deepseek','antigravity'].includes(executor) && event.type === 'local.input_ready') received(executor + '_turn_accepted')
          // Other executors without an input ACK still need actual output evidence.
          if (executor === 'codex' && ['item.started', 'item.updated', 'item.completed'].includes(event.type) &&
              ['reasoning', 'agent_message', 'command_execution', 'file_change', 'mcp_tool_call'].includes(event.item?.type)) received()
          if (['deepseek','antigravity'].includes(executor) && ['item.started', 'item.completed'].includes(event.type)) received(executor + '_output')
          if (event.type === 'turn.completed') { usage = event.usage || {}; if (saved.currentTask?.draft) setDraft('') }
          // The CLI's own subscription windows: the next probe shows a real quota, not a guess.
          if (executor === 'claude' && event.type === 'claude.quota') {
            void saveClaudeQuota(claudeQuotaFile(repo), event.info, event.at).catch(() => {})
          }
          if (executor === 'claude' && event.type === 'claude.progress') {
            const raw = event.event
            // 
            // 12:39 the turn began with an auto-compact: no echo and no stream for 87 s, the message stayed dim.
            // Claude's init means the CLI took the prompt into its turn; compaction gets its own visible step.
            if (raw?.type === 'system' && raw.subtype === 'init') received('claude_init')
            if (raw?.type === 'system' && (raw.subtype === 'compact_boundary' || raw.status === 'compacting'))
              hod({ text: raw.subtype === 'compact_boundary' ? 'Беседа сжата — продолжаю' : 'Сжимаю беседу перед ответом — до двух минут', at: Date.now() })
            if (raw?.type === 'assistant' || raw?.message?.content?.some?.(block => block.type === 'tool_use')) received()
            if ((raw?.type === 'assistant' && !raw.parent_tool_use_id) || raw?.type === 'result') { drafts.reset(); if (saved.currentTask?.draft) setDraft('') }
            if (raw?.type === 'system' && raw.subtype === 'init' && raw.model) actualModel = { providerID: 'anthropic', id: raw.model }
            if (raw?.type === 'system' && raw.subtype === 'compact_boundary') { compactSeen = true; compactedTurn = true }
            if (raw?.type === 'result') { lastResult = raw; usage = turnUsageOf(raw) }
            // result последним событием = ход CLI закончен, хотя живой процесс Claude ждёт
            // следующего сообщения. Без этого смена писателя висела после 41 из 105 ходов «неизвестно».
            cliTurnEnded = raw?.type === 'result' ? true : ['assistant', 'user'].includes(raw?.type) ? false : cliTurnEnded
            const previous = saved.claudeContext?.sessionId === sessionId ? saved.claudeContext : null
            const next = claudeContextStep(raw, { previous, windows: saved.contextWindows || {},
              configuredWindow: windowForModel(policy, actualModel?.id), at: Date.now() })
            saved.contextWindows = next.windows
            if (next.context && next.context !== previous) saved.claudeContext = { ...next.context, taskId: ticket.taskId, sessionId: sessionId || null }
            // Кэш хода: одна строка на результат (причина промаха — kesh-uchet.mjs). Учёт не должен ронять ход.
            if (raw?.type === 'result') {
              const now = Date.now()
              const mode = compactSeen || compact || commandName === 'compact' ? 'compact' : !resumedFrom ? 'novyy-process'
                : processReused === true ? 'zhivoy-process' : 'resume'
              void keshLog.zapisat({ executor: talkExecutor, model: actualModel?.id || model || null, thread: sessionId || null, usage: raw.usage,
                mode, compacted: compactSeen || commandName === 'compact', startedAt: keshFrom, endedAt: now,
                context: saved.claudeContext?.sessionId === sessionId ? saved.claudeContext.usedTokens : null }).catch(() => {})
              keshFrom = now; compactSeen = false
            }
          }
          progress.event(event)
          // Bookkeeping must never abort a live turn or leave its attempt open.
          try { progress.save() } catch (error) { hod({ text: 'Не сохранена точка продолжения: ' + error.message, at: Date.now() }) }
          // долго висит и кажется, что ничего не происходит — телефон
          // показывает последний шаг (тот же, что в «Джинни делает») и время с его начала.
          const stepLines = steps(event, executor)
          const step = stepLines.length ? { text: stepLines[stepLines.length - 1], at: Date.now() } : saved.currentTask?.step
          saved.currentTask = { ...saved.currentTask, session_id: sessionId, model: actualModel, ...(step ? { step } : {}) }; emit()
          for (const line of stepLines) hod({ text: line, at: Date.now() })
          const message = replies.event(event, executor)
          if (message) hod({ text: message.slice(0, 180), at: Date.now() })
        } }),
      // The executor may accept the task and then never start. Without this clock nothing ever ends
      // the turn, and the window cannot even say why it is silent.
      new Promise((resolve, reject) => {
        abortNoStart = () => reject(new Error('Исполнитель не начал работу за ' + Math.round(noStartMs / 1000) + ' с'))
        watchdog = setTimeout(() => {
          if (sawStart) return
          abandoned = true
          abortNoStart?.()
          try { child?.kill() } catch {}
        }, noStartMs)
        watchdog.unref?.()
      }),
    ])
    if (!sessionId || typeof reply !== 'string' || !reply.trim()) throw new Error('Исполнитель не подтвердил сессию и ответ')
    // Процесс видел пакет — запомнить; сжатая беседа пакет могла потерять — подать полностью снова.
    if (executor === 'claude') { if (packet.key && !compactedTurn) packetMemo.remember(sessionId, packet.key); else packetMemo.forget(sessionId) }
    received()
    // Ledger bookkeeping is optional; losing the reply because of it is not.
    let checkpoint = null
    try { checkpoint = progress.checkpoint(true) } catch (error) { hod({ text: 'Не сохранена точка продолжения: ' + error.message, at: Date.now() }) }
    // A reply is not a side effect: say it even when a tool receipt is missing, otherwise
    // one CLI stream quirk silences Jinny. The task still ends uncertain and is never replayed.
    await replies.finish(reply)
    replyDelivered = true
    await journal.safeRecord({ ...base(), event_type: 'message', role: 'assistant', message_id: item.id + ':reply', text: reply, usage })
    if (checkpoint?.unknownOutcomes?.length) throw new Error('Не все вызовы инструментов подтверждены')
    await journal.safeRecord({ ...base(), event_type: 'task.finished', message_id: item.id, status: 'succeeded', outcome: 'succeeded', usage, duration_ms: Date.now() - started })
    saved.currentTask = { ...saved.currentTask, model: actualModel, status: 'succeeded' }
    await core.complete(ticket, { sessionId, actualModel, checkpoint, reason: executor + '_native_cli_completed' })
    // Claude's real context is the last request's input (claude-context.mjs), not the turn total: the turn total misses the cache.
    const measuredContext = executor === 'claude' && saved.claudeContext?.taskId === ticket.taskId
      ? saved.claudeContext.usedTokens
      : executor === 'antigravity' && saved.antigravityContext?.taskId === ticket.taskId
        ? saved.antigravityContext.usedTokens
        : null
    // «/compact» в беседе без сессии открыл пустую — она не становится сессией беседы (следующему ответу нужен край переписки).
    if (!(commandName === 'compact' && !resumedSession)) saved.conversation = conversationAfterTurn(saved.conversation, { executor: talkExecutor, sessionId, continued: resumedSession,
      usage: measuredContext ? { ...usage, context: measuredContext } : usage })
    if (saved.conversation) delete saved.conversation.interrupted
    saved.queue = saved.queue.filter(value => value !== item)
    delete saved.taskTurns[sessionKey]
    return { ok: true }
  } catch (error) {
    // Ход оборвался: состояние процесса неизвестно — следующий ход подаст пакет правил полностью.
    if (executor === 'claude' && sessionId) packetMemo.forget(sessionId)
    if (core.store.get(ticket.taskId).state === 'completed') {
      saved.queue = saved.queue.filter(value => value !== item)
      return { ok: true, warning: error.message }
    }
    // пользователь сам прервал ход («отправить сейчас», «стоп»): сессия цела, его следующее сообщение продолжает её,
    // а не открывает новую. Неизвестный исход хода всё равно идёт на сверку (failure ниже).
    // Only a session Claude has really written down can be continued.
    const sessionOnDisk = talkExecutor !== 'claude' || sessionId === resumedFrom || process.env.DZHINNI_SESSION_CHECK === '0' || claudeSessionSaved(repo, sessionId)
    // The provider refused (limit, overload) — the session itself is whole; the talk goes on in it after the reset
    //.
    const providerRefused = ['quota_exhausted', 'rate_limited', 'service_transient'].includes(error?.claude?.failure?.kind)
    // the bridge's own clock stopped a working turn and the next message opened a blank session.
    const clockStopped = talkExecutor === 'claude' && TURN_CLOCK_STOP.test(String(error?.message || ''))
    if ((item.ownerInterrupted || clockStopped) && sessionId && CONTINUES_TALK.has(talkExecutor) && sessionOnDisk) {
      saved.conversation = { ...conversationAfterTurn(saved.conversation, { executor: talkExecutor, sessionId, continued: true, usage }),
        interrupted: { session: sessionId, taskId: ticket.taskId, at: Date.now() } }
    // A failed turn on the conversation's session does not pin the next message to it: the next one starts fresh with the packet.
    } else if (item.ownerInterrupted) {
      // Interrupted before Claude wrote the session down: the talk stays in the session it had.
    } else if (replyDelivered && sessionId && CONTINUES_TALK.has(talkExecutor) && sessionOnDisk) {
      // the answer reached пользователь, only one tool receipt stayed unconfirmed. The session was dropped,
      // the next message started a fresh Claude («Запускаю Claude…», ~63k tokens of rules again). The unknown outcome
      // goes to reconciliation below; the conversation keeps its session.
      saved.conversation = conversationAfterTurn(saved.conversation, { executor: talkExecutor, sessionId, continued: !!resumedFrom && sessionId === resumedFrom, usage })
    } else if (providerRefused && sessionId && CONTINUES_TALK.has(talkExecutor) && sessionOnDisk) {
      // лимит пришёл в НОВОЙ сессии беседы; ветка ниже её не удаляла, но и не
      // записывала — после сброса в 19:40 беседа началась с чистого листа. Отказ провайдера: сессию сохранить.
      saved.conversation = conversationAfterTurn(saved.conversation, { executor: talkExecutor, sessionId, continued: !!resumedFrom && sessionId === resumedFrom, usage })
    } else if (!providerRefused && saved.conversation?.sessions?.[talkExecutor]?.id && saved.conversation.sessions[talkExecutor].id === sessionId) {
      saved.conversation = { ...saved.conversation, sessions: { ...saved.conversation.sessions } }
      delete saved.conversation.sessions[talkExecutor]
    }
    // The stopped or failed process is gone; the conversation's session waits started for the next message.
    if (talkExecutor === 'claude' && turns === nativeLocalTurns && process.env.DZHINNI_SESSION_CHECK !== '0') {
      const talk = conversationSession(saved.conversation, { executor: 'claude', exists: id => claudeSessionSaved(repo, id) })
      if (talk.session) setTimeout(() => { try { warmClaude({ cwd: repo, model, reasoning, readOnly, thread: talk.session }) } catch {} }, 1500).unref?.()
    }
    let checkpoint = null
    try { checkpoint = progress.checkpoint(true) } catch (error) { hod({ text: 'Не сохранена точка продолжения: ' + error.message, at: Date.now() }) }
    stopRequested = !!child && (child.exitCode != null || child.signalCode != null)
    let failure = abandoned ? { kind: 'no_response', stoppedConfirmed: true }
      : executor === 'claude' && error.claude?.failure ? error.claude.failure
      : executor === 'deepseek' && error.dsh?.failure ? error.dsh.failure
      : executor === 'antigravity' && error.antigravity?.failure ? error.antigravity.failure : { kind: 'transport_unknown' }
    if (item.ownerInterrupted) failure = { kind: 'transport_unknown' }
    if (!item.ownerInterrupted && executor === 'codex' && stopRequested && !checkpoint?.unknownOutcomes?.length) {
      await core.refresh().catch(() => {})
      if (core.registry.row('codex').observation?.quota.state === 'exhausted') failure = { kind: 'quota_exhausted' }
    }
    item.state = 'uncertain'; saved.currentTask = { ...saved.currentTask, status: 'uncertain' }
    const result = await core.fail(ticket, { ...failure, checkpoint,
      reason: abandoned ? executor + '_no_response' : executor + '_unconfirmed',
      stoppedConfirmed: abandoned || stopRequested }).catch(failure => {
        hod({ text: 'Не удалось записать завершение попытки: ' + failure.message, at: Date.now() })
        return null
      })
    if (result?.action === 'handoff') {
      item.taskId = ticket.taskId; delete item.ticket; item.state = 'prepared'
      return { ok: false, handoff: true }
    }
    await journal.safeRecord({ ...base(), event_type: 'task.finished', message_id: item.id, status: 'uncertain', outcome: 'uncertain' })
    // the turn broke and the chat stayed silent; пользователь asked «работа идёт?» 5 min later.
    // A limit has its own notice (direct-provider limitNotice); his own stop needs none.
    if (!item.ownerInterrupted && !providerRefused && !replyDelivered) {
      try {
        await say(interruptedNotice({ executor, message: String(error?.message || ''), failure,
          sameSession: clockStopped && sessionOnDisk }))
      } catch (notice) { hod({ text: 'Сообщение об обрыве хода не доставлено: ' + notice.message, at: Date.now() }) }
    }
    return { ok: false, error: (replyDelivered ? 'Ответ доставлен. ' : '') + error.message + '. Нужна сверка; повтор этого сообщения отключён, очередь продолжается.' }
  } finally {
    if (watchdog) clearTimeout(watchdog)
    // Ход закончился — попытка не имеет права остаться открытой: иначе очередь ждёт её вечно.
    try {
      const task = core.store.get(ticket.taskId)
      const attempt = task.attempts.find(row => row.attemptId === ticket.attemptId)
      if (attempt && ['sending', 'running'].includes(attempt.state)) {
        // The checkpoint is best effort; closing the attempt must happen regardless.
        try {
          core.store.checkpoint(ticket.taskId, ticket.attemptId, { commandId: `close-checkpoint:${ticket.attemptId}`,
            expectedRevision: task.revision, checkpoint: progress.checkpoint(true) })
        } catch (error) { hod({ text: 'Не сохранена точка продолжения: ' + error.message, at: Date.now() }) }
        core.store.finish(ticket.taskId, ticket.attemptId, { commandId: `close:${ticket.attemptId}`,
          expectedRevision: core.store.get(ticket.taskId).revision, outcome: 'uncertain', reason: executor + '_unconfirmed', stoppedConfirmed: false })
        if (item.state === 'sending') item.state = 'uncertain'
      }
    } catch {}
    // Uncertain tool results need reconciliation, but a confirmed dead executor
    // no longer owns the workspace. Do not retain a stale writer reservation.
    if ((child && (child.exitCode != null || child.signalCode != null)) || (executor === 'claude' && cliTurnEnded)) await core.release()
    await replies.flush().catch(() => {}); await journal.flush().catch(() => {}); await keshLog.flush()
    // Facts of every lead turn go to the ratings journal even without the lead's own block.
    if (!readOnly || ocenki.length) await zapisatOcenku(repo, { taskId: ticket.taskId, executor, model: actualModel?.id || null,
      requested: model || null, readOnly, outcome: saved.currentTask?.status || null, seconds: Math.round((Date.now() - started) / 1000),
      usage: usage || null, ocenka: ocenki.at(-1) || null }).catch(error => hod({ text: 'Не записана оценка хода: ' + error.message, at: Date.now() }))
    await persist(); hod({ konec: true, at: Date.now() })
  }
}
