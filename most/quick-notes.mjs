// Owner quick notes storage and Markdown export without invoking models.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

const KINDS = { note: 'Заметка', bug: 'Баг', task: 'Задача' }

function notesFile(dataDir) {
  return join(dataDir, 'quick-notes.json')
}

function markdownTarget(repo, dataDir) {
  const metaDir = join(repo, 'memory', '_meta')
  return existsSync(metaDir) ? join(metaDir, 'BYSTRYE_ZAMETKI.md') : join(dataDir, 'quick-notes.md')
}

async function readList(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function syncMarkdown(repo, dataDir, notes) {
  const header = '# Быстрые заметки\n\n> Записаны из окна AllY без прерывания текущего хода.\n\n'
  const rows = notes.length
    ? notes.slice().reverse().map(n => `- **[${KINDS[n.kind] || 'Заметка'}]** (${n.at}) — ${n.text}`).join('\n')
    : '_Пока пусто._'
  await writeFile(markdownTarget(repo, dataDir), header + rows + '\n', 'utf8')
}

export async function listQuickNotes({ dataDir }) {
  return readList(notesFile(dataDir))
}

export async function addQuickNote({ repo, dataDir, kind, text }) {
  const cleanText = String(text || '').trim()
  const cleanKind = KINDS[kind] ? kind : 'note'
  if (!cleanText || cleanText.length > 7000) {
    throw Object.assign(new Error('Напиши заметку до 7000 символов'), { status: 400 })
  }
  await mkdir(dataDir, { recursive: true })
  const file = notesFile(dataDir)
  const notes = await readList(file)
  const note = { id: randomUUID(), kind: cleanKind, text: cleanText, at: new Date().toISOString() }
  notes.push(note)
  const trimmed = notes.slice(-300)
  await writeFile(file, JSON.stringify(trimmed, null, 2), 'utf8')
  await syncMarkdown(repo, dataDir, trimmed)
  return { note, notes: trimmed }
}

export async function deleteQuickNote({ repo, dataDir, id }) {
  const target = String(id || '').trim()
  if (!target) throw Object.assign(new Error('Не указан идентификатор заметки'), { status: 400 })
  await mkdir(dataDir, { recursive: true })
  const file = notesFile(dataDir)
  const notes = (await readList(file)).filter(item => item.id !== target)
  await writeFile(file, JSON.stringify(notes, null, 2), 'utf8')
  await syncMarkdown(repo, dataDir, notes)
  return { notes }
}
