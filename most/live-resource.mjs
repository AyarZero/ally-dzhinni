// Read-only measurements for the direct session. Never starts a conversation or a model turn.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { codexResources } from './codex-resource.mjs'

const clients=new Map()
export async function liveResource(repo,{read=readFile,resources=codexResources,cache=clients}={}) {
  // '.opencode-data' — историческое имя папки, живые данные.
  const file=process.env.DZHINNI_ENGINE_DATA?join(process.env.DZHINNI_ENGINE_DATA,'engine.json'):join(repo,'projects/dzhinni/most/.opencode-data/engine.json')
  const saved=JSON.parse(await read(file,'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error}))
  const executor=saved.directExecutor || null,threadId=saved.localSessions?.[executor+':'+(saved.currentTask?.task_id||'')] || saved.localSessions?.[executor] || null
  if(executor!=='codex' || !threadId) return {executor,threadId,contexts:[],limits:[],contextError:'Сессия ещё не выбрана.'}
  let client=cache.get(repo)
  if(!client) {
    client={threadId};client.reader=resources({repo,getThread:()=>client.threadId});cache.set(repo,client)
  }
  client.threadId=threadId;await client.reader.refresh();client.reader.pause()
  clearTimeout(client.idle)
  client.idle=setTimeout(()=>{client.reader.close();cache.delete(repo)},90000);client.idle.unref?.()
  const value=client.reader.status()
  // A cached footprint from an older conversation must never be attributed to the new one.
  return {...value,executor,threadId,contexts:(value.contexts||[]).filter(row=>row.threadId===threadId)}
}
