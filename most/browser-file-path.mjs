import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { appendFile } from 'node:fs/promises'

export async function browserFileCandidates(name, size, { signal } = {}) {
 if (process.platform !== 'win32') throw new Error('Автоматическое прикрепление по пути доступно в AllY для Windows')
 const started=Date.now()
 const output = await new Promise((resolve,reject)=>execFile('powershell.exe',
  ['-NoProfile','-File',fileURLToPath(new URL('./browser-file-path.ps1',import.meta.url)),'-InputBase64',Buffer.from(JSON.stringify({name,size}),'utf8').toString('base64')],
  {windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:256*1024,signal},(error,stdout,stderr)=>{
   if(!error)return resolve(stdout)
   const reason=error.killed?'helper_timeout':error.name==='AbortError'?'request_cancelled':'helper_failed'
   const diagnostic={at:new Date().toISOString(),reason,ms:Date.now()-started,code:error.code,signal:error.signal,stderr:String(stderr||'').replace(/[A-Z]:\\[^\r\n]*/gi,'[путь]').slice(0,1800)}
   appendFile(fileURLToPath(new URL('../../../scratchpad/file-locator-errors-20261121.jsonl',import.meta.url)),JSON.stringify(diagnostic)+'\n').catch(()=>{})
   reject(new Error(`Не удалось получить путь файла (${reason}). Файл и текст сохранены`))
  }))
 const rows=JSON.parse(output.trim())
 if(!Array.isArray(rows))throw new Error('Не удалось прочитать путь перетащенного файла')
 return rows.map(row=>{const index=row.indexOf('|');if(index<1)throw new Error('Некорректный ответ локального выбора');return{key:row.slice(0,index),path:row.slice(index+1)}})
}
