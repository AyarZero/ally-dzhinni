import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const engine = process.env.DZHINNI_PROVIDER || 'direct'
if (engine !== 'direct') throw new Error('Неизвестный режим: этот вход запускает только direct')
const here = dirname(fileURLToPath(import.meta.url))
// Историческое имя папки, живые данные: в ней беседа Джинни (chat.jsonl). Не переименовывать и не удалять.
const storage = process.env.DZHINNI_ENGINE_DATA || join(here, '.opencode-data')
await mkdir(storage, { recursive: true })
process.env.DZHINNI_PROVIDER = engine
process.env.DZHINNI_PORT ||= '8798'
process.env.DZHINNI_ENGINE_DATA = storage
for (const [name, relative] of Object.entries({ HISTORY: 'chat.jsonl', HOD: 'hod', PANELI: 'panels.json', VOPROSY: 'questions.json',
  DOKI: 'documents.json', FILES: 'files', SNIMKI: 'snapshots', ZNAYU: 'known.json', DNEVNIK: 'diary', VIDZHETY: 'widgets', PROCESSY: 'processes' })) {
  process.env[`DZHINNI_${name}`] ||= join(storage, relative)
}
// Reuse the already running locator during a bridge restart; never start a second owner.
try {
 const {ensureFileLocator}=await import('./file-locator-service.mjs')
 await ensureFileLocator({port:Number(process.env.DZHINNI_PORT)+1,windowPort:Number(process.env.DZHINNI_PORT)})
}catch(error){console.error('Определение пути файла недоступно:',error.message)}
await import('./server.mjs')
