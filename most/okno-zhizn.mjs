// «при закрытии программы мост закрывался сам через 9 минут, если только Джинни не запустили
// вновь в эти 9 минут. И на телефоне чтобы таймер шёл, сколько осталось».
// Окно (страница моста в Electron) шлёт «жива» раз в 20 с и «закрыта» при выгрузке. Отсчёт взводится, только
// если окно было видно хотя бы раз: мост, поднятый при входе в Windows без окна, живёт как раньше.
// Срок пишется в файл — перезапуск моста после хода отсчёт не теряет. Идёт ход — мост ждёт его конца.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'

export const ZAKRYTIE_MS = 9 * 60e3
// Свёрнутое окно Chromium будит таймеры раз в минуту — тишину дольше 3 минут считаем закрытием.
export const TISHINA_MS = 3 * 60e3

export function oknoZhizn({ file, busy = () => false, exit = () => process.exit(0), now = Date.now,
  graceMs = ZAKRYTIE_MS, quietMs = TISHINA_MS, log = () => {} }) {
  let seen = 0, deadline = null
  try { const saved = JSON.parse(readFileSync(file, 'utf8')); if (Number(saved.deadline) > 0) { deadline = Number(saved.deadline); seen = Number(saved.seen) || 1 } } catch {}
  const save = () => {
    try { if (deadline) writeFileSync(file, JSON.stringify({ deadline, seen })); else unlinkSync(file) } catch {}
  }
  const arm = (why, at) => {
    if (deadline) return
    deadline = at + graceMs; save()
    log(`окно ${why} — мост закроется в ${new Date(deadline).toLocaleTimeString('ru-RU')}, если окно не откроют`)
  }
  return {
    zhiva() { seen = now(); if (deadline) { deadline = null; save(); log('окно снова открыто — закрытие моста отменено') } },
    zakryta() { if (seen) arm('закрыто', now()) },
    tick() {
      if (!deadline && seen && now() - seen > quietMs) arm('молчит ' + Math.round((now() - seen) / 60e3) + ' мин', seen + quietMs)
      if (deadline && now() >= deadline && !busy()) { deadline = null; save(); log('окно не открыли за 9 минут — закрываю мост'); exit() }
    },
    status() {
      if (!deadline) return null
      return { deadline, ostalosMs: Math.max(0, deadline - now()), zhdyotHod: now() >= deadline && busy() }
    },
  }
}
