// Живо ли фоновое дело из .processy/<id>.json.
// С pid — судим по процессу. Без pid (так пишут помощники) — по свежести файла: молчит 15 минут, как «молчит» у
// помощников в claude-monitor, — значит брошено, и в «Джинни делает» не висит.
export const MOLCHIT_MS = 15 * 60e3

export function stoit(p, now = Date.now(), zhiv = () => true) {
  if (!(Number(p?.progress) < 100)) return false
  if (p.pid) return !zhiv(p.pid)
  return now - (Number(p.at) || 0) > MOLCHIT_MS
}
