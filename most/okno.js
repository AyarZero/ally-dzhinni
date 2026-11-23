const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let phase='idle',golosPlaying=false;const PH={idle:['готова','#00e5ff'],think:['думает','#c77dff'],work:['работает','#ffb547'],speak:['говорит','#00e5ff'],ask:['ждёт да','#5affc8'],stop:['стоп','#ff5a7a']};
let themeAccentRgb='0,229,255';
function syncThemeColors(){const css=getComputedStyle(document.documentElement),accent=css.getPropertyValue('--accent').trim();if(!/^#[0-9a-f]{6}$/i.test(accent))return;themeAccentRgb=css.getPropertyValue('--accent-rgb').trim()||themeAccentRgb;PH.idle[1]=PH.speak[1]=accent;PH.work[1]=css.getPropertyValue('--amber').trim()||PH.work[1];PH.ask[1]=css.getPropertyValue('--green').trim()||PH.ask[1]}
document.addEventListener('dzhinni-theme-change',syncThemeColors);syncThemeColors();
const live={processes:{},asks:{},panels:{}};
let providerState={provider:'claude'};
let lastDraft='';function renderProvider(p){if(!p)return;providerState=p;window.renderEngine(p);window.syncComposerQueue?.(p);renderZamer();faza();const d=p.busy&&p.task?.draft?.text||'';if(d!==lastDraft){lastDraft=d;try{renderChat()}catch{}}}
async function codexAction(action){try{renderProvider(await post('/codex/'+action,{}))}catch{$('#codexError').hidden=false;$('#codexError').textContent='Не удалось проверить исполнителя.'}}
$('#codexLogin').onclick=()=>codexAction('login');$('#codexDevice').onclick=()=>codexAction('login-device');$('#codexCheck').onclick=()=>codexAction('status');$('#codexRetry').onclick=()=>codexAction('retry');
function setPhase(p,label){phase=p;$('#phase').textContent=label||PH[p][0]}
// перерисовка раз в минуту заново проигрывала анимацию появления сводок — «панель дёргается»; рисуем только изменившееся
const setHTML=(el,h)=>{if(el._h===h)return false;el._h=h;el.innerHTML=h;return true};
// фаза ядра — из фактов, а не из того, кто последним позвал setPhase: «думает» висело, когда кончился лимит
let sentAt=0;
function limitKonchilsya(){if(providerState.provider==='direct'){const row=(providerState.availability||[]).find(row=>row.executor===providerState.executor);return row?.observation?.quota?.state==='exhausted'?'Лимиты выбранной нейросети исчерпаны':''}const now=Date.now();for(const[l,o]of[['лимит 5 часов',zamer?.pyat],['недельный лимит',zamer?.nedelya]])
 if(o&&o.procent>=100&&o.sbros>now)return `${l} кончился, до ${new Date(o.sbros).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;return ''}
function faza(){window.updateChatActivity?.();if(golosPlaying)return setPhase('speak');if(Object.keys(live.asks).length)return setPhase('ask');
 const h=hodL.at(-1),posle=h?h.at:0,lim=limitKonchilsya(),zhdyot=Date.now()-sentAt;
 // Причина ожидания — в шапку, а не только в меню: «молчит» без причины пользователь уже видел.
 const zh=providerState?.provider==='direct'&&!busy()?String(providerState.waiting||''):'';
 if(h&&h.oshibka&&posle>=sentAt-1000&&(Date.now()-posle<30*60e3||lim))return setPhase('stop',h.oshibka);
 if(busy()||Object.values(live.processes).some(p=>p.progress<100&&!p.stoit))return setPhase('work',
   providerState?.provider==='direct'&&providerState.readOnly?'отвечает без записи':undefined);
 if(zh)return setPhase('stop',zh.length>70?zh.slice(0,69)+'…':zh);
 if(sentAt>posle){if(lim)return setPhase('stop',lim);return zhdyot<180e3?setPhase('think'):setPhase('stop','молчит — сессия не отвечает')}
 setPhase('idle')}
async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-dzhinni':'1'},body:JSON.stringify(data)});return r.json()}

/* раскладка карты: колонки с блоками, как в Cursor. Ширины и высоты — flex-grow, раскладка в localStorage */
const main=$('#vMap'),pool=$('#wpool'),W={};let edit=false;
const clientInterface=document.documentElement.dataset.client==='true';
const clientWidgets=new Set(['chat','zamer','zhel','hod','doki']);
if(clientInterface){
 const queue=pool.querySelector('[data-w="hod"]');if(queue){queue.dataset.t='Очередь работы';queue.querySelector('.ph').firstChild.textContent='Очередь работы';queue.querySelector('.task-help').textContent='Сообщения, ожидающие ответа. Меняй порядок ожидания перетаскиванием карточек.'}
 const docs=pool.querySelector('[data-w="doki"]');if(docs){docs.dataset.t='Текстовые документы';docs.querySelector('.ph').firstChild.textContent='Текстовые документы';docs.querySelector('.empty').textContent='Здесь появятся распознанные ссылки на файлы .md и .txt из ответов.'}
}
pool.querySelectorAll('.w').forEach(w=>{W[w.dataset.w]=w;
 w.insertAdjacentHTML('afterbegin',`<div class="wh"><span>⠿ ${esc(w.dataset.t)}</span><button type="button" data-hide title="Убрать блок с карты; вернуть — кнопкой сверху">скрыть</button></div>`);
 w.insertAdjacentHTML('beforeend','<div class="ry" title="Потяни, чтобы поменять высоту"></div><div class="rxw" title="Потяни, чтобы поменять ширину"></div>')});
const DEF=clientInterface?{cols:[{w:2.45,items:[['chat',1]]},{w:1,items:[['zamer',.28],['zhel',1]]}],hidden:['focus','hod','asks','doki','panels','sys','say']}:{cols:[{w:1.85,items:[['chat',1]]},{w:1,items:[['zhel',.75],['zamer',1.25]]}],hidden:['focus','hod','asks','doki','panels','sys','say']};
const kids=c=>[...c.querySelectorAll(':scope>.w,:scope>.lrow')];
function mkCol(g){const c=document.createElement('div');c.className='lcol';c.style.flexGrow=g;c.innerHTML='<div class="rx" title="Потяни, чтобы поменять ширину"></div>';return c}
function mkRow(g){const r=document.createElement('div');r.className='lrow';r.style.flexGrow=g;return r}
function mkStack(g){const s=document.createElement('div');s.className='lst';s.style.flexGrow=g;s.innerHTML='<div class="rxw" title="Потяни, чтобы поменять ширину"></div>';return s}
// стопка из одного блока распускается: блок забирает её ширину; стопка, оказавшаяся прямо в колонке, высыпается в неё,
// и её блоки делят высоту стопки в прежней пропорции
function tidyStacks(){main.querySelectorAll('.lst').forEach(s=>{const k=[...s.children].filter(x=>x.matches('.w,.wph')),g=+s.style.flexGrow||1;
 if(s.parentElement.classList.contains('lrow')){if(k.length>1)return;if(k[0])k[0].style.flexGrow=g;s.replaceWith(...k);return}
 const sum=k.reduce((a,x)=>a+(+x.style.flexGrow||1),0)||1;k.forEach(x=>x.style.flexGrow=+(g*(+x.style.flexGrow||1)/sum).toFixed(4));s.replaceWith(...k)})}
// ряд, в котором осталась одна ячейка, распускается: она забирает высоту ряда
function tidyRows(){tidyStacks();main.querySelectorAll('.lrow').forEach(r=>{const k=[...r.children].filter(x=>x.matches('.w,.wph,.lst'));
 if(k.length>1)return;if(k[0]){k[0].style.flexGrow=r.style.flexGrow||1;r.replaceWith(k[0])}else r.remove()});tidyStacks()}
function fillLayout(){for(const box of [main,...main.querySelectorAll('.lcol,.lrow,.lst')]){
 const items=[...box.children].filter(el=>el.matches('.lcol,.w,.wph,.lrow,.lst')),sum=items.reduce((n,el)=>n+(+el.style.flexGrow||1),0);
 // Flex-grow totals below one leave part of the container empty instead of filling it proportionally.
 if(sum>0&&sum<1)items.forEach(el=>el.style.flexGrow=(+el.style.flexGrow||1)/sum)}}
function markVoid(){fillLayout();main.querySelectorAll('.lcol').forEach(c=>c.classList.toggle('void',!c.querySelector(':scope>.w,:scope>.wph,:scope>.lrow')))}
function dropVoid(){main.querySelectorAll('.lcol.void').forEach(c=>{if(main.children.length>1)c.remove()})}
const toBottom=()=>{const l=$('#clog');l.scrollTop=l.scrollHeight};
// переписка, прокрученная до низа, остаётся внизу и когда блок меняет размер
{const l=$('#clog');let stick=true;l.addEventListener('scroll',()=>{stick=l.scrollHeight-l.scrollTop-l.clientHeight<40});new ResizeObserver(()=>{if(stick)toBottom()}).observe(l)}
// полоса прокрутки у блока — только когда содержимое правда не влезает; пара пикселей запаса не в счёт
//
{const fit=el=>{el.style.overflowY=el.scrollHeight-el.clientHeight>8?'auto':'hidden'};
 const ro=new ResizeObserver(es=>es.forEach(e=>fit(e.target)));
 const watch=()=>document.querySelectorAll('.w>.panel,.w>.stack').forEach(el=>{if(!el._fit){el._fit=1;ro.observe(el);
  new MutationObserver(()=>fit(el)).observe(el,{childList:true,subtree:true,characterData:true})}fit(el)});
 watch();setInterval(()=>{if(oknoMotion.active())watch()},3000)}
function applyLayout(L){Object.values(W).forEach(w=>pool.append(w));main.innerHTML='';const used=new Set(L.hidden||[]);
 if(clientInterface)for(const id in W)if(!clientWidgets.has(id))used.add(id);
 const put=(box,id,g)=>{const w=W[id];if(!w||used.has(id))return;used.add(id);w.style.flexGrow=g||1;box.append(w)};
 let cols=(L.cols||[]).map(c=>({w:c.w||1,items:c.items||[]}));
 if(!W.core){let coreW=0;cols.forEach(c=>{if(c.items.length===1&&c.items[0][0]==='core')coreW+=+c.w||1});
  if(coreW>0){const chatCol=cols.find(c=>c.items.some(it=>it[0]==='chat'));if(chatCol)chatCol.w=+(+chatCol.w+coreW).toFixed(3)}}
 for(const col of cols){const c=mkCol(col.w||1);for(const[id,h,row]of col.items||[]){
   if(id==='row'){const r=mkRow(h||1);for(const[i,g,st]of row||[]){if(i==='st'){const s=mkStack(g||1);for(const[j,hj]of st||[])put(s,j,hj);r.append(s)}else put(r,i,g)}c.append(r)}else put(c,id,h)}main.append(c)}
 if(!main.children.length)main.append(mkCol(1));tidyRows();
 for(const id in W)if(!used.has(id)){W[id].style.flexGrow=1;main.lastElementChild.append(W[id])} // блок, которого не было в сохранённой раскладке
 markVoid();if(!edit)dropVoid();renderTray();toBottom()}
const gr=el=>+(+el.style.flexGrow||1).toFixed(3);
const readLayout=()=>({cols:[...main.children].map(c=>({w:gr(c),items:kids(c).map(w=>w.classList.contains('lrow')?['row',gr(w),[...w.children].filter(x=>x.matches('.w,.lst')).map(x=>x.classList.contains('lst')?['st',gr(x),[...x.children].filter(y=>y.matches('.w')).map(y=>[y.dataset.w,gr(y)])]:[x.dataset.w,gr(x)])]:[w.dataset.w,gr(w)])})),hidden:[...pool.children].map(w=>w.dataset.w)});
function saveLayout(){fillLayout();try{localStorage.setItem('dzh-layout',JSON.stringify(readLayout()))}catch{}}
// спрятанные блоки двумя списками: наши (обновляем мы) и твои
function renderTray(){const b=w=>`<button class="hb" data-add="${esc(w.dataset.w)}" title="Вернуть блок на карту">+ ${esc(w.dataset.t)}</button>`,all=[...pool.children].filter(w=>!clientInterface||clientWidgets.has(w.dataset.w)),
  nashi=all.filter(w=>!w.dataset.v),tvoi=all.filter(w=>w.dataset.v);
 $('#tray').innerHTML=(nashi.length?`<span class="trg">вернуть:</span>${nashi.map(b).join('')}`:'')+(tvoi.length?`<span class="trg">мои:</span>${tvoi.map(b).join('')}`:'')}
$('#tray').onclick=e=>{const b=e.target.closest('[data-add]');if(!b)return;const w=W[b.dataset.add],cols=[...main.children];
 if(clientInterface&&!clientWidgets.has(b.dataset.add))return;
 const c=cols.find(c=>c.classList.contains('void'))||cols.reduce((a,b)=>kids(a).length<=kids(b).length?a:b);
 w.style.flexGrow=1;c.append(w);markVoid();renderTray();saveLayout();toBottom()};
function setEdit(on){edit=on;document.body.classList.toggle('edit',on);$('#edbar').hidden=!on;$('#bEdit').classList.toggle('on',on);
 if(on){setView('map');renderTray()}else{dropVoid();saveLayout()}}
$('#bEdit').onclick=()=>setEdit(!edit);$('#eDone').onclick=()=>setEdit(false);
$('#eReset').onclick=()=>{applyLayout(DEF);saveLayout();window.resetChatSplit?.()};
$('#eCol').onclick=()=>{if(main.children.length<5){main.append(mkCol(1));markVoid()}};
main.addEventListener('click',e=>{const b=e.target.closest('[data-hide]');if(!b||!edit)return;pool.append(b.closest('.w'));tidyRows();markVoid();renderTray();saveLayout()});
main.addEventListener('pointerdown',e=>{if(!edit||e.button!==0||e.target.closest('[data-hide],[data-izm]'))return;
 const r=e.target.closest('.ry,.rx,.rxw');if(r)return split(e,r,r.classList.contains('ry'));
 const w=e.target.closest('.w');if(w)drag(e,w)});
// умные направляющие, как в Canva: граница липнет к краю соседнего блока, а размер — к размеру соседа
// той же породы (колонка к колонке, блок к блоку); с чем совпало — показывают линия или пунктир с подписью
const LIP=6,guide=document.createElement('div'),gtip=document.createElement('div');guide.className='guide';gtip.className='gtip';document.body.append(guide,gtip);
function lipkie(a,b,vert,sum){const A=a.getBoundingClientRect(),B=b.getBoundingClientRect(),st=vert?A.top:A.left,gap=(vert?B.top:B.left)-(vert?A.bottom:A.right),out=[];
 const kol=a.classList.contains('lcol');
 for(const el of main.querySelectorAll('.lcol,.lrow,.lst,.w')){if(el===a||el===b||a.contains(el)||b.contains(el)||el.contains(a))continue;
  const q=el.getBoundingClientRect(),s=vert?q.top:q.left,en=vert?q.bottom:q.right;
  out.push({na:en-st,line:en},{na:s-gap-st,line:s}); // край к краю: конец «a» или начало «b» на линии соседа
  if(kol===el.classList.contains('lcol'))out.push({na:en-s,el,who:a},{na:sum-(en-s),el,who:b})} // размер как у соседа
 return out}
function guidesOff(){guide.className='guide';gtip.style.display='none';document.querySelectorAll('.gmatch').forEach(x=>x.classList.remove('gmatch'))}
function pokazatGuide(c,a,b,vert,ev){guidesOff();if(!c)return;const M=main.getBoundingClientRect();
 if(c.line!=null){Object.assign(guide.style,vert?{top:c.line-1+'px',left:M.left+'px',width:M.width+'px',height:'2px'}:{left:c.line-1+'px',top:M.top+'px',height:M.height+'px',width:'2px'});guide.className='guide on';return}
 c.el.classList.add('gmatch');c.who.classList.add('gmatch');
 const imya=c.el.dataset.t?`«${c.el.dataset.t}»`:c.el.classList.contains('lcol')?'соседней колонки':'соседнего ряда';
 gtip.textContent=`${vert?'высота':'ширина'} как у ${imya}`;Object.assign(gtip.style,{display:'block',left:ev.clientX+14+'px',top:ev.clientY+14+'px'})}
// граница: меняются только два соседа, сумма их долей не меняется — остальные блоки стоят на месте
function split(e,h,vert){let a=h.parentElement;
 if(vert){const p=a.parentElement;if(p.classList.contains('lst')&&!a.nextElementSibling)a=p.parentElement; // нижний блок стопки меняет высоту всего ряда
  else if(p.classList.contains('lrow'))a=p} // высоту блока в ряду меняет весь ряд
 const b=a.nextElementSibling;if(!b||b.classList.contains('wph'))return;e.preventDefault();
 const sz=el=>vert?el.getBoundingClientRect().height:el.getBoundingClientRect().width,MIN=vert?64:a.parentElement.classList.contains('lrow')?120:240; // 240 = min-width колонки в CSS
 // доли соседей — в пикселях: колонка, упёртая в min-width, иначе сдвигает чужие, и «ширина как у соседа» выходила неравной
 {const sib=[...a.parentElement.children].filter(x=>x.matches('.lcol,.lrow,.lst,.w')),px=sib.map(sz),sr=px.reduce((s,v)=>s+v,0)/px.length;
  sib.forEach((x,i)=>x.style.flexGrow=+(px[i]/sr).toFixed(4))} // ~1, как в раскладке по умолчанию
 const sa=sz(a),sb=sz(b),G=(+a.style.flexGrow)+(+b.style.flexGrow),p0=vert?e.clientY:e.clientX;
 h.classList.add('on');h.setPointerCapture(e.pointerId);const cands=lipkie(a,b,vert,sa+sb);
 const mv=ev=>{let na=Math.min(Math.max(sa+(vert?ev.clientY:ev.clientX)-p0,MIN),sa+sb-MIN),best=null;
  for(const c of cands){const d=Math.abs(c.na-na);if(d<=LIP&&c.na>=MIN&&c.na<=sa+sb-MIN&&(!best||d<best.d))best={...c,d}}
  if(best)na=best.na;a.style.flexGrow=G*na/(sa+sb);b.style.flexGrow=G*(sa+sb-na)/(sa+sb);pokazatGuide(best,a,b,vert,ev)};
 const up=()=>{guidesOff();h.classList.remove('on');h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up);saveLayout()};
 h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up)}
// блок: едет за мышью, на его месте рамка-заглушка; отпустил — встаёт туда, где заглушка.
// Поднёс к левому или правому краю другого блока (четверть ширины) — встают рядом, в один ряд.
function drag(e,w){e.preventDefault();const r=w.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
 const ph=document.createElement('div');ph.className='wph';ph.style.flexGrow=w.style.flexGrow||1;w.before(ph);
 Object.assign(w.style,{width:r.width+'px',height:r.height+'px',left:r.left+'px',top:r.top+'px'});w.classList.add('drag');document.body.append(w);
 let inRow=ph.parentElement.classList.contains('lrow');
 // заглушка сменила ряд на колонку или обратно — доля «высота/ширина» уже не та, начинаем с ровной
 const place=fn=>{fn();const now=ph.parentElement.classList.contains('lrow');if(now!==inRow){ph.style.flexGrow=1;inRow=now}ph.classList.toggle('side',now);tidyRows();markVoid()};
 const beside=(t,left)=>place(()=>{if(!t.parentElement.classList.contains('lrow')){const row=mkRow(t.style.flexGrow||1);t.before(row);t.style.flexGrow=1;row.append(t)}left?t.before(ph):t.after(ph)});
 // Объединение двух соседних колонок в общий ряд стопок с размещением блока на всю ширину под ними.
 const pod=(cL,cR)=>{if([cL,cR].some(c=>c.querySelector(':scope>.lrow')))return false;
  place(()=>{const gL=+cL.style.flexGrow||1,gR=+cR.style.flexGrow||1,row=mkRow(2);
   for(const[c,g]of[[cL,gL],[cR,gR]]){const s=mkStack(g);s.append(...[...c.children].filter(k=>k.matches('.w')));row.append(s)}
   cL.style.flexGrow=+(gL+gR).toFixed(4);ph.style.flexGrow=1;cL.append(row,ph);cR.remove()});return true};
 const mv=ev=>{w.style.left=ev.clientX-dx+'px';w.style.top=ev.clientY-dy+'px';const x=ev.clientX,y=ev.clientY,cols=[...main.children];
  {const M=main.getBoundingClientRect();if(y>M.bottom-M.height*.15)for(let i=0;i<cols.length-1;i++){const L=cols[i].getBoundingClientRect(),R=cols[i+1].getBoundingClientRect();
   if(x>L.right-30&&x<R.left+30&&pod(cols[i],cols[i+1]))return}}
  const col=cols.find(c=>{const q=c.getBoundingClientRect();return x>=q.left-12&&x<=q.right+12})||(x<cols[0].getBoundingClientRect().left?cols[0]:cols.at(-1));
  const t=kids(col).find(s=>{const q=s.getBoundingClientRect();return y>=q.top-7&&y<=q.bottom+7});
  if(!t){const sib=kids(col).find(s=>y<s.getBoundingClientRect().top);if(sib){if(sib.previousElementSibling!==ph)place(()=>sib.before(ph))}else if(col.lastElementChild!==ph)place(()=>col.append(ph));return}
  const q=t.getBoundingClientRect(),top=y<q.top+q.height*.25,bot=y>q.bottom-q.height*.25;
  if(t.classList.contains('lrow')){ // в ряду: самый верх/низ — из ряда в колонку, середина ячейки — стопкой в ней, бока ячейки — место в ряду
   const kr=q.height*.12,cell=[...t.children].find(c=>c!==ph&&c.matches('.w,.lst')&&(r=>x>=r.left+r.width*.25&&x<=r.right-r.width*.25)(c.getBoundingClientRect()));
   if(y<q.top+kr){if(t.previousElementSibling!==ph)place(()=>t.before(ph))}else if(y>q.bottom-kr){if(t.nextElementSibling!==ph)place(()=>t.after(ph))}
   else if(cell){const st=cell.classList.contains('lst')?cell:null,bl=st?[...st.children].filter(c=>c!==ph&&c.matches('.w')):[cell];
    const nx=bl.find(c=>(r=>y<r.top+r.height/2)(c.getBoundingClientRect()));
    if(st&&ph.parentElement===st&&(nx?ph.nextElementSibling===nx:st.lastElementChild===ph))return;
    place(()=>{let s=st;if(!s){s=mkStack(cell.style.flexGrow||1);cell.before(s);cell.style.flexGrow=1;s.append(cell)}nx?nx.before(ph):s.append(ph)})}
   else{const s=[...t.children].find(c=>c!==ph&&c.matches('.w,.lst')&&x<c.getBoundingClientRect().left+c.getBoundingClientRect().width/2);
    if(s){if(s.previousElementSibling!==ph)place(()=>s.before(ph))}else if(t.lastElementChild!==ph)place(()=>t.append(ph))}return}
  const edge=q.width*.25;
  if(x<q.left+edge)return beside(t,true);if(x>q.right-edge)return beside(t,false);
  if(y<q.top+q.height/2){if(t.previousElementSibling!==ph)place(()=>t.before(ph))}else if(t.nextElementSibling!==ph)place(()=>t.after(ph))};
 const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
  w.classList.remove('drag');for(const k of['width','height','left','top'])w.style[k]='';w.style.flexGrow=ph.style.flexGrow;ph.replaceWith(w);tidyRows();markVoid();saveLayout();if(w===W.chat)toBottom()};
 addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',up)}

/* отрисовка */
// «осталось ~N мин»: сколько ушло на сделанное, столько же в пропорции на остаток
const ostalos=p=>{if(!p.start||p.progress<=0||p.progress>=100||p.stoit)return'';const ms=(p.at-p.start)*(100-p.progress)/p.progress,m=Math.max(1,Math.round(ms/60000));
 return' · осталось ~'+(m<60?m+' мин':Math.floor(m/60)+' ч'+(m%60?' '+m%60+' мин':''))};
// готовое висит 10 минут и уходит
const svezhee=p=>p.progress<100||Date.now()-(p.at||0)<6e5;setInterval(()=>{if(oknoMotion.active())renderProcs()},60000);
// Готовое и остановленное убирается ✓ сразу;
// Помним id: пока дело готово или стоит, оно скрыто; пошло заново — снова видно. (Время не годится: мост его
// обновляет при каждой отправке, и галочка «не закрывала» — пользователь .)
const skryto=(()=>{try{return JSON.parse(localStorage.getItem('dzh-skryto')||'{}')}catch(e){return{}}})();
const neSkryto=p=>!(skryto[p.id]&&(p.progress>=100||p.stoit));
$('#procs')?.addEventListener('click',e=>{const b=e.target.closest('[data-skryt]');if(!b)return;const p=live.processes[b.dataset.skryt];if(!p)return;
 skryto[p.id]=Date.now();try{localStorage.setItem('dzh-skryto',JSON.stringify(skryto))}catch(e){}renderProcs()});
function renderProcs(){if(!$('#procs')){faza();return}const a=Object.values(live.processes).filter(svezhee).filter(neSkryto).sort((x,y)=>y.at-x.at).slice(0,6);$('#nProc').textContent=a.filter(p=>p.progress<100&&!p.stoit).length||'';
 setHTML($('#procs'),a.length?a.map(p=>`<div class="row"><div class="grow">${esc(p.name)}<div class="sub">${p.progress>=100?'готово':p.ag?(p.stoit?'⛔ молчит 15 мин':'работает'):p.stoit?'⛔ остановлено на '+Math.round(p.progress)+'%':Math.round(p.progress)+'%'+ostalos(p)}${p.note?' · '+esc(p.note):''}</div><div class="prog"><i style="width:${p.progress}%"></i></div></div>${p.progress>=100||p.stoit?`<button class="lnk" data-skryt="${esc(p.id)}" title="Убрать надпись" style="font-size:18px;padding:0 6px;align-self:center">✓</button>`:''}</div>`).join(''):hodL.length?'':'<div class="empty">Пока тихо. Здесь будет видно каждое моё действие.</div>');
 faza()}
/* лента хода: каждое действие сессии приходит от мода само */
let hodL=[];const tm=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const busy=()=>{if(providerState.provider!=='claude'&&typeof providerState.busy==='boolean')return providerState.busy;const h=hodL.at(-1);return !!h&&!h.konec&&Date.now()-h.at<120000};
function renderHod(){if(!$('#hod')){faza();return}const a=hodL.slice(-7).reverse();
 setHTML($('#hod'),a.map((h,i)=>h.konec?`<div class="hl done"><b>${tm(h.at)}</b><span>${h.oshibka?'⛔ '+esc(h.oshibka):'✓ ответила, жду тебя'}</span></div>`:`<div class="hl${!i?' now':''}"><b>${tm(h.at)}</b><span>${esc(h.text)}</span></div>`).join(''));
 if(!Object.keys(live.processes).length)setHTML($('#procs'),'');
 $('#nProc').textContent=a[0]&&!a[0].konec&&busy()?'работает':(Object.values(live.processes).filter(p=>p.progress<100&&!p.stoit).length||'');
 faza()}
setInterval(()=>{if(!oknoMotion.active())return;if(hodL.length&&!busy())renderHod();else faza()},15000);
// «Ждёт тебя»: сверху разрешения (ДА/НЕТ), ниже вопросы, ответа на которые я жду
function renderAsks(){const a=Object.values(live.asks),v=live.voprosy||[];$('#nAsk').textContent=(a.length+v.filter(q=>!q.otvechen).length)||'';
 setHTML($('#asks'),a.length||v.length?a.map(k=>`<div class="row" style="align-items:flex-start"><div class="grow">${esc(k.tool)}<div class="sub">${esc(k.what)}</div>${k.preview?`<pre class="pv">${esc(k.preview)}</pre>`:''}</div><button class="yes" data-id="${esc(k.id)}" data-v="1">ДА</button><button class="no" data-id="${esc(k.id)}" data-v="0">НЕТ</button></div>`).join('')
  +v.map(q=>`<div class="row" style="align-items:flex-start${q.otvechen?';opacity:.55':''}"><div class="grow">${q.otvechen?'✓':'❓'} ${esc(q.text)}<div class="sub">${q.otvechen?'ответ получен '+tm(q.otvechen)+', Джинни разбирает':'жду с '+new Date(q.at).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}</div></div><button class="yes" data-q="${esc(q.id)}" data-v="otv">ОТВЕТИТЬ</button><button class="no" data-q="${esc(q.id)}" data-v="snyat" title="Убрать: вопрос отпал">✕</button></div>`).join('')
  :'<div class="empty">Ничего не ждёт.</div>');
 document.querySelectorAll('#asks button[data-id]').forEach(b=>b.onclick=async()=>{b.disabled=true;await post('/verdict',{id:b.dataset.id,allow:b.dataset.v==='1'});delete live.asks[b.dataset.id];renderAsks()});
 document.querySelectorAll('#asks button[data-q]').forEach(b=>b.onclick=async()=>{const q=v.find(x=>x.id===b.dataset.q);if(!q)return;
  if(b.dataset.v==='otv')return fillQ(`Ответ на твой вопрос «${q.text}»: `);
  b.disabled=true;await post('/vopros-snyat',{id:q.id});live.voprosy=v.filter(x=>x.id!==q.id);renderAsks()});
 if(a.length)setPhase('ask');else renderProcs()}
// убранная сводка не возвращается после F5; новая версия той же сводки (другое содержимое) — покажется снова
const pSled=p=>JSON.stringify([p.title,p.rows]);
let pUbrano={};try{pUbrano=JSON.parse(localStorage.getItem('dzh-panels-ubrano')||'{}')}catch{}
function ubratPanel(id){const p=live.panels[id];if(!p)return;pUbrano[id]=pSled(p);try{localStorage.setItem('dzh-panels-ubrano',JSON.stringify(pUbrano))}catch{}renderPanels()}
function renderPanels(){$('#panels').onclick=e=>{const b=e.target.closest('[data-ub]');if(b)ubratPanel(b.dataset.ub)};setHTML($('#panels'),Object.values(live.panels).filter(p=>pUbrano[p.id]!==pSled(p)).map(p=>`<div class="panel" style="${p.color?'--pc:'+esc(p.color):''}"><div class="ph">${esc(p.title)}<small>от Джинни · <button class="lnk" data-ub="${esc(p.id)}" title="Убрать эту сводку из окна">убрать ×</button></small></div>${p.rows.map(r=>`<div class="row"><div class="grow">${esc(r.text)}${r.sub?`<div class="sub">${esc(r.sub)}</div>`:''}</div></div>`).join('')}</div>`).join(''))}
/* история переписки */
let chat=[],unread=0;const hm=t=>new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
// Кто ответил на самом деле: подпись «Джинни» остаётся, исполнитель виден рядом.
const OTVETCHIK={codex:'Codex',qoder:'Qoder',claude:'Claude',deepseek:'DeepSeek',opencode:'OpenCode',support:'разработчики'};
const otKogo=m=>m.who==='ty'?'ты':'Джинни'+(m.engine?` · ${OTVETCHIK[m.engine]||m.engine}`:'');
const IMG=/\.(png|jpe?g|gif|webp|bmp)$/i;
const mFiles=fs=>fs&&fs.length?`<div class="mf">${fs.map(n=>{const u='/f/'+encodeURIComponent(n),short=n.replace(/^\d{8}-\d{6}-\d+-/,'');return IMG.test(n)?`<a href="${u}" target="_blank" title="${esc(short)}" style="padding:0;border:0"><img src="${u}" alt="${esc(short)}"></a>`:`<a href="${u}" target="_blank">📎 ${esc(short)}</a>`}).join('')}</div>`:'';
const vnizu=l=>l.scrollHeight-l.scrollTop-l.clientHeight<40;
// кнопка ↓ по центру внизу переписки: видна, пока ты выше конца; нажал — плавно к последнему сообщению
function strelka(l,n){const p=l.parentElement;let b=p.querySelector(':scope>.vniz');
 if(!b){b=document.createElement('button');b.className='vniz';b.title='К последнему сообщению';b.hidden=true;b.dataset.n=0;
  b.onclick=()=>l.scrollTo({top:l.scrollHeight,behavior:'smooth'});p.appendChild(b);
  l.addEventListener('scroll',()=>{const v=vnizu(l);if(v){b.dataset.n=0}b.hidden=v;b.innerHTML='↓'+(+b.dataset.n?`<b>${b.dataset.n}</b>`:'')})}
 if(n){b.dataset.n=(+b.dataset.n||0)+n}if(!vnizu(l)){b.hidden=false;b.innerHTML='↓'+(+b.dataset.n?`<b>${b.dataset.n}</b>`:'')}}
// путь к отчёту в ответе — ссылка; нажал — полный текст открывается прямо в окне (чтец поверх всего).
const PUT_RX=/(?:[A-Za-z]:[\\/](?:[^\\/\n<>"]+[\\/])*?)?(?:[\wА-Яа-яЁё.\-]+[\\/])+[\wА-Яа-яЁё.\-]+\.(?:md|txt)\b/g;
// Строка «📎 путь» —
// карточка файла (картинка видна сразу, у всего есть «скачать»); путь к картинке/документу в тексте — ссылка «скачать».
const FAJL_RX=/(?:[A-Za-z]:[\\/](?:[^\\/\n<>"]+[\\/])*?)?(?:[\wА-Яа-яЁё.\-]+[\\/])+[\wА-Яа-яЁё.\-]+\.(?:jpe?g|png|webp|gif|pdf|mp3|wav|ogg|m4a|mp4|webm|mov|docx|xlsx|pptx|csv|zip)\b/gi;
const KARTINKA=/\.(jpe?g|png|webp|gif)$/i,ZVUK=/\.(mp3|wav|ogg|m4a)$/i;
const urlF=(p,dl)=>'/api/skachat?put='+encodeURIComponent(p)+(dl?'&dl=1':'');
const kindF=p=>/\.apk$/i.test(p)?'apk':/\.pdf$/i.test(p)?'pdf':KARTINKA.test(p)?'image':ZVUK.test(p)?'audio':/\.(mp4|webm|mov)$/i.test(p)?'video':/\.(xlsx?|csv|tsv)$/i.test(p)?'table':/\.(zip|7z|rar)$/i.test(p)?'archive':'document';
function fajlKartochka(p){const imya=p.split(/[\\/]/).pop(),skach=`<a class="lnk" href="${urlF(p,1)}" download="${esc(imya)}">скачать</a>`;
 if(!KARTINKA.test(p)&&!ZVUK.test(p))return `<a class="file-tile" data-kind="${kindF(p)}" href="${urlF(p,1)}" download="${esc(imya)}" title="Скачать ${esc(imya)}" aria-label="Скачать файл ${esc(imya)}"><span class="file-type">${esc(imya.includes('.')?imya.split('.').pop().toUpperCase():'ФАЙЛ')}</span><span class="file-title">${esc(imya.replace(/\.[^.]+$/,''))}</span></a>`;
 const vid=KARTINKA.test(p)?`<img src="${urlF(p)}" alt="" loading="lazy" data-uvel="${esc(p)}">`:ZVUK.test(p)?`<audio controls preload="none" src="${urlF(p)}"></audio>`:'';
 const otkr=/\.(md|txt)$/i.test(p)?` · <a class="put lnk" data-put="${esc(p)}">открыть</a>`:'';
 return `<div class="fajl" data-kind="${kindF(p)}"><span class="file-type">${esc(imya.split('.').pop().toUpperCase())}</span>${vid}<div class="fajlNiz"><span>📎 ${esc(imya)}</span> ${skach}${otkr}</div></div>`}
const lokalnyePuti=t=>esc(t).replace(PUT_RX,p=>`<a class="put" data-put="${p}" title="Открыть полный текст">${p}</a>`)
 .replace(FAJL_RX,p=>p.includes('class=')?p:`<a class="put-f" href="${urlF(p.replace(/&amp;/g,'&'),1)}" download title="Скачать">${p}</a>`).replace(/`([^`\n]+)`/g,'<code>$1</code>');
// Parse web links before local paths/HTML escaping so a remote PDF is never a local file.
function sPutyami(t){
 const source=String(t),tokens=/`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/(?:[^\s<>()]+|\([^\s<>()]*\))+)\)|(https?:\/\/[^\s<>`"]+)/gi;
 let html='',offset=0;
 for(const m of source.matchAll(tokens)){
  html+=lokalnyePuti(source.slice(offset,m.index));offset=m.index+m[0].length;
  if(m[1]!=null){html+=`<code>${esc(m[1])}</code>`;continue}
  let url=m[3]||m[4],suffix='';
  if(!m[3]){
   const original=url;if(source.slice(0,m.index).endsWith('**')&&url.endsWith('**'))url=url.slice(0,-2);
   url=url.replace(/[.,;:!?…»'”]+$/g,'');
   for(const[open,close]of[['(',')'],['[',']'],['{','}']])while(url.endsWith(close)&&url.split(close).length>url.split(open).length)url=url.slice(0,-1);
   suffix=original.slice(url.length);
  }
  let valid=false;try{const parsed=new URL(url);valid=['http:','https:'].includes(parsed.protocol)&&!!parsed.hostname}catch{}
  html+=valid?`<a class="web-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(m[2]||url)}</a>${esc(suffix)}`:esc(m[0]);
 }
 return html+lokalnyePuti(source.slice(offset));
}
// Команда = строка с «! »
// в начале или блок в ```; рисуем тёмным блоком моноширинным, кнопка кладёт текст в буфер.
const kodBlok=k=>`<div class="kod"><pre>${esc(k)}</pre><button class="lnk kop" title="Скопировать в буфер">копировать</button></div>`;
function tekstHtml(t){return String(t).split(/```[a-z]*\n?([\s\S]*?)```/).map((ch,i)=>i%2?kodBlok(ch.replace(/\n$/,'')):
 ch.split('\n').map(s=>/^\s*! \S/.test(s)?'\u0000'+kodBlok(s.trim())+'\u0000':/^\s*📎\s*\S/.test(s)?'\u0000'+fajlKartochka(s.replace(/^\s*📎\s*/,'').trim())+'\u0000':sPutyami(s)).join('\n')).join('\u0000')
 .replace(/\n?\u0000\n?/g,'')}
document.addEventListener('click',async e=>{const b=e.target.closest('.kop');if(!b)return;const t=b.previousElementSibling.textContent;
 try{await navigator.clipboard.writeText(t)}catch{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();document.execCommand('copy');a.remove()}
 b.textContent='скопировано ✓';setTimeout(()=>b.textContent='копировать',1500)});
function mdHtml(src){const e=s=>esc(s).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>');
 const L=src.replace(/\r/g,'').replace(/^---\n[\s\S]*?\n---\n/,'').split('\n');let o='',spisok=false,tab=false,abz=[];
 // строки одного абзаца склеиваем: жирный и цитата, разбитые переносом, не рвутся
 const zakryt=()=>{if(abz.length){o+='<p>'+e(abz.join(' '))+'</p>';abz=[]}if(spisok){o+='</'+spisok+'>';spisok=false}if(tab){o+='</table>';tab=false}};
 for(const s of L){let m;
  if(/^\|/.test(s)){if(/^\|[\s|:-]+\|$/.test(s))continue;if(abz.length||spisok){const t=tab;tab=false;zakryt();tab=t}if(!tab){o+='<table>';tab=true}o+='<tr>'+s.replace(/^\||\|$/g,'').split('|').map(c=>'<td>'+e(c.trim())+'</td>').join('')+'</tr>';continue}
  // /«1)» — нумерованный список, а не абзац; spisok хранит вид списка: 'ul' | 'ol'
  if((m=s.match(/^\s*[-*] (.*)/))||(m=s.match(/^\s*(\d{1,3})[.)] (.*)/))){const vid=m.length>2?'ol':'ul',txt=m[m.length-1];
   if(spisok!==vid)zakryt();   // абзац, таблица или список другого вида закрываются; свой вид продолжается
   if(!spisok){o+=vid==='ol'?`<ol${+m[1]>1?` start="${+m[1]}"`:''}>`:'<ul>';spisok=vid}o+='<li>'+e(txt)+'</li>';continue}
  if(spisok&&/^\s{2,}\S/.test(s)){o=o.replace(/<\/li>$/,' '+e(s.trim())+'</li>');continue}   // продолжение пункта
  if((m=s.match(/^(#{1,4}) (.*)/))){zakryt();o+=`<h${m[1].length+1}>${e(m[2])}</h${m[1].length+1}>`}
  else if((m=s.match(/^> ?(.*)/))){zakryt();o+='<blockquote>'+e(m[1])+'</blockquote>'}
  else if(s.trim()){if(spisok||tab){const a=abz;abz=[];zakryt();abz=a}abz.push(s.trim())}
  else zakryt()}
 zakryt();return o}
async function otkrytFajl(put){const d=$('#chtec');d.hidden=false;$('#chtecPut').textContent=put;$('#chtecTelo').innerHTML='<div class="empty">Открываю…</div>';
 try{const r=await fetch('/api/fajl?put='+encodeURIComponent(put)),j=await r.json();
  $('#chtecTelo').innerHTML=r.ok?mdHtml(j.tekst):`<div class="empty">${esc(j.oshibka||'не открылся')}${r.status===404&&!j.oshibka?'':''}</div>`}
 catch{$('#chtecTelo').innerHTML='<div class="empty">Мост не отдал файл: старый мост? Переподключи его (/mcp → dzhinni).</div>'}
 $('#chtecTelo').scrollTop=0}
document.addEventListener('click',e=>{const a=e.target.closest('a.put');if(a){e.preventDefault();otkrytFajl(a.dataset.put)}});
// картинка в карточке → крупно в чтеце
document.addEventListener('click',e=>{const i=e.target.closest('img[data-uvel]');if(!i)return;const d=$('#chtec');d.hidden=false;
 $('#chtecPut').textContent=i.dataset.uvel;$('#chtecTelo').innerHTML=`<img src="${i.src}" alt="" style="max-width:100%;display:block;margin:0 auto">`});
// Документы: всё, на что Джинни сослалась, — здесь; «в архив» убирает с глаз, в архиве — «вернуть»
let doki=[],dokArh=false;
const dnMes=t=>{const d=new Date(t);return d.toLocaleDateString('ru',{day:'numeric',month:'short'})+' '+hm(t)};
function renderDoki(){const v=doki.filter(d=>!!d.arhiv===dokArh),na=doki.filter(d=>d.arhiv).length;
 $('#nDok').textContent=dokArh?'':(doki.length-na||'');$('#bDokArh').textContent=dokArh?'← назад':'архив'+(na?' '+na:'');
 setHTML($('#doki'),v.length?v.map(d=>`<div class="row dok"><div class="grow"><a class="put" data-put="${esc(d.put)}" title="${esc(d.put)}">${esc(d.nazv)}</a><div class="sub">${dnMes(d.posl)}${d.raz>1?' · упоминала '+d.raz+' раз':''} · ${esc(d.put.split('/').slice(-2,-1)[0]||'')}</div></div><button class="lnk" data-dok="${esc(d.put)}" data-arh="${dokArh?0:1}" title="${dokArh?'Вернуть в список':'Убрать в архив — можно вернуть'}">${dokArh?'вернуть':'в архив'}</button></div>`).join(''):`<div class="empty">${dokArh?'Архив пуст.':'Здесь соберутся отчёты и разборы, на которые я ссылаюсь в ответах.'}</div>`)}
async function loadDoki(){try{doki=await (await fetch('/api/dokumenty')).json();renderDoki();if(clientInterface&&!dokArh&&!doki.length)$('#doki .empty').textContent='Здесь появятся распознанные ссылки на файлы .md и .txt из ответов.'}catch{}}
$('#bDokArh').onclick=()=>{dokArh=!dokArh;renderDoki()};
$('#doki').addEventListener('click',async e=>{const b=e.target.closest('[data-dok]');if(!b)return;b.disabled=true;
 try{await post('/dokument',{put:b.dataset.dok,arhiv:b.dataset.arh==='1'})}catch{}
 loadDoki()});
loadDoki();
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#chtec').hidden)$('#chtec').hidden=true});
// Переписка показывает разметку ответов: без неё `**` и `##` видны как мусор.
// Форматирование и обновление только изменившихся сообщений — chat-render.js.
const chatOnMap=()=>!main.hidden&&main.contains(W.chat);
function toggleHist(open){$('#hist').classList.toggle('open',open);$('#bHist').classList.toggle('on',open);if(open){unread=0;renderChat()}}
// переписка на карте — «История» листает её вниз и подсвечивает; нет на карте — выезжает шторка
$('#bHist').onclick=()=>{if(chatOnMap()&&!$('#hist').classList.contains('open')){unread=0;renderChat();W.chat.classList.remove('flash');void W.chat.offsetWidth;W.chat.classList.add('flash');return}
 toggleHist(!$('#hist').classList.contains('open'))};
$('#bHistX').onclick=()=>toggleHist(false);
$('#bPin').onclick=()=>{if(!main.contains(W.chat)){const c=main.children[Math.min(1,main.children.length-1)];W.chat.style.flexGrow=2;c.append(W.chat);markVoid();renderTray();saveLayout()}toggleHist(false);setView('map');toBottom()};
{let L=null;try{L=JSON.parse(localStorage.getItem('dzh-layout')||'null');if(L&&L.cols&&!localStorage.getItem('dzh-layout-v1-clean')){L.cols=L.cols.map(c=>({...c,items:(c.items||[]).filter(it=>it[0]!=='focus')}));L.hidden=[...new Set([...(L.hidden||[]),'focus'])];localStorage.setItem('dzh-layout',JSON.stringify(L));localStorage.setItem('dzh-layout-v1-clean','1')}}catch{}applyLayout(L&&L.cols?L:DEF)}
// карта стоит НАД полем ввода: поле остаётся во всю ширину
new ResizeObserver(()=>document.body.style.setProperty('--fh',$('footer').offsetHeight+'px')).observe($('footer'));
new ResizeObserver(()=>document.body.style.setProperty('--hh',$('header').offsetHeight+'px')).observe($('header'));
document.addEventListener('click',e=>{const menu=$('#codexMenu');if(menu.open&&!menu.contains(e.target))menu.open=false});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#codexMenu').open=false});
new ResizeObserver(()=>document.body.style.setProperty('--eh',$('#edbar').offsetHeight+'px')).observe($('#edbar'));
// своё окно (pywebview) глушит клавиши браузера — F5 и Ctrl+R делаем сами
document.addEventListener('keydown',e=>{if(e.key==='F5'||(e.ctrlKey&&(e.key==='r'||e.key==='к'))){e.preventDefault();location.reload()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(edit)setEdit(false);toggleHist(false);$('#otz')?.classList.remove('open');$('#quickNotes')?.classList.remove('open');if($('footer').classList.contains('big'))bigMode(false)}});

// железо — своим блоком «Ноутбук»: градусы и нагрузка процессора и видеокарты, раз в 10 с
const gradC=(c,zh,kr)=>c==null?'#4da3ff':c<zh?'#5affc8':c<kr?'#ffb547':'#ff5a7a';
async function loadZhelezo(){let z;try{z=await (await fetch('/api/zhelezo')).json()}catch{return}const rows=[];
 rows.push({l:'Процессор',p:z.cpu.nagruzka??null,c:gradC(z.cpu.c,80,90),sub:z.cpu.c!=null?`${Math.round(z.cpu.c)}° · опасно с 90°`:'Датчик температуры недоступен'});
 if(z.ram){const g=b=>(b/2**30).toFixed(1);rows.push({l:'Оперативная память',p:z.ram.pc,c:z.ram.pc<75?'#5affc8':z.ram.pc<90?'#ffb547':'#ff5a7a',sub:`занято ${g(z.ram.zanyato)} из ${g(z.ram.vsego)} ГБ · свободно ${g(z.ram.vsego-z.ram.zanyato)} ГБ`})}
 if(z.gpu){const g=z.gpu,parts=[];if(g.spit)parts.push('спит');else if(Number.isFinite(g.c))parts.push(Math.round(g.c)+'°');if(Number.isFinite(g.pamyat)&&g.pamyatVsego>0)parts.push(`память ${g.pamyat}% (${(g.pamyatMb/1024).toFixed(1)} из ${(g.pamyatVsego/1024).toFixed(0)} ГБ)`);else if(Number.isFinite(g.pamyatMb)&&g.pamyatMb>0)parts.push(`видеопамять ${(g.pamyatMb/1024).toFixed(1)} ГБ`);else if(g.name)parts.push(g.name);rows.push({l:'Видеокарта',p:Number.isFinite(g.nagruzka)?g.nagruzka:null,c:gradC(g.c,75,85),sub:parts.join(' · ')||(g.name||'Активна')})}
 $('#zhel').innerHTML=rows.map(r=>`<div class="meter" style="--pc:${r.c}"><div class="top"><span>${r.l}</span><b>${r.p==null?'—':Math.round(r.p)+'%'}</b></div><div class="prog"><i style="width:${Math.min(100,r.p??0)}%"></i></div><div class="sub">${esc(r.sub)}</div></div>`).join('')}
loadZhelezo();setInterval(()=>{if(oknoMotion.active())loadZhelezo()},10000);

function showVoice(){const b=$('#bVoice');b.classList.toggle('on',voiceOn);b.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>'+(voiceOn?'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>':'<path d="m16 9 6 6m0-6-6 6"/>')+'</svg>';b.setAttribute('aria-pressed',String(voiceOn));b.setAttribute('aria-label',voiceOn?'Выключить озвучку':'Включить озвучку');b.title=voiceOn?'Выключить озвучку':'Включить озвучку'}
$('#bZnayu').onclick=()=>setView('znayu');
async function loadZnayu(){let z;try{z=await (await fetch('/api/znayu')).json()}catch{$('#znSum').textContent='Мост не отвечает.';return}
 const n=z.vsego%100,f=n%10,sl=n>10&&n<15?'вещей':f===1?'вещь':f>1&&f<5?'вещи':'вещей';
 $('#znSum').textContent=z.vsego?`Я знаю о тебе ${z.vsego} ${sl}${z.zaNedelyu?` · ${z.zaNedelyu} — новое за эту неделю`:''}`:'Мы ещё не знакомились. Нажми «Познакомимся» — и здесь появится то, что я о тебе узнаю.';
 const stroka=s=>`<div class="zs${s.novoe?' nov':''}"><div>${s.novoe?'<b>новое</b>':''}${esc(s.chto)}</div><small>${esc(s.otkuda||'')}</small></div>`;
 setHTML($('#znBody'),(z.novoe.length?`<div class="zng">Новое за неделю</div>${z.novoe.map(s=>stroka({...s,otkuda:s.razdel})).join('')}`:'')+z.razdely.map(r=>`<div class="zng">${esc(r.t)} · ${r.stroki.length}</div>${r.stroki.map(stroka).join('')}`).join(''))}
const zSend=t=>{fillQ(t);$('#hint').textContent='Вопрос в поле внизу: отправь Enter или сотри.'}; // не отправлять за человека
$('#zPomog').onclick=()=>zSend('Как то, что ты обо мне знаешь, помогает в моих делах? Конкретно, на примерах этой недели.');
$('#zPrav').onclick=()=>{setView('map');fillQ('Поправь, что ты обо мне знаешь: ')};
$('#zNazad').onclick=()=>setView('map');
if(document.documentElement.dataset.client==='true'){voiceOn=false;stopGolos();$('#bVoice').hidden=true;$('#bMic').hidden=true}
$('#bVoice').onclick=()=>{if(document.documentElement.dataset.client==='true')return;voiceOn=!voiceOn;try{localStorage.setItem('dzh-voice',voiceOn?'1':'0')}catch{};showVoice();if(voiceOn)speak('Голос включён.');else stopGolos()};showVoice();
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;
/* слух: окно само пишет микрофон (16 кГц), мост расшифровывает на этом компьютере (GigaAM); без модели — распознавание браузера */
let zap=null;
const micImya=st=>{const t=st.getAudioTracks()[0];return t?t.label.replace(/^(По умолчанию|Default)\s*-\s*/i,''):''};
async function mic(){if(zap)return stopZap();if(rec){rec.stop();return}
 let est=false;try{est=(await(await fetch('/api/slukh')).json()).est}catch{}
 if(!est)return micSR();
 let st;try{st=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}})}
 catch(e){$('#hint').textContent=e.name==='NotAllowedError'?'Микрофон не разрешён окну Джинни.':'Микрофон не найден: Windows не отдаёт звук. Проверь «Параметры → Звук → Ввод».';return}
 const ctx=new AudioContext({sampleRate:16000}),src=ctx.createMediaStreamSource(st),proc=ctx.createScriptProcessor(2048,1,1),imya=micImya(st);
 // текст по ходу речи: замолчал на полсекунды — фраза уходит в расшифровку и через секунду встаёт в поле
 // нарезчик (slukh_okno.js) звук не выбрасывает: хвост раз в 1,5 с — черновиком, после паузы — набело
 const z={ctx,st,src,proc,nar:new DzhNarezchik(),max:0,lvl:0,t0:Date.now(),base:$('#q').value.replace(/\s*$/,''),chasti:[],chern:'',chernIdet:false,zhdut:[]};zap=z;
 proc.onaudioprocess=e=>{if(zap!==z)return;const d=new Float32Array(e.inputBuffer.getChannelData(0));let m=0;for(const x of d)m=Math.max(m,Math.abs(x));
  z.lvl=m;z.max=Math.max(z.max,m);const k=z.nar.kadr(d);if(k)otpravitKusok(z,k);
  if((Date.now()-z.t0)>=600e3)stopZap()};
 z.chernT=setInterval(()=>{if(zap!==z||z.chernIdet||!z.nar.estRech())return;z.chernIdet=true;const n=z.chasti.length;
  slushat(z.nar.hvost()).then(r=>{if(zap===z&&n===z.chasti.length&&r.ok){z.chern=r.text||'';pokazat(z)}}).catch(()=>{}).finally(()=>z.chernIdet=false)},1500);
 src.connect(proc);proc.connect(ctx.destination);stopGolos();$('#bMic').classList.add('rec');setPhase('think','слушает');
 const show=()=>{const s=Math.round((Date.now()-z.t0)/1000);$('#hint').textContent=`Слушаю${imya?' через «'+imya+'»':''} · ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')} ${'▮'.repeat(Math.min(8,Math.round(z.lvl*24)))} — текст появляется по ходу; договоришь — нажми 🎙.`};
 show();z.timer=setInterval(show,200)}
const slushat=a=>{const pcm=Int16Array.from(a,x=>Math.max(-1,Math.min(1,x))*32767);
 return fetch('/slukh',{method:'POST',headers:{'x-dzhinni':'1','content-type':'application/octet-stream'},body:pcm.buffer}).then(r=>r.json())};
// набранное руками во время диктовки не затирать — поле изменилось не нами → оно и есть новая основа
function pokazat(z){const q=$('#q');
 if(z.pisano!==undefined&&q.value!==z.pisano){const i=z.tPrev?q.value.lastIndexOf(z.tPrev):-1;
  if(i>=0)z.base=(q.value.slice(0,i)+q.value.slice(i+z.tPrev.length)).replace(/\s+$/,'');else{z.base=q.value.replace(/\s*$/,'');z.ot=z.pokazano||0;z.chern=''}}
 const t=[...z.chasti.slice(z.ot||0),z.chern].filter(Boolean).join(' ');q.value=(z.base&&t?z.base+' ':z.base)+t;z.pisano=q.value;z.tPrev=t;z.pokazano=z.chasti.length;grow()}
function otpravitKusok(z,a){const i=z.chasti.length;z.chasti.push(z.chern);z.chern='';
 z.zhdut.push(slushat(a).then(r=>{if(!r.ok)throw new Error(r.error||'не вышло');z.chasti[i]=r.text||'';pokazat(z)}).catch(e=>{z.oshibka=e.message}))}
async function stopZap(){const z=zap;zap=null;clearInterval(z.timer);clearInterval(z.chernT);try{z.proc.disconnect();z.src.disconnect()}catch{};z.st.getTracks().forEach(t=>t.stop());z.ctx.close();$('#bMic').classList.remove('rec');
 if(z.max<0.01&&!z.chasti.length){setPhase('idle');$('#hint').textContent='Ничего не услышала: микрофон молчит. Проверь, тот ли выбран в Windows («Параметры → Звук → Ввод»).';return}
 const ost=z.nar.konec();if(ost&&ost.length>=16000*0.3)otpravitKusok(z,ost);
 setPhase('think','расшифровываю');$('#hint').textContent='Дописываю последнюю фразу…';
 await Promise.all(z.zhdut);
 $('#hint').textContent=z.oshibka?'Не расшифровала: '+z.oshibka:z.chasti.some(Boolean)?'Готово. Проверь текст и отправь.':'Слов не разобрала — скажи ещё раз чуть ближе к микрофону.';
 setPhase('idle');$('#q').focus()}
fetch('/api/slukh').catch(()=>{}); // модель грузится заранее, чтобы первая запись не ждала
function micSR(){if(!SR){$('#hint').textContent='Этот браузер не умеет слушать. Окно Edge умеет: открой ярлык «Джинни».';return}
 if(rec){rec.stop();return}
 rec=new SR();rec.lang='ru-RU';rec.continuous=true;rec.interimResults=true;const base=$('#q').value.replace(/\s*$/,'');stopGolos();
 let heard=false,failed=false;
 const ERR={'not-allowed':'Микрофон не разрешён: разреши его окну (значок замка слева от адреса).','service-not-allowed':'Микрофон не разрешён: разреши его окну (значок замка слева от адреса).',
  'audio-capture':'Микрофон не найден: Windows не отдаёт звук. Проверь «Параметры → Звук → Ввод».','network':'Нет связи со службой распознавания: Edge распознаёт речь через интернет. Проверь VPN и антивирус.',
  'no-speech':'Ничего не услышала: микрофон молчит. Проверь, тот ли выбран в Windows («Параметры → Звук → Ввод»).'};
 rec.onresult=e=>{heard=true;let s='';for(const r of e.results)s+=r[0].transcript;$('#q').value=(base?base+' ':'')+s.trim();grow()};
 rec.onerror=e=>{failed=true;$('#hint').textContent=ERR[e.error]||('Голос не распознан: '+e.error)};
 rec.onend=()=>{const m=rec&&rec.micName;rec=null;$('#bMic').classList.remove('rec');setPhase('idle');$('#q').focus();
  if(!heard&&!failed)$('#hint').textContent='Ничего не услышала'+(m?' через «'+m+'»':'')+'. Если микрофон не тот — смени его в Windows: «Параметры → Звук → Ввод».'};
 const r0=rec;rec.start();$('#bMic').classList.add('rec');setPhase('think','слушает');$('#hint').textContent='Слушаю… нажми 🎙 ещё раз, когда договоришь, и отправь.';
 /* какой микрофон слушает: распознавание берёт микрофон Windows по умолчанию, выбрать другой из окна нельзя */
 navigator.mediaDevices?.getUserMedia({audio:true}).then(st=>{const t=st.getAudioTracks()[0];const n=t?t.label.replace(/^(По умолчанию|Default)\s*-\s*/i,''):'';st.getTracks().forEach(x=>x.stop());
  if(n&&rec===r0){r0.micName=n;if(!heard&&!failed)$('#hint').textContent='Слушаю через «'+n+'»… нажми 🎙 ещё раз, когда договоришь, и отправь.'}}).catch(()=>{})}
$('#bMic').onclick=mic;

/* поле ввода: растёт по тексту, ⤢ — большое */
const grow=()=>{const q=$('#q');if($('footer').classList.contains('big'))return;q.style.height='auto';q.style.height=q.scrollHeight+'px'};
function bigMode(on){$('footer').classList.toggle('big',on);$('#bBig').textContent=on?'⤡':'⤢';$('#q').style.height='';if(!on)grow();$('#q').focus();
 $('#hint').textContent=on?'Большое поле: Enter — новая строка, Ctrl+Enter — отправить, Esc — свернуть.':''}
$('#bBig').onclick=()=>bigMode(!$('footer').classList.contains('big'));
$('#q').addEventListener('input',grow);
$('#q').addEventListener('keydown',e=>{if(e.key!=='Enter')return;const big=$('footer').classList.contains('big');if(big?(e.ctrlKey||e.metaKey):!(e.shiftKey||e.ctrlKey)){e.preventDefault();$('#f').requestSubmit()}});

let sayT;function say(t){speak(t);clearInterval(sayT);const el=$('#say');let i=0;faza();sayT=setInterval(()=>{i=oknoMotion.active()?i+2:t.length;el.textContent=t.slice(0,i);if(i>=t.length)clearInterval(sayT)},18)}

// «Фокус»: ✓ — закрыть (статус «Готово»), ✎ — поправить название и статус. Прямо из окна, без Claude и без лимитов;
// правку вносит мост в задача.md, в Notion её увезёт синк задач
const STAT=['Сегодня','На неделю','Оформлено','Входящие','Готово','Архив'];let fTasks=[],fEdit=null;
function renderFocus(){setHTML($('#focus'),fTasks.length?fTasks.map(t=>fEdit===t.slug
 ?`<div class="row" data-s="${esc(t.slug)}" style="align-items:flex-start"><div class="grow"><input class="fin" value="${esc(t.title)}"><select class="fst">${STAT.map(x=>`<option${x===t.status?' selected':''}>${x}</option>`).join('')}</select></div><button class="yes" data-f="save">Сохранить</button><button class="no" data-f="cancel">Отмена</button></div>`
 :`<div class="row" data-s="${esc(t.slug||'')}"><div class="grow"><span class="zkw" data-zk="${esc(t.slug||'')}" title="Открыть задачу">${esc(t.title)}</span><div class="sub">${esc([t.area,t.proekt,t.srok&&'срок '+t.srok].filter(Boolean).join(' · '))}</div></div>${t.slug?'<button class="fk" data-f="done" title="Закрыть задачу: статус «Готово»">✓</button><button class="fk" data-f="edit" title="Поправить название и статус">✎</button>':''}</div>`).join('')
 :'<div class="empty">Фокус пуст — открой вкладку «Задачи» и отметь ☆ главные.</div>')}
$('#focus').addEventListener('click',async e=>{const b=e.target.closest('[data-f]');if(!b)return;const row=b.closest('[data-s]'),slug=row.dataset.s,t=fTasks.find(x=>x.slug===slug),f=b.dataset.f;if(!t)return;
 if(f==='edit'){fEdit=slug;renderFocus();$('#focus .fin')?.focus();return}
 if(f==='cancel'){fEdit=null;renderFocus();return}
 const pr=[];if(f==='done')pr.push(['статус','Готово']);else{const ti=row.querySelector('.fin').value.trim(),st=row.querySelector('.fst').value;if(ti&&ti!==t.title)pr.push(['название',ti]);if(st!==t.status)pr.push(['статус',st])}
 b.disabled=true;let err='';
 for(const[pole,znach]of pr){const r=await post('/zadacha',{slug,pole,znach}).catch(()=>({ok:false,error:'мост не знает этой команды — перезапусти окно Джинни'}));if(!r.ok){err=r.error||'не вышло';break}}
 fEdit=null;$('#hint').textContent=err?'Задача не поправилась: '+err:!pr.length?'Ничего не поменялось.':f==='done'?`Закрыла «${t.title}». В Notion уедет синком.`:'Поправила задачу. В Notion уедет синком.';
 await loadState().catch(()=>{});renderFocus()});
$('#focus').addEventListener('keydown',e=>{if(!e.target.matches('.fin'))return;if(e.key==='Enter'){e.preventDefault();$('#focus [data-f=save]').click()}else if(e.key==='Escape'){e.stopPropagation();fEdit=null;renderFocus()}});
async function loadState(){
 const s=await (await fetch('/api/state')).json();
 // «нажал F5 и всё пропало». История — первой: ошибка ниже в этой функции больше не оставляет окно без переписки.
 if(s.live?.chat&&s.live.chat.length>=chat.length){chat=s.live.chat.slice(-300);try{renderChat()}catch{}}
 renderProvider(s.provider);
 $('#tRepo').textContent=s.repo.split(/[\\/]/).slice(-1)[0];
 fTasks=s.tasks;if(!fEdit)renderFocus(); // пока правишь — минутное обновление поле не сбивает
 {const n=$('#nFocus');n.textContent=s.counts.focusMax?`${s.counts.focus} из ${s.counts.focusMax} · все задачи →`:`сегодня ${s.counts.today??0} · неделя ${s.counts.week??0}`;n.style.cursor='pointer';n.onclick=()=>setView('zad')}
 {const z=s.znayu,b=$('#bZnayu');b.hidden=!z||!z.vsego;if(z&&z.vsego){const n=z.vsego%100,f=n%10;b.textContent=`Знаю о тебе: ${z.vsego}${z.zaNedelyu?` · +${z.zaNedelyu}`:''}`;b.title=`Я знаю о тебе ${z.vsego} ${n>10&&n<15?'вещей':f===1?'вещь':f>1&&f<5?'вещи':'вещей'}${z.zaNedelyu?`, из них ${z.zaNedelyu} — новое за неделю`:''}. Нажми — покажу всё по разделам`}}
 const c=s.counts;$('#kv').innerHTML=[['живых задач',c.tasksLive],['навыков',c.skills],['механик',c.mech],['модулей механик',c.mechModules]].map(([a,b])=>`<div><label>${a}</label><span class="big">${b==null?'—':Number(b).toLocaleString('ru-RU')}</span></div>`).join('');
 s.live.processes.forEach(p=>live.processes[p.id]=p);s.live.asks.forEach(k=>live.asks[k.id]=k);live.voprosy=s.live.voprosy||[];s.live.panels.forEach(p=>live.panels[p.id]=p);
 renderProcs();renderAsks();renderPanels();if(s.live.said&&!$('#say').textContent)$('#say').textContent=s.live.said.text;
 if(s.live.zamer){zamer=s.live.zamer;renderZamer()}
 if(s.live.hod&&s.live.hod.length>=hodL.length){hodL=s.live.hod;renderHod()}
}
function connect(){
 const es=window.dzhEs=new EventSource('/events');   // один поток на окно — виджеты (vidzhety_okno.js) слушают его же
 es.addEventListener('provider',e=>renderProvider(JSON.parse(e.data)));
 es.onopen=()=>{$('#dLink').classList.add('on');$('#tLink').textContent='';$('#tLink').hidden=true;fetch('/api/provider').then(r=>r.json()).then(renderProvider).catch(()=>{})};
 es.onerror=()=>{$('#dLink').classList.remove('on');$('#tLink').textContent='нет связи — сессия Джинни закрыта?'};
 es.addEventListener('say',e=>say(JSON.parse(e.data).text));
 es.addEventListener('process',e=>{const p=JSON.parse(e.data);if(p.ubrat)delete live.processes[p.id];else live.processes[p.id]=p;renderProcs()});
 es.addEventListener('panel',e=>{const p=JSON.parse(e.data);if(p.ubrat)delete live.panels[p.id];else live.panels[p.id]=p;renderPanels()});
 es.addEventListener('ask',e=>{const k=JSON.parse(e.data);live.asks[k.id]=k;renderAsks()});
 es.addEventListener('voprosy',e=>{live.voprosy=JSON.parse(e.data);renderAsks()});
 es.addEventListener('doki',e=>{doki=JSON.parse(e.data);renderDoki()});
 es.addEventListener('asked',e=>{delete live.asks[JSON.parse(e.data).id];renderAsks()});
 es.addEventListener('chat',e=>{const m=JSON.parse(e.data);chat.push(m);chat=chat.slice(-300);if(m.who==='ya'&&!$('#hist').classList.contains('open')&&!chatOnMap())unread++;renderChat()});
 es.addEventListener('zamer',e=>{zamer=JSON.parse(e.data);renderZamer()});
 es.addEventListener('hod',e=>{const h=JSON.parse(e.data);hodL.push(h);hodL=hodL.slice(-40);renderHod();ostrHod(h)});
 es.addEventListener('say',e=>ostrSay(JSON.parse(e.data).text));
}
/* вложения: Ctrl+V скриншота, 📎, перетаскивание; файл сразу уезжает на мост, в сессию уходит путь */
initializeChatComposer();
if(document.documentElement?.dataset?.client!=='true'){$('#core').onclick=mic;$('#core').title='Нажми и скажи'}
else{$('#core').removeAttribute('title');$('#core').style.cursor='default'}
setInterval(()=>{if(oknoMotion.active())$('#clock').textContent=new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})},1000);
setInterval(()=>{if(oknoMotion.active())loadState().catch(()=>{})},60000);
// Мост мог перезапускаться в момент F5: повторить через 3 с, а не ждать минутного опроса с пустой перепиской.
const pervayaZagruzka=n=>loadState().catch(()=>{$('#focus').innerHTML='<div class="empty">Мост не отвечает.</div>';if(n<20)setTimeout(()=>pervayaZagruzka(n+1),3000)});
pervayaZagruzka(0);connect();

/* вики и пульт: команды Claude Code, наши навыки и механики */
let wiki=null,wf='all';
function setView(v){if(document.documentElement.dataset.interface==='user'&&!['map','dnev','none'].includes(v)&&!String(v).startsWith('p-'))v='map';{const p=$('#vProiz'),t=$('#tProiz');if(p&&t){p.hidden=v!=='proiz';t.classList.toggle('on',v==='proiz');document.body.classList.toggle('production-view',v==='proiz');if(v==='proiz'&&!$('#productionFrame').getAttribute('src'))$('#productionFrame').src='/production'}}{const k=$('#vObuch'),kt=$('#tObuch');if(k&&kt){k.hidden=v!=='obuch';kt.classList.toggle('on',v==='obuch');document.body.classList.toggle('obuchenie-view',v==='obuch');if(v==='obuch'&&!$('#obuchenieFrame').getAttribute('src'))$('#obuchenieFrame').src='/obuchenie?embed=1'}}{const z=$('#vZad');if(z){z.hidden=v!=='zad';$('#tZad').classList.toggle('on',v==='zad');if(v==='zad')loadZad()}}$('#vDnev').hidden=v!=='dnev';if(v==='dnev')loadDnev();$('#tDnev').classList.toggle('on',v==='dnev');$('#vMap').hidden=v!=='map';$('#vWiki').hidden=v!=='wiki';$('#vIst').hidden=v!=='ist';$('#vZnayu').hidden=v!=='znayu';$('#vOstr').hidden=v!=='ostr';$('#vZdor').hidden=v!=='zdor';if(v==='zdor')loadZdor();if(v==='znayu')loadZnayu();ostrVkl(v==='ostr');
 $('#tMap').classList.toggle('on',v==='map');$('#tWiki').classList.toggle('on',v==='wiki');$('#tIst').classList.toggle('on',v==='ist');$('#tOstr').classList.toggle('on',v==='ostr');$('#tZdor').classList.toggle('on',v==='zdor');
 if(v!=='map'&&edit)setEdit(false);
 try{localStorage.setItem('dzh-view',v)}catch{};if(v==='wiki'&&!wiki)loadWiki();if(v==='ist')loadIst(istDen);window.scrollTo(0,0)}
/* дневник: реплики идут не мне в работу, а спутнику «Мудрому» (мост → dnevnik.mjs) */
let dnev={msgs:[],idet:false,dumaet:false,zap:[],zapIdet:false};
const dnevView=()=>!$('#vDnev').hidden;
/* мост дневник → «Знаю о тебе»: после разговора спутник предлагает «запомнить?», пишется только «Да» */
const zapBlok=()=>dnev.zap.length?`<div class="dzap"><b>Запомнить о тебе?</b><small>Это ляжет в «Знаю о тебе». Без твоего «да» ничего не запишу.</small>${dnev.zap.map(z=>`<div class="dzs"><span>${esc(z.chto)}<small>${esc(z.razdel)}</small></span><button class="chipf" data-zap="${esc(z.id)}" data-da="1">Да</button><button class="chipf" data-zap="${esc(z.id)}">Нет</button></div>`).join('')}</div>`:dnev.zapIdet?'<div class="dpust">Спутник перечитывает разговор и сейчас предложит, что запомнить о тебе…</div>':'';
let dnevT,dnevMoy=false; // dnevMoy — свой запрос в полёте; dumaet с сервера без своего запроса = окно открыли посреди ответа
function renderDnev(vniz){const L=$('#dLog');const m=dnev.msgs;const byl=innerHeight+scrollY>=document.body.scrollHeight-80; // опрос раз в 8 с не дёргает вниз читающего выше
 setHTML(L,zapBlok()+(m.length?m.map(x=>`<div class="dm ${x.role==='user'?'ty':'ch'}"><small>${x.role==='user'?'ты':'спутник'} · ${hm(x.at)}</small>${esc(x.content)}</div>`).join(''):'<div class="dpust">Здесь можно побыть с собой. Нажми «Начать» — спутник откроет разговор. Или просто начни говорить сам.</div>')+(dnev.dumaet?'<div class="dm ch dum">спутник слушает и думает…</div>':''));
 $('#dNach').hidden=dnev.idet;$('#dKon').hidden=!dnev.idet;$('#dKon').disabled=dnev.dumaet;if(vniz||byl)window.scrollTo(0,document.body.scrollHeight)}
async function loadDnev(){try{const s=await (await fetch('/api/dnevnik')).json();dnev={...dnev,msgs:s.msgs,idet:s.idet,dumaet:dnevMoy||!!s.dumaet,zap:s.zapomnit||[],zapIdet:!!s.zapiskaIdet}}catch{$('#dSub').textContent='Мост не отвечает.'}renderDnev()
 clearTimeout(dnevT);if((dnev.zapIdet||dnev.dumaet&&!dnevMoy)&&dnevView())dnevT=setTimeout(loadDnev,8000)} // записка пишется ~минуту — ждём строки «запомнить?»
$('#dLog').addEventListener('click',async e=>{const b=e.target.closest('[data-zap]');if(!b)return;b.parentNode.querySelectorAll('button').forEach(x=>x.disabled=true);const da=b.dataset.da==='1';
 const r=await post('/dnevnik',{zapomnit:b.dataset.zap,da}).catch(()=>({ok:false}));
 $('#hint').textContent=!r.ok?'Не вышло: '+(r.error||'мост не отвечает'):!da?'Хорошо, это не запоминаю.':r.zapisano?`Запомнила: «${r.razdel}» в «Знаю о тебе».`:'Это я уже знала.';
 await loadDnev();if(da&&r.ok)loadState().catch(()=>{})});
async function dnevPost(o,mine){if(dnev.dumaet)return;if(mine){dnev.msgs.push({role:'user',content:mine,at:Date.now()});dnev.idet=true}dnev.dumaet=dnevMoy=true;renderDnev(true);
 let r;try{r=await post('/dnevnik',o)}catch{r={ok:false,error:'мост не отвечает'}}dnev.dumaet=dnevMoy=false;
 if(r.ok&&r.reply){dnev.msgs.push({role:'assistant',content:r.reply,at:Date.now()});dnev.idet=true;speak(r.reply)}
 else if(!r.ok&&r.zanyat&&mine){dnev.msgs.pop();if(!$('#q').value.trim()){$('#q').value=mine;grow()}$('#hint').textContent='Спутник ещё думает — твои слова вернула в поле, отправь, когда ответит.'}
 else if(!r.ok){$('#hint').textContent='Спутник не ответил: '+(r.error||'')+(mine?' Твои слова сохранены — отправь что-нибудь ещё или подожди.':'')}
 renderDnev(true)}
$('#dNach').onclick=()=>dnevPost({});
$('#dKon').onclick=async()=>{if(dnev.dumaet){$('#hint').textContent='Спутник ещё думает — закончим, когда ответит.';return}const r=await post('/dnevnik',{konec:1}).catch(()=>({ok:false}));if(!r.ok){$('#hint').textContent='Не закрылось: '+(r.error||'мост не отвечает');return}
 dnev={...dnev,msgs:[],idet:false,dumaet:false};$('#hint').textContent=r.zapiska?'Разговор лёг в дневник. Спутник запомнит главное к следующему разу и спросит, что записать о тебе.':'Разговор закрыт.';loadDnev()};
$('#tDnev').onclick=()=>setView('dnev');
/* «Задачи»: все живые задачи по статусам; ☆ — в фокус вручную (до 7), ↑↓ — порядок фокуса.
 Правда — задача.md и свод синка; фокус — задачи/_фокус.json, закрытое из него убирает сторож моста сам. */
const Z_POR=['Сегодня','На неделю','Оформлено','Входящие'];let zad=null;
async function loadZad(){
 const root=$('#vZad');let frame=document.getElementById('pultTaskFrame');
 if(frame)return;
 try{
  const value=await post('/engine/settings',{taskAction:'donor'});
  if(!value.ok||!value.html)throw new Error(value.error||'Не удалось открыть задачи из Пульта');
  frame=document.createElement('iframe');frame.id='pultTaskFrame';frame.title='Задачи';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
  frame.style.cssText='display:block;width:100%;height:calc(100dvh - 80px);border:0;background:#0b0d12';frame.srcdoc=value.html;
  for(const child of Array.from(root.children))child.hidden=true;
  root.style.cssText='padding:0';root.append(frame);
 }catch(error){$('#zBody').textContent=error.message}
}
const zIkon=t=>[t.kart&&`картинки ${t.kart}`,t.fajl&&`файлы ${t.fajl}`,t.ssyl&&`ссылки ${t.ssyl}`].filter(Boolean).map(x=>`<span class="zi">${x}</span>`).join('');
function zRow(t,i,fk){return`<div class="zr" data-q="${lo(t.title,t.area,t.proekt,t.status,t.slug)}" data-z="${esc(t.slug)}"><button class="zs${t.fokus||fk?' on':''}" data-zf="${t.fokus||fk?'off':'on'}" title="${t.fokus||fk?'Убрать из фокуса':'В фокус'}">${t.fokus||fk?'★':'☆'}</button><div><div class="zt" data-zk="${esc(t.slug)}" title="Открыть задачу">${esc(t.title)}</div><div class="zm">${esc([t.area,t.proekt,t.srok&&'срок '+t.srok].filter(Boolean).join(' · '))}${zIkon(t)}</div></div>${fk?`<span><button class="zud" data-zu="${i}" title="Выше">↑</button><button class="zud" data-zd="${i}" title="Ниже">↓</button></span>`:`<span class="zp">${esc(t.sozdana||'')}</span>`}</div>`}
function renderZad(){
 if(!zad||zad.net||!zad.tasks){$('#zBody').innerHTML='<div class="empty" style="padding:30px 0">Мост не отдал задачи: старый мост? Перезапусти Джинни ярлыком.</div>';return}
 const po=new Map(zad.tasks.map(t=>[t.slug,t])),fk=zad.fokus.map(s=>po.get(s)).filter(Boolean);
 $('#zSum').textContent=`живых ${zad.tasks.length} · в фокусе ${fk.length} из ${zad.max} · свод ${String(zad.sobrano).replace('T',' ').slice(0,16)}`;
 $('#zFok').innerHTML=`<div class="zf"><h2>Фокус · ${fk.length} из ${zad.max}</h2>${fk.length?fk.map((t,i)=>zRow(t,i,true)).join(''):'<div class="empty">Отметь ☆ главные задачи ниже — они встанут в виджет «Фокус».</div>'}</div>`;
 const grp=new Map();for(const t of zad.tasks){const k=Z_POR.includes(t.status)?t.status:'Другое';if(!grp.has(k))grp.set(k,[]);grp.get(k).push(t)}
 $('#zBody').innerHTML=[...Z_POR,'Другое'].filter(k=>grp.has(k)).map(k=>`<details class="zgr"${k==='Входящие'||k==='Оформлено'?'':' open'}><summary><b>${esc(k)}</b>${grp.get(k).length}</summary>${grp.get(k).map(t=>zRow(t)).join('')}</details>`).join('');
 filterZad()}
function filterZad(){const q=$('#zq').value.trim().toLowerCase();document.querySelectorAll('#zBody .zr').forEach(r=>r.hidden=!!q&&!r.dataset.q.includes(q));if(q)document.querySelectorAll('#zBody .zgr').forEach(d=>d.open=true)}
$('#zq').addEventListener('input',filterZad);$('#zObn').onclick=loadZad;$('#tZad').onclick=()=>setView('zad');
$('#vZad').addEventListener('click',async e=>{const b=e.target.closest('[data-zf],[data-zu],[data-zd]');if(!b||!zad)return;let r;
 if(b.dataset.zf){const slug=b.closest('[data-z]').dataset.z;r=await post('/fokus',{slug,on:b.dataset.zf==='on'}).catch(()=>({ok:false,error:'мост не знает команды — перезапусти Джинни'}))}
 else{const f=[...zad.fokus],i=+(b.dataset.zu??b.dataset.zd),j=b.dataset.zu!=null?i-1:i+1;if(j<0||j>=f.length)return;[f[i],f[j]]=[f[j],f[i]];r=await post('/fokus',{poryadok:f}).catch(()=>({ok:false}))}
 if(!r.ok)$('#hint').textContent='Фокус не поменялся: '+(r.error||'мост не ответил');
 await loadZad();loadState().catch(()=>{})});
// Карточка задачи:
// статус меняется кнопками, свойства — область, проект, срок; картинки, файлы и ссылки видны отдельно; ниже — текст задачи.
let zkSlug=null;
async function otkrytZadachu(slug){zkSlug=slug;const d=$('#zKart');d.hidden=false;$('#zKartPut').textContent='задачи/'+slug;$('#zKartTelo').innerHTML='<div class="empty">Открываю…</div>';
 let k;try{k=await (await fetch('/api/zadacha?slug='+encodeURIComponent(slug))).json()}catch{k={ok:false,error:'мост не ответил — перезапусти Джинни'}}
 if(zkSlug!==slug)return;
 if(!k.ok){$('#zKartTelo').innerHTML=`<div class="empty">${esc(k.error||'не открылась')}</div>`;return}
 const sv=(n,v)=>v?`<dt>${n}</dt><dd>${v}</dd>`:'';
 const kart=k.fajly.filter(f=>KARTINKA.test(f)),proch=k.fajly.filter(f=>!KARTINKA.test(f));
 const fTile=f=>/\.(md|txt)$/i.test(f)?`<a class="put file-tile" data-kind="document" data-put="${esc(f)}" title="Открыть"><span class="file-type">${esc(f.split('.').pop().toUpperCase())}</span><span class="file-title">${esc(f.split('/').pop().replace(/\.[^.]+$/,''))}</span></a>`:fajlKartochka(f);
 const telo=k.telo.replace(/^#\s+.*\n+/,'');
 $('#zKartTelo').innerHTML=`<h1 class="zkt">${esc(k.title)}</h1>
  <div class="zkst">${STAT.map(s=>`<button data-zks="${s}" class="${s===k.status?'on':''}" title="${s===k.status?'Сейчас':'Поставить статус «'+s+'»'}">${s}</button>`).join('')}<button data-zkf="${k.fokus?'off':'on'}" class="${k.fokus?'on':''}" title="${k.fokus?'Убрать из фокуса':'Поставить в фокус'}">${k.fokus?'★ в фокусе':'☆ в фокус'}</button></div>
  <dl class="zkp">${sv('Область',esc(k.area))}${sv('Проект',esc(k.proekt))}${sv('Срок',esc(k.srok))}${sv('Создана',esc(k.sozdana))}${sv('Изменена',esc(String(k.izmenena).replace('T',' ').slice(0,16)))}${sv('Notion',k.notion?`<a href="${esc(k.notion)}" target="_blank" rel="noopener noreferrer">открыть в Notion</a>`:'')}${sv('Файл',`<a class="put lnk" data-put="${esc(k.put)}">задача.md</a>`)}</dl>
  ${kart.length?`<div class="zkh">Картинки · ${kart.length}</div><div class="zkf">${kart.map(fajlKartochka).join('')}</div>`:''}
  ${proch.length?`<div class="zkh">Файлы · ${proch.length}</div><div class="zkf">${proch.map(fTile).join('')}</div>`:''}
  ${k.ssylki.length?`<div class="zkh">Ссылки · ${k.ssylki.length}</div><div class="zkl">${k.ssylki.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`).join('')}</div>`:''}
  <div class="zkh">Текст задачи</div><div class="zkb">${telo.trim()?mdHtml(telo):'<div class="empty">Текста нет.</div>'}</div>`;
 $('#zKartTelo').scrollTop=0}
$('#zKartTelo').addEventListener('click',async e=>{const b=e.target.closest('[data-zks],[data-zkf]');if(!b||!zkSlug)return;const slug=zkSlug;
 b.parentElement.querySelectorAll('button').forEach(x=>x.disabled=true);let r;
 if(b.dataset.zks)r=await post('/zadacha',{slug,pole:'статус',znach:b.dataset.zks}).catch(()=>({ok:false,error:'мост не ответил'}));
 else r=await post('/fokus',{slug,on:b.dataset.zkf==='on'}).catch(()=>({ok:false,error:'мост не ответил'}));
 if(!r.ok)$('#hint').textContent='Не поменялось: '+(r.error||'мост не ответил');
 await Promise.all([otkrytZadachu(slug),loadZad(),loadState().catch(()=>{})])});
document.addEventListener('click',e=>{const a=e.target.closest('[data-zk]');if(a)otkrytZadachu(a.dataset.zk)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#chtec').hidden&&!$('#zKart').hidden)$('#zKart').hidden=true});
$('#tObuch').onclick=()=>setView('obuch');$('#tMap').onclick=()=>setView('map');$('#tOstr').onclick=()=>setView('ostr');$('#tWiki').onclick=()=>setView('wiki');$('#tIst').onclick=()=>setView('ist');$('#tZdor').onclick=()=>setView('zdor');$('#zNow').onclick=()=>loadZdor(true);$('#bIst').onclick=()=>setView('ist');

/* история работы: переписка, действия и ★-решения летописца по дням */
let istDen='';
const dnya=t=>{const d=new Date(t),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
const tmS=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
const plur=(n,a,b,c)=>{const m=n%10,k=n%100;return m===1&&k!==11?a:m>=2&&m<=4&&(k<12||k>14)?b:c};
// Здоровье репо: свод сторожей с моста (/api/zdorove, кэш 10 мин; «Проверить заново» — свежий прогон ~15 с)
const Z_IMYA={ok:'всё в порядке',warn:'есть что подправить',bad:'есть поломка'}
async function loadZdor(svezhiy){
 if(svezhiy||!$('#zdBody').children.length)$('#zdBody').innerHTML='<div class="empty" style="padding:30px 0">опрашиваю сторожей…</div>'
 let d;try{d=await (await fetch('/api/zdorove'+(svezhiy?'?svezhiy=1':''))).json()}catch(e){d={error:e.message}}
 if(d.net){$('#zdBody').innerHTML='<div class="empty" style="padding:30px 0">В этой копии сторожей репо нет — страница для владельца системы.</div>';return}
 if(d.error){$('#zdBody').innerHTML='<div class="empty" style="padding:30px 0">Не получилось: '+esc(d.error)+'</div>';return}
 $('#zKogda').textContent='проверено '+d.kogda+' · '+d.sek+' с · в порядке '+d.schet.ok+' · подправить '+d.schet.warn+' · поломок '+d.schet.bad
 let h='<div class="zsv"><i class="z-'+d.svetofor+'"></i>'+Z_IMYA[d.svetofor]+'</div>'
 if(d.slomano.length)h+='<div class="zslom"><b>Сломано сейчас</b><br>'+d.slomano.map(esc).join('<br>')+'</div>'
 for(const s of d.sekcii){h+='<div class="zsek">'+esc(s.imya)+'</div>'
  for(const r of s.stroki){const det=[...r.detali,r.komanda?'▶ '+r.komanda:''].filter(Boolean)
   h+='<details class="zdr"><summary><i class="z-'+r.status+'"></i><span>'+esc(r.imya)+'</span><div>'+esc(r.svodka)+'</div></summary>'+(det.length?'<pre>'+esc(det.join('\n'))+'</pre>':'')+'</details>'}}
 $('#zdBody').innerHTML=h}
async function loadIst(d){if(!$('#iBody').children.length||d!==istDen)$('#iBody').innerHTML='<div class="empty" style="padding:30px 0">собираю день…</div>';
 try{const r=await (await fetch('/api/istoriya'+(d?'?den='+d:''))).json();if(!r.dni)throw 0;istDen=r.den;renderIst(r)}
 catch{$('#iBody').innerHTML='<div class="empty" style="padding:30px 0">Мост не отдал историю: старый мост? Перезапусти Джинни ярлыком.</div>'}}
function renderIst(r){const seg=dnya(Date.now()),s=r.sobytiya,c={ty:0,ya:0,hod:0,resh:0};s.forEach(e=>{if(c[e.vid]!=null)c[e.vid]++});
 $('#iDni').innerHTML=r.dni.map(d=>`<button class="chipf${d===r.den?' on':''}" data-den="${d}">${d.slice(8)}.${d.slice(5,7)}${d===seg?' · сегодня':''}</button>`).join('');
 let h=`<div class="isum">твоих сообщений ${c.ty} · моих ответов ${c.ya} · действий ${c.hod} · ★ решений ${c.resh}</div>`,grp=[];
 const flush=()=>{if(!grp.length)return;const n=grp.length;
  h+=`<details class="ig"><summary><b>${tmS(grp[0].at)}</b><span>⚙ ${n} ${plur(n,'действие','действия','действий')}${n>1?' · до '+tmS(grp.at(-1).at):''}</span></summary><div class="igl">${grp.map(g=>`<div class="hl"><b>${tm(g.at)}</b><span>${esc(g.text)}</span></div>`).join('')}</div></details>`;grp=[]};
 for(const e of s){if(e.vid==='hod'){grp.push(e);continue}if(e.vid==='konec')continue;flush();
  const lab={ty:'ты',ya:'Джинни',resh:'★ решение · летописец'}[e.vid],long=(e.text||'').length>420;
  h+=`<div class="it ${e.vid}"><b>${tmS(e.at)}</b><div><i>${lab}</i><span${long?' class="clamp" title="Нажми, чтобы раскрыть"':''}>${esc(e.text)}</span>${mFiles(e.files)}</div></div>`}
 flush();if(!s.length)h+='<div class="empty" style="padding:20px 0">В этот день записей нет.</div>';
 $('#iBody').innerHTML=h;if(r.den===seg)window.scrollTo(0,document.body.scrollHeight)} // сегодня — сразу к свежему
$('#iDni').onclick=e=>{const b=e.target.closest('[data-den]');if(b)loadIst(b.dataset.den)};
$('#iBody').onclick=e=>{const cl=e.target.closest('.clamp');if(cl)cl.classList.toggle('open')};
$('#iHod').onchange=e=>$('#iBody').classList.toggle('nohod',!e.target.checked);
$('#iNow').onclick=()=>loadIst(istDen);
const grp=(arr,key,last)=>{const m=new Map();for(const x of arr){const k=x[key]||last;if(!m.has(k))m.set(k,[]);m.get(k).push(x)}return[...m].sort((a,b)=>(a[0]===last)-(b[0]===last))};
const lo=(...a)=>esc(a.filter(Boolean).join(' ').toLowerCase());
const ROD={'память':'📖 память области','исполнитель':'🛠 исполнитель','взгляд':'🎭 взгляд'};
function buildWiki(w){
 const VID={send:['отправит сразу',''],fill:['начнёт в поле',''],nazhat:['впишет в терминал','nz']};
 const act=d=>d.vid==='send'?`data-send="${esc(d.text)}"`:d.vid==='fill'?`data-fill="${esc(d.text)}"`:`data-press="${esc(d.text)}"`;
 const codex=providerState.provider==='codex',spr=w.spravka||[];
 let h=spr.length?`<section class="wsec" data-s="spr"><h2>Как это устроено<small>${spr.length}</small></h2><p class="note">Коротко о Claude и Джинни: память разговора, лимиты, модели, что умеет окно. «Спросить Джинни» — разберёмся на твоём примере.</p>`+
  grp(spr,'razdel','Прочее').map(([r,a])=>`<div class="wgrp"><h3>${esc(r)}</h3><div class="wgrid">${a.map(k=>`<div class="card" data-q="${lo(k.t,k.tekst,k.razdel)}"><div class="t" style="font-family:inherit;color:var(--ink)">${esc(k.t)}</div><p>${esc(k.tekst)}</p>${k.sprosit?`<div class="acts"><button class="wb" data-fill="${esc(k.sprosit)}" title="Вопрос встанет в поле внизу — отправишь сам">Спросить Джинни</button></div>`:''}</div>`).join('')}</div></div>`).join('')+'</section>':'';
 h+=`<section class="wsec" data-s="pult"><h2>Пульт Джинни<small>${w.deystviya.length}</small></h2><p class="note">Частые дела одной кнопкой. «Отправит сразу» — просьба уходит мне; «начнёт в поле» — допиши своё и отправь.</p>`+
  grp(w.deystviya,'razdel','Прочее').map(([r,a])=>`<div class="wgrp"><h3>${esc(r)}</h3><div class="pult">${a.map(d=>`<button class="pb" data-q="${lo(d.name,d.chto)}" ${act(d)}><i class="${VID[d.vid][1]}">${VID[d.vid][0]}</i><b>${esc(d.name)}</b><span>${esc(d.chto)}</span></button>`).join('')}</div></div>`).join('')+'</section>';
 h+=`<section class="wsec" data-s="kom"><h2>Команды ${codex?'Codex':'Claude Code'}<small>${w.komandy.length}</small></h2><p class="note">${codex?'Вход и очередь управляются кнопками над картой. Просьбы пиши обычным текстом в поле внизу.':'Эти команды принимает только терминал Claude Code. «Скопировать» кладёт команду в буфер: вставь в терминал и нажми Enter. Пример под командой тоже копируется щелчком. «Нажать в терминале» — впишу сама.'}</p>`+
  grp(w.komandy,'razdel','Прочее').map(([r,a])=>`<div class="wgrp"><h3>${esc(r)}</h3><div class="wgrid">${a.map(c=>`<div class="card" data-q="${lo(c.cmd,c.alias,c.chto,c.kogda)}"><div class="t">${esc(c.cmd)}${c.alias?`<small>${esc(c.alias)}</small>`:''}</div><p>${esc(c.chto)}</p><p class="k">${esc(c.kogda)}</p>${c.primer&&c.primer!==c.cmd?`<div class="ex" data-copy="${esc(c.primer)}" title="Скопировать пример">${esc(c.primer)}</div>`:''}<div class="acts"><button class="wb" data-copy="${esc(c.cmd)}">Скопировать</button>${c.nazhat?`<button class="wb hot" data-press="${esc(c.cmd)}">Нажать в терминале</button>`:''}</div></div>`).join('')}</div></div>`).join('')+'</section>';
 h+=`<section class="wsec" data-s="klav"><h2>Клавиши в терминале<small>${w.klavishi.length}</small></h2><div class="wgrp"><div class="kk">${w.klavishi.map(k=>`<div data-q="${lo(k.keys,k.chto)}"><kbd>${esc(k.keys)}</kbd><span>${esc(k.chto)}</span></div>`).join('')}</div></div></section>`;
 h+=`<section class="wsec" data-s="nav"><h2>Наши навыки<small>${w.navyki.length}</small></h2><p class="note">📖 память области — я читаю её перед работой; 🛠 исполнитель — отдаю ему работу; 🎭 взгляд — мнение со своей позиции. «Позвать» начинает просьбу в поле: допиши, что нужно.</p>`+
  grp(w.navyki,'arh','Без архипелага').map(([r,a])=>`<div class="wgrp"><h3>${esc(r)}</h3><div class="wgrid">${a.map(n=>`<div class="card" data-q="${lo(n.imya,n.name,n.opis,n.arh,n.rod)}"><div class="t">${n.imya?`<span style="font-family:'Chakra Petch',sans-serif;color:var(--ink)">${esc(n.imya)}</span><small>${esc(n.name)}</small>`:esc(n.name)}${n.rod?`<span class="rod">${ROD[n.rod]||esc(n.rod)}</span>`:''}</div><p class="clamp">${esc(n.opis||'описания нет')}</p><div class="acts"><button class="wb" data-fill="Навык ${n.imya?`«${esc(n.imya)}» (${esc(n.name)})`:esc(n.name)}: ">Позвать</button></div></div>`).join('')}</div></div>`).join('')+'</section>';
 h+=`<section class="wsec" data-s="meh"><h2>Механики<small>${w.mehaniki.reduce((s,m)=>s+m.n,0).toLocaleString('ru-RU')} приёмов в ${w.mehaniki.length} книгах и практиках</small></h2><p class="note">Книги и практики, разобранные на приёмы. «Взять приём» — назову механику по номеру и применю к твоему делу.</p>`+
  grp(w.mehaniki,'razdel','Прочее').map(([r,a])=>`<div class="wgrp"><h3>${esc(r)}</h3><div class="wgrid">${a.map(m=>`<div class="card" data-q="${lo(m.name,m.kogda,m.razdel)}"><div class="t" style="font-family:inherit;color:var(--ink)">${esc(m.name)}<small>${m.n} мех.</small></div><p class="k">${esc(m.kogda)}</p><div class="acts"><button class="wb" data-fill="По механикам «${esc(m.name)}»: ">Взять приём</button></div></div>`).join('')}</div></div>`).join('')+'</section>';
 h=buildStroyka(w.stroyka)+h;
 if(w.oshibka)h=`<div class="empty">${esc(w.oshibka)}</div>`+h;
 $('#wBody').innerHTML=h;
 const cs=$('#cStr');if(cs){cs.textContent=w.stroyka?.sfery?.length||'';cs.parentElement.hidden=!w.stroyka?.sfery}
 $('#cSpr').textContent=spr.length;$('#cPult').textContent=w.deystviya.length;$('#cKom').textContent=w.komandy.length;$('#cKlav').textContent=w.klavishi.length;$('#cNav').textContent=w.navyki.length;$('#cMeh').textContent=w.mehaniki.length;
 filterWiki()}
// «Стройка навыков»: 12 сфер × 5 слоёв, маршрут сводной задачи, сырьё, ещё не разобранное на механики
const SL_CV=['пусто','черновик','принято'];
function buildStroyka(s){
 if(!s||s.net||!s.sfery)return'';
 const n=x=>Number(x||0).toLocaleString('ru-RU'),gotE=s.etapy.filter(e=>e.vsego&&e.gotovo===e.vsego).length;
 const cell=(st,t)=>`<span class="slc s${st}" title="${SL_CV[st]}">${t}</span>`;
 let h=`<section class="wsec" data-s="str"><h2>Стройка навыков<small>${s.vsego.istochnikov} источников · ${n(s.vsego.kartochek)} карточек · этапов ${gotE} из ${s.etapy.length}</small></h2>`+
  `<p class="note">Как книги и курсы становятся навыками. Пять слоёв: сфера → направление → умение → задача → механика. <span class="slc s2">принято</span> <span class="slc s1">черновик</span> <span class="slc s0">пусто</span> Числа берутся из сводной задачи «${esc(s.put)}», нажми строку — увидишь источники.</p>`;
 h+=`<div class="wgrp"><h3>12 сфер × 5 слоёв</h3><div class="slm"><div class="slh"><span></span>${s.sloi.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`+
  s.sfery.map(f=>{const p=f.pilot,st=f.sloi;
   const row=[cell(st[0],f.obzor?'обзор принят':'название черновое'),cell(st[1],f.napr.length?f.napr.length+' '+plur(f.napr.length,'направление','направления','направлений'):'не найдено'),
    cell(st[2],p?n(p['умений'])+' · '+esc(p['направление']):'—'),cell(st[3],p?n(p['задач']):'—'),cell(st[4],f.kartochek?n(f.kartochek)+' карт. · '+f.istochnikov+' ист.':'нет источников')].join('');
   const src=f.istochniki.length?f.istochniki.map(x=>`<div><b>${esc(x.id)}</b><span>${esc(x.imya)}</span><i>${esc(x.napr)}</i><small>${n(x.kartochek)} · ${esc(x.status)}</small></div>`).join(''):`<div><span>В 47 источниках этой сферы нет: ${esc(f.opora)}</span></div>`;
   return`<details class="slr" data-q="${lo(f.imya,f.napravleniya,f.opora,...f.istochniki.map(x=>x.imya))}"><summary><b>${esc(f.imya)}</b>${row}</summary><div class="sls"><p>Направления для проверки: ${esc(f.napravleniya)}</p>${p?`<p>Пилот ${esc(p['когда']||'')}: ${esc(p['направление'])} — ${n(p['умений'])} умений, ${n(p['задач'])} задач, ${n(p['приёмов'])} приёмов; ${esc(p['статус']||'')}.</p>`:''}${src}</div></details>`}).join('')+'</div></div>';
 h+=`<div class="wgrp"><h3>Маршрут сводной задачи · 8 этапов</h3><div class="sle">`+s.etapy.map(e=>`<details data-q="${lo(e.imya,...e.punkty.map(x=>x.text))}"><summary><b>${e.n}</b><span>${esc(e.imya)}</span><i class="slb"><i style="width:${e.vsego?Math.round(e.gotovo/e.vsego*100):0}%"></i></i><small>${e.gotovo} из ${e.vsego}</small></summary><ul>${e.punkty.map(x=>`<li class="${x.gotovo?'ok':''}">${x.gotovo?'✓':'○'} ${esc(x.text)}</li>`).join('')}</ul></details>`).join('')+
  (s.hod.length?`<div class="slhod" data-q="${lo(...s.hod)}"><b>Последние шаги</b>${s.hod.map(x=>`<div>${esc(x)}</div>`).join('')}</div>`:'')+'</div></div>';
 const k=s.kursy||[],syr=k.filter(x=>x.fajlov-x.razobrano>0),bol=syr.filter(x=>x.fajlov>1),mal=syr.filter(x=>x.fajlov<=1);
 const vs=k.reduce((a,x)=>a+x.fajlov,0),raz=k.reduce((a,x)=>a+x.razobrano,0),r=s.rasshifrovka;
 h+=`<div class="wgrp"><h3>Сырьё · ещё не разобрано на механики</h3><p class="note">Расшифровки лежат в папках «_files» внутри memory/3. Resources. Разобранной считаю расшифровку, если её курс или файл упомянут в модулях механик, — это грубая сверка по названиям. Всего расшифровок ${n(vs)}, упомянуто в механиках ${n(raz)}.</p>`+
  (r?`<div class="slraw" data-q="расшифровка запаса ${lo(r.note)}"><b>Идёт расшифровка запаса</b><i class="slb"><i style="width:${r.vsego?Math.round(r.gotovo/r.vsego*100):0}%"></i></i><small>${n(r.gotovo)} из ${n(r.vsego)}</small><span>${esc(r.note)}</span></div>`:'')+
  (()=>{const kk=x=>`<div data-q="${lo(x.imya,x.put)}"><b title="${esc(x.put)}">${esc(x.imya)}</b><span>не разобрано ${n(x.fajlov-x.razobrano)} из ${n(x.fajlov)}${x.svezhih?` · новых за неделю ${x.svezhih}`:''}</span><button class="wb" data-fill="Разобрать на механики расшифровки «${esc(x.imya)}» (memory/3. Resources/${esc(x.put)}/_files): ">Разобрать</button></div>`;
   return`<div class="slk">${bol.slice(0,16).map(kk).join('')}</div>`+(bol.length>16?`<details class="slmore"><summary>ещё ${bol.length-16} ${plur(bol.length-16,'папка','папки','папок')} с несколькими расшифровками</summary><div class="slk">${bol.slice(16).map(kk).join('')}</div></details>`:'')})()+
  (mal.length?`<p class="note" data-q="${lo(...mal.map(x=>x.imya))}">И ещё ${mal.length} ${plur(mal.length,'папка','папки','папок')} по одной расшифровке: ${esc(mal.slice(0,12).map(x=>x.imya).join(' · '))}${mal.length>12?' …':''}</p>`:'')+'</div>';
 return h+'</section>'}
async function loadWiki(){try{const [w,s]=await Promise.all([fetch('/api/wiki').then(r=>r.json()),fetch('/api/stroyka').then(r=>r.json()).catch(()=>null)]);wiki=w;wiki.stroyka=s;buildWiki(wiki)}catch{$('#wBody').innerHTML='<div class="empty" style="padding:30px 0">Мост не отдал вики: старый мост? Перезапусти Джинни ярлыком.</div>'}}
function filterWiki(){const q=$('#wq').value.trim().toLowerCase();
 document.querySelectorAll('#wBody .wsec').forEach(s=>{const onF=wf==='all'||s.dataset.s===wf;let any=false;
  s.querySelectorAll('.wgrp').forEach(g=>{let n=0;g.querySelectorAll('[data-q]').forEach(el=>{const v=onF&&(!q||el.dataset.q.includes(q));el.hidden=!v;if(v)n++});g.hidden=!n;if(n)any=true});
  s.hidden=!any})}
$('#wq').addEventListener('input',filterWiki);
document.querySelectorAll('.chipf').forEach(b=>b.onclick=()=>{wf=b.dataset.f;document.querySelectorAll('.chipf').forEach(x=>x.classList.toggle('on',x===b));filterWiki()});
function fillQ(t){const q=$('#q');q.value=t;grow();q.focus();q.setSelectionRange(t.length,t.length);$('#hint').textContent='Допиши, что нужно, и отправь.'}
$('#vWiki').addEventListener('click',async e=>{
 const cl=e.target.closest('.clamp');if(cl){cl.classList.toggle('open');return}
 const b=e.target.closest('[data-send],[data-fill],[data-press],[data-copy]');if(!b)return;
 if(b.dataset.fill!=null)return fillQ(b.dataset.fill);
 if(b.dataset.copy!=null){try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;if(b.classList.contains('wb')){b.textContent='Скопировано ✓';b.classList.add('ok');setTimeout(()=>{b.textContent=t;b.classList.remove('ok')},1600)}$('#hint').textContent=`«${b.dataset.copy}» в буфере: вставь в терминал Claude Code и нажми Enter.`}catch{$('#hint').textContent='Буфер обмена не дался — выдели команду и скопируй вручную.'}return}
 // кнопка сама не отправляет — текст встаёт в поле, дальше решает человек
 if(b.dataset.send!=null){fillQ(b.dataset.send);$('#hint').textContent='Вопрос в поле внизу: отправь Enter или сотри.';return}
 if(b.dataset.press!=null){b.disabled=true;try{const r=await post('/press',{cmd:b.dataset.press});$('#hint').textContent=r.ok?`Вписала ${b.dataset.press} в терминал сессии.`:'Не нажалось: '+(r.error||'мост не ответил')}catch{$('#hint').textContent='Не нажалось: мост не отвечает (старый мост? перезапусти ярлыком).'}b.disabled=false}
});
try{const v=localStorage.getItem('dzh-view');if(v==='proiz'||v==='obuch'||v==='wiki'||v==='ist'||v==='ostr'||v==='zdor')setView(v)}catch{}

/* отзывы разработчикам: только в клиентской сборке */
const VID={zapusk:'запуск',etap:'этап знакомства',navyk:'новый навык',oshibka:'ошибка',trudnost:'трудность',soglasie:'согласие'};
const vremya=t=>new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
async function loadOtz(open){
 let o;try{o=await (await fetch('/api/otzyvy')).json()}catch{return}
 if(!o.vkl)return;$('#bOtz').hidden=false;renderOtz();
 if(open)$('#otz').classList.add('open');
}
const OTZ_EXT={'.txt':2*1024*1024,'.md':2*1024*1024,'.png':10*1024*1024,'.jpg':10*1024*1024,'.jpeg':10*1024*1024,'.webp':10*1024*1024,'.gif':10*1024*1024,'.mp4':25*1024*1024,'.webm':25*1024*1024,'.mov':25*1024*1024};
let otzFiles=[];
const otzExt=n=>((/\.[^.]+$/.exec(String(n||''))||[''])[0]).toLowerCase();
const otzFmtSize=b=>b>=1048576?(b/1048576).toFixed(1)+' МБ':Math.max(1,Math.round(b/1024))+' КБ';
function renderOtzFiles(){
 const box=$('#otzFilesList');if(!box)return;
 box.innerHTML=otzFiles.map((f,i)=>`<div class="otz-file-chip"><span title="${esc(f.name)}">${esc(f.name)}</span><small>${esc(otzFmtSize(f.size))}</small><button type="button" class="otz-file-rm" data-otz-rm="${i}" aria-label="Удалить вложение">×</button></div>`).join('');
}
function renderOtz(){
 otzFiles=[];
 $('#otzB').innerHTML='<section class="otz-card"><h4>Написать разработчикам</h4>'
  +'<input type="hidden" id="otzKind" value="idea">'
  +'<div class="otz-kinds" role="radiogroup" aria-label="Тип сообщения">'
  +'<button type="button" class="otz-kind-btn on" data-otz-kind="idea">Пожелание</button>'
  +'<button type="button" class="otz-kind-btn" data-otz-kind="bug">Ошибка</button>'
  +'<button type="button" class="otz-kind-btn" data-otz-kind="improvement">Идея / доработка</button>'
  +'</div>'
  +'<textarea id="otzText" maxlength="7000" placeholder="Опиши идею, проблему или что ты доработал…"></textarea>'
  +'<input type="file" id="otzFileInput" hidden multiple accept=".txt,.md,image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime">'
  +'<div class="otz-attach-row"><button type="button" class="otz-btn sm" id="otzAttachBtn">📎 Прикрепить файл</button><span class="otz-limits">.txt / .md до 2 МБ · фото до 10 МБ · видео до 25 МБ (до 3 файлов, всего 30 МБ)</span></div>'
  +'<div class="otz-files" id="otzFilesList"></div>'
  +'<p class="otz-note">Уйдут только этот текст и выбранные файлы. Ответ придёт в переписку.</p>'
  +'<button type="button" class="otz-btn solid" id="otzManualSend">Отправить сообщение</button>'
  +'<p class="otz-note" id="otzManualStatus" role="status"></p></section>';
 const input=$('#otzText'),fileIn=$('#otzFileInput'),status=$('#otzManualStatus');
 try{input.value=localStorage.getItem('ally-feedback-draft')||''}catch{}
 input.oninput=()=>{try{localStorage.setItem('ally-feedback-draft',input.value)}catch{}};
 $('#otzAttachBtn').onclick=()=>fileIn.click();
 fileIn.onchange=()=>{
  let err='';
  for(const file of [...(fileIn.files||[])]){
   if(otzFiles.length>=3){err='Можно прикрепить не более 3 файлов.';break}
   const limit=OTZ_EXT[otzExt(file.name)];
   if(!limit){err=`Формат «${file.name}» не поддержан (.txt, .md, фото, видео).`;continue}
   if(file.size<=0){err=`Файл «${file.name}» пустой.`;continue}
   if(file.size>limit){err=`Файл «${file.name}» превышает лимит ${Math.round(limit/1048576)} МБ.`;continue}
   const total=otzFiles.reduce((a,x)=>a+x.size,0)+file.size;
   if(total>30*1024*1024){err='Суммарный размер вложений больше 30 МБ.';continue}
   otzFiles.push(file);
  }
  fileIn.value='';renderOtzFiles();if(err)status.textContent=err;
 };
 $('#otzManualSend').onclick=async()=>{
  const button=$('#otzManualSend'),text=input.value.trim();if(!text||button.disabled)return;
  button.disabled=true;status.textContent=otzFiles.length?'Загружаю вложения…':'Отправляю…';
  try{
   const uploaded=[];
   for(const f of otzFiles){
    const upRes=await fetch('/otzyvy/upload',{method:'POST',headers:{'x-dzhinni':'1','x-name':encodeURIComponent(f.name),'content-type':'application/octet-stream'},body:f});
    const upJson=await upRes.json().catch(()=>({}));
    if(!upRes.ok||!upJson.ok)throw Error(upJson.error||'Не удалось загрузить файл '+f.name);
    uploaded.push({id:upJson.id,name:upJson.name});
   }
   status.textContent='Отправляю…';
   const r=await post('/otzyvy/report',{kind:$('#otzKind').value,text,files:uploaded});if(!r.ok)throw Error(r.error||'Исход отправки неизвестен');
   status.textContent='Сообщение отправлено ✓ Ответ придёт в переписку.';
   if(input.value.trim()===text){input.value='';try{localStorage.removeItem('ally-feedback-draft')}catch{}}
   otzFiles=[];renderOtzFiles();button.disabled=false;
  }
  catch(error){status.textContent=error.message+' Текст сохранён; перед повтором проверь переписку.';button.disabled=false}
 };
}
$('#otzB').addEventListener('click',e=>{
 const rmBtn=e.target.closest('[data-otz-rm]');
 if(rmBtn){otzFiles.splice(Number(rmBtn.dataset.otzRm),1);renderOtzFiles();return}
 const kindBtn=e.target.closest('[data-otz-kind]');
 if(!kindBtn)return;
 const hidden=$('#otzKind');if(hidden)hidden.value=kindBtn.dataset.otzKind;
 $('#otzB').querySelectorAll('[data-otz-kind]').forEach(btn=>btn.classList.toggle('on',btn===kindBtn));
});
$('#bOtz').onclick=()=>loadOtz(true);$('#bOtzX').onclick=()=>$('#otz').classList.remove('open');
loadOtz(false);

/* «Поддержка проекта „Джинни“»: только у владельца проекта. Отчёты людей — текст (esc), в сессию сами не уходят */
let podId='';
async function podGet(id){try{return await (await fetch('/api/podderzhka'+(id?'?id='+id:''))).json()}catch{return {vkl:false}}}
async function podSpisok(){
 podId='';$('#bPodNazad').hidden=true;const d=await podGet();
 if(!d.vkl)return;if(!d.ok){$('#podB').innerHTML='<p>Приёмник отзывов не ответил. Связь с сервером?</p>';return}
 $('#podB').innerHTML=d.kopii.length?'<p>Копии Джинни у людей. Нажми на копию, чтобы прочитать и ответить.</p>'+d.kopii.map(k=>`<div class="orow kop" data-id="${esc(k.id)}"><small>${esc(vremya(k.byl))}</small><b>${esc(k.id.slice(0,6))}</b> · v${esc(k.versiya||'?')} · этап: ${esc(k.etap||'—')} · отчётов ${k.otchetov}, ошибок ${k.oshibok}, ответов ${k.otvetov}${k.poslednij?'\n«'+esc(k.poslednij.text.slice(0,160))+'»':''}</div>`).join(''):'<p>Пока ни одной копии не отозвалось.</p>'}
async function podKopiya(id){
 podId=id;$('#bPodNazad').hidden=false;const d=await podGet(id);if(!d.ok){$('#podB').innerHTML='<p>Копия не нашлась.</p>';return}
 const sp=(a,f)=>a.length?a.slice().reverse().map(f).join(''):'<div class="orow">Нет.</div>';
 $('#podB').innerHTML=`<p><b>${esc(id)}</b> · v${esc(d.versiya||'?')} · с ${esc(vremya(d.at))}, был ${esc(vremya(d.byl))}</p>`
  +'<h4>Отчёты</h4>'+sp(d.otchety,o=>`<div class="orow"><small>${esc(vremya(o.at))}</small>${esc(o.text)}${o.files?.length?'\n📎 '+o.files.map(f=>`${esc(f.name)} (${Math.max(1,Math.round((f.size||0)/1024))} КБ)`).join(', '):''}${o.kontekst?'\n— '+esc(o.kontekst):''}</div>`)
  +'<h4>Ответить</h4><textarea id="podTxt" placeholder="Ответ придёт человеку в переписку Джинни"></textarea><div class="obtn"><button class="hb go" id="podSend">Отправить</button><span id="podSt"></span></div>'
  +'<h4>Мои ответы</h4>'+sp(d.otvety,o=>`<div class="orow"><small>${esc(vremya(o.at))}</small>${esc(o.text)}</div>`)
  +'<h4>События</h4>'+sp(d.sobytiya.slice(-80),s=>`<div class="orow"><small>${esc(vremya(s.at))}</small>${esc(VID[s.vid]||s.vid)}${s.chto?': '+esc(s.chto):''}</div>`)}
$('#podB').addEventListener('click',async e=>{
 const k=e.target.closest('.kop');if(k)return podKopiya(k.dataset.id);
 if(e.target.id==='podSend'){const t=$('#podTxt').value.trim();if(!t)return;$('#podSt').textContent='отправляю…';
  const r=await post('/podderzhka/otvet',{id:podId,text:t}).catch(()=>({}));if(r.ok)podKopiya(podId);else $('#podSt').textContent='не ушло'}});
$('#bPod').onclick=()=>{$('#pod').classList.add('open');podSpisok()};$('#bPodX').onclick=()=>$('#pod').classList.remove('open');$('#bPodNazad').onclick=podSpisok;
podGet().then(d=>{if(d.vkl)$('#bPod').hidden=false});

/* окно закрыли — мост закрывается сам через 9 минут, если окно не открыть снова (okno-zhizn.mjs).
 Окно говорит «жива» раз в 20 с и «закрыта» при выгрузке; перезагрузка страницы тут же отменяет отсчёт. */
const oknoZhiva=()=>fetch('/api/okno/zhiva',{method:'POST',headers:{'x-dzhinni':'1'}}).catch(()=>{});
oknoZhiva();setInterval(oknoZhiva,20000);
// по pagehide убрано — 01:58 страница так «закрыла» живое окно и мост ушёл на ночь.
// Закрытие окна теперь сообщает сама программа (app/main.js, pulsMosta), она же шлёт «жива» без замедления в фоне.

if(document.getElementById("tProiz"))document.getElementById("tProiz").onclick=()=>setView("proiz");
