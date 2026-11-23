import {openProductionEditor} from './production-editor.mjs'
import {readFile,stat} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {join} from 'node:path'
import {productionUnits,readProductionConsistent,writeProduction,writeProductionMedia,productionMedia,createProductionProject,renameProductionProject,productionBackups,restoreProductionBackup} from './production-store.mjs'
import {libraryList,libraryMedia,serveLibraryMedia} from './production-library.mjs'
import {exportProductionPackage,importProductionPackage,duplicateProductionProject,cleanupTransfer} from './production-transfer.mjs'
import {methodEnvironment,probeMethodMedia,exportMethodPackage} from './production-method-routes.mjs'
import {productionMethodPage} from './production-method-page.mjs'
import {workshopDialogue} from './production-workshop-dialogue.mjs'
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
const readBody=(req,max)=>new Promise((ok,bad)=>{let chunks=[],size=0,tooBig=false;req.on('data',b=>{size+=b.length;if(size>max){tooBig=true;chunks=[]}else if(!tooBig)chunks.push(b)});req.on('end',()=>tooBig?bad(Object.assign(new Error('Файл или проект слишком большой'),{status:413})):ok(Buffer.concat(chunks)));req.on('error',bad)})
export async function productionRoutes({req,res,url,HERE,REPO}){
 const methodAssets=['/production-taste.js','/production-taste-ui.js','/production-method.js','/production-method-ui.js','/production-method.css','/production-workshop.js','/production-workshop-ui.js','/production-workshop.css','/production-workshop-library.js'];
 const methodAPI=['/api/production/environment','/api/production/probe','/api/production/preparation','/api/production/dialogue'];
 if(![...methodAssets,...methodAPI,'/api/production/editor','/production-editor-ui.js','/production','/production-library.js','/production-library.css','/production-projects.js','/production-projects.css','/api/production/projects','/api/production/backups','/api/production/package','/api/production/library','/api/production/library-media','/api/production/units','/api/production/project','/api/production/media'].includes(url.pathname))return false
 try{
  if(url.pathname==='/production'&&req.method==='GET'){const html=productionMethodPage(await readFile(join(HERE,'production.html'),'utf8'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-src http://127.0.0.1:*; object-src 'none'; frame-ancestors 'self'; base-uri 'none'"});res.end(html);return true}
  // Host is checked at the outer boundary. Refuse cross-origin requests including reads.
  if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'Чужой источник запроса'});return true}
  if([...methodAssets,'/production-editor-ui.js','/production-library.js','/production-library.css','/production-projects.js','/production-projects.css'].includes(url.pathname)&&req.method==='GET'){res.writeHead(200,{'content-type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(await readFile(join(HERE,url.pathname.slice(1))));return true}
  const mediaRead=['/api/production/media','/api/production/library-media','/api/production/package'].includes(url.pathname)&&['GET','HEAD'].includes(req.method)
  if(req.headers['x-dzhinni']!=='1'&&!mediaRead){json(res,403,{error:'Запрос только из AllY'});return true}
  const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`){json(res,403,{error:'Чужой источник запроса'});return true}
  if(methodAPI.includes(url.pathname)&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){json(res,403,{error:'Подготовка доступна на компьютере'});return true}
  if(url.pathname==='/api/production/dialogue'&&req.method==='GET'){json(res,200,await workshopDialogue(REPO,HERE,url.searchParams.get('unit')));return true}
  if(url.pathname==='/api/production/environment'&&req.method==='GET'){json(res,200,await methodEnvironment(REPO));return true}
  if(url.pathname==='/api/production/probe'&&req.method==='GET'){json(res,200,await probeMethodMedia(REPO,url.searchParams.get('unit'),url.searchParams.get('id')));return true}
  if(url.pathname==='/api/production/preparation'&&req.method==='GET'){const pack=await exportMethodPackage(REPO,url.searchParams.get('unit'),url.searchParams.get('revision')),s=await stat(pack.file);res.writeHead(200,{'content-type':'application/zip','content-length':s.size,'content-disposition':'attachment; filename="'+pack.name+'"','cache-control':'no-store','x-content-type-options':'nosniff'});createReadStream(pack.file).on('error',()=>res.destroy()).pipe(res);return true}
  if(url.pathname==='/api/production/editor'&&req.method==='POST'){if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){json(res,403,{error:'Монтаж доступен на компьютере'});return true}const data=JSON.parse((await readBody(req,4096)).toString('utf8'));json(res,200,await openProductionEditor(REPO,data.unit));return true}
  if(url.pathname==='/api/production/projects'){
   if(req.method==='GET'){json(res,200,{projects:await productionUnits(REPO),storagePolicy:'sqlite-extra-v1'});return true}
   if(req.method==='POST'){const data=JSON.parse((await readBody(req,17*1024*1024)).toString('utf8'));let result;if(data.action==='create')result=await createProductionProject(REPO,data);else if(data.action==='rename')result=await renameProductionProject(REPO,data);else if(data.action==='duplicate')result=await duplicateProductionProject(REPO,data.unit);else{json(res,400,{error:'Неизвестное действие проекта'});return true}json(res,200,result);return true}
  }
  if(url.pathname==='/api/production/backups'){
   if(req.method==='GET'){json(res,200,{backups:await productionBackups(REPO,url.searchParams.get('unit'))});return true}
   if(req.method==='POST'){const data=JSON.parse((await readBody(req,4096)).toString('utf8'));if(!Number.isSafeInteger(data.id)||data.id<1){json(res,400,{error:'Неверная копия'});return true}json(res,200,await restoreProductionBackup(REPO,data));return true}
  }
  if(url.pathname==='/api/production/package'){
   if(req.method==='POST'){json(res,200,await importProductionPackage(REPO,req));return true}
   if(req.method==='GET'){const pack=await exportProductionPackage(REPO,url.searchParams.get('unit')),s=await stat(pack.file);res.writeHead(200,{'content-type':'application/zip','content-length':s.size,'content-disposition':'attachment; filename="'+pack.name+'"','cache-control':'no-store','x-content-type-options':'nosniff'});const stream=createReadStream(pack.file);stream.on('error',()=>res.destroy());stream.on('close',()=>cleanupTransfer(REPO,pack.dir).catch(()=>{}));res.on('close',()=>stream.destroy());stream.pipe(res);return true}
  }
  if(url.pathname==='/api/production/library'&&req.method==='GET'){json(res,200,await libraryList(REPO,Object.fromEntries(url.searchParams)));return true}
  if(url.pathname==='/api/production/library-media'&&['GET','HEAD'].includes(req.method)){await serveLibraryMedia(req,res,await libraryMedia(REPO,url.searchParams.get('id'),{poster:url.searchParams.get('poster')==='1',image:url.searchParams.get('image')||0}));return true}
  if(url.pathname==='/api/production/units'&&req.method==='GET'){json(res,200,{units:await productionUnits(REPO)});return true}
  if(url.pathname==='/api/production/project'){
   if(req.method==='GET'){json(res,200,await readProductionConsistent(REPO,url.searchParams.get('unit')));return true}
   if(req.method==='POST'){let data=JSON.parse((await readBody(req,17*1024*1024)).toString('utf8'));json(res,200,await writeProduction(REPO,data));return true}
  }
  if(url.pathname==='/api/production/media'){
   if(req.method==='POST'){let name=req.headers['x-file-name'];try{name=decodeURIComponent(name||'')}catch{throw Object.assign(new Error('Некорректное имя'),{status:400})};json(res,200,await writeProductionMedia(REPO,url.searchParams.get('unit'),name,await readBody(req,50*1024*1024)));return true}
   if(req.method==='GET'){let item=await productionMedia(REPO,url.searchParams.get('unit'),url.searchParams.get('id'));let start=0,end=item.size-1,status=200;const range=req.headers.range;if(range){let m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416,{'content-range':`bytes */${item.size}`});res.end();return true}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end||start>=item.size){res.writeHead(416,{'content-range':`bytes */${item.size}`});res.end();return true}status=206}res.writeHead(status,{'content-type':item.type,'content-length':end-start+1,'accept-ranges':'bytes','cache-control':'private, no-cache','x-content-type-options':'nosniff',...(status===206?{'content-range':`bytes ${start}-${end}/${item.size}`}:{})});createReadStream(item.file,{start,end}).pipe(res);return true}
  }
  json(res,405,{error:'Метод не поддерживается'});return true
 }catch(e){json(res,e.status||(e instanceof SyntaxError?400:500),{error:String(e.message||e).slice(0,300)});return true}
}
