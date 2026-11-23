// Монтажные проекты существующих единиц контента. Статусы выпусков и карточки не переписываются.
import {readFile,writeFile,mkdir,rename,copyFile,stat} from 'node:fs/promises'
import {join,extname} from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {committed,commit,durableFile,checkpoints,checkpoint} from './production-durable.mjs'
import {projectList,projectId,newProjectStage,publishProject,renameProject} from './production-projects.mjs'
import {validMethod} from './production-method.js'
import {validWorkshop} from './production-workshop.js'
const MODES=['carousel','story','lesson'],STYLES=['Бумага и ботаника','Тёмная типографика','Тёплый коллаж']
const queues=new Map()
const fail=(status,message)=>Object.assign(new Error(message),{status})
export const productionRoot=repo=>join(repo,'memory','2. Areas','Контент','_production')
const contentRoot=repo=>join(repo,'memory','2. Areas','Контент')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const str=x=>typeof x==='string'
const validStyle=s=>['',...STYLES].includes(s)||(str(s)&&s.startsWith('Библиотека: ')&&s.length<=200&&!/[\x00-\x1f]/.test(s))
function validDoc(d,mode){
 if(!d||d.mode!==mode||!Array.isArray(d.parts)||!d.parts.length||d.parts.length>100||!d.global||!d.release||!d.stale||typeof d.dirty!=='boolean'||!validMethod(d.method)||!validWorkshop(d.workshop))return false
 const g=d.global,ids=new Set(d.parts.map(p=>p?.id))
 if(ids.size!==d.parts.length||!['4:5','9:16','1:1','16:9'].includes(g.ratio)||!STYLES.includes(g.style)||!['Голос владельца','Рассказчик','Без голоса'].includes(g.voice)||!['yes','no'].includes(g.subtitles))return false
 if(!Array.isArray(g.characters)||!g.characters.length||g.characters.length>100||!g.characters.every(c=>c&&str(c.id)&&str(c.name)&&str(c.voice)))return false
 const chars=new Set(g.characters.map(c=>c.id));if(chars.size!==g.characters.length)return false
 if(!['audioName','musicName'].every(k=>str(g[k]))||!ids.has(d.release.cover)||!['Instagram','Telegram','YouTube'].includes(d.release.platform)||!['caption','time'].every(k=>str(d.release[k]))||!['audio','timing','assembly'].every(k=>typeof d.stale[k]==='boolean'))return false
 return d.parts.every(p=>p&&str(p.id)&&['name','text','narration','visual','prompt','ref','style','voice','visualName','audioName'].every(k=>str(p[k]))&&validStyle(p.style)&&['','Голос владельца','Рассказчик','Без голоса'].includes(p.voice)&&['photo','video'].includes(p.kind)&&(mode==='carousel'||p.kind==='video')&&['contain','cover'].includes(p.fit)&&Number.isFinite(p.duration)&&p.duration>=1&&p.duration<=120&&Number.isFinite(p.intro)&&p.intro>=0&&p.intro<=Math.min(10,p.duration)&&Array.isArray(p.dialogue)&&p.dialogue.every(l=>l&&str(l.text)&&chars.has(l.character)))
}
export function validProductionStore(value){
 return value&&MODES.includes(value.mode)&&value.projects&&MODES.every(mode=>{let p=value.projects[mode];return p&&validDoc(p.doc,mode)&&Array.isArray(p.versions)&&p.versions.length<=100&&p.versions.every(v=>v&&str(v.name)&&str(v.note)&&Number.isFinite(v.at)&&validDoc(v.doc,mode))})
}
export async function productionUnits(repo){
 let data={};try{data=JSON.parse(await readFile(join(contentRoot(repo),'_реестр_личного.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 const legacy=Object.entries(data).filter(([id])=>/^lk-\d{3,6}$/.test(id)).map(([id,v])=>({id,title:String(v['тема']||id),format:String(v['формат']||''),sourceUnit:id})),projects=await projectList(repo),byId=new Map(legacy.map(x=>[x.id,x]));for(const x of projects)byId.set(x.id,{...byId.get(x.id),...x});return[...byId.values()].sort((a,b)=>(b.at||'').localeCompare(a.at||''))
}
async function unitPath(repo,unit){if(!/^lk-\d{3,6}$/.test(unit||'')&&!projectId(unit)||!(await productionUnits(repo)).some(u=>u.id===unit))throw fail(404,'Проект не найден');return join(productionRoot(repo),unit)}
export async function readProduction(repo,unit){const dir=await unitPath(repo,unit),journal=committed(dir,validProductionStore);if(journal&&!journal.journalDamaged)return journal;let missing=true;for(const name of ['project.json','previous.json']){try{const bytes=await readFile(join(dir,name)),d=JSON.parse(bytes);missing=false;if(!validProductionStore(d.store))continue;return{unit,revision:hash(bytes),store:d.store,at:d.at,durable:false,recovered:name!=='project.json'||!!journal,journalDamaged:!!journal}}catch(e){if(e.code!=='ENOENT')missing=false}}if(missing&&!journal)return{unit,revision:'0',store:null,at:null};throw fail(500,'Не удалось прочитать проект и резервные копии. Сохранённые файлы оставлены без изменений.')}
async function serialized(key,fn){let previous=queues.get(key)||Promise.resolve(),run=previous.catch(()=>{}).then(fn);queues.set(key,run);try{return await run}finally{if(queues.get(key)===run)queues.delete(key)}}
export async function readProductionConsistent(repo,unit){let dir=await unitPath(repo,unit);return serialized(dir,()=>readProduction(repo,unit))}
export async function writeProduction(repo,{unit,revision,store}){
 if(!str(revision)||!validProductionStore(store))throw fail(400,'Некорректный проект')
 const encoded=JSON.stringify(store);if(Buffer.byteLength(encoded)>16*1024*1024)throw fail(413,'Проект больше 16 МБ')
 const dir=await unitPath(repo,unit)
 return serialized(dir,async()=>{let old=await readProduction(repo,unit);if(old.revision!==revision){if(JSON.stringify(old.store)===encoded){if(old.durable)return{unit,revision:old.revision,at:old.at,durable:true};if(!old.journalDamaged)return commit(dir,{unit,revision:old.revision,store},old,validProductionStore)}throw fail(409,'Проект изменён в другом окне. Сохрани свою копию перед загрузкой новой версии.')}
  if(old.journalDamaged)throw fail(503,'Журнал повреждён. Открой резервную копию как отдельный проект; оригиналы сохранены.')
  return commit(dir,{unit,revision,store},old,validProductionStore)
 })
}
export const MEDIA_TYPES={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4'}
export async function writeProductionMedia(repo,unit,name,bytes){
 const dir=await unitPath(repo,unit),ext=extname(String(name)).toLowerCase();if(!MEDIA_TYPES[ext])throw fail(400,'Поддерживаются изображения, аудио и видео; SVG/HTML не принимаются')
 if(!bytes.length||bytes.length>50*1024*1024)throw fail(413,'Допустимый размер файла: от 1 байта до 50 МБ')
 const id=randomBytes(16).toString('hex')+ext;await mkdir(join(dir,'media'),{recursive:true});await durableFile(join(dir,'media',id),bytes)
 return{id,name:String(name).replace(/[\\/]/g,'_').slice(-180),size:bytes.length,type:MEDIA_TYPES[ext]}
}
export async function productionMedia(repo,unit,id){let dir=await unitPath(repo,unit);if(!/^[a-f0-9]{32}\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|ogg|m4a)$/.test(id||''))throw fail(404,'Файл не найден');let file=join(dir,'media',id);try{let info=await stat(file);if(!info.isFile())throw fail(404,'Файл не найден');return{file,size:info.size,type:MEDIA_TYPES[extname(id)]}}catch(e){if(e.code==='ENOENT')throw fail(404,'Файл не найден');throw e}}
export async function createProductionProject(repo,{title,store}){if(!validProductionStore(store))throw fail(400,'Некорректный проект');if(Buffer.byteLength(JSON.stringify(store))>16*1024*1024)throw fail(413,'Проект больше16МБ');const stage=await newProjectStage(repo,title);await commit(stage.dir,{unit:stage.id,revision:'0',store},{revision:'0',store:null},validProductionStore);await publishProject(repo,stage);return{unit:stage.id,title:stage.meta.title}}
export async function renameProductionProject(repo,{unit,title}){await unitPath(repo,unit);return renameProject(repo,unit,title,await productionUnits(repo))}
export async function productionBackups(repo,unit){return checkpoints(await unitPath(repo,unit),validProductionStore)}
export async function restoreProductionBackup(repo,{unit,revision,id}){const dir=await unitPath(repo,unit),value=checkpoint(dir,Number(id),validProductionStore);if(!value)throw fail(404,'Копия не найдена');return writeProduction(repo,{unit,revision,store:value.store})}
