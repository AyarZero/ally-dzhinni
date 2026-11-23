import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {stat,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomBytes} from 'node:crypto'
import {readProductionConsistent,productionRoot,productionMedia,productionUnits} from './production-store.mjs'
import {durableFile} from './production-durable.mjs'
import {memoryFiles} from './production-method.js'
const exec=promisify(execFile),script=fileURLToPath(new URL('./production-method-pack.py',import.meta.url))
async function tool(name,args){try{const r=await exec(name,args,{windowsHide:true,timeout:10000,maxBuffer:20000});return{available:true,version:r.stdout.split(/\r?\n/)[0].slice(0,160)}}catch(e){return{available:false,reason:e.code==='ENOENT'?'Не установлен или не найден в PATH':'Проверка не завершилась: '+String(e.code||e.message).slice(0,80)}}}
export async function methodEnvironment(repo){const [git,ffmpeg,ffprobe,remotion]=await Promise.all([tool('git',['--version']),tool('ffmpeg',['-version']),tool('ffprobe',['-version']),stat(join(repo,'art/video/node_modules/@remotion/cli/package.json')).then(()=>({available:true,version:'Установлен локально; проверка рендера отдельная'})).catch(()=>({available:false,reason:'Локальный пакет не найден'}))]);
 return{schema:'pronin-prep-v1',at:new Date().toISOString(),node:{available:true,version:process.version},git,ffmpeg,ffprobe,remotion,elevenlabs:{configured:!!process.env.ELEVENLABS_API_KEY,scope:'Только окружение процесса; внешняя доступность и баланс не проверялись'},openai:{configured:!!process.env.OPENAI_API_KEY,scope:'Только окружение процесса; внешняя доступность и баланс не проверялись'},pronin:{available:null,reason:'ProninMCP не проверен в сессии исполнителя. Наш маршрут подготовки и FableCut от него не зависят.'},generation:{available:false,reason:'Подготовка поручения через общую очередь Джинни; платные синтез и генерация не запускаются автоматически.'}};
}
export async function probeMethodMedia(repo,unit,id){const m=await productionMedia(repo,unit,id),r=await exec('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height,r_frame_rate','-of','json',m.file],{windowsHide:true,timeout:20000,maxBuffer:20000});const d=JSON.parse(r.stdout),duration=Number(d.format?.duration);if(!Number.isFinite(duration)||duration<=0)throw Object.assign(Error('Не удалось измерить длительность файла'),{status:400});return{duration,streams:d.streams||[]};}
export async function exportMethodPackage(repo,unit,revision){const value=await readProductionConsistent(repo,unit);if(value.revision!==revision)throw Object.assign(Error('Проект изменился. Сначала сохрани и повтори экспорт.'),{status:409});if(!value.store)throw Object.assign(Error('Сначала сохрани проект'),{status:400});const meta=(await productionUnits(repo)).find(x=>x.id===unit),files=memoryFiles(value.store.projects[value.store.mode].doc,{unit,title:meta.title});
 const dir=join(productionRoot(repo),unit,'preparation-'+randomBytes(8).toString('hex'));await mkdir(dir);for(const[name,text]of Object.entries(files))await durableFile(join(dir,name),text);const manifest=join(dir,'files.json'),file=join(dir,'preparation.zip');await durableFile(manifest,JSON.stringify(files));await exec(process.env.DZHINNI_PYTHON||'python',[script,manifest,file],{windowsHide:true,timeout:30000,maxBuffer:1000});return{file,name:unit+'-preparation.zip'};
}
