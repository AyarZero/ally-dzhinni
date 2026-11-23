"""Живость держателя смены писателя (страж к agent_shift.py, ).

Повод: у Qoder кончились лимиты, его сессия умерла, а смена висела сутки — Джинни и
другие агенты стояли «только чтение». Теперь при захвате запоминается процесс агента
(ближайший предок из AGENT_EXE: claude/qodercli/codex/opencode/node) с временем запуска
(защита от переиспользования PID). Смена брошена, если этого процесса больше нет, а
если держатель не опознан — когда она старше ПОТОЛОК_ЧАСОВ.

Только Windows API через ctypes: psutil в системном Python нет.
"""
import ctypes
import os
import sys
from ctypes import wintypes
from datetime import datetime, timezone

AGENT_EXE = ("claude.exe", "qodercli.exe", "qoder.exe", "codex.exe", "opencode.exe", "node.exe")
ПОТОЛОК_ЧАСОВ = 12

TH32CS_SNAPPROCESS = 0x2
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


class PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("th32ProcessID", wintypes.DWORD),
                ("th32DefaultHeapID", ctypes.c_size_t), ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long), ("dwFlags", wintypes.DWORD),
                ("szExeFile", ctypes.c_wchar * 260)]


def _процессы():
    """{pid: (ppid, имя_exe_в_нижнем_регистре)} — снимок всех процессов."""
    k32 = ctypes.windll.kernel32
    k32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    snap = k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snap in (None, wintypes.HANDLE(-1).value):
        return {}
    итог, entry = {}, PROCESSENTRY32W()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
    try:
        ok = k32.Process32FirstW(snap, ctypes.byref(entry))
        while ok:
            итог[entry.th32ProcessID] = (entry.th32ParentProcessID, entry.szExeFile.lower())
            ok = k32.Process32NextW(snap, ctypes.byref(entry))
    finally:
        k32.CloseHandle(snap)
    return итог


def время_запуска(pid):
    """Время создания процесса (FILETIME как int) или None, если процесса нет."""
    k32 = ctypes.windll.kernel32
    k32.OpenProcess.restype = wintypes.HANDLE
    h = k32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
    if not h:
        return None
    try:
        c, e, kk, u = (wintypes.FILETIME() for _ in range(4))
        if not k32.GetProcessTimes(h, ctypes.byref(c), ctypes.byref(e), ctypes.byref(kk), ctypes.byref(u)):
            return None
        return (c.dwHighDateTime << 32) | c.dwLowDateTime
    finally:
        k32.CloseHandle(h)


def держатель(pid=None):
    """Ближайший предок-агент текущего процесса: {pid, exe, started} или None."""
    if os.name != "nt":
        return None
    try:
        таблица = _процессы()
        pid = pid or os.getpid()
        виденные = set()
        while pid and pid not in виденные and pid in таблица:
            виденные.add(pid)
            ppid, exe = таблица[pid]
            if pid != os.getpid() and exe in AGENT_EXE:
                started = время_запуска(pid)
                return {"pid": pid, "exe": exe, "started": started} if started else None
            pid = ppid
    except Exception:
        return None
    return None


def брошена(reservation, now=None):
    """Причина, по которой смену можно забрать, или None (смена жива)."""
    hold = reservation.get("holder")
    if isinstance(hold, dict) and hold.get("pid") and hold.get("started"):
        if os.name == "nt" and время_запуска(hold["pid"]) != hold["started"]:
            return "holder_dead"
        return None
    try:
        since = datetime.fromisoformat(reservation["acquired_at"])
    except (KeyError, ValueError):
        return "no_time"
    now = now or datetime.now(timezone.utc)
    if (now - since).total_seconds() > ПОТОЛОК_ЧАСОВ * 3600:
        return f"older_than_{ПОТОЛОК_ЧАСОВ}h"
    return None


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(держатель())
