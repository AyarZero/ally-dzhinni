// Свод правил общения с пользователем подкладывается перед КАЖДЫМ ходом любого исполнителя.
// Аналог SessionStart Claude, но в ядре: одинаков для Codex, Claude и следующих.
// Источник истины — rules/obshchenie_svod.md; здесь только чтение с потолком размера.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const SVOD_PATH = 'rules/obshchenie_svod.md'
export const SVOD_MAX_CHARS = 9000

export function rulesSvod(repo) {
  let body
  try { body = readFileSync(join(repo, SVOD_PATH), 'utf8') }
  catch (e) {
    if (e?.code === 'ENOENT') return { ok: false, text: `Свод правил общения не найден (${SVOD_PATH}). Действуй по CLAUDE.md и сообщи владельцу, что свод потерян.` }
    throw e
  }
  body = body.replace(/^﻿/, '').trim()
  if (body.length > SVOD_MAX_CHARS) return { ok: false, text: `Свод правил общения (${SVOD_PATH}) длиннее ${SVOD_MAX_CHARS} знаков и не подан целиком. Прочитай файл сам и сообщи владельцу, что свод надо сократить.` }
  return { ok: true, text: `Правила общения с владельцем (обязательны в этом ходе; источник ${SVOD_PATH}):\n${body}` }
}
