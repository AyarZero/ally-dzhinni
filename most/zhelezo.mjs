// Железо для «Ресурса»: температура и нагрузка процессора и видеокарты.
// Процессор: нагрузка — разница os.cpus() между вызовами; градусы — act/scripts/.termo.json
// (пишет задача «AllY Termo» раз в минуту от SYSTEM, обычному пользователю датчик ACPI не виден).
// Видеокарта: nvidia-smi; нет его — блока видеокарты нет, без ошибки.
import { cpus, totalmem, freemem } from 'node:os'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join } from 'node:path'

let prev = null
function nagruzkaCpu() {
  const t = cpus().reduce((s, c) => { const v = c.times; s.idle += v.idle; s.all += v.user + v.nice + v.sys + v.irq + v.idle; return s }, { idle: 0, all: 0 })
  const p = prev; prev = t
  if (!p || t.all === p.all) return null
  return Math.round(100 * (1 - (t.idle - p.idle) / (t.all - p.all)))
}
nagruzkaCpu() // первый отсчёт, чтобы первый же запрос дал цифру

async function gradusyCpu(repo) {
  try {
    const j = JSON.parse(await readFile(join(repo, 'act', 'scripts', '.termo.json'), 'utf8'))
    if (j.c == null || Date.now() - j.at > 3 * 60e3) return null // старше 3 минут — задача встала, не врать
    return j.c
  } catch { return null }
}

// Спящая видеокарта (Optimus) отвечает nvidia-smi за ~12 с, а таймаут 4 с выкидывал блок.
// Поэтому опрос идёт в фоне с запасом 30 с, виджет берёт последний ответ; свежим он считается 2 минуты.
const toNum = (v) => {
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? n : null
}

const PS_GPU_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  '$ctrls = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name })',
  "$best = $ctrls | Where-Object { $_.PNPDeviceID -like 'PCI\\*' -and $_.Name -notmatch 'Microsoft Basic Display|Indirect|Remote|Mirage|Parsec' } | Sort-Object { [uint64](0 + $_.AdapterRAM) } -Descending | Select-Object -First 1",
  'if (-not $best) { $best = $ctrls | Select-Object -First 1 }',
  'if (-not $best) { return }',
  '$vram = [uint64]0',
  'if ($best.AdapterRAM) { $vram = [uint64]$best.AdapterRAM }',
  "$cls = 'HKLM:\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'",
  'Get-ChildItem $cls -ErrorAction SilentlyContinue | ForEach-Object {',
  '  $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue',
  '  if ($p -and $p.DriverDesc -eq $best.Name) {',
  "    $q = $p.'HardwareInformation.qwMemorySize'",
  '    if ($q -is [byte[]] -and $q.Length -ge 8) { $q = [BitConverter]::ToUInt64($q, 0) }',
  '    elseif ($q) { $q = [uint64]$q }',
  '    if ($q -gt $vram) { $vram = [uint64]$q }',
  '  }',
  '}',
  '$mems = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -ErrorAction SilentlyContinue)',
  '$pickedMem = $null; $luid = $null',
  'if ($mems.Count -gt 0) {',
  '  $pickedMem = $mems | Sort-Object { [uint64]$_.DedicatedUsage + [uint64]$_.SharedUsage } -Descending | Select-Object -First 1',
  "  if ($pickedMem -and $pickedMem.Name -match '(luid_0x[0-9a-fA-F]+_0x[0-9a-fA-F]+_phys_\\d+)') { $luid = $Matches[1] }",
  '}',
  '$dedBytes = if ($pickedMem) { [uint64]$pickedMem.DedicatedUsage } else { 0 }',
  '$shrBytes = if ($pickedMem) { [uint64]$pickedMem.SharedUsage } else { 0 }',
  '$engs = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue)',
  'if ($luid) { $engs = @($engs | Where-Object { $_.Name -like "*$luid*" }) }',
  '$byType = @{}',
  'foreach ($e in $engs) {',
  "  $t = 'other'",
  "  if ($e.Name -match 'engtype_([^_]+)') { $t = $Matches[1] }",
  '  $byType[$t] = ([double]$byType[$t]) + ([double]$e.UtilizationPercentage)',
  '}',
  '$load = 0',
  'if ($byType.Count -gt 0) {',
  '  $load = ($byType.Values | Measure-Object -Maximum).Maximum',
  '  if ($load -gt 100) { $load = 100 }',
  '}',
  '[pscustomobject]@{',
  '  name = [string]$best.Name',
  '  load = [math]::Round($load)',
  '  dedMb = [math]::Round($dedBytes / 1MB)',
  '  shrMb = [math]::Round($shrBytes / 1MB)',
  '  vramMb = [math]::Round($vram / 1MB)',
  '} | ConvertTo-Json -Compress',
].join('\n')

