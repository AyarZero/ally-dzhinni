// Interaction ratings: not a section in the chat, but a record in a journal that a daily
// review turns into changes of the routing rules. The lead puts its rating into one hidden block at the end of
// the answer; the bridge cuts it out before the chat and stores it with the facts of the turn.
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCK = /<ocenka>([\s\S]*?)<\/ocenka>/gi

// The text without rating blocks, and the blocks themselves (JSON when it parses, otherwise text).
export function splitOcenka(value) {
  if (typeof value !== 'string' || !/<ocenka>/i.test(value)) return { text: value, ocenki: [] }
  const ocenki = []
  const keep = body => {
    const raw = body.trim()
    try { ocenki.push(JSON.parse(raw)) } catch { ocenki.push({ tekst: raw.slice(0, 4000) }) }
    return ''
  }
  let text = value.replace(BLOCK, (_, body) => keep(body))
  // A block with a wrong or missing end still never reaches the chat:
  // the rating stands at the very end of the answer, so everything from its opening tag on is cut.
  const open = text.search(/<ocenka>/i)
  if (open >= 0) { keep(text.slice(open + '<ocenka>'.length).replace(/<\/[\w-]*>?\s*$/, '')); text = text.slice(0, open) }
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), ocenki }
}

export const ocenkiDir = repo => join(repo, 'coordination', 'ocenki')
const day = at => new Date(at - new Date(at).getTimezoneOffset() * 60e3).toISOString().slice(0, 10)

// One line per finished turn of the lead: facts from the bridge + the lead's own rating (may be absent).
export async function zapisatOcenku(repo, record) {
  const at = record.at || Date.now()
  const dir = ocenkiDir(repo)
  await mkdir(dir, { recursive: true })
  await appendFile(join(dir, day(at) + '.jsonl'), JSON.stringify({ ...record, at: new Date(at).toISOString() }) + '\n', 'utf8')
}

export const OCENKA_PROMPT = 'После результата добавь в самый конец ответа ОДИН скрытый блок <ocenka>{…}</ocenka> с JSON — ' +
  'замер связки «ведущая ↔ помощники», а не самооценка. Поля: poruchila (кому что поручила, [] если никому), ' +
  'brif (полнота брифа), zhdala_s, peredelok, produktivnost («высокая»/«средняя»/«низкая»/«без помощников»), ' +
  'srabotalo, meshalo, izmenit (что поменять в брифе, распределении или профиле помощника), ' +
  'mozhno_bylo_otdat (если помощников не было: какую часть и почему не отдала). ' +
  'Джинни вырежет блок из чата и запишет в журнал оценок; раз в сутки разбор правит правила распределения работы. ' +
  'Об оценке в тексте ответа владельцу НЕ пиши.'
