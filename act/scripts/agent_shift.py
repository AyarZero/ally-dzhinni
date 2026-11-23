"""Добровольная общая очередь писателя; не ограничивает доступ средствами ОС.

Коды: 0 — успех, 1 — ошибка/повреждённое состояние, 2 — место занято.
Сбой при записи оставляет блокирующий файл для ручного разбора.

Брошенная смена (08.11.2026): при захвате запоминается процесс агента-держателя.
Умер держатель (кончились лимиты, закрыли окно) или смена без держателя старше 12 ч —
`status` показывает "stale", а следующий `acquire` забирает её сам; снятая запись
дописывается в .agent-writer.stale.jsonl. Живую смену так забрать нельзя.
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent_shift_zhivoy import брошена, держатель  # noqa: E402


DEFAULT_ROOT = Path(__file__).resolve().parents[2]
LOCK_NAME = ".agent-writer.json"
STALE_LOG = ".agent-writer.stale.jsonl"
AGENTS = ("codex", "claude", "opencode", "qoder", "deepseek", "antigravity")


def inspect(path):
    try:
        with path.open(encoding="utf-8") as stream:
            state = json.load(stream)
        if not isinstance(state, dict) or state.get("agent") not in AGENTS:
            raise ValueError("invalid agent")
        for key in ("session", "scope", "acquired_at"):
            if not isinstance(state.get(key), str) or not state[key].strip():
                raise ValueError("invalid " + key)
        result = {"status": "busy", "reservation": state}
        stale = брошена(state)
        if stale:
            result["stale"] = stale
        return result
    except FileNotFoundError:
        # В том числе блокируем существующую битую символическую ссылку.
        if path.is_symlink():
            return {"status": "corrupt", "error": "dangling symlink"}
        return {"status": "free"}
    except (OSError, ValueError) as exc:
        return {"status": "corrupt", "error": str(exc)}


def снять_брошенную(path, seen):
    """Убрать именно ту смену, что признана брошенной. Гонка двух захватчиков: файл сперва
    уводится под уникальное имя; если там уже чужая СВЕЖАЯ смена — возвращается на место."""
    aside = path.with_name(f"{path.name}.{os.getpid()}.stale")
    try:
        os.rename(path, aside)
    except OSError:
        return False
    try:
        with aside.open(encoding="utf-8") as stream:
            now = json.load(stream)
    except (OSError, ValueError):
        now = None
    if isinstance(now, dict) and now.get("session") == seen.get("session") and now.get("acquired_at") == seen.get("acquired_at"):
        aside.unlink()
        return True
    try:
        os.rename(aside, path)
    except OSError:
        pass  # слот уже занят третьим — его смена главная, наша копия остаётся рядом для разбора
    return False


def nonblank(value):
    if not value.strip():
        raise argparse.ArgumentTypeError("must not be blank")
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("status", "acquire", "release"):
        command = commands.add_parser(name)
        command.add_argument("--root", type=Path, default=argparse.SUPPRESS)
        if name != "status":
            command.add_argument("--session", required=True, type=nonblank)
        if name == "release":
            # --force снимает забытую чужую смену; это явное действие владельца, не обход очереди.
            command.add_argument("--force", action="store_true")
        if name == "acquire":
            command.add_argument("--agent", choices=AGENTS, required=True)
            command.add_argument("--scope", required=True, type=nonblank)
    args = parser.parse_args(argv)
    path = args.root / LOCK_NAME
    code = 0
    try:
        if args.command == "acquire":
            state = dict(agent=args.agent, session=args.session, scope=args.scope,
                         acquired_at=datetime.now(timezone.utc).isoformat())
            hold = держатель()
            if hold:
                state["holder"] = hold
            taken = None
            for _ in range(2):
                try:
                    # O_EXCL: существующий файл не открывается и не перезаписывается.
                    stream = path.open("x", encoding="utf-8")
                except FileExistsError:
                    result, code = inspect(path), 2
                    if taken is None and result.get("stale") and снять_брошенную(path, result["reservation"]):
                        # Брошенную смену снимаем ровно один раз и с записью в журнал.
                        taken = dict(result["reservation"], stale=result["stale"],
                                     taken_by=args.session, taken_at=state["acquired_at"])
                        with (args.root / STALE_LOG).open("a", encoding="utf-8") as log:
                            log.write(json.dumps(taken, ensure_ascii=False) + "\n")
                        continue
                    break
                else:
                    with stream:
                        json.dump(state, stream, ensure_ascii=True)
                        stream.write("\n")
                    result, code = {"status": "busy", "reservation": state, "acquired": True}, 0
                    if taken:
                        result["taken_over"] = taken
                    break
        else:
            result = inspect(path)
            if result["status"] == "corrupt":
                code = 1
            elif args.command == "release":
                if result["status"] == "free":
                    result, code = {"status": "free", "error": "no reservation"}, 1
                elif result["reservation"]["session"] != args.session and not args.force:
                    result["error"], code = "foreign session", 1
                else:
                    freed = result["reservation"]
                    path.unlink()
                    result = {"status": "free", "released": True}
                    if freed["session"] != args.session:
                        result["forced"] = freed
    except OSError as exc:
        result, code = {"status": "error", "error": str(exc)}, 1
    print(json.dumps(result, ensure_ascii=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
