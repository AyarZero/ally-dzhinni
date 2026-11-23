# Впечатать команду во ввод консоли процесса (сессии Claude Code), не трогая фокус окон.
# Цепляемся к консоли процесса -ProcId и кладём нажатия прямо в её буфер ввода (WriteConsoleInput).
# Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File nazhat.ps1 -ProcId 1234 -Text "/compact"
param([Parameter(Mandatory)][int]$ProcId, [Parameter(Mandatory)][string]$Text, [switch]$NoEnter)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Nazhat {
  [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode)]
  struct INPUT_RECORD { [FieldOffset(0)] public ushort EventType; [FieldOffset(4)] public KEY_EVENT_RECORD Key; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct KEY_EVENT_RECORD { public int bKeyDown; public ushort wRepeatCount; public ushort wVirtualKeyCode; public ushort wVirtualScanCode; public char UnicodeChar; public uint dwControlKeyState; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AttachConsole(int pid);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool WriteConsoleInputW(IntPtr h, INPUT_RECORD[] rec, uint n, out uint written);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  static INPUT_RECORD Key(char c, ushort vk, bool down) {
    var r = new INPUT_RECORD(); r.EventType = 1;
    r.Key.bKeyDown = down ? 1 : 0; r.Key.wRepeatCount = 1; r.Key.wVirtualKeyCode = vk; r.Key.UnicodeChar = c;
    return r;
  }
  public static string Send(int pid, string text, bool enter) {
    FreeConsole();
    if (!AttachConsole(pid)) return "не прицепилась к консоли процесса " + pid + " (ошибка " + Marshal.GetLastWin32Error() + ")";
    try {
      IntPtr h = CreateFileW("CONIN$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
      if (h == new IntPtr(-1)) return "нет доступа к вводу консоли (ошибка " + Marshal.GetLastWin32Error() + ")";
      var recs = new System.Collections.Generic.List<INPUT_RECORD>();
      foreach (char c in text) { recs.Add(Key(c, 0, true)); recs.Add(Key(c, 0, false)); }
      if (enter) { recs.Add(Key('\r', 0x0D, true)); recs.Add(Key('\r', 0x0D, false)); }
      uint w; bool ok = WriteConsoleInputW(h, recs.ToArray(), (uint)recs.Count, out w);
      CloseHandle(h);
      return ok ? "ok " + w : "не записалось (ошибка " + Marshal.GetLastWin32Error() + ")";
    } finally { FreeConsole(); }
  }
}
'@
$r = [Nazhat]::Send($ProcId, $Text, -not $NoEnter)
[Console]::Error.WriteLine($r)
if ($r -notlike 'ok*') { exit 1 }
