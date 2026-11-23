// SQLite rollback journal is authoritative; JSON remains a readable, fsynced backup.
import {DatabaseSync} from 'node:sqlite'
import {readFile,open,rename,mkdir} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
export async function durableFile(file,bytes){const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp',h=await open(tmp,'wx');try{await h.writeFile(bytes);await h.sync()}finally{await h.close()}await rename(tmp,file)}
const database=dir=>join(dir,'history.sqlite')
function validRow(row,validate){try{if(!row||digest(row.payload)!==row.revision)return null;let d=JSON.parse(row.payload);return validate(d.store)?{unit:d.unit,revision:row.revision,at:d.at,store:d.store}:null}catch{return null}}
export function committed(dir,validate){
 if(!existsSync(database(dir)))return null
 let db;try{db=new DatabaseSync(database(dir),{readOnly:true,timeout:5000});let rows=db.prepare('SELECT id,payload,revision FROM snapshots ORDER BY id DESC LIMIT 20').all();for(let i=0;i<rows.length;i++){const value=validRow(rows[i],validate);if(value)return{...value,durable:true,recovered:i>0}}return{journalDamaged:true}}
 catch{return{journalDamaged:true}}finally{db?.close()}
}
export function checkpoints(dir,validate){if(!existsSync(database(dir)))return[];const db=new DatabaseSync(database(dir),{readOnly:true,timeout:5000});try{return db.prepare('SELECT id,payload,revision FROM snapshots ORDER BY id DESC LIMIT 20').all().flatMap(row=>{let v=validRow(row,validate);return v?[{id:row.id,revision:row.revision,at:v.at}]:[]})}finally{db.close()}}
export function checkpoint(dir,id,validate){const db=new DatabaseSync(database(dir),{readOnly:true,timeout:5000});try{return validRow(db.prepare('SELECT payload,revision FROM snapshots WHERE id=?').get(id),validate)}finally{db.close()}}
export async function commit(dir,{unit,revision,store},old,validate){
 await mkdir(dir,{recursive:true})
 const db=new DatabaseSync(database(dir),{timeout:5000});let result,bytes
 try{
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY, revision TEXT NOT NULL, payload TEXT NOT NULL); BEGIN IMMEDIATE')
  let current=null;for(const row of db.prepare('SELECT payload,revision FROM snapshots ORDER BY id DESC LIMIT 20').all()){current=validRow(row,validate);if(current)break}
  current||=old
  if(current.revision!==revision){if(JSON.stringify(current.store)===JSON.stringify(store)){db.exec('ROLLBACK');return{unit,revision:current.revision,at:current.at,durable:current.durable===true}}throw Object.assign(Error('Проект изменён в другом окне. Сохрани свою копию перед загрузкой новой версии.'),{status:409})}
  const at=new Date().toISOString();bytes=JSON.stringify({schema:2,unit,at,store},null,2);const rev=digest(bytes)
  db.prepare('INSERT INTO snapshots(revision,payload) VALUES (?,?)').run(rev,bytes)
  db.exec('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 20); COMMIT')
  result={unit,revision:rev,at,durable:true}
 }catch(e){try{db.exec('ROLLBACK')}catch{}throw e}finally{db.close()}
 try{
  if(old.store)await durableFile(join(dir,'previous.json'),JSON.stringify({schema:2,unit,at:old.at,store:old.store},null,2))
  await durableFile(join(dir,'project.json'),bytes)
 }catch{result.backupWarning='Основной журнал сохранён; не удалось обновить JSON-копию.'}
 return result
}
