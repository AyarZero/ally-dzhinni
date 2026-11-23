import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

// Read-only projection of the same local catalogue as the desktop Tasks page.
// No Notion requests, focus pruning, task creation or model calls.
export function mobileTaskReader() {
  const cache=new Map()
  return async repo=>{
    if(typeof repo!=='string' || !repo) return {available:false,stale:true,at:null,total:null,tasks:[]}
    const file=join(repo,'pamyat','zadachi.json'), previous=cache.get(file)
    try {
      const info=await stat(file)
      if(previous?.mtime===info.mtimeMs) return previous.value
      const data=JSON.parse(await readFile(file,'utf8'))
      if(!data['задачи'] || typeof data['задачи']!=='object') throw new Error('invalid_catalog')
      const tasks=Object.values(data['задачи']).map(row=>({
        slug:String(row['слаг']||''),title:String(row['название']||'').replace(/^"(.*)"$/s,'$1'),
        status:String(row['статус']||''),project:String(row['проект']||''),area:String(row['область']||''),
        due:String(row['срок']||''),summary:String(row['суть']||'').slice(0,400),
        closed:row['статус']==='Оформлено'?false:!!row['закрыта']||['Готово','Архив','Проверено'].includes(row['статус'])
      })).filter(row=>row.slug && row.title && !/^[.]|[\\/\x00-\x1f]/.test(row.slug))
      tasks.sort((a,b)=>a.title.localeCompare(b.title,'ru'))
      const value={available:true,stale:false,at:data['собрано']||null,total:tasks.length,tasks}
      cache.set(file,{mtime:info.mtimeMs,value})
      return value
    } catch {
      return previous?{...previous.value,stale:true}:{available:false,stale:true,at:null,total:null,tasks:[]}
    }
  }
}
