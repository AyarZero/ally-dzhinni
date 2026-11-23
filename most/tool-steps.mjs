// The bridge itself shows what the executor is doing: every tool call becomes
// a short Russian line in «Джинни делает». No model is involved, so silence cannot happen
// because the executor forgot to speak. Only names and short descriptions, never tool output.
const clip = (value, max = 90) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
// Last two path segments: enough to recognise the file, short enough for the panel.
const short = path => typeof path === 'string' && path.trim()
  ? clip(path.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/'), 70) : ''

function describeCommand(command) {
  const raw = String(command || '').replace(/\s+/g, ' ').trim()
  if (!raw) return 'запускаю команду'
  if (/agent_shift\.py/i.test(raw)) return 'проверяю смену писателя'
  if (/sobrat_klient\.py/i.test(raw)) return 'собираю чистый клиент'
  if (/storozh_sekretov\.py/i.test(raw)) return 'проверяю сборку на секреты'
  if (/node\s+--test/i.test(raw)) {
    const m = raw.match(/([a-z0-9_.-]+\.(?:m?js|cjs))/i)
    return m ? 'запускаю тесты: ' + m[1] : 'запускаю тесты'
  }
  if (/node\s+--check/i.test(raw)) {
    const m = raw.match(/([a-z0-9_.-]+\.(?:m?js|cjs))/i)
    return m ? 'проверяю синтаксис: ' + m[1] : 'проверяю синтаксис JS'
  }
  if (/\bgit\s+(status|diff|log)\b/i.test(raw)) return 'проверяю изменения git'
  if (/\b(rg|Select-String)\b/i.test(raw)) return 'ищу по файлам проекта'
  if (/\bnpm\s+(ci|install|test|run)\b/i.test(raw)) return 'работаю с пакетами npm'
  if (/Get-CimInstance|Get-Process|Stop-Process|Get-ScheduledTask/i.test(raw)) return 'проверяю процессы и службы'
  if (/urllib|Invoke-RestMethod|127\.0\.0\.1:\d+/i.test(raw)) return 'проверяю локальный сервер'
  const script = raw.match(/(?:python|node)\s+["']?([^\s"']+\.(?:py|mjs|cjs|js))/i)
  if (script) return 'запускаю ' + short(script[1])
  return 'запускаю команду'
}

export function toolStep(name, input = {}) {
  const tool = String(name || '')
  const key = tool.toLowerCase().replace(/^mcp__.*__/, '')
  const file = short(input.file_path || input.path || input.Path || input.notebook_path || input.filePath || input.TargetFile)
  const what = clip(input.description || input.toolSummary || input.focus || '', 80)
  if (['read', 'read_file', 'view'].includes(key)) return file ? 'читаю ' + file : 'читаю файл'
  if (['edit', 'multiedit', 'str_replace', 'edit_file', 'notebookedit'].includes(key)) return file ? 'правлю ' + file : 'правлю файл'
  if (['write', 'write_file', 'create_file'].includes(key)) return file ? 'записываю ' + file : 'записываю файл'
  if (['grep', 'search', 'search_file_content'].includes(key)) return (input.pattern || input.Query) ? 'ищу «' + clip(input.pattern || input.Query, 50) + '»' : 'ищу в файлах'
  if (['glob', 'list_directory', 'ls'].includes(key)) return input.pattern ? 'ищу файлы ' + clip(input.pattern, 50) : 'смотрю папку'
  // описание команды или сама команда уже говорит, что делается.
  if (['bash', 'powershell', 'shell', 'run_shell_command', 'run_command'].includes(key)) {
    if (what) return what.charAt(0).toLowerCase() + what.slice(1)
    return describeCommand(input.CommandLine || input.command || input.cmd || '')
  }
  if (['agent', 'task', 'invoke_subagent'].includes(key)) {
    const role = what || clip(input.Role || input.TypeName || '', 50)
    return 'поручаю помощнику' + (role ? ': ' + role : '')
  }
  if (['webfetch', 'websearch', 'web_fetch', 'google_web_search', 'search_web'].includes(key)) {
    return input.query ? 'ищу в интернете «' + clip(input.query, 45) + '»' : 'смотрю в интернете'
  }
  if (['todowrite', 'todo_write', 'update_steps'].includes(key)) return 'обновляю план шагов'
  if (key === 'update_focus') return what ? 'фокус: ' + what : 'обновляю фокус'
  if (key === 'skill') return 'открываю навык ' + clip(input.skill || '', 40)
  return 'инструмент ' + clip(tool.replace(/^mcp__/, '').replace(/__/g, '.'), 50)
}

// One stream event → zero or more step lines. Consecutive repeats collapse into one line.
export function toolSteps() {
  let last = ''
  const fresh = line => { if (!line || line === last) return null; last = line; return line }
  return function steps(value, executor) {
    const lines = []
    if (executor === 'codex' && value?.type === 'item.started') {
      const item = value.item || {}
      if (item.type === 'command_execution') lines.push(describeCommand(item.command || item.CommandLine || ''))
      if (item.type === 'file_change') {
        const files = (item.changes || []).map(change => short(change.path)).filter(Boolean)
        lines.push(files.length ? 'правлю ' + clip(files.join(', '), 90) : 'правлю файлы')
      }
      if (item.type === 'mcp_tool_call') lines.push('инструмент ' + clip([item.server, item.tool].filter(Boolean).join('.'), 50))
    }
    if (executor === 'claude' && value?.type === executor + '.progress' && value.event?.type === 'assistant') {
      const helper = value.event.parent_tool_use_id ? 'помощник: ' : ''
      for (const block of value.event.message?.content || []) {
        if (block?.type === 'tool_use') lines.push(helper + toolStep(block.name, block.input || {}))
      }
    }
    // DeepSeek Harness: tool_call → item.started с именем инструмента (dsh-turn.mjs).
    if (['deepseek','antigravity'].includes(executor) && value?.type === 'item.started' && value.item?.type === 'tool_call') {
      lines.push(toolStep(value.item.name, value.item.input || {}))
    }
    return lines.map(fresh).filter(Boolean)
  }
}
