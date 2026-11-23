// Собирает программу «AllY» (Джинни — помощница внутри; имя exe и папки прежние): Electron из node_modules → %LOCALAPPDATA%\Dzhinni\programma,
// electron.exe → Dzhinni.exe со своим значком и именем (его видят Касперский и диспетчер задач),
// наш код — в resources\app. Запуск: node sobrat.mjs (после npm install).
import { cp, mkdir, rename, rm, copyFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import rceditMod from 'rcedit'

const rcedit = rceditMod.rcedit || rceditMod

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = join(HERE, 'node_modules', 'electron', 'dist')
const VYHOD = process.env.DZHINNI_PROGRAMMA || join(process.env.LOCALAPPDATA, 'Dzhinni', 'programma')
const EXE = join(VYHOD, 'Dzhinni.exe')
const KOD = ['client-runtime.cjs', 'main.js', 'startup.js', 'startup.html', 'ally-intro-flow-enhanced-full.webm', 'package.json', 'dzhinni.ico']

await access(DIST).catch(() => { console.error('нет Electron: сперва npm install'); process.exit(1) })
await rm(VYHOD, { recursive: true, force: true })
await mkdir(dirname(VYHOD), { recursive: true })
await cp(DIST, VYHOD, { recursive: true })
await rm(join(VYHOD, 'resources', 'default_app.asar'), { force: true })
await rename(join(VYHOD, 'electron.exe'), EXE)
const APP = join(VYHOD, 'resources', 'app')
await mkdir(APP, { recursive: true })
for (const f of KOD) await copyFile(join(HERE, f), join(APP, f))
await rcedit(EXE, {
  icon: join(HERE, 'dzhinni.ico'),
  'version-string': {
    FileDescription: 'AllY',
    ProductName: 'AllY',
    InternalName: 'Dzhinni',
    OriginalFilename: 'Dzhinni.exe',
    CompanyName: 'AllY',
  },
  'file-version': '0.1.0',
  'product-version': '0.1.0',
})
console.log('собрано:', EXE)
