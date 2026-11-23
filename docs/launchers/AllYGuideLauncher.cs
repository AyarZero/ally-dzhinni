using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("AllY Guide")]
[assembly: AssemblyDescription("AllY · Джинни — интерактивный свод версий и документация")]
[assembly: AssemblyProduct("AllY · Свод версий")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace AllYLaunchers
{
    internal static class AllYGuideLauncher
    {
        [STAThread]
        private static int Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(
                Path.DirectorySeparatorChar,
                Path.AltDirectorySeparatorChar
            );
            string htmlPath = Path.Combine(baseDir, "docs", "index.html");
            if (!File.Exists(htmlPath))
            {
                MessageBox.Show(
                    "Не найден файл docs\\index.html рядом с AllY-Guide.exe.\nРаспакуйте архив AllY полностью.",
                    "AllY · Свод версий",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return 1;
            }

            string lang = null;
            string tab = null;
            string customProfile = null;
            ParseArgs(args, out lang, out tab, out customProfile);

            string targetUri = BuildTargetUri(htmlPath, lang, tab);
            string profileDir = string.IsNullOrEmpty(customProfile)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AllY", "guide-profile")
                : Path.GetFullPath(customProfile);

            string browserExe = FindAppHostBrowser();
            if (!string.IsNullOrEmpty(browserExe))
            {
                try
                {
                    Directory.CreateDirectory(profileDir);
                }
                catch
                {
                    // Browser handles profile creation fallback if needed
                }

                string browserArgs = string.Format(
                    "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1220,860 --no-first-run --no-default-browser-check --disable-fre --disable-sync --disable-features=msEdgeFirstRunExperience,Translate",
                    targetUri,
                    profileDir
                );

                var psi = new ProcessStartInfo
                {
                    FileName = browserExe,
                    Arguments = browserArgs,
                    WorkingDirectory = baseDir,
                    UseShellExecute = false
                };

                try
                {
                    Process.Start(psi);
                    return 0;
                }
                catch
                {
                    // Fall through to shell default handler below
                }
            }

            try
            {
                Process.Start(new ProcessStartInfo(targetUri) { UseShellExecute = true });
                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Не удалось открыть интерактивный гид AllY:\n" + ex.Message,
                    "AllY · Свод версий",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return 1;
            }
        }

        private static void ParseArgs(string[] args, out string lang, out string tab, out string profile)
        {
            lang = null;
            tab = null;
            profile = null;
            if (args == null) return;

            for (int i = 0; i < args.Length; i++)
            {
                string cur = args[i];
                if (string.IsNullOrEmpty(cur)) continue;
                string v;
                if (TrySplitOption(cur, "lang", out v)) lang = v;
                else if (IsFlag(cur, "lang") && i + 1 < args.Length) lang = args[++i];
                else if (TrySplitOption(cur, "tab", out v)) tab = v;
                else if (IsFlag(cur, "tab") && i + 1 < args.Length) tab = args[++i];
                else if (TrySplitOption(cur, "profile", out v)) profile = v;
                else if (IsFlag(cur, "profile") && i + 1 < args.Length) profile = args[++i];
            }
        }

        private static bool IsFlag(string raw, string name)
        {
            string s = raw.TrimStart('-', '/').ToLowerInvariant();
            return s == name;
        }

        private static bool TrySplitOption(string raw, string name, out string value)
        {
            value = null;
            string trimmed = raw.TrimStart('-', '/');
            int eq = trimmed.IndexOf('=');
            if (eq <= 0) return false;
            if (!string.Equals(trimmed.Substring(0, eq), name, StringComparison.OrdinalIgnoreCase)) return false;
            value = trimmed.Substring(eq + 1);
            return true;
        }

        private static string BuildTargetUri(string htmlPath, string lang, string tab)
        {
            var builder = new UriBuilder(new Uri(Path.GetFullPath(htmlPath)));
            var queryParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(lang))
            {
                queryParts.Add("lang=" + Uri.EscapeDataString(lang.Trim()));
            }
            if (!string.IsNullOrWhiteSpace(tab))
            {
                queryParts.Add("tab=" + Uri.EscapeDataString(tab.Trim()));
            }
            builder.Query = string.Join("&", queryParts.ToArray());
            return builder.Uri.AbsoluteUri;
        }

        private static string FindAppHostBrowser()
        {
            string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? string.Empty;
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] candidates = new[]
            {
                Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(localApp, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(localApp, "Google", "Chrome", "Application", "chrome.exe")
            };

            foreach (string path in candidates)
            {
                if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
                {
                    return path;
                }
            }
            return null;
        }
    }
}
