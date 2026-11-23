// Incremental DOM patching preserves the fixed presence bar outside message history.
// Existing message nodes preserve text selection and loaded attachments across updates.
const CHAT_SPLIT_KEY='ally-chat-split-v1',CHAT_SPLIT_DEFAULT=264,CHAT_SPLIT_MIN=148,CHAT_SPLIT_RIGHT_MIN=280,CHAT_SPLIT_MAX_PX=520,CHAT_SPLIT_MAX_RATIO=.58;
function chatSplitClamp(panelWidth,desiredWidth,savedRatio){
 if(!(panelWidth>0))return CHAT_SPLIT_DEFAULT;
 const maxLeft=Math.max(CHAT_SPLIT_MIN,Math.min(Math.round(panelWidth*CHAT_SPLIT_MAX_RATIO),Math.round(panelWidth-CHAT_SPLIT_RIGHT_MIN),CHAT_SPLIT_MAX_PX));
 const target=desiredWidth!=null?desiredWidth:(savedRatio>0&&savedRatio<1?Math.round(panelWidth*savedRatio):CHAT_SPLIT_DEFAULT);
 return Math.round(Math.min(Math.max(target,CHAT_SPLIT_MIN),maxLeft));
}
function attachChatSplit(panel,bar,container){
 if(!panel||!bar||!container||typeof document==='undefined'||typeof panel.querySelector!=='function')return;
 let split=panel.querySelector('.chat-split');
 if(!split){
  split=document.createElement('div');
  split.className='chat-split';split.id='chatSplit';
  split.setAttribute('role','separator');split.setAttribute('aria-orientation','vertical');
  split.setAttribute('aria-label','Изменить соотношение левой и правой части переписки');
  split.tabIndex=0;split.title='Потяни, чтобы изменить размер · двойной клик — по умолчанию';
  panel.insertBefore(split,container);
 }else if(bar.nextElementSibling!==split||split.nextElementSibling!==container){
  panel.insertBefore(split,container);
 }
 if(split._bound)return;split._bound=true;
 const doc=panel.ownerDocument||document;
 let savedRatio=null;
 try{const raw=parseFloat(localStorage.getItem(CHAT_SPLIT_KEY));if(raw>.05&&raw<.85)savedRatio=raw}catch{}
 const innerWidth=()=>{
  const cw=panel.clientWidth||0;if(!cw)return 0;
  let pad=32;
  try{if(typeof getComputedStyle==='function'){const cs=getComputedStyle(panel);pad=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0)}}catch{}
  return Math.max(0,cw-pad-(split.offsetWidth||12));
 };
 const applyWidth=(px,persist=false)=>{
  const inner=innerWidth(),w=chatSplitClamp(inner,px,savedRatio);
  const maxW=chatSplitClamp(inner,1e6,savedRatio);
  panel.style?.setProperty?.('--chat-left',w+'px');
  split.setAttribute?.('aria-valuemin',String(CHAT_SPLIT_MIN));
  split.setAttribute?.('aria-valuemax',String(maxW));
  split.setAttribute?.('aria-valuenow',String(w));
  if(persist&&inner>0){savedRatio=+(w/inner).toFixed(4);try{localStorage.setItem(CHAT_SPLIT_KEY,String(savedRatio))}catch{}}
  return w;
 };
 let curW=applyWidth(null,false),targetW=curW,rafId=0,persistPending=false,orbShift=0,actShift=0;
 const reducedMotion=()=>typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const setParallax=(orbPx,actPx,scale)=>{
  orbShift=orbPx;actShift=actPx;
  panel.style?.setProperty?.('--orb-shift',orbPx.toFixed(2)+'px');
  panel.style?.setProperty?.('--act-shift',actPx.toFixed(2)+'px');
  panel.style?.setProperty?.('--orb-scale',String(Number(scale.toFixed(4))));
 };
 const cancelAnim=()=>{if(rafId&&typeof cancelAnimationFrame==='function'){cancelAnimationFrame(rafId);rafId=0}};
 const stepAnim=()=>{
  rafId=0;
  const delta=targetW-curW;
  curW+=delta*0.24;
  const wantOrb=Math.max(-14,Math.min(14,delta*0.14));
  const wantAct=Math.max(-9,Math.min(9,delta*0.08));
  orbShift+=(wantOrb-orbShift)*0.32;
  actShift+=(wantAct-actShift)*0.26;
  const orbScale=1+Math.min(0.025,Math.abs(delta)*0.0006);
  if(Math.abs(targetW-curW)<0.35&&Math.abs(orbShift)<0.2&&Math.abs(actShift)<0.2){
   curW=applyWidth(targetW,persistPending);
   persistPending=false;
   setParallax(0,0,1);
   return;
  }
  panel.style?.setProperty?.('--chat-left',curW.toFixed(1)+'px');
  split.setAttribute?.('aria-valuenow',String(Math.round(curW)));
  setParallax(orbShift,actShift,orbScale);
  rafId=requestAnimationFrame(stepAnim);
 };
 const animateTo=(desiredPx,{persistOnDone=false}={})=>{
  const clamped=chatSplitClamp(innerWidth(),desiredPx,savedRatio);
  targetW=clamped;
  if(persistOnDone)persistPending=true;
  if(reducedMotion()||typeof requestAnimationFrame!=='function'){
   cancelAnim();
   const shouldPersist=persistPending||persistOnDone;
   persistPending=false;
   curW=applyWidth(clamped,shouldPersist);
   setParallax(0,0,1);
   return curW;
  }
  if(!rafId)rafId=requestAnimationFrame(stepAnim);
  return clamped;
 };
 const resetSplit=()=>{savedRatio=null;try{localStorage.removeItem(CHAT_SPLIT_KEY)}catch{};animateTo(null,{persistOnDone:false})};
 if(typeof window!=='undefined')window.resetChatSplit=resetSplit;
 split.addEventListener?.('dblclick',resetSplit);
 split.addEventListener?.('keydown',e=>{
  const step=e.shiftKey?40:16,cur=bar.getBoundingClientRect?.().width||curW||parseFloat(panel.style?.getPropertyValue?.('--chat-left'))||CHAT_SPLIT_DEFAULT;
  if(e.key==='ArrowLeft'){e.preventDefault();animateTo(cur-step,{persistOnDone:true})}
  else if(e.key==='ArrowRight'){e.preventDefault();animateTo(cur+step,{persistOnDone:true})}
  else if(e.key==='Home'){e.preventDefault();animateTo(CHAT_SPLIT_MIN,{persistOnDone:true})}
  else if(e.key==='End'){e.preventDefault();animateTo(CHAT_SPLIT_MAX_PX,{persistOnDone:true})}
  else if(e.key==='Enter'||e.key==='0'){e.preventDefault();resetSplit()}
 });
 split.addEventListener?.('pointerdown',e=>{
  if(e.button!==0||doc.body?.classList?.contains('edit'))return;
  e.preventDefault();
  const startX=e.clientX,startW=bar.getBoundingClientRect?.().width||curW||parseFloat(panel.style?.getPropertyValue?.('--chat-left'))||CHAT_SPLIT_DEFAULT;
  curW=startW;
  let lastTarget=startW;
  split.classList?.add('dragging');doc.body?.classList?.add('chat-splitting');
  split.setPointerCapture?.(e.pointerId);
  const mv=ev=>{lastTarget=animateTo(startW+(ev.clientX-startX),{persistOnDone:false})};
  const up=()=>{
   split.classList?.remove('dragging');doc.body?.classList?.remove('chat-splitting');
   split.removeEventListener?.('pointermove',mv);split.removeEventListener?.('pointerup',up);split.removeEventListener?.('pointercancel',up);
   animateTo(lastTarget,{persistOnDone:true});
  };
  split.addEventListener?.('pointermove',mv);split.addEventListener?.('pointerup',up);split.addEventListener?.('pointercancel',up);
 });
 if(typeof ResizeObserver!=='undefined'){new ResizeObserver(()=>{cancelAnim();persistPending=false;curW=applyWidth(null,false);targetW=curW;setParallax(0,0,1)}).observe(panel)}
}
function placeCoreFloat(container) {
 if (!container || container.id !== 'clog' || typeof document === 'undefined') return;
 const core = document.getElementById('coreFloat');
 if (!core) return;
 const panel = container.closest?.('.chatw');
 if (!panel) return;
 let bar = panel.querySelector('.chat-presence');
 if (!bar) {
  bar = document.createElement('div');bar.className = 'chat-presence';
  panel.insertBefore(bar, container);
 }
 if (core.parentElement !== bar) bar.prepend(core);
 const activity = panel.querySelector('.chat-activity');
 if (activity && activity.parentElement !== bar) bar.append(activity);
 attachChatSplit(panel, bar, container);
}
function patchChatRows(container, rows) {
 const core = container.id === 'clog' && typeof document !== 'undefined' ? document.getElementById('coreFloat') : null;
 placeCoreFloat(container);
 // Remove initial placeholder markup on first render while preserving #coreFloat.
 if(!container._chatRows)for(const child of[...container.children])if(child.id!=='coreFloat')child.remove();
 const previous=container._chatRows||new Map(), next=new Map();let changed=false;
 for(let i=0;i<rows.length;i++) {
  const row=rows[i];let cached=previous.get(row.key);
  if(!cached||cached.signature!==row.signature) {
   const template=container.ownerDocument.createElement('template');template.innerHTML=row.html();
   const node=template.content.firstElementChild;
   if(cached)cached.node.replaceWith(node);
   cached={signature:row.signature,node};changed=true;
  }
  const at=[...container.children].filter(el=>el.id!=='coreFloat')[i];
  if(at!==cached.node){container.insertBefore(cached.node,at||null);changed=true}
  next.set(row.key,cached);
 }
 for(const[key,cached]of previous)if(!next.has(key)){cached.node.remove();changed=true}
 container._chatRows=next;
 placeCoreFloat(container);
 return changed;
}
function chatLocalFiles(text){
 const files=[];const body=String(text).replace(/^Файл на компьютере \(без загрузки\): (.+) · (\d+) байт\r?\n`?([^`\r\n]+)`?(?=\r?\n|$)/gm,(_,name,bytes,path)=>{files.push({name,path,bytes:Number(bytes)});return''});
 return{body:body.trim(),files};
}
function chatLocalFileTiles(files){return files.map(f=>`<div class="file-tile local-file" title="${esc(f.path)}" role="group" aria-label="${esc(f.name)}, файл на компьютере"><span class="file-type">${esc((f.name.split('.').pop()||'ФАЙЛ').toUpperCase())}</span><span class="file-title">${esc(f.name)}</span><small>${Math.round(f.bytes/1048576)} МБ · На компьютере</small></div>`).join('')}
function chatHtml(t){return String(t).split(/```[a-z]*\n?([\s\S]*?)```/).map((ch,i)=>i%2?kodBlok(ch.replace(/\n$/,'')):
 ch.split('\n').map(s=>{
  if(/^\s*! \S/.test(s))return '\u0000'+kodBlok(s.trim())+'\u0000'
  if(/^\s*📎\s*\S/.test(s))return '\u0000'+fajlKartochka(s.replace(/^\s*📎\s*/,'').trim())+'\u0000'
  const zhir=[],raw=s.replace(/\*\*([^*\n]+)\*\*/g,(_,x)=>{zhir.push(x);return '\u0002'+(zhir.length-1)+'\u0002'})
  return sPutyami(raw).replace(/\u0002(\d+)\u0002/g,(_,n)=>'<b>'+esc(zhir[+n])+'</b>')
 }).join('\n')).join('\u0000').replace(/\n?\u0000\n?/g,'')}
let chatNeedsPaint=false;
if(typeof addEventListener==='function'){
 const resume=()=>{if(chatNeedsPaint)renderChat()};
 addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
}
function renderChat(){
 // Defer DOM updates only when the document is hidden; render immediately when visible even if unfocused.
 if(typeof document!=='undefined'&&document.hidden){chatNeedsPaint=true;return}
 chatNeedsPaint=false;
 window.syncComposerQueue?.(providerState);
 const seen=new Map(),rows=chat.map(m=>{
  const id=m.messageId||`${m.at}:${m.who}`,n=seen.get(id)||0;seen.set(id,n+1);
  const local=m.who==='ty'?chatLocalFiles(m.text):{body:m.text,files:[]};
  return {key:`message:${id}:${n}`,signature:JSON.stringify(m),html:()=>`<div class="m ${m.who==='ty'?'ty':'ya'}"><small>${esc(otKogo(m))} · ${hm(m.at)}</small>${chatHtml(local.body)}${chatLocalFileTiles(local.files)}${mFiles(m.files)}</div>`}
 });
 if(!rows.length)rows.push({key:'empty',signature:'empty',html:()=>'<div class="empty">Пока пусто.</div>'});
 const dr=providerState?.busy&&providerState?.task?.draft?.text;
 if(dr)rows.push({key:'draft',signature:`${providerState.executor}:${dr}`,html:()=>`<div class="m ya draft"><small>${esc(providerState.executor||'Джинни')} · пишет…</small>${chatHtml(dr)}<span class="kursor">▍</span></div>`});
 const svoe=chat.at(-1)?.who==='ty';
 for(const lg of[$('#log'),$('#clog')]){
  const bylo=+lg.dataset.len||0,pervyy=!lg.dataset.pokazan,niz=vnizu(lg);
  if(!patchChatRows(lg,rows)){placeCoreFloat(lg);continue}lg.dataset.len=chat.length;
  if(pervyy||niz||(svoe&&chat.length>bylo)){if(lg.clientHeight)lg.dataset.pokazan=1;lg.scrollTop=lg.scrollHeight;
   for(const im of lg.querySelectorAll('img'))if(!im.complete&&!im._chatScrollBound){im._chatScrollBound=true;im.addEventListener('load',()=>{if(vnizu(lg))lg.scrollTop=lg.scrollHeight},{once:true})}}
  strelka(lg,!niz&&!pervyy&&chat.length>bylo&&!svoe?chat.length-bylo:0)
 }
 $('#bHist').innerHTML='История'+(unread?`<b>${unread}</b>`:'')
}
