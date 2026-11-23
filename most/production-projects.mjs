import {readFile,readdir,mkdir,rename,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {randomBytes} from 'node:crypto'
import {durableFile} from './production-durable.mjs'
export const projectRoot=repo=>join(repo,'memory/2. Areas/Контент/_production')
export const projectId=id=>/^prj-[a-f0-9]{32}$/.test(id||'')
export function projectTitle(value){if(typeof value!=='string'||!value.trim()||value.trim().length>120||/[\x00-\x1f]/.test(value))throw Object.assign(Error('Название: от 1 до 120 символов'),{status:400});return value.trim()}
export async function projectList(repo){let entries;try{entries=await readdir(projectRoot(repo),{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return[];throw e}
 const out=[];for(const item of entries.filter(x=>x.isDirectory()&&/^(lk-\d{3,6}|prj-[a-f0-9]{32})$/.test(x.name))){try{const m=JSON.parse(await readFile(join(projectRoot(repo),item.name,'meta.json'),'utf8')),s=await stat(join(projectRoot(repo),item.name,'history.sqlite')).catch(()=>null);out.push({id:item.name,title:projectTitle(m.title),createdAt:m.createdAt,at:s?.mtime.toISOString()||m.createdAt,sourceUnit:m.sourceUnit||null})}catch(e){if(e.code!=='ENOENT')throw e}}return out
}
export async function newProjectStage(repo,title){const id='prj-'+randomBytes(16).toString('hex'),dir=join(projectRoot(repo),'.creating-'+id);await mkdir(dir,{recursive:true});const meta={schema:1,id,title:projectTitle(title),createdAt:new Date().toISOString()};await durableFile(join(dir,'meta.json'),JSON.stringify(meta,null,2));return{id,dir,meta}}
export async function publishProject(repo,stage){await rename(stage.dir,join(projectRoot(repo),stage.id));return stage.meta}
export async function renameProject(repo,id,title,legacy=[]){if(!projectId(id)&&!legacy.some(x=>x.id===id))throw Object.assign(Error('Проект не найден'),{status:404});const dir=join(projectRoot(repo),id);await mkdir(dir,{recursive:true});let old;try{old=JSON.parse(await readFile(join(dir,'meta.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;old={schema:1,id,createdAt:new Date().toISOString()}}const meta={...old,title:projectTitle(title)};await durableFile(join(dir,'meta.json'),JSON.stringify(meta,null,2));return meta}
