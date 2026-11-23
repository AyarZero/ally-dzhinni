using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("AllY")]
[assembly: AssemblyDescription("AllY · Джинни — локальный клиент")]
[assembly: AssemblyProduct("AllY · Джинни")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace AllYLaunchers
{
    internal static class AllYLauncher
    {
        private const int ATTACH_PARENT_PROCESS = -1;
        private static readonly Regex AnsiRegex = new Regex(@"\x1B\[[0-9;?]*[ -/]*[@-~]", RegexOptions.Compiled);
        private static readonly Regex ElectronPctRegex = new Regex(@"Downloading\s+electron[^\r\n]*?(\d{1,3})%(?:[^\r\n]*?ETA:\s*([0-9.]+\s*s(?:ec(?:onds?)?)?))?", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AttachConsole(int dwProcessId);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static int Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(
                Path.DirectorySeparatorChar,
                Path.AltDirectorySeparatorChar
            );
            string targetExe = Path.Combine(baseDir, "programma", "Dzhinni.exe");
            string setupPs1 = Path.Combine(baseDir, "ustanovka.ps1");

            if (HasArg(args, new[] { "-proverka", "--proverka", "/proverka", "-check", "--check", "/check" }))
            {
                return RunCheck(baseDir, setupPs1);
            }

            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (HasArg(args, new[] { "--preview-ui", "-preview-ui" }))
            {
                return RunPreviewUi();
            }

            bool noSplash = HasArg(args, new[] { "--no-splash", "-no-splash" });
            if (File.Exists(targetExe))
            {
                return StartDesktopApp(targetExe, baseDir, noSplash);
            }

            return RunFirstTimeSetupAndStart(baseDir, setupPs1, targetExe);
        }

        private static bool HasArg(string[] args, string[] candidates)
        {
            if (args == null) return false;
            foreach (string raw in args)
            {
                if (string.IsNullOrEmpty(raw)) continue;
                string a = raw.Trim().ToLowerInvariant();
                foreach (string c in candidates)
                {
                    if (a == c) return true;
                }
            }
            return false;
        }

        private static int RunCheck(string baseDir, string setupPs1)
        {
            bool attached = AttachConsole(ATTACH_PARENT_PROCESS);
            bool redirected = Console.IsOutputRedirected;
            bool hasOutput = attached || redirected;
            if (!File.Exists(setupPs1))
            {
                string missing = "Не найден файл ustanovka.ps1 рядом с AllY.exe.";
                if (hasOutput) WriteConsole(missing, true, redirected);
                else MessageBox.Show(missing, "AllY · Проверка", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            string escapedPs1 = EscapePsSingleQuoted(setupPs1);
            string psCommand =
                "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " +
                "& '" + escapedPs1 + "' -Proverka";

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"" + psCommand + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            try
            {
                using (Process proc = Process.Start(psi))
                {
                    string stdout = proc.StandardOutput.ReadToEnd();
                    string stderr = proc.StandardError.ReadToEnd();
                    proc.WaitForExit();

                    string combined = (stdout + Environment.NewLine + stderr).Trim();
                    if (hasOutput)
                    {
                        if (!string.IsNullOrEmpty(stdout)) WriteConsole(stdout.TrimEnd(), false, redirected);
                        if (!string.IsNullOrEmpty(stderr)) WriteConsole(stderr.TrimEnd(), true, redirected);
                    }
                    else
                    {
                        MessageBox.Show(
                            string.IsNullOrEmpty(combined)
                                ? (proc.ExitCode == 0 ? "Проверка завершена успешно." : "Проверка завершилась с ошибкой.")
                                : combined,
                            "AllY · Проверка сборки",
                            MessageBoxButtons.OK,
                            proc.ExitCode == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning
                        );
                    }
                    return proc.ExitCode;
                }
            }
            catch (Exception ex)
            {
                string err = "Не удалось запустить проверку: " + ex.Message;
                if (hasOutput) WriteConsole(err, true, redirected);
                else MessageBox.Show(err, "AllY · Проверка сборки", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static int RunPreviewUi()
        {
            using (SetupSplashForm form = new SetupSplashForm(false))
            {
                int tick = 0;
                var demo = new System.Windows.Forms.Timer();
                demo.Interval = 50;
                demo.Tick += delegate
                {
                    tick++;
                    if (tick == 1) form.SetStage("Проверяю систему…", "Node.js 24+, Python 3 и Git найдены", 12f, 16f);
                    else if (tick == 10) form.SetStage("Устанавливаю модули моста…", "Загрузка зависимостей из npm", 26f, 34f);
                    else if (tick == 18) form.SetStage("Загружаю движок окна…", "Electron · 56% · осталось 3.4 сек", 62f, 80f);
                    else if (tick == 44) form.SetStage("Собираю приложение AllY…", "Формирую programma\\Dzhinni.exe", 90f, 96f);
                    else if (tick == 56) form.MarkSuccess("Готово! Запускаю AllY…", "Открываю окно приложения");
                    else if (tick == 68)
                    {
                        demo.Stop();
                        form.BeginFadeOutAndClose();
                    }
                };
                form.Shown += delegate { demo.Start(); };
                Application.Run(form);
                return 0;
            }
        }

        private static int StartDesktopApp(string targetExe, string workingDir, bool noSplash)
        {
            Process launched = null;
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = targetExe,
                    WorkingDirectory = workingDir,
                    UseShellExecute = true
                };
                launched = Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Не удалось запустить AllY (programma\\Dzhinni.exe):\n" + ex.Message,
                    "AllY · Джинни",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return 1;
            }

            if (noSplash || launched == null)
            {
                return 0;
            }

            using (SetupSplashForm splash = new SetupSplashForm(true))
            {
                int elapsedMs = 0;
                bool closing = false;
                var watcher = new System.Windows.Forms.Timer();
                watcher.Interval = 80;
                watcher.Tick += delegate
                {
                    if (closing) return;
                    elapsedMs += 80;
                    bool done = false;
                    try
                    {
                        launched.Refresh();
                        if (launched.HasExited) done = true;
                        else if (elapsedMs >= 150 && launched.MainWindowHandle != IntPtr.Zero) done = true;
                    }
                    catch
                    {
                        done = elapsedMs >= 150;
                    }

                    if (done || elapsedMs >= 2000)
                    {
                        closing = true;
                        watcher.Stop();
                        splash.BeginFadeOutAndClose();
                    }
                };
                splash.Shown += delegate { watcher.Start(); };
                splash.FormClosed += delegate { watcher.Stop(); watcher.Dispose(); };
                Application.Run(splash);
                return 0;
            }
        }

        private static int RunFirstTimeSetupAndStart(string baseDir, string setupPs1, string targetExe)
        {
            if (!File.Exists(setupPs1))
            {
                MessageBox.Show(
                    "Не найден файл ustanovka.ps1 рядом с AllY.exe.\nРаспакуйте архив AllY полностью в одну папку.",
                    "AllY · Джинни",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return 1;
            }

            int finalExitCode = 1;
            using (SetupSplashForm form = new SetupSplashForm(false))
            {
                Process activeProc = null;
                bool cancelled = false;
                object procLock = new object();

                Action startInstall = null;
                startInstall = delegate
                {
                    var worker = new Thread(delegate()
                    {
                        cancelled = false;
                        int code = ExecuteHiddenSetup(baseDir, setupPs1, targetExe, form, procLock, delegate(Process p) { activeProc = p; }, delegate { return cancelled; });
                        if (cancelled)
                        {
                            finalExitCode = 1;
                            form.BeginFadeOutAndClose();
                            return;
                        }
                        if (code == 0 && File.Exists(targetExe))
                        {
                            finalExitCode = 0;
                            form.MarkSuccess("Готово! Запускаю AllY…", "Открываю рабочее окно приложения");
                            Process launched = null;
                            try
                            {
                                launched = Process.Start(new ProcessStartInfo
                                {
                                    FileName = targetExe,
                                    WorkingDirectory = baseDir,
                                    UseShellExecute = true
                                });
                            }
                            catch (Exception ex)
                            {
                                finalExitCode = 1;
                                form.MarkError("Сборка завершена, но окно не открылось", ex.Message);
                                return;
                            }

                            for (int i = 0; i < 18; i++)
                            {
                                Thread.Sleep(100);
                                try
                                {
                                    if (launched == null) break;
                                    launched.Refresh();
                                    if (launched.HasExited) break;
                                    if (i >= 4 && launched.MainWindowHandle != IntPtr.Zero) break;
                                }
                                catch { break; }
                            }
                            form.BeginFadeOutAndClose();
                        }
                        else
                        {
                            finalExitCode = code != 0 ? code : 1;
                        }
                    });
                    worker.IsBackground = true;
                    worker.Start();
                };

                form.RetryRequested += delegate
                {
                    form.ResetForRetry();
                    startInstall();
                };

                form.CancelRequested += delegate
                {
                    cancelled = true;
                    Process toKill = null;
                    lock (procLock) { toKill = activeProc; }
                    if (toKill != null)
                    {
                        KillProcessTree(toKill);
                    }
                    form.BeginFadeOutAndClose();
                };

                form.Shown += delegate { startInstall(); };
                Application.Run(form);
            }
            return finalExitCode;
        }

        private static int ExecuteHiddenSetup(
            string baseDir,
            string setupPs1,
            string targetExe,
            SetupSplashForm form,
            object procLock,
            Action<Process> setActiveProc,
            Func<bool> isCancelled)
        {
            string escapedPs1 = EscapePsSingleQuoted(setupPs1);
            string command =
                "$OutputEncoding=[System.Text.Encoding]::UTF8; " +
                "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " +
                "& '" + escapedPs1 + "'";

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"" + command + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            var recentErrors = new List<string>();
            object errLock = new object();

            try
            {
                using (Process proc = Process.Start(psi))
                {
                    lock (procLock) { setActiveProc(proc); }

                    Thread outThread = new Thread(delegate()
                    {
                        ReadStreamLines(proc.StandardOutput, delegate(string rawLine)
                        {
                            HandleSetupLine(rawLine, false, form, recentErrors, errLock);
                        });
                    });
                    Thread errThread = new Thread(delegate()
                    {
                        ReadStreamLines(proc.StandardError, delegate(string rawLine)
                        {
                            HandleSetupLine(rawLine, true, form, recentErrors, errLock);
                        });
                    });
                    outThread.IsBackground = true;
                    errThread.IsBackground = true;
                    outThread.Start();
                    errThread.Start();

                    proc.WaitForExit();
                    outThread.Join(1200);
                    errThread.Join(1200);
                    lock (procLock) { setActiveProc(null); }

                    if (isCancelled()) return 1;

                    if (proc.ExitCode == 0 && File.Exists(targetExe)) return 0;

                    string detail = PickErrorSummary(recentErrors, proc.ExitCode);
                    form.MarkError("Не удалось установить AllY", detail);
                    return proc.ExitCode != 0 ? proc.ExitCode : 1;
                }
            }
            catch (Exception ex)
            {
                form.AppendLog("Ошибка запуска PowerShell: " + ex.Message);
                form.MarkError("Не удалось запустить установщик", ex.Message);
                return 1;
            }
        }

        private static void ReadStreamLines(StreamReader reader, Action<string> onLine)
        {
            var sb = new StringBuilder();
            int ch;
            while ((ch = reader.Read()) != -1)
            {
                if (ch == '\r' || ch == '\n')
                {
                    if (sb.Length > 0)
                    {
                        onLine(sb.ToString());
                        sb.Length = 0;
                    }
                }
                else
                {
                    sb.Append((char)ch);
                }
            }
            if (sb.Length > 0) onLine(sb.ToString());
        }

        private static void HandleSetupLine(string rawLine, bool isErr, SetupSplashForm form, List<string> recentErrors, object errLock)
        {
            string line = AnsiRegex.Replace(rawLine ?? string.Empty, string.Empty).Trim();
            if (line.Length == 0) return;

            bool isProgressBar = line.IndexOf("Downloading electron", StringComparison.OrdinalIgnoreCase) >= 0;
            if (!isProgressBar)
            {
                form.AppendLog(line);
            }

            if (isErr || IsErrorLike(line))
            {
                lock (errLock)
                {
                    if (recentErrors.Count >= 40) recentErrors.RemoveAt(0);
                    recentErrors.Add(line);
                }
            }

            if (line.Contains("[1/5]"))
            {
                form.SetStage("Проверяю систему…", "Ищу Node.js 24+, Python 3 и Git", 10f, 16f);
                return;
            }
            if (line.Contains("[2/5]"))
            {
                form.SetStage("Устанавливаю модули моста…", "Подтягиваю локальные пакеты Node.js", 20f, 32f);
                return;
            }
            if (line.Contains("[3/5]"))
            {
                form.SetStage("Устанавливаю модули окна…", "Готовлю зависимости оболочки", 34f, 44f);
                return;
            }
            if (line.Contains("[4/5]"))
            {
                form.SetStage("Загружаю движок окна…", "Подготовка Electron для Windows", 46f, 80f);
                return;
            }
            if (line.Contains("[5/5]") || line.IndexOf("собрано:", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                form.SetStage("Собираю приложение AllY…", "Создаю programma\\Dzhinni.exe и ярлык", 86f, 96f);
                return;
            }

            Match m = ElectronPctRegex.Match(line);
            if (m.Success)
            {
                int pct;
                if (int.TryParse(m.Groups[1].Value, out pct))
                {
                    pct = Math.Max(0, Math.Min(100, pct));
                    string eta = m.Groups[2].Success ? m.Groups[2].Value.Trim() : string.Empty;
                    string detail = eta.Length > 0
                        ? string.Format("Electron · {0}% · осталось ~{1}", pct, eta)
                        : string.Format("Electron · {0}%", pct);
                    form.SetStage("Загружаю движок окна…", detail, 46f + pct * 0.36f, 82f);
                }
            }
        }

        private static bool IsErrorLike(string line)
        {
            if (line.StartsWith("npm warn", StringComparison.OrdinalIgnoreCase)) return false;
            return line.IndexOf("Не найден", StringComparison.OrdinalIgnoreCase) >= 0
                || line.IndexOf("Не установились", StringComparison.OrdinalIgnoreCase) >= 0
                || line.IndexOf("Не загрузился", StringComparison.OrdinalIgnoreCase) >= 0
                || line.IndexOf("Не собралась", StringComparison.OrdinalIgnoreCase) >= 0
                || line.IndexOf("Не поддержива", StringComparison.OrdinalIgnoreCase) >= 0
                || line.IndexOf("npm ERR!", StringComparison.OrdinalIgnoreCase) >= 0
                || line.IndexOf("Error:", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static string PickErrorSummary(List<string> recentErrors, int exitCode)
        {
            for (int i = 0; i < recentErrors.Count; i++)
            {
                string s = recentErrors[i];
                if (s.StartsWith("At ", StringComparison.OrdinalIgnoreCase) || s.StartsWith("+")) continue;
                if (s.StartsWith("CategoryInfo", StringComparison.OrdinalIgnoreCase) || s.StartsWith("FullyQualifiedErrorId", StringComparison.OrdinalIgnoreCase)) continue;
                return s;
            }
            if (recentErrors.Count > 0) return recentErrors[0];
            return string.Format("Установщик завершился с кодом {0}. Откройте «Подробности» ниже.", exitCode);
        }

        private static void KillProcessTree(Process proc)
        {
            try
            {
                var killInfo = new ProcessStartInfo
                {
                    FileName = "taskkill.exe",
                    Arguments = string.Format("/PID {0} /T /F", proc.Id),
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process kp = Process.Start(killInfo))
                {
                    if (kp != null) kp.WaitForExit(3000);
                }
            }
            catch { }
        }

        private static string EscapePsSingleQuoted(string value)
        {
            return (value ?? string.Empty).Replace("'", "''");
        }

        private static void WriteConsole(string text, bool isError, bool redirected)
        {
            if (!redirected)
            {
                try { Console.OutputEncoding = Encoding.UTF8; } catch { }
            }
            try
            {
                if (isError) Console.Error.WriteLine(text);
                else Console.WriteLine(text);
            }
            catch { }
        }
    }
}
