// «/» в поле ввода, как в приложении Claude («и в телефоне, и на компе; команды те, что появляются
// в Клод. Первым делом компакт»). Список = свои команды Джинни + то, что сам Claude CLI присылает событием
// `commands_changed` (имя, описание, подсказка аргумента). Команда уходит в сессию беседы КАК ЕСТЬ, без обёртки моста:
// на CLI — «/compact» строкой stdin модель принимает за текст, а сообщением stream-json сжимает
// (115 тыс. → 4,7 тыс. токенов, память беседы цела). Пустая сессия: «Not enough messages to compact», модель не зовётся.

const NAME = /^[\p{L}\p{N}_.:-]+$/u

export const OWN = [
  { name: 'compact', aliases: ['компакт', 'сжать'], hint: '[что сохранить]',
    description: 'Сжать беседу и продолжить' },
  { name: 'new', aliases: ['clear', 'новая'], hint: '[первая просьба]',
    description: 'Начать новую беседу' },
]

// Команды экрана терминала Claude: в беседе без терминала им нечего показать или нечего переключить.
export const HIDDEN = new Set(['color', 'focus', 'heapdump', 'config', 'fast', 'output-style', 'rename', 'model', 'effort',
  'mcp', 'theme', 'vim', 'terminal-setup', 'exit', 'resume', 'login', 'logout', 'agents', 'extra-usage', 'usage-credits',
  '__remote-workflow', 'workflow-launch-exec', 'design', 'design-consent', 'design-revoke', 'import', 'reload-plugins',
  'auto-mode-setup', 'autocompact', 'debug', 'team-onboarding', 'list-agents', 'compact', 'clear'])

// Все команды по-русски, коротко.
// Нет строки здесь и описание не русское — описания нет вовсе: английского в меню не бывает.
const RU = {
  context: 'Сколько занято в окне беседы', usage: 'Расход и лимиты подписки', recap: 'Итог беседы одной строкой',
  init: 'Завести CLAUDE.md с описанием проекта', 'code-review': 'Проверить изменения кода на ошибки',
  'security-review': 'Проверить изменения на дыры в защите', simplify: 'Упростить изменённый код',
  doctor: 'Проверить установку Claude Code', insights: 'Отчёт по сессиям Claude Code', goal: 'Работать, пока не выполнено условие',
  'skill-doctor': 'Какие навыки не используются и занимают контекст', 'reload-skills': 'Подхватить новые навыки с диска',
  advisor: 'Советоваться с более сильной моделью', loop: 'Повторять просьбу через промежуток', schedule: 'Задача по расписанию в облаке',
  verify: 'Проверить, что правка работает', batch: 'Большая правка частями параллельно', ukompa: 'Дела «у компа» списком',
  limity: 'Контекст и лимиты подписки текстом',
  core: 'Управлять браузером', graphify: 'Граф знаний по файлам и коду', 'prompt-master': 'Составить промпт для нейросети',
  'design-sync': 'Выгрузить дизайн-систему в Claude', dataviz: 'Графики и диаграммы', 'update-config': 'Настройки Claude: права и хуки',
  'fewer-permission-prompts': 'Меньше вопросов о разрешениях', 'claude-api': 'Справка по API Claude',
  run: 'Запустить приложение и проверить', 'run-skill-generator': 'Навык запуска приложения проекта',
  'plugin-authoring': 'Сделать дополнение к Claude', ultrareview: 'Облачная проверка кода (платно)',
  'built-in-browser': 'Встроенный браузер', 'chrome-browser': 'Браузер Chrome', 'computer-use': 'Управлять компьютером',
  'deep-research': 'Глубокое исследование темы', docs: 'Документ для правки и обсуждения', docx: 'Документ Word',
  'google-workspace': 'Файлы Google: документы, таблицы, слайды', 'import-memory': 'Перенести память из другого ИИ',
  morning: 'Утренняя сводка', pdf: 'Работа с PDF', pptx: 'Презентация PowerPoint', 'skill-creator': 'Создать или улучшить навык',
  xlsx: 'Таблица Excel',
}
const russian = text => (/[а-яё]/i.test(text || '') ? text : '')

