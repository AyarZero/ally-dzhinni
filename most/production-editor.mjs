import {readFile,writeFile,mkdir,stat,copyFile,readdir} from 'node:fs/promises'
import {join,dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {productionUnits,productionRoot,readProductionConsistent,productionMedia} from './production-store.mjs'
import {DatabaseSync} from 'node:sqlite'
const here=dirname(fileURLToPath(import.meta.url)),sessions=new Map()
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function seedLibrary(app,root){for(const group of ['sfx','elements','svg','fonts']){const target=join(root,'library',group);await mkdir(target,{recursive:true});for(const file of await readdir(join(app,'library',group),{withFileTypes:true})){if(!file.isFile()||file.name.startsWith('.'))continue;try{await copyFile(join(app,'library',group,file.name),join(target,file.name),1)}catch(e){if(e.code!=='EEXIST')throw e}}}}
function replaceOnce(s,old,value){if(s.split(old).length!==2)throw Error('Версия FableCut изменилась: адаптер требует проверки');return s.replace(old,value)}
function allyEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function adaptEditorApp(source){
 source=source.replace('if (!force && (data.revision || 0) === (project.revision || 0)) return;','if (window.allyEditorDirty?.() || (data.revision || 0) <= (project.revision || 0)) return;')
 for(const name of ['m.name','thumbSrc','p.text'])source=source.split('${'+name+'}').join('${allyEscape('+name+')}')
 source=source.replace('(c.props.text || "").split("\\n")[0]','allyEscape((c.props.text || "").split("\\n")[0])').replace('"FX · " + c.name : c.name','"FX · " + allyEscape(c.name) : allyEscape(c.name)')
 return allyEscape.toString()+'\n'+source
}
export async function editorSnapshot(root){
 try{await stat(join(root,'history.sqlite'));const db=new DatabaseSync(join(root,'history.sqlite'),{readOnly:true});try{const row=db.prepare('SELECT payload FROM saves ORDER BY revision DESC LIMIT 1').get();if(row)return JSON.parse(row.payload)}finally{db.close()}}catch(e){if(e.code!=='ENOENT')throw e}
 try{return JSON.parse(await readFile(join(root,'project.json'),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}
}
async function initialTimeline(repo,unit,root,title){
 const value=await readProductionConsistent(repo,unit),s=value.store,doc=s?.projects?.[s.mode]?.doc;
 const ratio=doc?.global?.ratio||'9:16',sizes={'9:16':[1080,1920],'16:9':[1920,1080],'4:5':[1080,1350],'1:1':[1080,1080]},[width,height]=sizes[ratio]||sizes['9:16'];
 const project={name:title,width,height,fps:30,revision:0,media:[],clips:[]};if(!doc)return project;
 let start=0;await mkdir(join(root,'media'),{recursive:true});
 async function media(id,name,kind,duration){if(!id)return null;const old=project.media.find(m=>m.id===id);if(old)return old;const source=await productionMedia(repo,unit,id);await copyFile(source.file,join(root,'media',id));const m={id,name:name||id,kind,src:'/media/'+id,duration};project.media.push(m);return m}
 for(const p of doc.parts){const duration=p.duration||5,m=await media(p.visualMedia,p.visualName,/\.(mp4|webm|mov)$/.test(p.visualMedia||'')?'video':'image',duration);
  if(m)project.clips.push({id:'visual_'+p.id,mediaId:m.id,kind:m.kind,track:'V1',start,in:0,duration,name:p.name,props:{fit:p.fit||'contain'}});
  if(p.text)project.clips.push({id:'title_'+p.id,mediaId:null,kind:'text',track:'V2',start,in:0,duration,name:p.name,props:{text:p.text,font:'Segoe UI',fontSize:Math.round(width/16),color:'#ffffff'}});
  const a=await media(p.audioMedia,p.audioName,'audio',duration);if(a)project.clips.push({id:'audio_'+p.id,mediaId:a.id,kind:'audio',track:'A1',start,in:0,duration,name:p.audioName,props:{}});start+=duration;
 }
 for(const [key,track] of [['audioMedia','A2'],['musicMedia','A3']]){const m=await media(doc.global[key],doc.global[key.replace('Media','Name')],'audio',start);if(m)project.clips.push({id:'global_'+key,mediaId:m.id,name:m.name,kind:'audio',track,start:0,in:0,duration:start,props:{}})}
 return project;
}
export function adaptEditor(source,{app,root,persistence}){
 source=source.replace(/\r\n/g,'\n')
 source=replaceOnce(source,'const PORT = process.env.PORT || 7777;','let PORT = Number(process.env.PORT ?? 7777);')
 source=replaceOnce(source,'server.listen(PORT, HOST, () => {','server.listen(PORT, HOST, () => { PORT=server.address().port; console.log("ALLY_PORT="+PORT);')
 source=replaceOnce(source,'const ROOT = __dirname;',`const ROOT = ${JSON.stringify(root)}; const APP_ROOT = ${JSON.stringify(app)}; const allyStore = require(${JSON.stringify(persistence)}).openStore(ROOT);`)
 source=replaceOnce(source,'require("./analyze")',`require(${JSON.stringify(join(app,'analyze.js'))})`)
 source=replaceOnce(source,'const server = http.createServer(async (req, res) => {',`const server = http.createServer(async (req, res) => {
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'");
 const incoming=new URL(req.url,'http://127.0.0.1'), cookie='ally_fable_'+PORT+'='+process.env.ALLY_EDITOR_TOKEN;
 if(req.headers.host!==HOST+':'+PORT || (req.headers.origin&&req.headers.origin!=='http://'+HOST+':'+PORT)){res.writeHead(403);res.end();return}
 if(incoming.pathname==='/'&&incoming.searchParams.get('allyToken')===process.env.ALLY_EDITOR_TOKEN){res.writeHead(303,{'set-cookie':cookie+'; HttpOnly; SameSite=Strict; Path=/','location':'/'});res.end();return}
 if(!(req.headers.cookie||'').split(';').some(v=>v.trim()===cookie)){res.writeHead(403);res.end();return}
 if(incoming.pathname==='/api/project'&&req.method==='PUT'&&incoming.searchParams.has('force')){res.writeHead(403);res.end();return}
 if(incoming.pathname==='/ally-client.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(fs.readFileSync(${JSON.stringify(join(here,'production-editor-client.js'))}));return}
 `)
 source=replaceOnce(source,'const chunks = [];','const chunks = []; let size=0;')
 source=replaceOnce(source,'req.on("data", (c) => chunks.push(c));','req.on("data", (c) => {size+=c.length;if(size>50*1024*1024){reject(Error("Файл больше 50 МБ"));req.destroy()}else chunks.push(c)});')
 const readExpression='JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(new RegExp("^\\\\uFEFF"), ""))'
 if(source.split(readExpression).length!==3)throw Error('Изменилось чтение FableCut')
 source=source.split(readExpression).join('allyStore.read()')
 source=replaceOnce(source,'const tmp = PROJECT_FILE + ".tmp";\n      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));\n      fs.renameSync(tmp, PROJECT_FILE);','allyStore.write(data);')
 source=source.replace('{ stdio: ["pipe", "ignore", "pipe"] }','{ windowsHide:true, stdio: ["pipe", "ignore", "pipe"] }').replace('{ maxBuffer: 1 << 24 }','{ windowsHide:true, maxBuffer: 1 << 24 }')
 source=replaceOnce(source,'let name = safeName(url.searchParams.get("name") || "upload.bin");','let name = safeName(url.searchParams.get("name") || "upload.bin"); if(!/\\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|aac|flac)$/i.test(name))throw Error("Формат файла не поддерживается");')
 source=replaceOnce(source,'function beginExport(fps, name) {','function beginExport(fps, name) { if(exportSessions.size)throw Error("Дождись завершения экспорта");')
 source=replaceOnce(source,'"-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",','"-y", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", String(fps), "-i", "-",')
 const old='  file = path.normalize(path.join(ROOT, file));\n  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }\n  serveFile(req, res, file);'
 const updated=`  if(!/^\\/(index\\.html|app\\.js|style\\.css|favicon\\.svg|icons\\/[a-zA-Z0-9_.-]+)$/.test(file)){res.writeHead(404);res.end();return}
  if(file==='/index.html'){let html=fs.readFileSync(path.join(APP_ROOT,'index.html'),'utf8').replace('</body>','<script src="/ally-client.js"></script></body>');res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return}
  if(file==='/app.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});res.end(fs.readFileSync(path.join(ROOT,'.app.js')));return}
  file = path.normalize(path.join(APP_ROOT,file));
  serveFile(req,res,file);`
 return replaceOnce(source,old,updated)
}
export async function openProductionEditor(repo,unit){
 const meta=(await productionUnits(repo)).find(x=>x.id===unit);if(!meta)throw Object.assign(Error('Сначала создай или открой проект'),{status:404})
 const root=join(productionRoot(repo),unit,'editor'),key=resolve(root)
 if(sessions.has(key))return sessions.get(key).ready
 const entry={};sessions.set(key,entry)
 entry.ready=(async()=>{
  const app=join(repo,'_repos','FableCut');await stat(join(app,'server.js'));await mkdir(root,{recursive:true})
  await seedLibrary(app,root)
  try{await stat(join(root,'project.json'))}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(join(root,'project.json'),JSON.stringify(await initialTimeline(repo,unit,root,meta.title)),{flag:'wx'})}
  const runtime=join(root,'.server.cjs'),source=await readFile(join(app,'server.js'),'utf8');await writeFile(runtime,adaptEditor(source,{app,root,persistence:join(here,'fablecut-persistence.cjs')}))
  await writeFile(join(root,'.app.js'),adaptEditorApp(await readFile(join(app,'app.js'),'utf8')))
  let port='0';try{port=String(Number(await readFile(join(root,'.port'),'utf8')));if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535)throw Error('Неверный порт редактора')}catch(e){if(e.code!=='ENOENT')throw e}
  const token=randomBytes(32).toString('hex');let output=''
  const child=spawn(process.execPath,[runtime],{cwd:root,windowsHide:true,env:{...process.env,PORT:port,HOST:'127.0.0.1',ALLY_EDITOR_TOKEN:token},stdio:['ignore','pipe','pipe']});entry.child=child
  child.stdout.on('data',b=>{output=(output+b).slice(-4000)});child.stderr.on('data',b=>{entry.error=String(b).slice(-400)})
  child.once('exit',()=>sessions.delete(key));child.once('error',e=>{entry.error=e.message;sessions.delete(key)})
  // Port zero is reported by the adapter from the actual listening socket.
  for(let i=0;i<100;i++){const m=output.match(/ALLY_PORT=(\d+)/);if(m){await writeFile(join(root,'.port'),m[1]);return{url:'http://127.0.0.1:'+m[1]+'/?allyToken='+token,unit,title:meta.title}}if(child.exitCode!==null)throw Error(entry.error||'Редактор не запустился');await pause(100)}
  child.kill();throw Error('Редактор не ответил вовремя')
 })().catch(e=>{sessions.delete(key);throw e})
 return entry.ready
}
export function stopProductionEditors(){for(const v of sessions.values())v.child?.kill();sessions.clear()}
process.once('exit',stopProductionEditors)
