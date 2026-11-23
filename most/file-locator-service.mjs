// Local file-handle lookup is separate from the model runner: deploying it never interrupts a turn.
import http from 'node:http'
import { localFileReferences } from './local-file-reference.mjs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export async function ensureFileLocator({port=8799,windowPort=8798}={}) {
 const marker='ally-local-file-locator-v1'
 const buildHash=createHash('sha256')
 for(const name of ['file-locator-service.mjs','local-file-reference.mjs','browser-file-path.mjs','browser-file-path.ps1'])buildHash.update(await readFile(new URL(name,import.meta.url)))
 const build=buildHash.digest('hex')
 try {
  const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1000)})
  const health=await response.json()
  if(health.service===marker&&health.windowPort===windowPort){if(health.build!==build)throw new Error('Служба определения пути требует обновления');return null}
  throw new Error('Порт определения пути занят другим приложением')
 }catch(error){if(['Порт определения пути занят другим приложением','Служба определения пути требует обновления'].includes(error.message))throw error}
 const refs=localFileReferences()
 const origins=new Set([`http://127.0.0.1:${windowPort}`,`http://localhost:${windowPort}`])
 const server=http.createServer(async(req,res)=>{
  const reply=(code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
  if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return reply(403,{ok:false})
  if(req.method==='GET'&&req.url==='/health')return reply(200,{service:marker,windowPort,pid:process.pid,build})
  if(!origins.has(req.headers.origin))return reply(403,{ok:false})
  res.setHeader('access-control-allow-origin',req.headers.origin);res.setHeader('vary','Origin')
  if(req.method==='OPTIONS'){
   res.setHeader('access-control-allow-methods','POST');res.setHeader('access-control-allow-headers','content-type,x-dzhinni');res.writeHead(204);return res.end()
  }
  if(req.method!=='POST'||req.url!=='/drop'||req.headers['x-dzhinni']!=='1')return reply(403,{ok:false})
  const controller=new AbortController(),disconnect=()=>{if(!res.writableEnded)controller.abort()};res.once('close',disconnect)
  try{
   const chunks=[];let bytes=0
   for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw new Error('Неверные данные файла');chunks.push(chunk)}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'))
   if(!['begin','finish'].includes(data.drop))throw new Error('Неверный запрос определения пути')
   const result=await refs.create(data,{signal:controller.signal})
   return reply(200,result.reference?{ok:true,path:result.reference.path}:result)
  }catch(error){if(!res.destroyed)reply(400,{ok:false,error:error.message})}finally{res.off('close',disconnect)}
 })
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
 return server
}
