/* ресурс: контекст и лимиты — от мода «Лимиты»; темп как в моде: 5 ч по часам, неделя по рабочим 10–22 местного времени компьютера */
// файл грузится РАНЬШЕ, чем okno.html объявляет `$`. Всё состояние — здесь, наверху, а к DOM обращаться
// только по DOMContentLoaded: иначе ReferenceError при загрузке оставлял `directResource` неинициализированным и виджет
// «Ресурс» навсегда стоял пустым («Цифры придут…»). Страж — test_context_ui.mjs, тест «$ объявлен позже».
let zamer=null;const H=3600e3,D=24*H;
let compactInFlight=false,compactUncertain=false,compactNoticeText='';
let directResource=null,directResourceLoading=false,directResourceFailed=false;
let resourceTab='main',helperResource=null,helperResourceLoading=false,helperResourceFailed=false;
let aggregatorResource=null,resourceSnapshot=[];
const POYAS=-new Date().getTimezoneOffset()*6e4;const rab=t=>{const m=t+POYAS,d=Math.floor(m/D);return d*12*H+Math.min(Math.max(m-d*D-10*H,0),12*H)};
const tempPyat=(s,n)=>Math.floor((5*H-Math.min(Math.max(s-n,0),5*H))*100/(5*H));
const tempNed=(s,n)=>Math.floor(Math.min(Math.max(rab(n)-rab(s-7*D),0),7*12*H)*100/(7*12*H));
const doSbrosa=(s,n)=>{const ms=s-n;if(ms<=0)return'';const d=Math.floor(ms/D),h=Math.floor(ms%D/H),m=Math.floor(ms%H/6e4);return d?`${d} д ${h} ч`:`${h}:${String(m).padStart(2,'0')}`};
// после сброса мост выбрасывает окно «5 часов» с прошедшим сроком (claude-quota.mjs) — строка пропадала.
// Есть неделя, а пяти часов нет → показываем строку «обновился», а не пустоту.
const SBROSHEN='Лимит обновился — новая цифра придёт с первым ходом';
const s5h=ws=>{const a=[...(ws||[])];if(a.some(w=>w.id==='secondary')&&!a.some(w=>w.id==='primary'))a.unshift({id:'primary',usedPercent:null,sbroshen:true});return a};
const tys=n=>n>=1e6?(n/1e6).toFixed(n%1e6?1:0)+'M':Math.round(n/1e3)+'k';
// Резерв только для показа: действующий порог передаёт мост из ~/.claude/settings.json.
// CLAUDE.md: 350k; context_size.py пока содержит устаревшие 500k. Это не размер окна модели.
const CLAUDE_COMPACT_TOKENS=350000,AGY_COMPACT_TOKENS=350000;
function resourceContext(executor,context,state={}){
 if(executor==='claude'){
  const configured=state.claudeAutoCompactTokens,threshold=Number.isSafeInteger(configured)&&configured>0?configured:CLAUDE_COMPACT_TOKENS;
  const used=context?.usedTokens;
  return {...context,windowTokens:threshold,percent:Number.isFinite(used)&&used>=0?used/threshold*100:null,untilCompact:true};
 }
 if(executor==='antigravity'&&context){
  const configured=state.antigravityContextLimit,limit=Number.isSafeInteger(configured)&&configured>0?configured:AGY_COMPACT_TOKENS;
  const threshold=context.windowTokens>0?Math.min(context.windowTokens,limit):limit;
  const used=context.usedTokens;
  return {...context,windowTokens:threshold,percent:Number.isFinite(used)&&used>=0?used/threshold*100:null,untilCompact:true};
 }
 return context;
}
function resourceMeter(row){
 const valid=Number.isFinite(row.percent),percent=valid?Math.max(0,Math.min(100,row.percent)):null;
 const tone=row.c||(percent>=95?'var(--resource-warn)':'var(--resource-tone,var(--resource-helper))');
 return `<div class="meter" aria-label="${esc(row.accessibleLabel||row.label)}" style="--pc:${tone}"><div class="top"><span>${esc(row.label)}</span><b>${valid?Math.round(row.percent)+'%':'—'}</b></div>${valid?`<div class="prog"><i style="width:${percent}%"></i>${Number.isFinite(row.tick)?`<u style="left:${Math.max(0,Math.min(100,row.tick))}%"></u>`:''}</div>`:''}<div class="sub">${esc(row.sub||'')}</div></div>`;
}
function resourceGroups(rows,state){
 resourceSnapshot=rows;
 const mode=state.provider==='direct'?state.selection?.mode||'auto':state.provider;
 const names={claude:'Claude',codex:'Codex',deepseek:'DeepSeek',antigravity:'Antigravity'};
 const lead=names[state.executor]?state.executor:mode!=='auto'&&names[mode]?mode:'claude';
 const all=[...new Set([lead,'claude','codex','antigravity'])];
 const helpers=all.filter(id=>id!==lead);
 const card=(engine,isLead)=>{
  const name=names[engine],role=isLead?'ведущая':'помощник';
  const tone=isLead?'var(--resource-'+engine+',var(--resource-claude))':'var(--resource-helper)';
  let selected=rows.filter(row=>(row.engine||lead)===engine);
  if(!isLead){
   selected=selected.filter(row=>!row.label.includes('Контекст')&&!row.label.includes('Подписка'));
   const observation=(state.availability||[]).find(row=>row.executor===engine)?.observation;
   if(engine==='antigravity'){
    const buckets=new Map((observation?.quota?.groups||[]).flatMap(g=>g.buckets||[]).map(b=>[b.id,b]));
    selected=[['gemini-5h','5 ч'],['gemini-weekly','7 дней'],['gemini-argon-wtu-weekly','Аргон']].map(([id,label])=>{
     const b=buckets.get(id),fallback=(observation?.quota?.windows||[]).find(w=>w.id===(id==='gemini-5h'?'primary':id==='gemini-weekly'?'secondary':id));
     const value=b||fallback;
     return {label,percent:value?.usedPercent,sub:value?.resetAt>Date.now()?'Сброс через '+doSbrosa(value.resetAt,Date.now()):'Нет свежего замера'};
    });
   }else if(!selected.length){
    selected=(observation?.quota?.windows||[]).map(w=>({label:w.id==='primary'?'5 ч':w.id==='secondary'?'7 дней':w.id,percent:w.usedPercent,sub:w.resetAt>Date.now()?'Сброс через '+doSbrosa(w.resetAt,Date.now()):'Нет свежего замера'}));
   }
  }
  const meters=selected.map(row=>resourceMeter({...row,label:row.label.replace(name+' · ','').replace(' · '+name,'').replace('5 часов','5 ч').replace('Неделя','7 дней'),accessibleLabel:row.label,c:row.c||(row.percent>=100?'var(--resource-danger)':row.percent>=95?'var(--resource-warn)':tone)})).join('');
  return `<section class="resource-group ${isLead?'resource-lead':'resource-helper-card'}" style="--resource-tone:${tone}" aria-label="${name} · ${role}"><div class="resource-heading"><span>${name}</span><small>${role}</small></div>${meters||'<div class="empty">Нет свежего замера</div>'}</section>`;
 };
 if(resourceTab==='main')return card(lead,true);
 const tokenator=`<section class="resource-group" aria-label="Агрегатор"><div class="resource-heading"><span>Агрегатор</span><small>${aggregatorResource?.configured?'ключ настроен':'резерв'}</small></div><div class="sub">${aggregatorResource?.configured?'Баланс и лимиты источник не сообщает.':'Нет подтверждённых данных о лимитах.'}</div></section>`;
 return '<div class="resource-helper-list">'+helpers.map(id=>card(id,false)).join('')+helperBalanceHTML(helperResource,{loading:helperResourceLoading,failed:helperResourceFailed})+tokenator+'</div>';
}
function renderZamer(){syncCompactControl();if(providerState.provider==='direct'){renderDirectResource();return}if(providerState.provider==='codex'){renderCodexResource();return}if(!zamer){if(resourceTab==='helpers')renderHelperResource();return}const now=Date.now(),z=zamer,rows=[];
 const context=resourceContext('claude',{usedTokens:z.tokeny},providerState);
 if(Number.isFinite(context.percent))rows.push({label:'Контекст · Claude',percent:context.percent,c:context.percent>=100?'var(--resource-danger)':context.percent>=85?'var(--resource-warn)':'var(--resource-claude)',sub:`${tys(z.tokeny)} из ${tys(context.windowTokens)} до сжатия`});
 for(const[label,o,f]of[['5 часов',z.pyat,tempPyat],['Неделя',z.nedelya,tempNed]]){if(!o)continue;
  const tick=o.sbros==null?null:f(o.sbros,now),r=tick==null?null:Math.round(o.procent-tick);
  rows.push({engine:'claude',label:'Claude · '+label,percent:o.procent,tick,c:r>0?'var(--resource-danger)':undefined,sub:tick==null?'':`темп ${tick}% (${r>0?'+'+r:r}) · сброс через ${doSbrosa(o.sbros,now)}`})}
 $('#zamer').innerHTML=resourceGroups(rows,providerState);
 $('#zAt').textContent='замер '+new Date(z.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});faza()}
