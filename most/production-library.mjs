// Read-only bridge to the existing Pult style catalogue and the reference index.
import {readFile,stat,realpath} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {join,resolve,relative,extname,basename} from 'node:path'
import {createHash} from 'node:crypto'
const cache=new Map(),mime={'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp4':'video/mp4','.webm':'video/webm'}
const key=s=>createHash('sha256').update(s).digest('hex').slice(0,24)
const inside=(root,file)=>{let p=relative(root,file);return p!==''&&!p.startsWith('..')&&!p.includes(':')&&!p.startsWith('/')}
async function catalogue(repo){
 const now=Date.now(),old=cache.get(repo);if(old&&now-old.at<10000)return old.items
 const items=[],add=(kind,id,title,group,file,root,extra={})=>items.push({kind,id:key(id),title,group,file,root,source:relative(repo,file).replaceAll('\\','/'),status:'Только референс',rights:'Лицензия на производное использование не подтверждена. Проверить первоисточник перед выпуском.',...extra})
 const own=join(repo,'art/video/sitkom');
 for(const [id,title,file] of [['mix-stage','Наша смесь · сцена','probyi/smes_2610/A_scena.png'],['mix-room','Наша смесь · подвал','probyi/smes_2610/B_podval.png'],['retro-background','Ретро 60-х · фон','etalon/fon_etalon_pavilon.png'],['retro-director','Ретро 60-х · режиссёр','etalon/rezhisser_vybran.png']]){
  try{await stat(join(own,file));add('styles','own:'+id,title,'Наши образцы',join(own,file),own,{note:'Собственный образец из библиотеки проекта'})}catch(e){if(e.code!=='ENOENT')throw e}
 }
 const data=JSON.parse(await readFile(join(repo,'act/scripts/pages/stili_data.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{"разделы":[]}';throw e})),images=join(repo,'memory/_assets/images/STYLES TOOLKIT — таблица стилей')
 for(const section of data['разделы'])for(const table of section['таблицы'])for(const row of table.zapisi){
  const files=Object.values(row.img||{}).filter(f=>typeof f==='string'&&/^[\w.-]+\.webp$/.test(f));if(!files.length)continue
  add('styles','toolkit:'+row.id,String(row.name).slice(0,180),section.ru,join(images,files[0]),images,{note:'STYLES TOOLKIT · '+section.ru,rights:String(data['права']||'Лицензия не подтверждена'),description:'Визуальный референс из категории «'+section.ru+'». Характеристики для своего проекта обсуждаются с Джинни.',alternates:files.slice(1).map(f=>join(images,f))})
 }
 const refs=JSON.parse(await readFile(join(repo,'art/video/referensy/index.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '[]';throw e})),videos=join(repo,'art/video/referensy')
 for(const row of refs){const file=resolve(repo,row.path||'');if(!inside(videos,file)||!['.mp4','.webm'].includes(extname(file)))continue
  const id=key(row.id||row.path),poster=join(videos,'_previews',id+'.jpg')
  add('references',row.id||row.path,row.title||[row.author,'Пример '+(row.slide||items.filter(i=>i.kind==='references').length+1)].filter(Boolean).join(' · '),row.author||'Анимация',file,videos,{duration:row.duration_s||0,note:row.author||'Видеореференс',poster,source:row.source||relative(repo,file).replaceAll('\\','/'),description:'Видеопример движения и композиции. Помогает выбрать впечатление; готовый компонент воспроизведения этого стиля не подтверждён.'})
 }
 cache.set(repo,{at:now,items});return items
}
export async function libraryList(repo,{kind='styles',q='',group='',offset=0}={}){
 const all=(await catalogue(repo)).filter(x=>x.kind===kind),groups=[...new Set(all.map(x=>x.group))],needle=String(q).toLocaleLowerCase().slice(0,180)
 const matches=all.filter(x=>(!group||x.group===group)&&(!needle||(x.title+' '+x.group).toLocaleLowerCase().includes(needle))),start=Math.max(0,Math.floor(Number(offset)||0))
 return{groups,total:matches.length,offset:start,items:matches.slice(start,start+24).map(({file,root,poster,alternates,...x})=>({...x,url:'/api/production/library-media?id='+x.id,poster:poster?'/api/production/library-media?id='+x.id+'&poster=1':null,images:alternates?[0,...alternates.map((_,i)=>i+1)].map(i=>'/api/production/library-media?id='+x.id+'&image='+i):undefined}))}
}
export async function libraryMedia(repo,id,{poster=false,image=0}={}){
 if(!/^[a-f0-9]{24}$/.test(id||''))throw Object.assign(Error('Пример не найден'),{status:404})
 const item=(await catalogue(repo)).find(x=>x.id===id);if(!item)throw Object.assign(Error('Пример не найден'),{status:404})
 const index=Number(image);if(!Number.isInteger(index)||index<0||index>20)throw Object.assign(Error('Картинка не найдена'),{status:404})
 const file=poster?item.poster:(index===0?item.file:item.alternates?.[index-1]);if(!file)throw Object.assign(Error('Файл не найден'),{status:404})
 try{const [root,actual]=await Promise.all([realpath(item.root),realpath(file)]);if(!inside(root,actual))throw Object.assign(Error('Недоступный файл'),{status:403});const s=await stat(actual);if(!s.isFile()||!mime[extname(actual)])throw Object.assign(Error('Файл не поддерживается'),{status:404});return{file:actual,size:s.size,type:mime[extname(actual)]}}
 catch(e){if(e.code==='ENOENT')throw Object.assign(Error('Файл не найден'),{status:404});throw e}
}
export async function serveLibraryMedia(req,res,item){
 let start=0,end=item.size-1,status=200
 if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m){res.writeHead(416,{'content-range':`bytes */${item.size}`});res.end();return}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=item.size){res.writeHead(416,{'content-range':`bytes */${item.size}`});res.end();return}status=206}
 res.writeHead(status,{'content-type':item.type,'content-length':end-start+1,'accept-ranges':'bytes','cache-control':'private, max-age=300','x-content-type-options':'nosniff',...(status===206?{'content-range':`bytes ${start}-${end}/${item.size}`}:{})})
 if(req.method==='HEAD'){res.end();return}const stream=createReadStream(item.file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res)
}
