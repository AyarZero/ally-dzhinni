param([switch]$Proverka)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$clientRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Output '[1/5] Проверка окружения (Node.js 24+, Python 3, Git)...'
foreach ($tool in @('node','python','git')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Не найден $tool. Нужны Node.js 24+, Python 3 и Git." }
}
& node -e "require('node:sqlite')"
if ($LASTEXITCODE -ne 0) { throw 'Эта версия Node.js не поддерживает SQLite. Нужна Node.js 24+.' }
if ($Proverka) {
    if (-not (Test-Path (Join-Path $clientRoot 'programma/Dzhinni.exe'))) { throw 'Программа ещё не собрана. Запусти установку без -Proverka.' }
    Write-Host 'Программа AllY на месте. Вход в выбранную нейросеть проверяется в приложении.'
    exit
}
Write-Output '[2/5] Установка модулей моста...'
& npm ci --prefix (Join-Path $clientRoot 'most') --no-audit --no-fund --ignore-scripts --loglevel=error
if ($LASTEXITCODE -ne 0) { throw 'Не установились зависимости most' }
Write-Output '[3/5] Установка модулей окна...'
& npm ci --prefix (Join-Path $clientRoot 'app') --no-audit --no-fund --ignore-scripts --loglevel=error
if ($LASTEXITCODE -ne 0) { throw 'Не установились зависимости app' }
Write-Output '[4/5] Загрузка движка Electron...'
$electronInstaller = Join-Path $clientRoot 'app/node_modules/electron/install.js'
if (-not $env:electron_config_cache) { $env:electron_config_cache = Join-Path $clientRoot '.ally-data/cache/electron' }
& node $electronInstaller
if ($LASTEXITCODE -ne 0) { throw 'Не загрузился Electron для окна AllY.' }
if (-not (Test-Path (Join-Path $clientRoot 'app/node_modules/electron/dist/electron.exe'))) { throw 'Electron не установлен: отсутствует electron.exe.' }
Write-Output '[5/5] Сборка программы AllY...'
$env:DZHINNI_PROGRAMMA = Join-Path $clientRoot 'programma'
& node (Join-Path $clientRoot 'app/sobrat.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Не собралась программа AllY' }
try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if ($desktop -and (Test-Path $desktop)) {
        $ws = New-Object -ComObject WScript.Shell
        $lnk = $ws.CreateShortcut((Join-Path $desktop 'AllY.lnk'))
        $allyLauncher = Join-Path $clientRoot 'AllY.exe'
        $lnk.TargetPath = if (Test-Path $allyLauncher) { $allyLauncher } else { Join-Path $clientRoot 'programma\Dzhinni.exe' }
        $lnk.WorkingDirectory = $clientRoot
        $ico = Join-Path $clientRoot 'app\dzhinni.ico'
        if (Test-Path $ico) { $lnk.IconLocation = $ico }
        $lnk.Save()
    }
} catch { }
Write-Host 'Готово! Программа собрана: programma\Dzhinni.exe. Запускай AllY.exe, ярлык AllY на рабочем столе или напрямую programma\Dzhinni.exe.'
