// Острова: к какому навыку («острову») относится действие сессии и сколько раз к нему обращались за день
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Особые острова — не навыки, а места памяти; страница рисует их у самого ядра
export const OSOBYE = { _pamyat: 'Память', _zadachi: 'Задачи' }
// Встроенные помощники Claude Code — по-русски; свои помощники берут имя из шапки .claude/agents/<имя>.md
export const AGENTY = {
  'general-purpose': 'Помощник', claude: 'Помощник', работник: 'Помощник', Explore: 'Поиск по файлам', Plan: 'Планировщик',
  'web-fetch': 'Чтение веб-страниц', 'claude-code-guide': 'Справка по Claude Code', 'statusline-setup': 'Настройка строки состояния',
}

// Путь может стоять в начале, после слеша или внутри текста команды и брифа (после пробела, кавычки, скобки)
const PUT_NAVYKA = /(?:^|[\\/\s"'`(])skills[\\/]([a-z0-9][a-z0-9_-]*)(?:[\\/\s"'`)]|$)/i
const PUT_PAMYATI = /(?:^|[\\/\s"'`(])(?:memory|pamyat)(?:[\\/]|$)/i
const PUT_ZADACH = /(?:^|[\\/\s"'`(])задачи(?:[\\/]|$)/i

function poPuti(s) {
  const t = String(s ?? '')
  const m = t.match(PUT_NAVYKA)
  if (m) return m[1].toLowerCase()
  if (PUT_PAMYATI.test(t)) return '_pamyat'
  if (PUT_ZADACH.test(t)) return '_zadachi'
  return null
}

// { ostrov, agent } — что из этого известно; null, если действие ни к какому острову не ведёт
export function ostrovDeystviya(tool, a = {}) {
  let ostrov = null, agent = null
  switch (tool) {
    case 'Skill': ostrov = String(a.skill ?? '').split(':').pop().split('/').pop().toLowerCase() || null; break
    case 'Agent': agent = String(a.subagent_type || 'работник'); ostrov = poPuti(a.prompt); break
    case 'Read': case 'Edit': case 'Write': ostrov = poPuti(a.file_path); break
    case 'NotebookEdit': ostrov = poPuti(a.notebook_path); break
    case 'Grep': case 'Glob': ostrov = poPuti(a.path) || poPuti(a.pattern) || poPuti(a.glob); break
    case 'Bash': case 'PowerShell': ostrov = poPuti(a.command); break
  }
  if (!ostrov && !agent) return null
  return { ...(ostrov && { ostrov }), ...(agent && { agent }) }
}

// Обращения к островам за день по ленте хода: { имя: { n, posl } }
export async function schetDnya(hodDir, den) {
  const out = {}
  let txt = ''
  try { txt = await readFile(join(hodDir, den + '.jsonl'), 'utf8') } catch { return out }
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue
    let h
    try { h = JSON.parse(line) } catch { continue }
    if (!h.ostrov) continue
    const o = (out[h.ostrov] ??= { n: 0, posl: 0 })
    o.n++
    o.posl = Math.max(o.posl, h.at || 0)
  }
  return out
}