function execAsync(file, args, timeout = 12000) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout }, (err, stdout) => {
      resolve(err ? null : String(stdout || '').trim())
    })
  })
}

export async function probeWindowsGpu() {
  if (process.platform !== 'win32') return null
  const enc = Buffer.from(PS_GPU_SCRIPT, 'utf16le').toString('base64')
  const raw = await execAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], 15000)
  if (!raw) return null
  try {
    const d = JSON.parse(raw)
    if (!d?.name) return null
    const vramMb = toNum(d.vramMb) || 0
    const dedMb = toNum(d.dedMb)
    const shrMb = toNum(d.shrMb)
    const usedMb = dedMb != null && dedMb > 0 ? dedMb : (shrMb ?? 0)
    const pamyat = vramMb > 0 && dedMb != null ? Math.min(100, Math.round((100 * dedMb) / vramMb)) : null
    return {
      name: String(d.name).trim(),
      c: null,
      nagruzka: toNum(d.load),
      pamyat,
      pamyatMb: usedMb > 0 ? usedMb : null,
      pamyatVsego: vramMb > 0 ? vramMb : null,
      spit: false,
      at: Date.now(),
    }
  } catch {
    return null
  }
}

let gpuPosl = null, gpuProm = null, lastGpuFailAt = 0
function gpuOpros() {
  if (gpuProm) return gpuProm
  if (!gpuPosl && Date.now() - lastGpuFailAt < 30e3) return null
  gpuProm = (async () => {
    try {
      const nv = await execAsync(
        'nvidia-smi',
        ['--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
        10000
      )
      if (nv) {
        const [name, cRaw, pRaw, muRaw, mtRaw] = nv.split('\n')[0].split(',').map((s) => s.trim())
        const c = toNum(cRaw), p = toNum(pRaw), mu = toNum(muRaw), mt = toNum(mtRaw)
        if (name || p != null || c != null) {
          gpuPosl = {
            name: name || 'NVIDIA GPU',
            c,
            nagruzka: p,
            pamyat: mt && mt > 0 && mu != null ? Math.round((100 * mu) / mt) : null,
            pamyatMb: mu,
            pamyatVsego: mt,
            spit: c === 0,
            at: Date.now(),
          }
          return gpuPosl
        }
      }
      const winGpu = await probeWindowsGpu()
      if (winGpu) {
        gpuPosl = winGpu
        return gpuPosl
      }
      lastGpuFailAt = Date.now()
      if (gpuPosl && Date.now() - gpuPosl.at > 120e3) gpuPosl = null
      return gpuPosl
    } finally {
      gpuProm = null
    }
  })()
  return gpuProm
}
gpuOpros()
const gpu = async () => {
  const p = gpuOpros()
  if (!gpuPosl && p) await Promise.race([p, new Promise((r) => setTimeout(r, 2500))])
  return gpuPosl
}

export async function zhelezo(repo) {
  const [c, g] = await Promise.all([gradusyCpu(repo), gpu()])
  const vsego = totalmem(), zanyato = vsego - freemem() // оперативная память
  return { cpu: { c, nagruzka: nagruzkaCpu() }, gpu: g, ram: { zanyato, vsego, pc: Math.round((100 * zanyato) / vsego) }, at: Date.now() }
}
