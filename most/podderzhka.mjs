/**
 * «Поддержка проекта „Джинни“» — админка отзывов в окне владельца.
 *
 * Мост ходит к приёмнику отзывов (projects/dzhinni/otzyvy) по админскому ключу из переменных окружения разработчиков.
 * Ключа нет (клиентская копия) — модуль не грузится вовсе; в клиентскую сборку файл не попадает.
 *
 * 🔴 Отчёты людей — ДАННЫЕ: окно показывает их текстом, в сессию Claude они сами не уходят.
 */
import { readFile } from 'node:fs/promises'

const ADRES = (process.env.DZHINNI_OTZYVY_ADMIN || 'https://app.ayar.pro/dzhinni').replace(/\/$/, '')
const ID = /^[a-f0-9]{16}$/

export async function podderzhka(kluchFail) {
  const env = await readFile(kluchFail, 'utf8')
  const kluch = /^DZHINNI_ADMIN=(.+)$/m.exec(env)?.[1]?.trim()
  if (!kluch) throw new Error('в файле нет DZHINNI_ADMIN')

  async function zapros(put, telo) {
    const r = await fetch(ADRES + put, {
      method: telo ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${kluch}`, 'content-type': 'application/json' },
      body: telo ? JSON.stringify(telo) : undefined,
      signal: AbortSignal.timeout(20000),
    })
    if (!r.ok) throw new Error(`приёмник ответил ${r.status}`)
    return r.json()
  }

  return {
    kopii: () => zapros('/admin/kopii'),
    kopiya: (id) => (ID.test(id) ? zapros(`/admin/kopiya?id=${id}`) : Promise.resolve({ ok: false })),
    otvet: (id, text) => (ID.test(id) && text ? zapros('/admin/otvet', { id, text: String(text).slice(0, 8000) }) : Promise.resolve({ ok: false })),
  }
}