setInterval(()=>{if(document.hidden||document.hasFocus?.()===false)return;try{renderZamer()}catch(error){console.error('Ресурс:',error)}},30000);
function syncCompactControl(){
 const button=$('#compactContext'),notice=$('#compactNotice');
 if(!button||!notice)return;
 const direct=typeof providerState!=='undefined'&&providerState.provider==='direct';
 const phase=providerState.contextCompaction?.state;
 const scheduled=direct&&['scheduled','running','completed'].includes(phase);
 if(scheduled)compactUncertain=false;
 if(phase==='unknown')compactUncertain=true;
 button.hidden=resourceTab==='helpers'||!direct||!(providerState.canCompactContext??(providerState.busy&&providerState.threadId));
 button.disabled=scheduled||compactInFlight;
 button.textContent=scheduled?(phase==='completed'?'Контекст сжат':phase==='running'?'Сжимаю контекст…':'Сжатие запланировано'):compactInFlight?'Проверяю…':compactUncertain?'Проверить состояние':'Сжать контекст';
 const message=scheduled?'':phase==='unknown'?'Исход сжатия требует сверки. Автоматического повтора нет.':compactNoticeText;
 notice.hidden=!message;notice.textContent=message;
}
document.addEventListener('DOMContentLoaded',()=>$('#compactContext')?.addEventListener('click',async()=>{
 if(compactInFlight||providerState.provider!=='direct'||providerState.contextCompaction?.state==='scheduled')return;
 compactInFlight=true;compactNoticeText='';syncCompactControl();
 try{
  const checking=compactUncertain, payload={executor:providerState.executor,target:providerState.compactTarget,...(checking?{contextAction:'compact-status'}:{})};
  const response=await fetch(checking?'/engine/settings':'/engine/compact',{method:'POST',headers:{'x-dzhinni':'1','content-type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();
  if(!response.ok)compactUncertain=checking||response.status>=500||response.status===408||response.status===429;
  if(!response.ok||!result.provider)throw new Error(result.error||'Не удалось запланировать сжатие');
  renderProvider(result.provider);
 }catch(error){if(error instanceof TypeError)compactUncertain=true;compactNoticeText=error.message}
 finally{compactInFlight=false;syncCompactControl()}
}));
async function refreshDirectResource(){
 if(typeof providerState==='undefined'||providerState.provider!=='direct'||directResourceLoading||document.hidden||document.hasFocus?.()===false)return;
 directResourceLoading=true;
 try{const response=await fetch('/api/performance?days=0');if(!response.ok)throw new Error('resource unavailable');const data=await response.json();directResource=data.resource;directResourceFailed=false;renderZamer()}
 catch{directResourceFailed=true;renderZamer()}finally{directResourceLoading=false}
}
document.addEventListener('DOMContentLoaded',()=>{setTimeout(refreshDirectResource,500);setInterval(refreshDirectResource,15000)});
function renderDirectResource(){
 const p=providerState,executor=p.executor,entry=(p.availability||[]).find(row=>row.executor===executor),observation=entry?.observation||{},quota=observation.quota||{},rows=[];
 const measured=directResource?.executor===executor&&directResource?.threadId===p.threadId?directResource:null;
 const reported=p.context&&p.context.source!=='unknown'?p.context:null;
 const context=resourceContext(executor,reported||measured?.contexts?.[0],p),policy=p.contextPolicy||{},stamp=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 if(context&&Number.isFinite(context.percent)){
  const source=context.source==='measured'?'замер '+({claude:'Claude',codex:'Codex'}[executor]||executor):context.source==='reported'?'из итога хода':'';
  const parts=[];
  if(context.usedTokens!=null&&context.windowTokens)parts.push(`${tys(context.usedTokens)} из ${tys(context.windowTokens)}${context.untilCompact?' до сжатия':''}`);
  else if(context.windowTokens)parts.push(`окно ${tys(context.windowTokens)}${context.windowSource==='config'?' (настройка)':context.windowSource==='model'?' (модель)':''}`);
  else parts.push('окно не задано');
  if(source)parts.push(source);
  // цифра с прошлого хода (02:42) стояла утром как текущая — старый замер подписываем словами
  if(context.at)parts.push((Date.now()-context.at>H?'старый, ':'')+stamp(context.at).slice(0,5));
  const tone=context.untilCompact?(context.percent>=100?'var(--resource-danger)':context.percent>=85?'var(--resource-warn)':'var(--resource-claude)'):Number.isFinite(policy.compactAt)&&context.percent>=policy.compactAt?'var(--resource-danger)':Number.isFinite(policy.warnAt)&&context.percent>=policy.warnAt?'var(--resource-warn)':'var(--resource-'+executor+',var(--resource-codex))';
  // «каждая нейросеть — в своей плашке»: контекст живёт в плашке своей нейросети, не над ними
  rows.push({engine:executor,label:'Контекст · '+({claude:'Claude',codex:'Codex',antigravity:'Antigravity',deepseek:'DeepSeek'}[executor]||executor),percent:context.percent,sub:parts.join(' · '),c:tone});
 }
 else if(executor==='claude')rows.push({engine:'claude',label:'Контекст',percent:null,sub:p.context?.usedTokens?`Занято ${tys(p.context.usedTokens)} · размер окна мост узнает в конце хода`:'Контекст появится после первого ответа Claude.'});
 else if(executor==='antigravity'){
  const agyModel=p.antigravityContext?.model||p.executorSettings?.antigravity?.model||'gemini-4-argon-medium';
  const agyWin=p.antigravityContext?.windowTokens||(agyModel==='gpt-oss-120b-medium'?128000:1000000);
  rows.push({engine:'antigravity',label:'Контекст · Antigravity',percent:null,sub:`Окно ${tys(agyWin)} · ${agyModel} · замер токенов появится после первого ответа`});
 }
 else rows.push({engine:executor,label:'Контекст',percent:null,sub:measured?.contextError||(directResourceFailed?'Замер временно недоступен. Повторяю проверку…':'Получаю замер текущей беседы…')});
 if(executor==='antigravity'||(p.availability||[]).some(row=>row.executor==='antigravity'&&row.observation?.service==='available')){
  const agyEntry=(p.availability||[]).find(row=>row.executor==='antigravity'),agyObs=agyEntry?.observation||{};
  const agyCtx=p.antigravityContext||{},agyModel=agyCtx.model||p.executorSettings?.antigravity?.model||'gemini-4-argon-medium';
  const agyWin=agyCtx.windowTokens||(agyModel==='gpt-oss-120b-medium'?128000:1000000),agyTurns=agyCtx.turns?` · ходов: ${agyCtx.turns}`:'';
  const cooldown=(agyEntry?.blocks||[]).find(b=>b.kind==='cooldown'&&b.until>Date.now());
  if(executor!=='antigravity'&&Number.isFinite(agyCtx.percent)){
   rows.push({engine:'antigravity',label:'Antigravity · Контекст',percent:agyCtx.percent,sub:`${tys(agyCtx.usedTokens)} из ${tys(agyWin)} · ${agyModel}${agyTurns}`});
  }
  const agyBuckets=new Map();
  for(const g of (agyObs.quota?.groups||[]))for(const b of (g.buckets||[]))if(b.id)agyBuckets.set(b.id,b);
  const bucketSpecs=[
   ['gemini-5h','Gemini Models · 5 часов'],
   ['gemini-weekly','Gemini Models · Неделя'],
   ['gemini-argon-wtu-weekly','Gemini 4 Argon · Неделя']
  ];
  let pushedBuckets=0;
  for(const [bid,blabel] of bucketSpecs){
   const b=agyBuckets.get(bid);if(!b||!Number.isFinite(b.usedPercent))continue;
   pushedBuckets++;
   const rem=Math.max(0,100-b.usedPercent).toFixed(0);
   rows.push({engine:'antigravity',label:`Antigravity · ${blabel}`,percent:b.usedPercent,sub:b.resetAt>Date.now()?`Осталось ${rem}% · сброс через ${doSbrosa(b.resetAt,Date.now())}`:`Осталось ${rem}%`});
  }
  if(!pushedBuckets){
   for(const w of (agyObs.quota?.windows||[])){
    if(!Number.isFinite(w.usedPercent))continue;
    const label=w.id==='primary'?'5 часов':w.id==='secondary'?'Неделя':w.id;
    rows.push({engine:'antigravity',label:`Antigravity · ${label}`,percent:w.usedPercent,sub:w.resetAt>Date.now()?`Осталось ${Math.max(0,100-w.usedPercent).toFixed(0)}% · сброс через ${doSbrosa(w.resetAt,Date.now())}`:'Сброс: нет свежих данных'});
   }
  }
  if(cooldown)rows.push({engine:'antigravity',label:'Остывание',percent:null,sub:`Сброс через ${doSbrosa(cooldown.until,Date.now())}`});
 }
 if(executor==='codex'||executor==='claude'){
  const limits=executor==='codex'&&measured?.limits?.length&&measured.limitsAt>=(observation.observedAt||0)?measured.limits:s5h(quota.windows).map(w=>({label:w.id==='primary'?'5 часов':w.id==='secondary'?'Неделя':w.id,percent:w.usedPercent,resetsAt:w.resetAt}));
  for(const limit of limits){const percent=limit.percent;rows.push({engine:executor,label:(executor==='codex'?'Codex':'Claude')+' · '+limit.label,percent,sub:!Number.isFinite(percent)?SBROSHEN:limit.resetsAt>Date.now()?`Осталось ${Math.max(0,100-percent).toFixed(0)}% · сброс через ${doSbrosa(limit.resetsAt,Date.now())}`:'Сброс: нет свежих данных'})}
  if(!limits.length)rows.push({engine:executor,label:'Лимиты '+(executor==='claude'?'Claude':'Codex'),percent:null,sub:executor==='claude'?'Нет свежего замера: Claude сообщает лимиты в начале каждого хода.':'Нет подтверждённого замера.'});
 }
 // лимиты остальных подключённых нейросетей видны в том же виджете, не только текущей.
 for(const other of (p.availability||[]).filter(row=>row.executor!==executor&&(row.executor==='codex'||row.executor==='claude'))){
  const name=other.executor==='codex'?'Codex':'Claude';
  for(const w of s5h(other.observation?.quota?.windows)){if(!Number.isFinite(w.usedPercent)&&!w.sbroshen)continue;const label=w.id==='primary'?'5 часов':w.id==='secondary'?'Неделя':w.id;rows.push({engine:other.executor,label:`${name} · ${label}`,percent:w.usedPercent,sub:w.sbroshen?SBROSHEN:w.resetAt>Date.now()?`Осталось ${Math.max(0,100-w.usedPercent).toFixed(0)}% · сброс через ${doSbrosa(w.resetAt,Date.now())}`:'Сброс: нет свежих данных'})}
 }
 const at=Math.max(observation.observedAt||0,measured?.limitsAt||0,context?.at||0),stale=at&&Date.now()-at>120000;
 setHTML($('#zamer'),resourceGroups(rows,p)+(stale?'<div class="empty">Замер устарел, обновляю…</div>':''));
 fitResourceWidget();
 $('#zAt').textContent=at?stamp(at):'';
}
// Codex supplies its own quota windows and context capacity, independently of Claude.
function renderCodexResource(){
 const resource=providerState.resource||{},now=Date.now(),rows=[];
 const panel=$('#zamer').closest('.panel');
 const stamp=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 for(const context of resource.contexts||[]){
  const label='Контекст';
  rows.push({l:label,p:context.percent,c:context.percent<70?'var(--resource-codex)':context.percent<90?'var(--resource-warn)':'var(--resource-danger)',
   sub:`${tys(context.usedTokens)} из ${tys(context.windowTokens)} · ${context.model||'Codex'} · замер ${stamp(context.at)}`});
 }
 for(const limit of resource.limits||[]){
  const reset=limit.resetsAt==null?'':limit.resetsAt<=now?' · ожидаю обновления после сброса':` · сброс через ${doSbrosa(limit.resetsAt,now)}`;
  rows.push({l:limit.label,p:limit.percent,c:limit.percent<80?'#4da3ff':limit.percent<95?'#ffb547':'#ff5a7a',sub:`использовано ${Math.round(limit.percent)}%${reset}`});
 }
 let html=resourceGroups(rows.map(row=>({label:row.l,percent:row.p,sub:row.sub,engine:row.l==='Контекст'?undefined:'codex',c:row.l==='Контекст'?row.c:undefined})),providerState);
 if(!resource.contexts?.length)html+='<div class="empty">Контекст появится после первого ответа Codex.</div>';
 if(resource.error||resource.contextError)html+=`<div class="empty">${esc([resource.error,resource.contextError].filter(Boolean).join('. '))}</div>`;
 if(resource.limitsAt&&now-resource.limitsAt>120000)html+='<div class="empty">Лимиты давно не обновлялись.</div>';
 if(!providerState.authenticated)html='<div class="empty">Войди в Codex, чтобы увидеть лимиты и контекст.</div>';
 setHTML($('#zamer'),html||'<div class="empty">Получаю данные Codex…</div>');
 // Saved layouts may still give this tile the old, shorter height.
 fitResourceWidget();
 $('#zAt').textContent=resource.limitsAt?'Codex · лимиты '+stamp(resource.limitsAt):'Codex · жду данные';
}

// Оба окна (okno.html и okno-engine.html) подключают resurs.js. Общий декор здесь,
// чтобы прямой режим тоже получил стили без правки второго HTML вне области поручения.
function initDesktopPresentation(){
 if(!document.head)return;
 const style=document.createElement('style');style.id='desktop-presentation';
 style.textContent=`
 :root{--resource-claude:#d99a78;--resource-codex:#79ace3;--resource-antigravity:#8aa8ff;--resource-deepseek:#5bc2b4;--resource-helper:#a8afb8;--hardware:#8ca69c;--resource-warn:#dfb478;--resource-danger:#df8491}
 :root[data-theme=light]{--resource-claude:#9b4f2e;--resource-codex:#2867a3;--resource-antigravity:#3558b8;--resource-deepseek:#21786c;--resource-helper:#5f6771;--hardware:#526f62;--resource-warn:#895608;--resource-danger:#a73e50}
 header{gap:16px;padding:10px 20px;min-height:56px;flex-wrap:nowrap;background:var(--header,var(--bg));font-family:system-ui,sans-serif}
 header .brand{flex:none}header .brand b{font:600 17px/1.3 system-ui,sans-serif;letter-spacing:.01em;text-shadow:none}
 header .tabs{gap:4px;margin:0;flex:none;white-space:nowrap}
 header .st{gap:12px;min-width:0;font-size:12px;letter-spacing:0;text-transform:none}
 header .link-status{display:flex;align-items:center;white-space:nowrap;min-width:0;color:var(--ink)}
 header #tLink{overflow:hidden;text-overflow:ellipsis;max-width:240px}header #clock{flex:none;font-size:12px;font-variant-numeric:tabular-nums}
 header .hb,header .tab,header .theme-control select{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:6px 10px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dim);font:500 13px/18px system-ui,sans-serif;letter-spacing:0;text-transform:none;white-space:nowrap;cursor:pointer}
 header .hb:hover,header .tab:hover{background:var(--surface-raised,rgba(127,163,173,.12));color:var(--ink);border-color:transparent}
 header .tab.on,header .hb.on{background:var(--surface-raised,rgba(127,163,173,.12));color:var(--ink);border-color:var(--line)}
 header :is(button,summary,select):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
 #codexMenu,.desktop-more{display:none!important}
 header #providerName,header #tRepo{display:none}
 header .theme-toggle,header .edit-toggle,header .phone-toggle{font-size:16px;width:32px;height:32px;padding:4px;display:inline-flex;align-items:center;justify-content:center}
 header .edit-toggle svg,header .phone-toggle svg{width:16px;height:16px;display:block}
 header .theme-control[hidden]{display:none}
 .w[data-w=zamer]>.panel,.w[data-w=zhel]>.panel{padding:8px 12px}
 .w[data-w=zamer] .ph,.w[data-w=zhel] .ph{margin-bottom:6px;letter-spacing:.03em;text-transform:none;font-size:12px}
 .w[data-w=zamer] .ph{flex-wrap:wrap;gap:4px}.w[data-w=zamer] .ph small{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;letter-spacing:0;margin-left:auto;text-align:right;justify-content:flex-end}
 #compactContext{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:7px;margin-left:auto;min-height:34px;padding:7px 12px;border:1px solid color-mix(in srgb,var(--resource-codex) 38%,var(--line));border-radius:10px;background:linear-gradient(135deg,color-mix(in srgb,var(--resource-codex) 15%,var(--surface)),var(--surface));color:var(--ink);font:500 12px/18px system-ui,sans-serif;letter-spacing:0;text-transform:none;cursor:pointer;box-shadow:inset 0 1px 0 #ffffff0d}
 #compactContext::before{content:'↙↗';font-size:16px;color:var(--resource-codex)}#compactContext[hidden]{display:none}#compactContext:hover{border-color:var(--resource-codex);background:color-mix(in srgb,var(--resource-codex) 17%,var(--surface))}#compactContext:focus-visible{outline:2px solid var(--resource-codex);outline-offset:3px}#compactContext:disabled{opacity:.55;cursor:default}
 #zamer .meter,#zhel .meter{padding:4px 0;min-width:0}#zamer .top,#zhel .top{font-size:12px;gap:6px;line-height:1.4}#zamer .top b,#zhel .top b{flex:none}
 #zamer .prog,#zhel .prog{height:3px;margin-top:3px;background:color-mix(in srgb,var(--ink) 15%,transparent)}
 #zamer .prog i,#zhel .prog i{box-shadow:none;filter:none}#zamer .sub,#zhel .sub{font:11px/1.35 system-ui,sans-serif;margin-top:3px}
 /* «каждая нейросеть — в своей плашке»; цифра крупно, подписи читаются, цвет нейросети — рамка и имя */
 .w[data-w=zamer]{min-height:96px}
 .w[data-w=zamer]>.panel{display:flex;flex-direction:column;min-height:0;overflow:hidden}
 #zamer{min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;overscroll-behavior:contain}
 #zamer .resource-helper-list{display:flex;flex-direction:column;gap:6px}
 #zamer .resource-group{min-width:0;padding:7px 8px;border:1px solid var(--line);border-radius:7px;background:var(--surface)}
 #zamer .resource-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px;font:600 12px/1.3 system-ui;color:var(--ink)}
 #zamer .resource-heading small{font:10px/1.3 system-ui;color:var(--dim)}
 #zamer .meter{padding:3px 0}
 #zamer .resource-group .top{font:12px/1.3 system-ui;align-items:baseline}
 #zamer .resource-group .top b,#zamer .helper-balance strong{font:500 12px/1.2 'JetBrains Mono',monospace;color:var(--pc,var(--resource-tone))}
 #zamer .resource-group .prog{height:3px;margin-top:3px;border-radius:3px;overflow:hidden;background:var(--line)}
 #zamer .resource-group .sub{font:10px/1.35 system-ui;color:var(--dim);margin-top:2px}
 #zamer .empty{font:11px/1.4 system-ui;color:var(--dim);padding:3px 0}
 header .quick-actions{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}
 header .quick-actions .hb{min-width:32px;width:32px;height:32px;padding:4px;font-size:16px;border-radius:6px;color:var(--dim)}
 header .quick-actions #bOnboard.onboard-cta{width:34px;min-width:34px;height:34px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--accent) 65%,transparent);background:color-mix(in srgb,var(--accent) 16%,var(--surface));color:var(--accent);border-radius:8px;box-shadow:0 0 12px rgba(var(--accent-rgb),.22)}
 header .quick-actions #bOnboard.onboard-cta:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 26%,var(--surface))}
 header .quick-actions #bVoice.on{color:var(--ink);background:var(--surface-raised)}
 header .bug-toggle svg{width:16px;height:16px;display:block}
 html[data-client=true] header .quick-actions :is(#bVoice,#bPhone,#bQuickNote),html[data-interface=user] header .quick-actions :is(#bVoice,#bPhone,#bQuickNote){display:none!important}
 body.edit header .quick-actions [data-qbtn],body.edit header .tabs .tab[draggable="true"]{cursor:grab;border-style:dashed;border-color:color-mix(in srgb,var(--accent) 55%,var(--line))}
 .hdr-dragging{opacity:.45}
 .hdr-drop-target{outline:2px solid var(--accent);outline-offset:2px}
 header .link-status{display:none!important}
 #keshStrip{min-width:0!important}#keshStrip:empty{display:none!important}
 header .st{margin-left:0!important;gap:10px;flex:none}
 .activity-idle-hint{font:11.5px/1.45 system-ui,sans-serif;color:var(--dim);text-align:center;padding:4px 6px}
 #otz{width:min(740px,94vw)}
 #otz .ph{text-transform:none;letter-spacing:0;font:600 16px/1.3 system-ui,sans-serif;color:var(--ink);display:flex;align-items:center;justify-content:space-between;padding:18px 26px}
 #otz .otz-close,#quickNotes .otz-close{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;font:500 20px/1 system-ui,sans-serif;letter-spacing:0;border-radius:10px;border:1px solid var(--line);color:var(--dim)}
 #otz .otz-close:hover,#quickNotes .otz-close:hover{color:var(--ink);border-color:var(--accent)}
 #otz .ob{padding:20px 26px 28px;display:flex;flex-direction:column;gap:14px;font-family:system-ui,sans-serif}
 .otz-card{padding:22px 24px;border:1px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--ink) 2.5%,var(--bg))}
 #otz .ob .otz-card h4,#quickNotes .ob .otz-card h4,.otz-card h4{margin:0 0 12px;font:600 15px/1.3 system-ui,sans-serif;color:var(--ink);opacity:1;letter-spacing:0;text-transform:none}
 .otz-kinds{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
 .otz-kind-btn{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--dim);font:500 13.5px/1.2 system-ui,sans-serif;letter-spacing:0;white-space:nowrap;transition:border-color .15s,background .15s,color .15s}
 .otz-kind-btn:hover{color:var(--ink);border-color:color-mix(in srgb,var(--accent) 55%,var(--line))}
 .otz-kind-btn.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,var(--surface));color:var(--ink);font-weight:600}
 #otzText{display:block;box-sizing:border-box;width:100%;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font:14.5px/1.55 system-ui,sans-serif;min-height:210px;margin:0;resize:vertical}
 #otzText:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent)}
 #otz .ob .otz-note,#quickNotes .ob .otz-note,.otz-note{margin:12px 0 14px;font:13px/1.5 system-ui,sans-serif;color:var(--dim)}
 .otz-btn{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:10px 20px;border-radius:10px;border:1px solid var(--line);background:var(--surface-raised,var(--surface));color:var(--ink);font:600 13.5px/1.2 system-ui,sans-serif;text-transform:none;letter-spacing:0;white-space:nowrap}
 .otz-btn:hover{border-color:var(--accent)}
 .otz-btn.primary{border-color:var(--accent);color:var(--accent)}
 .otz-btn.solid{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:600}
 .otz-btn:disabled{opacity:.55;cursor:default}
 #otzManualSend{margin-top:4px}#otzManualStatus{font-size:12px}
 .otz-attach-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 8px}
 .otz-btn.sm{min-height:34px;padding:7px 14px;font-size:13px}
 .otz-limits{font:12.5px/1.45 system-ui,sans-serif;color:var(--dim)}
 .otz-files{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
 .otz-file-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface);font:12px/1.3 system-ui,sans-serif;color:var(--ink)}
 .otz-file-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px}
 .otz-file-chip small{color:var(--dim);font-size:11px;flex:none}
 .otz-file-rm{all:unset;cursor:pointer;color:var(--dim);font-size:14px;line-height:1;padding:0 2px}.otz-file-rm:hover{color:#ff5a7a}
 #compactContext{min-height:26px;padding:3px 6px;font:11px/1.4 system-ui;border:1px solid var(--line);border-radius:5px;background:transparent;box-shadow:none}
 html[data-client=true] :is(#eVid,#eStr,#addPageTab,#bIst){display:none!important}
 .resource-tabs{flex:none}
 @media(prefers-reduced-motion:reduce){#zamer .prog i{transition:none}}
 .w[data-w=zhel]>.panel{--pc:var(--hardware)!important}#zhel .meter[style*="#5affc8"]{--pc:var(--hardware)!important}
 @media(max-width:1400px){header{gap:12px;padding-inline:16px}header .st{gap:10px}header .tab{padding-inline:8px}}
 @media(max-width:1100px){header{flex-wrap:wrap;gap:8px 12px}}
 @media(max-width:600px){header{gap:8px;padding:8px 12px}header .brand b{font-size:15px}header .st{gap:8px}header #tLink{max-width:88px}header .tab{padding-inline:6px}}
 `;
 document.head.append(style);
 const resourceTitle=document.querySelector('.w[data-w=zamer] .ph');
 if(resourceTitle?.firstChild?.nodeType===3)resourceTitle.firstChild.nodeValue='Ресурсы';
 const header=document.querySelector('header'),nav=header?.querySelector('.tabs'),status=header?.querySelector('.st');
 if(!nav||!status)return;
 header.querySelector('.brand b').textContent='AllY';
 status.firstElementChild?.classList.add('link-status');
 const codexMenuNode=header.querySelector('#codexMenu');if(codexMenuNode)codexMenuNode.hidden=true;
 const repo=header.querySelector('#tRepo');if(repo)repo.hidden=true;
 const quick=document.createElement('div');quick.className='quick-actions';quick.setAttribute('aria-label','Быстрые действия');header.insertBefore(quick,status);
 const BUG_SVG='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>';
 const phone=header.querySelector('#bPhone');
 if(phone){
  phone.classList.remove('hide');phone.classList.add('phone-toggle');phone.dataset.qbtn='phone';
  phone.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
  quick.append(phone);
 }
 const voice=header.querySelector('#bVoice');if(voice){voice.classList.remove('hide');voice.dataset.qbtn='voice';quick.append(voice)}
 const onboardBtn=document.createElement('button');onboardBtn.type='button';onboardBtn.id='bOnboard';onboardBtn.className='hb onboard-cta';onboardBtn.dataset.qbtn='onboard';
 onboardBtn.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
 onboardBtn.title='Подключить нейросеть';onboardBtn.setAttribute('aria-label','Подключить нейросеть');
 onboardBtn.onclick=()=>{window.openAllYOnboarding?.()};
 quick.append(onboardBtn);
 const BOOK_SVG='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
 const guideBtn=document.createElement('button');guideBtn.type='button';guideBtn.id='bGuide';guideBtn.className='hb guide-toggle';guideBtn.dataset.qbtn='guide';
 guideBtn.innerHTML=BOOK_SVG;guideBtn.title='Справка и свод версий AllY';guideBtn.setAttribute('aria-label','Справка и свод версий AllY');
 guideBtn.onclick=()=>{window.openAllYGuide?.()};
 quick.append(guideBtn);
 const themeBox=header.querySelector('.theme-control'),themeSelect=themeBox?.querySelector('select');
 if(themeSelect){
  themeBox.hidden=true;
  const themeButton=document.createElement('button');themeButton.id='bTheme';themeButton.className='hb theme-toggle';themeButton.type='button';themeButton.textContent='◐';themeButton.dataset.qbtn='theme';
  const label=()=>{const name=themeSelect.options[themeSelect.selectedIndex]?.text||'';themeButton.title='Тема: '+name+' — нажми, чтобы сменить';themeButton.setAttribute('aria-label',themeButton.title)};
  themeButton.addEventListener('click',()=>{themeSelect.selectedIndex=(themeSelect.selectedIndex+1)%themeSelect.options.length;themeSelect.dispatchEvent(new Event('change',{bubbles:true}));label()});
  themeSelect.addEventListener('change',label);label();quick.append(themeButton);
 }
 const editButton=header.querySelector('#bEdit');
 if(editButton){
  editButton.classList.add('edit-toggle');editButton.dataset.qbtn='edit';
  editButton.setAttribute('aria-label','Настроить карту, вкладки и быстрые кнопки');
  editButton.title='Настроить карту, порядок вкладок и быстрых кнопок';
  editButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/><path d="M14.5 17.5 3.5 15"/></svg>';
  quick.append(editButton);
 }
 const otzBtn=header.querySelector('#bOtz');
 if(otzBtn){
  otzBtn.classList.add('bug-toggle');otzBtn.dataset.qbtn='feedback';
  otzBtn.innerHTML=BUG_SVG;otzBtn.title='Обратная связь / сообщить о баге';otzBtn.setAttribute('aria-label','Обратная связь');
  quick.append(otzBtn);
 }
 const quickNoteBtn=document.createElement('button');quickNoteBtn.type='button';quickNoteBtn.id='bQuickNote';quickNoteBtn.className='hb bug-toggle';quickNoteBtn.dataset.qbtn='note';
 quickNoteBtn.innerHTML=BUG_SVG;quickNoteBtn.title='Быстрая заметка (без прерывания хода)';quickNoteBtn.setAttribute('aria-label','Быстрая заметка');
 quickNoteBtn.onclick=()=>{window.openQuickNotes?.()};
 quick.append(quickNoteBtn);
 const clockEl=header.querySelector('#clock');if(clockEl)status.append(clockEl);
 const edTip=document.querySelector('#edbar .sub');
 if(edTip)edTip.textContent='тяни блоки, вкладки и быстрые кнопки мышью';
 setupHeaderReorder(quick);
}
function setupHeaderReorder(quick){
 const QUICK_KEY='ally-quick-order-v2',TABS_KEY='ally-tab-order-v1';
 const readOrder=k=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return Array.isArray(v)?v:null}catch{return null}};
 const writeOrder=(k,arr)=>{try{localStorage.setItem(k,JSON.stringify(arr))}catch{}};
 const clearOrder=k=>{try{localStorage.removeItem(k)}catch{}};
 const defaultQuick=[...quick.querySelectorAll('[data-qbtn]')].map(el=>el.dataset.qbtn).filter(Boolean);
 const applyOrder=(container,sel,getId,order)=>{
  if(!Array.isArray(order)||!order.length)return;
  const items=[...container.querySelectorAll(sel)],byId=new Map(items.map(el=>[getId(el),el]));
  for(const id of order){const el=byId.get(id);if(el){container.append(el);byId.delete(id)}}
  for(const rest of byId.values())container.append(rest);
 };
 applyOrder(quick,'[data-qbtn]',el=>el.dataset.qbtn,readOrder(QUICK_KEY));
 const syncDraggable=()=>{
  const editing=!!document.body?.classList?.contains('edit');
  for(const el of quick.querySelectorAll('[data-qbtn]'))el.draggable=editing;
 };
 syncDraggable();
 if(typeof MutationObserver!=='undefined'&&document.body){
  new MutationObserver(syncDraggable).observe(document.body,{attributes:true,attributeFilter:['class']});
 }
 let dragged=null;
 const clearMarks=()=>quick.querySelectorAll('.hdr-drop-target,.hdr-dragging').forEach(n=>n.classList.remove('hdr-drop-target','hdr-dragging'));
 quick.addEventListener('dragstart',e=>{
  if(!document.body?.classList?.contains('edit')){e.preventDefault();return}
  const item=e.target?.closest?.('[data-qbtn]');if(!item||!item.draggable){e.preventDefault();return}
  dragged=item;item.classList.add('hdr-dragging');
  if(e.dataTransfer){e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',item.dataset.qbtn)}catch{}}
 });
 quick.addEventListener('dragover',e=>{
  if(!dragged||!document.body?.classList?.contains('edit'))return;
  const target=e.target?.closest?.('[data-qbtn]');if(!target||target===dragged||!quick.contains(target))return;
  e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';
  quick.querySelectorAll('.hdr-drop-target').forEach(n=>{if(n!==target)n.classList.remove('hdr-drop-target')});
  target.classList.add('hdr-drop-target');
  const rect=target.getBoundingClientRect(),after=e.clientX>rect.left+rect.width/2;
  quick.insertBefore(dragged,after?target.nextSibling:target);
 });
 quick.addEventListener('drop',e=>{
  if(!dragged)return;e.preventDefault();clearMarks();
  writeOrder(QUICK_KEY,[...quick.querySelectorAll('[data-qbtn]')].map(el=>el.dataset.qbtn).filter(Boolean));dragged=null;
 });
 quick.addEventListener('dragend',()=>{
  clearMarks();if(dragged){writeOrder(QUICK_KEY,[...quick.querySelectorAll('[data-qbtn]')].map(el=>el.dataset.qbtn).filter(Boolean));dragged=null}
 });
 document.getElementById('eReset')?.addEventListener('click',()=>{
  clearOrder(QUICK_KEY);clearOrder(TABS_KEY);
  applyOrder(quick,'[data-qbtn]',el=>el.dataset.qbtn,defaultQuick);
  syncDraggable();
 });
}
document.addEventListener('DOMContentLoaded',initDesktopPresentation);

// Отдельная вкладка помощников; деньги не превращаем в проценты лимита.
function helperBalanceHTML(data,{loading=false,failed=false,now=Date.now()}={}){
 const row=data?.helpers?.find(item=>item.id==='deepseek');
 const money=(value,currency)=>`${currency==='CNY'?'¥':'$'}${Number(value).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const valid=row?.wallets?.length>0;
 const old=valid&&(failed||row.status!=='ready'||!row.checkedAt||now-row.checkedAt>120000);
 const amounts=valid?row.wallets.map(wallet=>`<div class="helper-wallet"><strong>${esc(money(wallet.total,wallet.currency))}</strong><span>${esc(wallet.currency)}</span></div><div class="sub">Пополнено ${esc(money(wallet.toppedUp,wallet.currency))} · бонус ${esc(money(wallet.granted,wallet.currency))}</div>`).join(''):'<div class="empty">'+(loading?'Получаю баланс…':'Баланс пока недоступен')+'</div>';
 const time=row?.checkedAt?new Date(row.checkedAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):null;
 return `<section class="resource-group helper-balance" style="--resource-tone:var(--resource-helper)" aria-label="DeepSeek · баланс"><div class="resource-heading"><span>DeepSeek</span><small>API-баланс</small></div>${amounts}<div class="sub">${time?'Проверено '+esc(time):'Свежего замера ещё нет'}</div>${old?'<div class="sub" role="status">'+(failed||row.error?'Не удалось обновить. Показан последний успешный баланс.':'Данные устарели — обновляю…')+'</div>':!valid&&!loading?'<div class="sub">Проверь вход в DeepSeek Harness на компьютере.</div>':''}</section>`;
}
function fitResourceWidget(){
 const target=$('#zamer'),panel=target?.closest('.panel'),widget=panel?.closest('.w');
 if(widget)widget.style.minHeight='';
}
function renderHelperResource(){
 const target=$('#zamer');if(!target)return;
 setHTML(target,resourceGroups(resourceSnapshot,providerState));
 $('#zAt').textContent=helperResourceLoading?'Помощники · обновляю…':'Помощники';
 const refresh=$('#refreshHelperBalance');if(refresh){refresh.hidden=false;refresh.disabled=helperResourceLoading;refresh.textContent=helperResourceLoading?'Обновляю…':'Обновить'}
 fitResourceWidget();
}
async function refreshHelperResource(manual=false){
 if(resourceTab!=='helpers'||helperResourceLoading||document.hidden||document.hasFocus?.()===false)return;
 helperResourceLoading=true;renderZamer();
 try{
  const response=await fetch('/api/helper-resources'+(manual?'?refresh=1':''),{headers:{'x-dzhinni':'1'}});
  if(!response.ok)throw new Error('unavailable');
  const data=await response.json();if(!Array.isArray(data.helpers))throw new Error('invalid');
  helperResource=data;helperResourceFailed=data.helpers.some(row=>row.status==='stale'||row.status==='unavailable');
  try{const response=await fetch('/api/aggregator');if(response.ok){const a=await response.json();aggregatorResource={configured:a.configured}}}catch{}
 }catch{helperResourceFailed=true}
 finally{helperResourceLoading=false;renderZamer()}
}
function selectResourceTab(tab){
 resourceTab=tab==='helpers'?'helpers':'main';
 for(const id of ['main','helpers']){const b=$('#resourceTab-'+id);if(b){b.setAttribute('aria-selected',String(id===resourceTab));b.tabIndex=id===resourceTab?0:-1}}
 const refresh=$('#refreshHelperBalance');if(refresh)refresh.hidden=resourceTab!=='helpers';
 $('#zamer')?.setAttribute?.('aria-labelledby','resourceTab-'+resourceTab);
 $('#zamer')?.setAttribute?.('data-tab',resourceTab);
 renderZamer();fitResourceWidget();if(resourceTab==='helpers')void refreshHelperResource();
}
document.addEventListener('DOMContentLoaded',()=>{
 const target=$('#zamer');if(!target||!document.createElement)return;
 const tabs=document.createElement('div');tabs.className='resource-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Ресурсы');
 for(const [id,title]of[['main','Ведущая'],['helpers','Помощники']]){
  const button=document.createElement('button');button.id='resourceTab-'+id;button.type='button';button.textContent=title;button.setAttribute('role','tab');button.setAttribute('aria-controls','zamer');button.setAttribute('aria-selected',String(id==='main'));button.tabIndex=id==='main'?0:-1;
  button.addEventListener('click',()=>selectResourceTab(id));
  button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'main':event.key==='End'?'helpers':resourceTab==='main'?'helpers':'main';selectResourceTab(next);$('#resourceTab-'+next)?.focus()}});tabs.append(button);
 }
 const refresh=document.createElement('button');refresh.id='refreshHelperBalance';refresh.className='lnk';refresh.type='button';refresh.textContent='Обновить';refresh.hidden=true;refresh.addEventListener('click',()=>refreshHelperResource(true));tabs.append(refresh);
 const compact=$('#compactContext');if(compact){compact.title='Сжать текущую сессию Codex с сохранением истории чата';tabs.append(compact)}
 target.before(tabs);target.setAttribute('role','tabpanel');target.setAttribute('aria-labelledby','resourceTab-main');target.setAttribute('data-tab','main');
 const style=document.createElement('style');style.textContent='#zamer[data-tab=main] .resource-helpers{display:none}.resource-tabs{display:flex;align-items:center;gap:4px;margin:0 0 6px;flex-wrap:wrap}.resource-tabs button[role=tab]{border:1px solid var(--line);border-radius:5px;padding:3px 7px;color:var(--dim);background:transparent;font:12px system-ui;cursor:pointer}.resource-tabs button[aria-selected=true]{color:var(--ink);background:color-mix(in srgb,var(--ink) 9%,transparent)}.resource-tabs #refreshHelperBalance{margin-left:auto}.helper-balance .helper-wallet{display:flex;align-items:baseline;gap:8px;margin-top:3px}.helper-balance .helper-wallet span{font:11px system-ui;color:var(--dim)}';document.head.append(style);
 setInterval(()=>void refreshHelperResource(),60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshHelperResource()});
});