export function parseCommand(text) {
  const m = /^\s*\/([\p{L}\p{N}_.:-]+)(?:\s+([\s\S]*))?$/u.exec(String(text || ''))
  if (!m) return null
  const said = m[1].toLowerCase(), args = (m[2] || '').trim()
  const own = OWN.find(row => row.name === said || row.aliases.includes(said))
  return { name: own ? own.name : said, said, args, own: !!own }
}

export const isCompact = text => parseCommand(text)?.name === 'compact'

// Known names of Claude's list (names and aliases), lower case.
function knownNames(list) {
  const names = new Set()
  for (const row of Array.isArray(list) ? list : []) {
    if (typeof row?.name === 'string') names.add(row.name.toLowerCase())
    for (const alias of Array.isArray(row?.aliases) ? row.aliases : []) if (typeof alias === 'string') names.add(alias.toLowerCase())
  }
  return names
}

// The text that goes into Claude's session as is, or null (ordinary message; «/new» is handled by askedFresh).
export function rawCommand(text, claudeList) {
  const cmd = parseCommand(text)
  if (!cmd) return null
  if (cmd.name === 'compact') return '/compact' + (cmd.args ? ' ' + cmd.args : '')
  if (cmd.own || HIDDEN.has(cmd.name) || !knownNames(claudeList).has(cmd.name)) return null
  return String(text).trim()
}

const shortText = value => {
  const text = String(value || '').replace(/\s*\((?:user|project|plugin|bundled|MCP)\)\s*$/i, '').replace(/\s+/g, ' ').trim()
  const first = /^(.{20,160}?[.!?])(\s|$)/.exec(text)
  return (first ? first[1] : text).slice(0, 160)
}

// Normalized list from Claude's `commands_changed`: [{ name, description, hint, aliases }].
export function claudeCommandsFrom(commands) {
  if (!Array.isArray(commands)) return []
  const rows = []
  for (const row of commands.slice(0, 300)) {
    const name = typeof row?.name === 'string' ? row.name.trim() : ''
    if (!name || !NAME.test(name) || name.length > 80) continue
    rows.push({ name, description: shortText(row.description), hint: typeof row.argumentHint === 'string' ? row.argumentHint.slice(0, 80) : '',
      aliases: (Array.isArray(row.aliases) ? row.aliases : []).filter(alias => typeof alias === 'string' && NAME.test(alias)).slice(0, 5) })
  }
  return rows
}

// What the «/» menu shows: Jinny's own first, then Claude's in its own order, without screen-only ones.
export function commandList(claudeList, { executor = 'claude' } = {}) {
  const seen = new Set(), list = []
  for (const row of OWN) { seen.add(row.name); list.push({ name: row.name, description: row.description, hint: row.hint, aliases: row.aliases, source: 'dzhinni' }) }
  // Codex and others do not take Claude's commands: only Jinny's own work there.
  if (!['claude', 'tokenator', 'auto'].includes(executor)) return list
  for (const row of Array.isArray(claudeList) ? claudeList : []) {
    const key = String(row?.name || '').toLowerCase()
    if (!key || seen.has(key) || HIDDEN.has(key)) continue
    seen.add(key)
    list.push({ name: row.name, description: RU[key] || russian(row.description), hint: row.hint || '', aliases: row.aliases || [], source: 'claude' })
  }
  return list
}

// Russian answer of a command turn that ended without the model's own text (compact, local command output).
export function commandAnswer({ name, compacted = null, compactError = null, output = '', text = '' }) {
  const k = n => Math.max(1, Math.round(Number(n) / 1000))
  if (name === 'compact' && compacted) {
    const pre = Number(compacted.pre_tokens), post = Number(compacted.post_tokens)
    return pre > 0 && post > 0 ? `владелец, сжала беседу: было ${k(pre)} тыс. токенов, стало ${k(post)} тыс. Продолжаем в той же сессии.`
      : 'владелец, беседа сжата, продолжаем в той же сессии.'
  }
  if (name === 'compact' && compactError) {
    return /not enough messages/i.test(compactError) ? 'владелец, сжимать пока нечего: в беседе ещё мало сообщений.'
      : 'владелец, сжать беседу не вышло: ' + String(compactError).slice(0, 300)
  }
  const said = String(text || '').trim()
  if (said) return said
  const out = String(output || '').trim()
  return out ? 'владелец, ответ команды /' + name + ':\n\n' + out.slice(0, 6000) : ''
}
