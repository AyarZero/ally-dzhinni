// Layout and controls for the main message composer and queued message tray.
function arrangeComposer(){
 const form=document.getElementById('f'),engine=document.getElementById('bEngine');
 if(!form||!engine||document.getElementById('composerTools'))return;
 const style=document.createElement('style');style.textContent=`
 footer{padding:10px 24px 12px}
 #queuedTray{margin-bottom:8px;padding:8px 10px;border-radius:12px;background:color-mix(in srgb,var(--surface) 94%,transparent);border:1px solid var(--line);font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.38);backdrop-filter:blur(8px)}
 #queuedTray[hidden]{display:none!important}
 .w[data-w="chat"]>.panel{position:relative}
 .w[data-w="chat"]>.panel #queuedTray{position:absolute;left:calc(var(--chat-left,264px) + 28px);right:12px;bottom:10px;z-index:6;margin:0}
 @media(max-width:820px){.w[data-w="chat"]>.panel #queuedTray{left:12px}}
 .qt-list{max-height:112px;overflow-y:auto;padding-right:2px}
 html[data-client="true"] #bMic,html[data-client="true"] #bVoice{display:none!important}
 .qt-head{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--dim);margin-bottom:6px}
 .qt-head b{color:var(--ink);font-weight:600}
 .qt-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:rgba(var(--accent-rgb),.18);color:var(--accent);font:600 11px/1 'JetBrains Mono',monospace}
 .qt-row{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:10px;background:var(--surface);border:1px solid color-mix(in srgb,var(--line) 70%,transparent);margin-top:4px}
 .qt-text{flex:1;min-width:0;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px}
 .qt-actions{display:flex;align-items:center;gap:4px;flex:none}
 .qt-btn{all:unset;cursor:pointer;width:28px;height:28px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;color:var(--dim);font-size:14px;transition:background .15s,color .15s}
 .qt-btn:hover{color:var(--ink);background:rgba(var(--accent-rgb),.14)}
 .qt-btn[data-qact="delete"]:hover{color:#ff5a7a;background:rgba(255,90,122,.14)}
 footer #f{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:16px;background:var(--surface);border:1px solid var(--line);box-shadow:0 6px 24px rgba(0,0,0,.18);position:relative;transition:border-color .18s,box-shadow .18s}
 footer.big #f{align-items:flex-end}
 html:not(.window-unfocused) footer #f:has(#q:focus){border-color:var(--accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}
 html.window-unfocused footer #f{border-color:var(--line);box-shadow:0 6px 24px rgba(0,0,0,.18)}
 footer #q{order:2;flex:1 1 auto;min-width:0;width:auto;box-sizing:border-box;font:15px/1.45 system-ui,sans-serif;min-height:24px;padding:6px 4px;max-height:28vh}
 footer.big #q{height:min(55vh,560px);max-height:none}
 footer #f .fb,footer #composerTools{box-sizing:border-box;font:500 13px/1.2 system-ui,sans-serif;letter-spacing:0;text-transform:none;border-radius:11px;height:36px;min-width:36px;padding:0 12px;box-shadow:none;cursor:pointer;flex:none;transition:background .15s,border-color .15s,color .15s}
 footer #composerTools{order:1;width:36px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:var(--surface-raised,rgba(255,255,255,.04));border:1px solid var(--line);color:var(--dim);font-size:21px;font-weight:400}
 footer #composerTools:hover,footer #composerTools[aria-expanded="true"]{color:var(--ink);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface))}
 footer #f #bBig{order:3;width:32px;min-width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid transparent;color:var(--dim);font-size:15px}
 footer #f #bBig:hover{color:var(--ink);border-color:var(--line);background:var(--surface-raised,rgba(255,255,255,.04))}
 footer #f #bEngine{order:4;max-width:min(40vw,320px);background:var(--surface-raised,var(--surface));color:var(--ink);font-weight:500;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid color-mix(in srgb,var(--net-color,var(--accent)) 28%,var(--line));padding:0 12px}
 footer #f #bEngine:hover{border-color:var(--net-color,var(--accent));background:color-mix(in srgb,var(--net-color,var(--accent)) 10%,var(--surface))}
 footer #f #bMic{order:5;width:36px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:var(--surface-raised,rgba(255,255,255,.04));border:1px solid var(--line);font-size:15px}
 footer #f .send{order:6;background:var(--accent);color:var(--on-accent);border:0;font-size:18px;font-weight:600;padding:0;width:36px;display:inline-flex;align-items:center;justify-content:center}
 footer #f .send:hover{filter:brightness(1.08)}
 footer #f #bStopTurn{order:7;background:transparent;color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:0;width:32px;min-width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center}
 footer #f #bStopTurn:hover{background:var(--surface-raised);color:var(--ink)}
 .stop-icon{display:block;width:10px;height:10px;border-radius:1px;background:currentColor}
 footer #f #bStopTurn[hidden]{display:none!important}
 footer #f button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
 #composerActions{position:absolute;bottom:calc(100% + 8px);left:8px;min-width:236px;padding:6px;background:var(--surface-raised,var(--surface));border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.42);z-index:20}
 #composerActions[hidden]{display:none!important}
 footer #composerActions .fb{display:flex;align-items:center;width:100%;height:40px;color:var(--ink);background:transparent;border:0;text-align:left;justify-content:flex-start;max-width:none;border-radius:9px;padding:0 12px}
 footer #composerActions .fb:hover{background:rgba(var(--accent-rgb),.12)}
 header .st{margin-left:0;justify-content:flex-end;flex-shrink:0}header #tLink{display:inline-block;max-width:180px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;white-space:nowrap}header #providerName{display:none}
 @media(max-width:720px){footer{padding:8px 12px 10px}footer #f{padding:6px 8px;gap:6px}footer #f #bEngine{font-size:12px;max-width:44vw;padding:0 9px}footer #composerActions{left:6px}}
 `;document.head.append(style);
 const tray=document.createElement('div');tray.id='queuedTray';tray.hidden=true;tray.setAttribute('aria-live','polite');
 const chatPanel=document.querySelector('.w[data-w="chat"]>.panel');
 if(chatPanel)chatPanel.append(tray);else form.before(tray);
 const toggle=document.createElement('button');toggle.type='button';toggle.id='composerTools';toggle.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';toggle.title='Прикрепить файл';toggle.setAttribute('aria-label',toggle.title);
 toggle.onclick=()=>{document.getElementById('fileIn')?.click()};
 for(const id of ['bFile','bReference','bHist']){const el=document.getElementById(id);if(el)el.hidden=true}
 const send=form.querySelector('.send');
 form.insertBefore(toggle,form.firstChild);
 if(send)form.insertBefore(engine,send);
 const stopBtn=document.createElement('button');stopBtn.type='button';stopBtn.id='bStopTurn';stopBtn.className='fb';stopBtn.hidden=true;stopBtn.innerHTML='<span class="stop-icon" aria-hidden="true"></span>';stopBtn.title='Остановить текущий ход';stopBtn.setAttribute('aria-label',stopBtn.title);
 stopBtn.onclick=async()=>{stopBtn.disabled=true;try{const r=await post('/engine/stop',{});if(r&&r.ok===false)throw new Error(r.error||'не удалось остановить')}catch(e){const h=document.getElementById('hint');if(h)h.textContent='Не получилось остановить: '+(e?.message||'ошибка')}finally{stopBtn.disabled=false}};
 form.append(stopBtn);
 const windowFocus=()=>document.documentElement.classList.toggle('window-unfocused',!document.hasFocus());
 window.addEventListener('focus',windowFocus);window.addEventListener('blur',windowFocus);windowFocus();
 if(send){send.textContent='↑';send.title='Отправить сообщение';send.setAttribute('aria-label',send.title)}
 tray.addEventListener('click',async event=>{
  const btn=event.target.closest('button[data-qact]');if(!btn)return;
  const act=btn.dataset.qact,messageId=btn.dataset.id,text=btn.dataset.text||'';
  btn.disabled=true;
  try{
   if(act==='expedite'){
    const r=await post('/messages/expedite',{messageId,interrupt:true});
    if(r&&r.ok===false)throw new Error(r.error||'не удалось отправить вне очереди');
   }
   else if(act==='delete'){
    const r=await post('/messages/cancel',{messageId});
    if(r&&r.ok===false)throw new Error(r.error||'не удалось удалить из очереди');
   }
   else if(act==='edit'){
    const r=await post('/messages/cancel',{messageId});
    if(r?.ok!==false){const q=document.getElementById('q');if(q){q.value=q.value?q.value+'\n'+text:text;q.dispatchEvent(new Event('input'));q.focus()}}
   }
  }catch(e){const h=document.getElementById('hint');if(h)h.textContent=e?.message||'Действие с очередью не выполнено'}finally{btn.disabled=false}
 });
 window.syncComposerQueue=(state)=>{
  const stop=document.getElementById('bStopTurn');if(stop)stop.hidden=!state?.busy;
  const items=Array.isArray(state?.queuedItems)?state.queuedItems:[];
  if(!items.length){tray.hidden=true;tray.innerHTML='';return}
  tray.hidden=false;
  tray.innerHTML=`<div class="qt-head"><b>В очереди</b><span class="qt-count">${items.length}</span><span>Отправится после завершения текущего ответа</span></div><div class="qt-list">`+
   items.map(item=>`<div class="qt-row"><div class="qt-text" title="${esc(item.text)}">${esc(item.text||'(вложение)')}</div><div class="qt-actions"><button type="button" class="qt-btn" data-qact="expedite" data-id="${esc(item.id||item.messageId||'')}" title="Отправить сейчас (в текущей задаче)">→</button><button type="button" class="qt-btn" data-qact="edit" data-id="${esc(item.id||item.messageId||'')}" data-text="${esc(item.text||'')}" title="Изменить сообщение">✎</button><button type="button" class="qt-btn" data-qact="delete" data-id="${esc(item.id||item.messageId||'')}" title="Удалить из очереди">🗑</button></div></div>`).join('')+'</div>';
 };
}
// Browser entry loaded before okno.js. Called once after the window's shared helpers exist.
function initializeChatComposer(){
let att=[],sendTail=Promise.resolve(),outgoing=0,locateTail=Promise.resolve();
function renderAtt(){$('#att').innerHTML=att.map((a,i)=>`<div class="at ${a.state}">${a.thumb?`<img src="${a.thumb}" alt="">`:`<div class="ic">${a.reference?'↗':esc((a.orig.split('.').pop()||'файл').slice(0,4))}</div>`}<span>${esc(a.orig)}<small class="sub">${a.state==='locating'?'\u041e\u043f\u0440\u0435\u0434\u0435\u043b\u044f\u044e \u043f\u0443\u0442\u044c\u2026':a.state==='up'?'загружаю…':a.state==='ref'?'Без загрузки — укажи расположение':a.state==='err'?esc(a.err):(a.reference?'На компьютере · ':'')+Math.max(1,Math.round(a.size/1024)).toLocaleString('ru-RU')+' КБ'}</small>${a.reference?`<small class="sub" title="${esc(a.reference.path)}">${esc(a.reference.path)}</small>`:''}</span>${a.state==='ref'?`<button type="button" data-ref="${i}">Указать файл</button>`:''}<button type="button" data-i="${i}" title="Убрать">×</button></div>`).join('');
 document.querySelectorAll('#att button[data-i]').forEach(b=>b.onclick=()=>{const a=att.splice(+b.dataset.i,1)[0];if(a?.thumb)URL.revokeObjectURL(a.thumb);renderAtt()});
 document.querySelectorAll('#att button[data-ref]').forEach(b=>b.onclick=()=>openReference(att[+b.dataset.ref]));}
let referenceTarget=null,referenceBusy=false,referenceEpoch=0;
function openReference(target=null){referenceEpoch++;referenceTarget=target;$('#refPath').value='';$('#refError').textContent='';$('#refInfo').textContent=target?`«${target.orig}» · ${razmerFaila(target.size)}. Выбери этот файл на компьютере или вставь полный путь к нему.`:'Файл останется на этом компьютере. Джинни получит его имя, размер и путь.';$('#refDialog').showModal();$('#refPath').focus()}
async function attachReference(pick){
 if(referenceBusy)return;referenceBusy=true;const target=referenceTarget,epoch=referenceEpoch;
 $('#refError').textContent=pick?'Открыла окно выбора файла Windows…':'Проверяю расположение…';
 try{
  const r=await post('/attachments/reference',pick?{pick:true}:{path:$('#refPath').value});
  if(!r.ok)throw new Error(r.error||'Не удалось прикрепить файл');if(r.cancelled){$('#refError').textContent='Выбор отменён. Можно вставить путь вручную.';return}
  if(!$('#refDialog').open||epoch!==referenceEpoch)return;
  if(target&&(r.reference.name!==target.orig||r.reference.size!==target.size))throw new Error('Это другой файл: имя или размер не совпадают с перетащенным. Выбери исходный файл.');
  if(target&&!att.includes(target))return;
  if(!target&&att.length>=20)throw new Error('Можно отправить до 20 вложений за раз');
  const a=target||{};Object.assign(a,{orig:r.reference.name,size:r.reference.size,state:'ok',reference:r.reference});if(!target)att.push(a);
  renderAtt();$('#refDialog').close();$('#hint').textContent='Прикрепила ссылку на файл. Отправь сообщение, чтобы передать её Джинни.';$('#q').focus();
 }catch(error){$('#refError').textContent=error.message||'Файл недоступен'}finally{referenceBusy=false}
}
$('#bReference').onclick=()=>openReference();
$('#refBrowse').onclick=()=>attachReference(true);
$('#refAdd').onclick=()=>attachReference(false);
$('#refClose').onclick=()=>$('#refDialog').close();
$('#refPath').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();attachReference(false)}};
const VLOZHENIE_MAX=50*1024*1024;
function razmerFaila(b){return b>=1024**3?(b/1024**3).toLocaleString('ru-RU',{maximumFractionDigits:1})+' ГБ':Math.round(b/1024**2).toLocaleString('ru-RU')+' МБ'}
async function attachDroppedFile(f,a){
 let reader
 try{
  const locate=async data=>{
   const url=new URL(location.href);url.port=String(Number(url.port)+1);url.pathname='/drop';url.search='';url.hash='';
   return(await fetch(url.href,{method:'POST',headers:{'content-type':'application/json','x-dzhinni':'1'},body:JSON.stringify(data),signal:AbortSignal.timeout(25000)})).json();
  };
  const start=await locate({drop:'begin',name:f.name,size:f.size});if(!start.ok)throw new Error(start.error||'Не удалось определить путь файла');
  reader=f.stream().getReader();await reader.read(); // Keep the source file handle open while the local bridge identifies it.
  const length=Math.min(65536,f.size),samples=new Uint8Array(length*3);let offset=0;
  for(const position of [0,Math.floor((f.size-length)/2),f.size-length]){samples.set(new Uint8Array(await f.slice(position,position+length).arrayBuffer()),offset);offset+=length}
  const digest=await crypto.subtle.digest('SHA-256',samples),sampleHash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  const found=await locate({drop:'finish',dropId:start.dropId,sampleHash});if(!found.ok)throw new Error(found.error||'Не удалось определить путь файла');
  const result=await post('/attachments/reference',{path:found.path});if(!result.ok)throw new Error(result.error||'Не удалось прикрепить файл');
  a.reference=result.reference;a.state='ok';
 }catch(error){a.state='err';a.err=/[а-яё]/i.test(error.message||'')?error.message:'Не удалось определить путь файла. Файл и текст сохранены.';}finally{if(reader)await reader.cancel().catch(()=>{});renderAtt()}
}
function addFiles(list){for(const f of list){
 if(att.length>=20){$('#hint').textContent='В одном сообщении до 20 вложений. Остальные файлы приложи следующим сообщением.';break}
 // Server rejects >50 MB anyway; refuse before the browser streams gigabytes into a request that will be dropped.
 if(f.size>VLOZHENIE_MAX){const a={orig:f.name,size:f.size,state:'locating'};att.push(a);a.p=locateTail=locateTail.then(()=>attachDroppedFile(f,a));$('#hint').textContent=`Прикрепляю «${f.name}» по пути на компьютере…`;continue}
 const orig=f.name&&f.name!=='image.png'?f.name:`скрин-${new Date().toLocaleTimeString('ru-RU').replace(/:/g,'-')}.${(f.type.split('/')[1]||'png').replace('jpeg','jpg')}`;
 const a={orig,size:f.size,state:'up',thumb:/^image\//.test(f.type)?URL.createObjectURL(f):''};
 a.p=fetch('/upload',{method:'POST',headers:{'x-dzhinni':'1','x-name':encodeURIComponent(orig),'content-type':'application/octet-stream'},body:f})
  .then(r=>r.json()).then(r=>{if(!r.ok)throw new Error(r.error||'не принято');a.name=r.name;a.state='ok'}).catch(e=>{a.state='err';a.err=e.message||'не загрузилось'}).finally(renderAtt);
 att.push(a)}renderAtt();$('#q').focus()}
$('#bFile').onclick=()=>$('#fileIn').click();
$('#fileIn').onchange=e=>{addFiles([...e.target.files]);e.target.value=''};
document.addEventListener('paste',e=>{const cd=e.clipboardData;if(!cd||!cd.files.length)return;if(cd.getData('text/plain').trim())return;e.preventDefault();addFiles([...cd.files])});
let dragN=0;
document.addEventListener('dragenter',e=>{if(![...e.dataTransfer.types].includes('Files'))return;dragN++;document.body.classList.add('drag')});
document.addEventListener('dragleave',()=>{if(--dragN<=0){dragN=0;document.body.classList.remove('drag')}});
document.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault()});
document.addEventListener('drop',e=>{dragN=0;document.body.classList.remove('drag');if(!e.dataTransfer.files.length)return;e.preventDefault();addFiles([...e.dataTransfer.files])});

