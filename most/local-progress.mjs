// Native receipts for the direct runner; unknown tool outcomes prevent handoff.
import { createHash } from 'node:crypto'
import { canonical } from '../core/task-contract.mjs'

export function localProgress({ core, ticket, now = Date.now, everyMs = 5000 }) {
  const prior = core.store.get(ticket.taskId).checkpoint
  const completed = new Map(prior.completed.map(step => [step.stepId, step]))
  const pending = new Map(), files = new Set(prior.files)
  const checks = new Set(prior.checks)
  const prefix = `${ticket.executor}:${ticket.attemptId}:`
  // The contract accepts at most 64000 bytes; keep the per-turn target at 44000 so the
  // current batch and the unknown-outcome lines always fit under it.
  const BUDGET = 44000
  const encoder = new TextEncoder()
  const byteSize = value => encoder.encode(canonical(value)).length
  const OVERFLOW = 'Подтверждения сверх бюджета точки продолжения'
  const batch = []
  let batchNo = [...completed.keys()].filter(id => id.startsWith(prefix + 'batch:')).length
  let overflow = 0
  for (const line of [...checks]) {
    if (!line.startsWith(OVERFLOW + ':')) continue
    checks.delete(line)
    overflow += Number((line.match(/: (\d+)/) || [])[1]) || 0
  }
  function flushBatch() {
    if (!batch.length) return
    const steps = batch.splice(0)
    const step = { stepId: `${prefix}batch:${batchNo}`, summary: `Подтверждено инструментов: ${steps.length}`,
      evidence: steps.map(item => item.stepId) }
    if (byteSize(build([...completed.values(), step])) > BUDGET) { overflow += steps.length; return }
    batchNo++
    completed.set(step.stepId, step)
    saveNow = true   // новый пакет подтверждений — сохранить сразу, не дожидаясь 5 с
  }
  function receipt(id, name, failed = false) {
    if (failed) return // Leave the possibly changing tool unresolved.
    pending.delete(id)
    const stepId = prefix + id
    batch.push({ stepId, summary: 'Подтверждён инструмент ' + name,
      evidence: [`native:${ticket.executor}:${ticket.attemptId}:${id}`] })
    if (batch.length >= 20) flushBatch()
  }
  // сеть и поиск инструментов файлов не пишут — их падение не делает ход «неподтверждённым»
  const READ_TOOLS = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'ToolSearch']
  const EDIT_NOOP = 'Error: Edit tool parameter validation failed: No changes to make: old_string and new_string are exactly the same.'
  // A PreToolUse refusal returns its reason instead of running the command.
  const HOOK_DENIAL = /Сторож команд:|Blocking hook failure|blocked by (?:a )?hook|PreToolUse[^\n]*(?:denied|blocked)|^PreToolUse:\w+ hook error/i
  // Anything here can create or rewrite a file, so a failure stays unknown.
  const WRITE_MARKS = /[<>]|`|\$\(|\btee\b|\bxargs\b|\bsed\s+-i|\bperl\s+-pi|\bfind\b[^|]*-delete|--output(?:=|\s)|--test-reporter-destination|\s-o\s|--fix\b|--write\b|\|\s*(?:sh|bash|node|python|powershell|pwsh)\b/i
  const WRITE_GIT = /\bgit\s+(?:add|am|apply|checkout|clean|clone|commit|config|fetch|init|merge|mv|pull|push|rebase|reset|restore|rm|stash|switch|tag|update-index)\b/i
  const READ_COMMAND = /^(?:git\s+(?:status|diff|log|show|rev-parse|ls-files|grep|blame|shortlog)\b|(?:ls|dir|cat|head|tail|wc|find|grep|rg|echo|pwd|whoami|node\s+--test|python\s+-m\s+pytest|pytest)\b)/i
  const TEST_COMMAND = /^(?:node\s+--test|python\s+-m\s+pytest|pytest)\b/i
  // упавшая команда вне READ_COMMAND делала ход «неизвестным» в 48 ходах из 112.
  // Решение ведущей: команда без признаков записи — проверка. Признаки записи — WRITE_MARKS, WRITE_GIT и слова ниже.
  const WRITE_WORDS = /(?:^|[\s;|&(])(?:rm|rmdir|mv|cp|del|erase|copy|move|ren|rename|mkdir|md|touch|chmod|chown|ln|truncate|dd|unzip|tar|7z|robocopy|xcopy|taskkill|kill|schtasks|reg|setx|winget|choco|npx|pnpm|yarn)(?=$|[\s;|&)])|\bnpm\s+(?:i|install|ci|uninstall|update|run|exec)\b|\bpip3?\s+(?:install|uninstall)\b|\b(?:Set|Add|Clear)-Content\b|\bOut-File\b|\b(?:New|Remove|Move|Copy|Rename|Set)-Item(?:Property)?\b|\bExport-\w+|\b(?:Expand|Compress)-Archive\b|\b(?:Start|Stop)-Process\b|\bRegister-ScheduledTask\b|-OutFile\b|--delat\b|--apply\b|--commit\b|--yes\b/i
  // A GET cannot rewrite workspace files; refuse anything that carries a body or writes.
  function httpRead(command) {
    return /^(?:powershell(?:\.exe)?|pwsh)\s/i.test(command) &&
      /Invoke-(?:RestMethod|WebRequest)\b/i.test(command) &&
      !/-Method\s+(?:Post|Put|Patch|Delete)\b|-Body\b|-OutFile\b|-InFile\b|\b(?:Set|New|Remove|Move|Copy|Start|Stop|Restart|Clear|Add|Out)-[A-Za-z]/i.test(command)
  }
  // Why a failed call cannot leave changes behind; null means the outcome is unknown.
  function noEffect(name, command, text) {
    if (READ_TOOLS.includes(name)) return 'read'
    if (name === 'Edit' && text.trim() === EDIT_NOOP) return 'edit-noop'
    // A PreToolUse denial means the tool never ran — for PowerShell, Agent, Monitor as for Bash (
    // denials of non-Bash tools left turns «uncertain», and the conversation lost its session).
    if (HOOK_DENIAL.test(text)) return 'hook-denied'
    if (!['Bash', 'PowerShell'].includes(name) || typeof command !== 'string' || !command.trim()) return null
    if (WRITE_MARKS.test(command) || WRITE_GIT.test(command)) return null
    const segments = command.split(/\s*(?:&&|\|\||;|\n)\s*/).filter(Boolean)
    if (segments.every(segment => READ_COMMAND.test(segment))) {
      return TEST_COMMAND.test(segments[0]) ? 'test-failed' : 'command-read'
    }
    if (httpRead(command)) return 'http-read'
    return WRITE_WORDS.test(command) ? null : 'command-nowrite'
  }
  function noEffectCheck(kind, name, id) {
    const label = prefix + id
    return kind === 'test-failed' ? `Тестовый прогон с ошибкой учтён как проверка: ${label}`
      : kind === 'command-read' ? `Команда только для чтения завершилась ошибкой: ${label}`
      : kind === 'http-read' ? `HTTP-чтение без записи файлов: ${label}`
      : kind === 'command-nowrite' ? `Команда без признаков записи завершилась ошибкой: ${label}`
      : kind === 'hook-denied' ? `Отказ хука без выполнения ${name}: ${label}`
      : `Отказ ${name} без изменения файлов: ${label}`
  }
  function event(value) {
    const item = value.item
    if (ticket.executor === 'codex' && item?.id && ['command_execution', 'file_change', 'mcp_tool_call'].includes(item.type)) {
      if (value.type === 'item.started') pending.set(item.id, { name: item.type, command: item.command })
      if (value.type === 'item.completed') {
        const failed = item.status === 'failed' || item.error != null
        const entry = pending.get(item.id) || { name: item.type, command: item.command }
        const kind = failed ? noEffect(entry.name, entry.command, '') : null
        if (kind) { pending.delete(item.id); checks.add(noEffectCheck(kind, entry.name, item.id)) }
        else if (failed) pending.set(item.id, entry)
        else receipt(item.id, entry.name)
        if (item.type === 'file_change') for (const change of item.changes || []) if (typeof change.path === 'string') files.add(change.path)
      }
    }
    // Claude Code stream format: tool_use / tool_result blocks.
    if (ticket.executor === 'claude') {
      const raw = value.type === ticket.executor + '.progress' ? value.event : null
      for (const block of raw?.message?.content || []) {
        if (block.type === 'tool_use') pending.set(block.id, { name: block.name, command: block.input?.command })
        if (block.type === 'tool_result' && pending.has(block.tool_use_id)) {
          const id = block.tool_use_id, entry = pending.get(id)
          const text = typeof block.content === 'string' ? block.content
            : (Array.isArray(block.content) ? block.content : []).filter(part => part.type === 'text').map(part => part.text).join('\n')
          // A failed tool is a check only when its outcome provably cannot touch files:
          // a refused hook, a read-only command or a failing test run. Otherwise it stays unknown.
          const kind = block.is_error === true ? noEffect(entry.name, entry.command, text) : null
          if (kind) { pending.delete(id); checks.add(noEffectCheck(kind, entry.name, id)) }
          else receipt(id, entry.name, block.is_error === true)
        }
      }
    }
  }
  function idChecks(ids, label) {
    const chunks = []
    for (const id of ids) {
      if (!chunks.length || chunks.at(-1).length + id.length + 2 > 3500) chunks.push('')
      chunks[chunks.length - 1] += (chunks.at(-1) ? ', ' : '') + id
    }
    return chunks.map((chunk, index) => `${label} ${index + 1}: ${chunk}`)
  }
  // The contract caps every list at 200 items; fold the oldest checks instead of failing.
  function boundedChecks(extra) {
    const lines = [...checks, ...extra, ...(overflow ? [`${OVERFLOW}: ${overflow}`] : [])]
    return lines.length <= 200 ? lines : [`Старые проверки свёрнуты: ${lines.length - 199}`, ...lines.slice(-199)]
  }
  function build(completedList = [...completed.values()], extraChecks = [], unknown = []) {
    return { ...prior, completed: completedList, files: [...files], checks: boundedChecks(extraChecks),
      unknownOutcomes: [...prior.unknownOutcomes, ...unknown],
      nextStep: prior.nextStep || 'Проверь подтверждённые результаты и продолжи исходную задачу; завершённые действия не повторяй.' }
  }
  function checkpoint(terminal = false) {
    if (terminal) flushBatch()
    // A read-only turn cannot change files or run commands: an unanswered tool receipt
    // there is a CLI quirk, not an unknown side effect, so it must not mark the task uncertain.
    const unknown = terminal && !ticket.readOnly
      ? [...pending].map(([id, entry]) => `Не сверен исход ${entry.name}: ${prefix}${id}`) : []
    const currentBatch = idChecks(batch.map(step => step.stepId), 'Подтверждения текущего пакета')
    return build([...completed.values()], currentBatch, unknown)
  }
  // save() зовут на каждое событие хода — полная точка писалась сотни раз в минуту (база 150 МБ).
  // Теперь не чаще раза в everyMs и сразу после нового пакета; итог хода всё равно пишет checkpoint(true) в complete/fail.
  let lastSave = -Infinity, saveNow = false
  function save() {
    if (!saveNow && now() - lastSave < everyMs) return
    saveNow = false; lastSave = now()
    const task = core.store.get(ticket.taskId), attempt = task.attempts.find(row => row.attemptId === ticket.attemptId)
    if (!['sending', 'running'].includes(attempt?.state)) return
    const next = checkpoint()
    if (canonical(next) === canonical(task.checkpoint)) return
    const hash = createHash('sha256').update(canonical(next)).digest('hex').slice(0, 24)
    core.store.checkpoint(task.taskId, ticket.attemptId, { commandId: `local-progress:${ticket.attemptId}:${hash}`,
      expectedRevision: task.revision, checkpoint: next })
  }
  return { event, checkpoint, save }
}
