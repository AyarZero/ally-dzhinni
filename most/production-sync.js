// Server persistence. One serialized write, revision conflict blocks further writes, browser copy survives failure.
const productionHeaders={'x-dzhinni':'1'};
async function productionFetch(path,options={}){let r=await fetch(path,{...options,headers:{...productionHeaders,...options.headers}});let data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'Ошибка сохранения'),{status:r.status});return data}
async function productionBootstrap(){
 let {units}=await productionFetch('/api/production/units');
 let wanted=new URL(location.href).searchParams.get('unit');if(!wanted)try{wanted=localStorage.getItem('ally-production-unit')}catch{}
 let unit=units.find(u=>u.id===wanted)||units[0]||{id:'',title:'Новый проект'},remote=unit.id?await productionFetch('/api/production/project?unit='+encodeURIComponent(unit.id)):{revision:'0',store:null};
 let base='ally-production-live-'+unit.id,previousKey=null,key=base+'-'+crypto.randomUUID();try{previousKey=sessionStorage.getItem(base);sessionStorage.setItem(base,key)}catch{}
 return{...remote,units,unit,key,base,previousKey}
}
const productionBoot=await productionBootstrap().catch(e=>{document.getElementById('sync-alert').hidden=false;document.getElementById('sync-message').textContent='Не удалось открыть производство: '+e.message;document.getElementById('saved').textContent='Не загружено';document.getElementById('workspace').inert=true;document.getElementById('sync-retry').onclick=()=>location.reload();document.getElementById('sync-copy').disabled=true;document.getElementById('sync-load').disabled=true;throw e});
let serverRevision=productionBoot.revision,writePending=null,writeActive=null,saveTimer=null,syncBlocked=false,selectionCacheConflict=false;
function productionValidStore(s){return s&&['carousel','story','lesson'].includes(s.mode)&&s.projects&&['carousel','story','lesson'].every(mode=>validImported({kind:'ally-production-v3',schema:1,mode,project:s.projects[mode]}))}
function cacheProduction(pending){try{localStorage.setItem(KEY,JSON.stringify({revision:serverRevision,store,pending,at:Date.now()}));localStorage.setItem('ally-production-unit',productionBoot.unit.id)}catch{if(pending)productionBanner('Черновик не помещается в браузере. Не закрывай страницу до сохранения на компьютере или скачай копию.')}}
function loadProductionCopy(){
 let local;try{local=JSON.parse(localStorage.getItem(productionBoot.previousKey)||'null')}catch{}
 if(productionValidStore(productionBoot.store))store=clone(productionBoot.store);
 if(local?.pending&&productionValidStore(local.store)){if(JSON.stringify(local.store)===JSON.stringify(productionBoot.store))return;store=clone(local.store);if(local.revision!==serverRevision){syncBlocked=selectionCacheConflict=true}else writePending=clone(store)}
}
function productionBanner(message){$('sync-message').textContent=message;$('sync-alert').hidden=!message}
function requestProductionSave(){writePending=clone(store);cacheProduction(true);$('saved').textContent=syncBlocked?'Не сохранено · конфликт':'Сохраняю…';clearTimeout(saveTimer);if(!productionBoot.unit.id){productionBanner('Создай проект, чтобы сохранить правки на диск.');return}if(!syncBlocked)flushProduction()}
async function flushProduction(){
 clearTimeout(saveTimer);if(writeActive)return writeActive;if(syncBlocked)return false;
 writeActive=(async()=>{while(writePending&&!syncBlocked){let snapshot=writePending;writePending=null;
  try{let result=await productionFetch('/api/production/project',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({unit:productionBoot.unit.id,revision:serverRevision,store:snapshot})});if(result.durable!==true)throw Error('Сервер ещё не подтвердил защищённую запись. Черновик сохранён в браузере.');serverRevision=result.revision;cacheProduction(!!writePending);if(!writePending){$('saved').textContent='Сохранено на компьютере';productionBanner(result.backupWarning||'')}}
  catch(e){writePending=writePending||snapshot;cacheProduction(true);syncBlocked=true;if(e.status===409)selectionCacheConflict=true;$('saved').textContent='Не сохранено';productionBanner(e.status===409?'Материал изменён в другом окне. Сохрани свою копию или загрузи версию с компьютера.':'Сохранение не завершено: '+e.message);return false}
 }return !writePending&&!syncBlocked})().finally(()=>writeActive=null);return writeActive
}
function exportProduction(){let value={kind:'ally-production-live',schema:1,unit:productionBoot.unit.id,store:clone(store)};let blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});if(blob.size>16*1024*1024){toast('Проект больше 16 МБ; файл не создан');return}let a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='ally-production-'+productionBoot.unit.id+'-'+new Date().toISOString().replaceAll(':','-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('project-menu').open=false}
function productionMediaURL(id){return'/api/production/media?unit='+encodeURIComponent(productionBoot.unit.id)+'&id='+encodeURIComponent(id)}
function setupProduction(){
 document.querySelector('h1').textContent=productionBoot.unit.title;document.title='AllY · '+productionBoot.unit.title;
 $('unit-open').textContent=productionBoot.unit.id+' · Сменить материал';$('unit-picker').replaceChildren();productionBoot.units.forEach(u=>{let o=document.createElement('option');o.value=u.id;o.textContent=u.title;$('unit-picker').append(o)});$('unit-picker').value=productionBoot.unit.id;
 $('unit-open').onclick=()=>$('unit-dialog').showModal();$('unit-go').onclick=async()=>{if(!await flushProduction()){toast('Сначала сохрани текущие правки или разреши конфликт');return}location.href='/production?unit='+encodeURIComponent($('unit-picker').value)};
 $('sync-retry').onclick=()=>{if(selectionCacheConflict){productionBanner('Есть конфликт версий. Сначала сохрани свою копию, затем загрузи версию с компьютера.');return}syncBlocked=false;flushProduction()};
 $('sync-copy').onclick=exportProduction;$('sync-load').onclick=async()=>{if(!confirm('Загрузить сохранённую версию и заменить текущие правки? Сначала скачай свою копию, если она нужна.'))return;try{if(writeActive)await writeActive;let fresh=await productionFetch('/api/production/project?unit='+encodeURIComponent(productionBoot.unit.id));if(fresh.store&&!productionValidStore(fresh.store))throw Error('Некорректная сохранённая версия');store=clone(fresh.store||defaults);serverRevision=fresh.revision;writePending=null;syncBlocked=selectionCacheConflict=false;for(let mode of ['carousel','story','lesson']){editHistory[mode]={undo:[],redo:[]};lastDoc[mode]=clone(store.projects[mode].doc)}selected=null;selectionText='';cacheProduction(false);productionBanner('');$('saved').textContent='Сохранено на компьютере';render()}catch(e){productionBanner('Не удалось загрузить: '+e.message)}};
 $('drafts-open').onclick=()=>{let list=$('drafts-list');list.replaceChildren();let found=0;for(let i=0;i<localStorage.length;i++){let key=localStorage.key(i);if(!key.startsWith(productionBoot.base+'-')||key===KEY)continue;try{let d=JSON.parse(localStorage.getItem(key));if(!d.pending||!productionValidStore(d.store))continue;found++;let row=el('div',undefined,'version-row');row.append(el('p',new Date(d.at||Date.now()).toLocaleString('ru-RU')+' · '+labels[d.store.mode][2]));row.append(button('Восстановить черновик',()=>{if(!confirm('Заменить текущие правки выбранным черновиком?'))return;store=clone(d.store);for(let mode of ['carousel','story','lesson']){editHistory[mode]={undo:[],redo:[]};lastDoc[mode]=clone(store.projects[mode].doc)}selected=null;selectionText='';syncBlocked=selectionCacheConflict=d.revision!==serverRevision;writePending=clone(store);cacheProduction(true);render();$('drafts-dialog').close();if(syncBlocked)productionBanner('Черновик восстановлен, но версия на компьютере изменилась. Скачай копию перед разрешением конфликта.');else flushProduction()}));list.append(row)}catch{}}if(!found)list.append(el('p','Нет других несохранённых черновиков.'));$('drafts-dialog').showModal();$('project-menu').open=false};
 $('export-project').onclick=exportProduction;
 $('import-project').onchange=async()=>{let file=$('import-project').files[0];$('import-project').value='';if(!file)return;try{if(file.size>16*1024*1024)throw Error('Файл больше 16 МБ');let value=JSON.parse(await file.text()),replacement;
  if(value.kind==='ally-production-live'&&value.schema===1&&value.unit===productionBoot.unit.id&&productionValidStore(value.store))replacement=value.store;
  else if(validImported(value)){replacement=clone(store);replacement.mode=value.mode;replacement.projects[value.mode]=value.project}
  else throw Error('Неверный файл или материал');if(!confirm('Заменить проект данными из файла?'))return;
  store=clone(replacement);selected=null;selectionText='';for(let mode of ['carousel','story','lesson'])editHistory[mode]={undo:[],redo:[]};save();render();$('project-menu').open=false;
 }catch(e){toast('Не удалось загрузить: '+e.message)}};
 function upload(id,field,scope){$(id).onchange=async()=>{let file=$(id).files[0];$(id).value='';if(!file)return;if(file.size>50*1024*1024){toast('Файл больше 50 МБ');return}
  let mode=store.mode,partId=current().id,target=scope==='global'?doc().global:current();$(id).disabled=true;toast('Загружаю файл…');
  try{let data=await productionFetch('/api/production/media?unit='+encodeURIComponent(productionBoot.unit.id),{method:'POST',headers:{'x-file-name':encodeURIComponent(file.name)},body:file});let active=scope==='global'?store.projects[mode].doc.global:store.projects[mode].doc.parts.find(p=>p.id===partId);
   if(active!==target){toast('Файл загружен, но сцена изменилась. Выбери его заново.');return}
   active[field+'Name']=data.name;active[field+'Media']=data.id;
   // changed() is scoped to the active format. Preserve other format if navigation occurred during upload.
   if(store.mode===mode){changed(field==='visual'?'visual':'audio');render();if($('global').open)renderGlobal()}
   else{store.projects[mode].doc.dirty=true;store.projects[mode].doc.stale.assembly=true;if(field!=='visual')store.projects[mode].doc.stale.timing=true;requestProductionSave()}
   toast('Файл сохранён на компьютере');
  }catch(e){toast('Файл не сохранён: '+e.message)}finally{$(id).disabled=false}
 }}
 upload('visual-file','visual','part');upload('audio-file','audio','part');upload('global-audio-file','audio','global');upload('music-file','music','global');
 const baseDraw=draw;draw=function(){baseDraw();let p=current(),art=$('art'),id=p.visualMedia,video=/\.(mp4|webm|mov)$/i.test(id||'');$('transport').hidden=isPhoto(p)||video;art.dataset.hasMedia=id?'yes':'no';let node=$('production-media');if(node&&node.dataset.mediaId!==id){node.remove();node=null}if(id&&!node){node=document.createElement(video?'video':'img');node.id='production-media';node.dataset.mediaId=id;node.src=productionMediaURL(id);if(video){node.controls=true;node.playsInline=true;node.preload='metadata'}else node.alt=p.visual||p.name;node.onerror=()=>toast('Не удалось открыть медиафайл');art.prepend(node)}if(node)node.style.objectFit=p.fit;
  let audio=$('production-audio');if(!audio){audio=document.createElement('audio');audio.id='production-audio';audio.controls=true;audio.preload='metadata';$('preview').append(audio)}let aid=p.audioMedia||doc().global.audioMedia;audio.hidden=!aid;if(aid){let src=productionMediaURL(aid);if(audio.getAttribute('src')!==src)audio.src=src}else audio.removeAttribute('src');
 };
 const oldDetail=renderDetail;renderDetail=function(){oldDetail();let p=current();$('visual-file-name').textContent=p.visualName||'Выбрать файл';$('audio-file-name').textContent=p.audioName||'Выбрать аудио'};
 const oldGlobal=renderGlobal;renderGlobal=function(){oldGlobal();let g=doc().global;$('global-audio-name').textContent=g.audioName||'Выбрать аудио';$('music-name').textContent=g.musicName||'Выбрать музыку'};
 window.addEventListener('beforeunload',e=>{if(writePending||writeActive||syncBlocked){e.preventDefault();e.returnValue=''}});
 if(selectionCacheConflict)productionBanner('Есть несохранённый черновик и более новая версия на компьютере. Сохрани копию перед загрузкой.');
 let coldDrafts=0;for(let i=0;i<localStorage.length;i++){let k=localStorage.key(i);if(!k.startsWith(productionBoot.base+'-')||k===KEY)continue;try{let d=JSON.parse(localStorage.getItem(k));if(d.pending&&productionValidStore(d.store)&&JSON.stringify(d.store)!==JSON.stringify(productionBoot.store))coldDrafts++}catch{}}if(coldDrafts&&!selectionCacheConflict)productionBanner('Найдены несохранённые черновики: '+coldDrafts+'. Открой «Черновики браузера» в меню ⋯. Сохранённый проект не заменён.');
 if(productionBoot.recovered&&!coldDrafts)productionBanner('Открыта резервная копия после повреждения основного сохранения. Проверь последние изменения.');
 if(productionBoot.store&&!productionBoot.durable&&!productionBoot.journalDamaged&&!writePending)requestProductionSave();
 if((writePending||writeActive)&&!syncBlocked)flushProduction();else $('saved').textContent=syncBlocked?'Не сохранено · конфликт':serverRevision==='0'?'Новый проект':'Сохранено на компьютере';
}