$('#f').onsubmit=e=>{e.preventDefault();if(rec)rec.stop();if(zap){$('#hint').textContent='Сначала договори: нажми 🎙, текст встанет в поле.';return}const t=$('#q').value.trim();if(!t&&!att.length)return;
 if(att.length>20){$('#hint').textContent='Можно отправить до 20 вложений за раз. Убери лишние карточки — текст сохранён.';return}
 if(dnevView()&&att.length){$('#hint').textContent='Вложения отправляются в чат. Текст и файлы сохранены — переключись в чат.';return}
 if(att.some(a=>a.state==='ref')){$('#hint').textContent='Укажи расположение большого файла или убери его карточку. Текст сохранён.';return}
 if(dnevView()){if(!t)return;if(dnev.dumaet){$('#hint').textContent='Спутник ещё думает — твои слова в поле, отправь, когда ответит.';return}$('#q').value='';grow();$('#q').focus({preventScroll:true});$('#hint').textContent='';dnevPost({text:t},t);return}
 const sent=att;att=[];$('#q').value='';renderAtt();grow();bigMode(false);$('#q').focus({preventScroll:true});outgoing++;
 $('#hint').textContent='В очереди отправки: '+outgoing+'. Можно писать дальше.';
 // Snapshot before awaiting uploads/HTTP: later drafts and attachments belong to the next message.
 sendTail=sendTail.then(async()=>{
  let attempted=false;
  try{
   await Promise.all(sent.map(a=>a.p));
   if(sent.some(a=>a.state!=='ok'))throw new Error('Вложение не загрузилось — убери его или приложи заново');
   const files=sent.filter(a=>!a.reference).map(a=>a.name),references=sent.filter(a=>a.reference).map(a=>a.reference.id);sentAt=Date.now();faza();$('#say').textContent='';attempted=true;
   window.jinnyChatDeliveryStarted?.();
   const r=await post('/say',{text:t,files,...(references.length?{references}:{})});if(!r.ok){attempted=false;throw new Error(r.error||'сервер не принял сообщение')}
   sent.forEach(a=>a.thumb&&URL.revokeObjectURL(a.thumb));outgoing--;
   $('#hint').textContent=outgoing?'В очереди отправки: '+outgoing+'. Можно писать дальше.':'Принято. Новые сообщения передаются в текущий ход, если исполнитель это поддерживает; иначе — в очередь.';
  }catch(error){
   window.jinnyChatDeliveryFailed?.();
   const draft=$('#q').value;$('#q').value=t+(t&&draft?'\n\n':'')+draft;att=[...sent,...att];outgoing--;
   renderAtt();grow();$('#hint').textContent=(attempted?'Подтверждение не получено — проверь историю перед повтором. ':'Сообщение не отправлено. ')+(error.message||'сервер не отвечает')+'. Текст и вложения сохранены в поле.';sentAt=0;faza();
  }
 });return sendTail;
};
const focusOnOpen=()=>{
 const active=document.activeElement;
 if(active&&active!==document.body&&active!==document.documentElement)return;
 if(document.querySelector('dialog[open],.modal.open,.phone-dialog[open]'))return;
 $('#q').focus({preventScroll:true});
};
if(typeof arrangeComposer==='function')arrangeComposer();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',focusOnOpen,{once:true});else focusOnOpen();
}
