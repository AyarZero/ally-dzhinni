// Embedded workspace uses the same project/editor API as the existing full-screen view.
export function mountProductionEditor({unit,flush,toast,onContext=()=>{}}){
 const host=document.createElement('section');host.className='ws-editor';host.setAttribute('aria-label','Монтаж видео');
 const status=document.createElement('p');status.className='ws-editor-status';status.setAttribute('role','status');
 const retry=document.createElement('button');retry.textContent='Открыть монтаж';retry.type='button';
 const frame=document.createElement('iframe');frame.id='ws-montage-frame';frame.title='Монтаж видео: предпросмотр, материалы и дорожки';frame.allow='autoplay';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads allow-modals');frame.hidden=true;
 host.append(status,retry,frame);let started=false,opening=null,editorOrigin=null,openedUnit=null,ready=false;const readyWaiters=new Set();
 function waitReady(){if(ready)return Promise.resolve(true);return new Promise(resolve=>{const timer=setTimeout(()=>done(false),15000);function done(ok){clearTimeout(timer);readyWaiters.delete(done);resolve(ok)}readyWaiters.add(done);if(started)frame.contentWindow.postMessage({type:'ally-editor-context-request'},editorOrigin)})}
 function request(type,extra,replyType){
  if(!started)return Promise.resolve(false);
  return new Promise(resolve=>{const id=crypto.randomUUID(),timer=setTimeout(()=>finish(false),10000);
   function finish(value){clearTimeout(timer);window.removeEventListener('message',receive);resolve(value)}
   function receive(e){if(e.source!==frame.contentWindow||e.origin!==editorOrigin||e.data?.type!==replyType||e.data.id!==id)return;finish(e.data.ok===true)}
   window.addEventListener('message',receive);frame.contentWindow.postMessage({type,id,...extra},editorOrigin);
  });
 }
 const editor={host,frame,
  flush:async()=>!started?true:await waitReady()&&request('ally-flush-editor',{},'ally-editor-flushed'),
  help:async key=>await waitReady()&&request('ally-editor-help',{key},'ally-editor-help-result'),
  async open(){
   const requestedUnit=unit();if(started&&requestedUnit!==openedUnit){status.textContent='Проект изменился. Открой его через меню проектов.';return false}if(started)return waitReady();if(opening)return opening;
   opening=(async()=>{retry.disabled=true;status.textContent='Открываю монтаж…';
    try{if(!requestedUnit){status.textContent='Создай или открой проект, чтобы начать монтаж.';return false}
     if(!await flush()){status.textContent='Сначала разреши ошибку сохранения проекта.';return false}
     if(unit()!==requestedUnit)return false;
     const r=await fetch('/api/production/editor',{method:'POST',headers:{'x-dzhinni':'1','content-type':'application/json'},body:JSON.stringify({unit:requestedUnit})});
     const v=await r.json();if(!r.ok)throw Error(v.error||'Редактор недоступен');
     if(unit()!==requestedUnit)return false;
     const url=new URL(v.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('Неверный адрес локального редактора');
     openedUnit=requestedUnit;editorOrigin=url.origin;frame.name='ally-project:'+requestedUnit;frame.src=v.url+'#allyProject='+encodeURIComponent(requestedUnit);frame.hidden=false;retry.hidden=true;started=true;status.textContent='Загружаю рабочее пространство…';const ok=await waitReady();if(!ok){status.textContent='Редактор ещё загружается. Можно проверить готовность повторно.';retry.hidden=false;retry.textContent='Проверить готовность'}return ok;
    }catch(e){status.textContent=e.message;toast(e.message);retry.textContent='Повторить открытие';return false}
    finally{retry.disabled=false;opening=null}
   })();return opening;
  }
 };
 const previousFlush=window.flushProductionEditor;
 window.flushProductionEditor=async()=>{if(previousFlush&&!await previousFlush())return false;return editor.flush()};
 window.addEventListener('message',e=>{if(openedUnit===unit()&&e.source===frame.contentWindow&&e.origin===editorOrigin&&e.data?.type==='ally-editor-context'&&e.data.context&&typeof e.data.context==='object'){if(e.data.context.ready){ready=true;status.textContent='';retry.hidden=true;for(const done of [...readyWaiters])done(true);onContext(e.data.context)}}});
 frame.addEventListener('load',()=>{if(started)frame.contentWindow.postMessage({type:'ally-editor-context-request'},editorOrigin)});
 retry.onclick=()=>editor.open();return editor;
}
export function setupProductionEditor({unit,flush,toast}){
 const button=document.createElement('button');button.id='montage-open';button.textContent='Монтаж';button.title='Открыть видеоредактор текущего проекта';button.style.minHeight='44px';document.getElementById('unit-open').after(button);
 const dialog=document.createElement('dialog');dialog.id='montage-editor';dialog.style.cssText='width:calc(100vw - 24px);height:calc(100vh - 24px);max-width:none;max-height:none;padding:12px;background:#111;color:#eee';dialog.innerHTML='<div style="display:flex;align-items:center;gap:16px;height:44px"><strong id="montage-title">Монтаж</strong><span id="montage-status" role="status"></span><button id="montage-close" style="margin-left:auto;min-height:40px">Вернуться в производство</button></div><iframe id="montage-frame" title="Видеоредактор FableCut" style="border:0;width:100%;height:calc(100% - 52px);background:#111" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"></iframe>';
 document.body.append(dialog);let started=false,editorOrigin=null;const frame=dialog.querySelector('iframe');
 window.flushProductionEditor=()=>{if(!started)return Promise.resolve(true);return new Promise(resolve=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{window.removeEventListener('message',done);resolve(false)},10000);function done(e){if(e.origin!==editorOrigin||e.source!==frame.contentWindow||e.data?.type!=='ally-editor-flushed'||e.data.id!==id)return;clearTimeout(timer);window.removeEventListener('message',done);resolve(e.data.ok===true)}window.addEventListener('message',done);frame.contentWindow.postMessage({type:'ally-flush-editor',id},editorOrigin)})};
 const close=async()=>{if(await window.flushProductionEditor())dialog.close();else toast('Монтаж не сохранён. Проверь сообщение внутри редактора.')};dialog.querySelector('#montage-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();void close()});
 button.onclick=async()=>{if(!unit.id){toast('Сначала создай проект');return}button.disabled=true;try{if(!await flush()){toast('Сначала сохрани текущие изменения');return}dialog.showModal();dialog.querySelector('#montage-status').textContent='Открываю редактор…';if(!started){const r=await fetch('/api/production/editor',{method:'POST',headers:{'x-dzhinni':'1','content-type':'application/json'},body:JSON.stringify({unit:unit.id})}),v=await r.json();if(!r.ok)throw Error(v.error||'Редактор недоступен');dialog.querySelector('#montage-title').textContent='Монтаж · '+v.title;editorOrigin=new URL(v.url).origin;frame.name='ally-project:'+unit.id;frame.src=v.url+'#allyProject='+encodeURIComponent(unit.id);started=true}dialog.querySelector('#montage-status').textContent='';}catch(e){dialog.querySelector('#montage-status').textContent=e.message;toast(e.message)}finally{button.disabled=false}};
}
