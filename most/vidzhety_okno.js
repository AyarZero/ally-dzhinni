/* Свои виджеты и страницы (most/vidzhety.mjs): блоки карты и вкладки в шапке. Код виджета живёт в iframe-песочнице,
 * данные ему передаёт окно сообщением; сам он в сеть и в мост не ходит. Подключается после основного скрипта окна. */
(()=>{
const VID={};let vSpisok=[],vPervyy=true;
document.head.insertAdjacentHTML('beforeend',`<style>
body.edit .vw iframe{pointer-events:none}.trg{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:0 4px 0 10px}.wh .chey{color:var(--dim);margin-left:8px;letter-spacing:.1em}.vw{display:flex;flex-direction:column;height:100%;box-sizing:border-box}.vw iframe{flex:1;border:0;width:100%;min-height:90px;background:transparent;color-scheme:dark}
.vbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px;font-size:12px;color:var(--dim)}.vbar .hb{padding:3px 7px}
.vbar.razr{border:1px solid color-mix(in srgb,var(--amber) 40%,transparent);padding:6px 8px}.vchip{color:var(--amber);font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin-right:6px}
.lnk.vi{all:unset;cursor:pointer;color:var(--dim);margin-left:6px}.lnk.vi:hover{color:var(--accent)}
.wh [data-izm]{all:unset;cursor:pointer;margin-left:auto;margin-right:8px;color:var(--dim);font-size:11px}
.vpage{position:fixed;left:0;right:0;top:var(--hh,56px);bottom:var(--fh,80px);padding:12px 16px;box-sizing:border-box}.vpage .panel{height:100%}
#vdlg{position:fixed;top:0;right:0;bottom:0;z-index:42;width:min(480px,100vw);display:flex;flex-direction:column;background:var(--surface);color:var(--ink);border-left:1px solid var(--line);transform:translateX(100%);visibility:hidden;transition:transform .25s ease,visibility .25s}
#vdlg.open{transform:none;visibility:visible;box-shadow:-20px 0 60px rgba(0,0,0,.35)}#vdlg .ph{padding:20px 22px 16px;margin:0;border-bottom:1px solid var(--line)}
#vdlg .ob{padding:14px 18px;line-height:1.5;overflow:auto}#vdlg textarea{width:100%;min-height:120px;box-sizing:border-box;background:transparent;color:inherit;border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit}
#vdlg .obtn{display:flex;gap:8px;margin:10px 0}</style>`);
document.body.insertAdjacentHTML('beforeend',`<aside id="vdlg"><div class="ph"><span id="vdT">Новый виджет</span><small><button class="hb" id="vdX">закрыть</button></small></div>
<div class="ob"><p id="vdP" class="sub"></p><label for="vdQ">Что ты хочешь создать?</label><textarea id="vdQ" maxlength="12000" placeholder="Опиши своими словами: что здесь должно быть и что ты хочешь делать."></textarea>
<div class="obtn"><button class="hb go" id="vdGo">Обсудить с Джинни</button></div><p id="vdStatus" role="status" aria-live="polite"></p><p class="sub">Сначала обсудим замысел. Готовый черновик появится здесь после создания — его можно принять или попросить изменить.</p></div></aside>`);
$('#vdP').textContent='';
let vdPref='',vdBusy=false,vdReturn=null;
const draftKey=pref=>'ally-create-draft:'+pref;
function dlg(zag,pref,podskazka){if(vdBusy)return;vdReturn=document.activeElement;$('#vdT').textContent=zag;vdPref=pref;$('#vdP').textContent=podskazka||'';try{$('#vdQ').value=localStorage.getItem(draftKey(pref))||''}catch{$('#vdQ').value=''}$('#vdStatus').textContent='';$('#vdlg').classList.add('open');setTimeout(()=>$('#vdQ').focus(),50)}
const closeCreate=()=>{$('#vdlg').classList.remove('open');vdReturn?.focus?.()};
$('#vdX').onclick=closeCreate;
$('#vdQ').oninput=()=>{try{localStorage.setItem(draftKey(vdPref),$('#vdQ').value)}catch{}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#vdlg').classList.contains('open'))closeCreate()});
$('#vdGo').onclick=async()=>{const t=$('#vdQ').value.trim();if(!t||vdBusy)return;
 const pref=vdPref;vdBusy=true;$('#vdGo').disabled=true;$('#vdQ').disabled=true;$('#vdStatus').textContent='Передаю описание…';
 try{const r=await post('/say',{text:`${pref} ${t}`});if(!r.ok)throw new Error(r.error||'Запрос не принят');try{localStorage.removeItem(draftKey(pref))}catch{}closeCreate();$('#hint').textContent='Описание принято. Продолжи обсуждение с Джинни в переписке.'}catch(error){$('#vdStatus').textContent='Подтверждение не получено. Проверь переписку перед повтором. Описание сохранено. '+(error.message||'Нет связи.')}finally{vdBusy=false;$('#vdGo').disabled=false;$('#vdQ').disabled=false}};
// «+ виджет» и «+ страница» в полосе настройки
$('#eCol').insertAdjacentHTML('beforebegin','<button class="hb" id="eVid" title="Описать словами — Джинни соберёт виджет">+ виджет</button><button class="hb" id="eStr" title="Описать словами — Джинни соберёт страницу во всё окно">+ страница</button>');
$('#eVid').onclick=()=>dlg('Новый виджет','[Новый виджет]','Опиши, что должно быть в блоке и откуда брать данные, если знаешь.');
$('#eStr').onclick=()=>dlg('Новая страница','[Новая страница]','Опиши страницу: что на ней, откуда данные. Она появится вкладкой в шапке.');
// Navigation order belongs to this client, not to model sessions or the server's source files.
const tabs=$('.tabs'),orderKey='ally-tab-order-v1',tabKey=el=>el.dataset.v||el.id;
const addTab=document.createElement('button');addTab.type='button';addTab.id='addPageTab';addTab.className='tab';addTab.textContent='+';addTab.title='Создать страницу';addTab.setAttribute('aria-label','Создать страницу');addTab.onclick=()=>$('#eStr').click();tabs.append(addTab);
const tabList=()=>[...tabs.querySelectorAll('.tab')].filter(t=>t!==addTab&&tabKey(t));
const visibleTabList=()=>tabList().filter(t=>!t.hidden&&(typeof getComputedStyle==='undefined'||getComputedStyle(t).display!=='none'));
const canDragTabs=()=>document.body.classList.contains('edit')&&visibleTabList().length>1;
const saveTabOrder=()=>{try{localStorage.setItem(orderKey,JSON.stringify(tabList().map(tabKey)))}catch{}};
function syncTabDrag(){
 const allow=canDragTabs();
 for(const t of tabList()){
  if(t.dataset.baseTitle===undefined)t.dataset.baseTitle=t.title||'';
  t.draggable=allow;
  if(allow){t.setAttribute('aria-keyshortcuts','Alt+Shift+ArrowLeft Alt+Shift+ArrowRight');t.title=(t.dataset.baseTitle?t.dataset.baseTitle+'. ':'')+'Перетащи для перемещения; Alt+Shift+←/→'}
  else{t.removeAttribute('aria-keyshortcuts');t.title=t.dataset.baseTitle}
 }
}
function restoreTabOrder(){
 let saved=[];try{const value=JSON.parse(localStorage.getItem(orderKey)||'[]');if(Array.isArray(value))saved=value.filter(x=>typeof x==='string')}catch{}
 const list=tabList(),rank=new Map(saved.map((id,i)=>[id,i]));list.sort((a,b)=>(rank.get(tabKey(a))??1e6)-(rank.get(tabKey(b))??1e6));
 const actual=[...tabs.children],wanted=[...list,addTab];if(actual.length!==wanted.length||actual.some((el,i)=>el!==wanted[i]))for(const t of wanted)tabs.append(t);
 syncTabDrag();
}
let dragging=null,suppressClickUntil=0;
tabs.addEventListener('dragstart',e=>{if(!canDragTabs()){e.preventDefault();return}const t=e.target.closest('.tab');if(!t||t===addTab)return;dragging=t;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',tabKey(t));t.style.opacity='.45'});
tabs.addEventListener('dragover',e=>{if(dragging&&canDragTabs()){e.preventDefault();e.dataTransfer.dropEffect='move'}});
tabs.addEventListener('drop',e=>{if(!dragging||!canDragTabs())return;e.preventDefault();const target=e.target.closest('.tab');if(target&&target!==dragging){const r=target.getBoundingClientRect();tabs.insertBefore(dragging,target===addTab||e.clientX<r.x+r.width/2?target:target.nextSibling);saveTabOrder()}suppressClickUntil=Date.now()+250});
tabs.addEventListener('dragend',()=>{if(dragging)dragging.style.opacity='';dragging=null});
tabs.addEventListener('click',e=>{if(Date.now()<suppressClickUntil){e.stopImmediatePropagation();e.preventDefault()}},true);
tabs.addEventListener('keydown',e=>{if(!canDragTabs()||!e.altKey||!e.shiftKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;const t=e.target.closest('.tab'),list=tabList(),i=list.indexOf(t),j=i+(e.key==='ArrowLeft'?-1:1);if(i<0||j<0||j>=list.length)return;e.preventDefault();tabs.insertBefore(t,e.key==='ArrowLeft'?list[j]:list[j].nextSibling);saveTabOrder();t.focus()});
let orderScheduled=false;new MutationObserver(()=>{if(orderScheduled)return;orderScheduled=true;queueMicrotask(()=>{orderScheduled=false;restoreTabOrder()})}).observe(tabs,{childList:true});
new MutationObserver(syncTabDrag).observe(document.body,{attributes:true,attributeFilter:['class']});
restoreTabOrder();
// «✎» у каждого блока в режиме настройки: встроенный блок правится твоей копией поверх, наш код не трогается
// в режиме настройки у блока видно, чей он: наш (обновляем мы) или твой (совершенствуешь сам)
function izmKnopki(){for(const id in W){const wh=W[id].querySelector(':scope>.wh');if(!wh||wh.querySelector('[data-izm]'))continue;
 wh.querySelector('span').insertAdjacentHTML('beforeend',`<small class="chey">${W[id].dataset.v?'· мой':'· стандартный'}</small>`);
 wh.querySelector('[data-hide]').insertAdjacentHTML('beforebegin',`<button type="button" data-izm="${esc(id)}" title="Изменить словами">✎ изменить</button>`)}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-izm]');if(!b)return;e.stopPropagation();const id=b.dataset.izm,w=W[id];
 if(w?.dataset.v)return dlg(`Изменить «${w.dataset.t}»`,`[Изменить виджет ${w.dataset.v} «${w.dataset.t}»]`,'Что поменять? Прежняя версия сохранится, вернуть можно кнопкой ↶.');
 dlg(`Изменить «${w?.dataset.t||id}»`,`[Изменить блок ${id} «${w?.dataset.t||id}»]`,'Это наш блок. Джинни сделает из него твой — дальше его совершенствуешь ты, а наши обновления идут в наш блок: он останется в списке «стандартные», вернуть можно в любой момент.')},true);

const vnutr=()=>({'dzhinni:zadachi':typeof fTasks!=='undefined'?fTasks:[],'dzhinni:zamer':typeof zamer!=='undefined'?zamer:null,'dzhinni:hod':typeof hodL!=='undefined'?hodL:[]});
async function dannyeV(v){let d={};try{d=await(await fetch(`/vidzhet/${v.imya}/dannye`)).json()}catch{}
 const vn=vnutr();for(const s of v.istochniki||[])if(s.vnutr)d[s.id]={url:s.url,at:Date.now(),data:vn[s.url]};return d}
async function otdat(imya){const v=VID[imya];if(!v)return;const d=await dannyeV(v.m);v.ifr.forEach(f=>{try{f.contentWindow?.postMessage({dzhinni:'dannye',dannye:d},'*')}catch{}})}

function shapka(m){const razr=(m.istochniki||[]).filter(s=>s.status==='zhdyot');
 return (m.chernovik?`<div class="vbar"><span class="vchip">черновик</span><button class="hb go" data-va="ostavit">Оставить</button><button class="hb" data-va="izm">Поправить</button><button class="hb" data-va="ubrat">Убрать</button></div>`:'')+
  razr.map(s=>`<div class="vbar razr">Хочет брать данные с <b>${esc(s.host)}</b> раз в ${s.kazhdye} мин${s.zachem?` (${esc(s.zachem)})`:''} — <button class="hb go" data-va="da" data-h="${esc(s.host)}">Разрешить</button><button class="hb" data-va="net" data-h="${esc(s.host)}">Нет</button></div>`).join('')+
  (m.istochniki||[]).filter(s=>s.status==='net').map(s=>`<div class="vbar">${esc(s.host)}: запрещено тобой</div>`).join('')}
function ramka(m){return `<div class="panel vw"><div class="ph"><span>${esc(m.t)}</span><small>v${m.versiya}<button class="lnk vi" data-va="izm" title="Изменить словами">✎</button>${m.versiy?`<button class="lnk vi" data-va="otkat" title="Вернуть как было (прежняя версия)">↶</button>`:''}${m.vid==='stranica'?`<button class="lnk vi" data-va="ubrat" title="Убрать страницу">×</button>`:''}</small></div>
 <div class="vsh">${shapka(m)}</div><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" src="/vidzhet/${m.imya}/vid.html?v=${m.versiya}-${m.at}" title="${esc(m.t)}"></iframe></div>`}
function podklyuchit(el,imya){el.querySelectorAll('iframe').forEach(f=>f.addEventListener('load',()=>otdat(imya)));VID[imya].ifr=[...el.querySelectorAll('iframe')]}

function postavitNaKartu(sec){const cols=[...main.children];const c=cols.find(c=>c.classList.contains('void'))||cols.reduce((a,b)=>kids(a).length<=kids(b).length?a:b);sec.style.flexGrow=1;c.append(sec);markVoid()}
function zamena(m,sec){const b=W[m.zamenyaet];if(!b||!main.contains(b))return;if(main.contains(sec))return pool.append(b);sec.style.flexGrow=b.style.flexGrow;b.replaceWith(sec);pool.append(b)}

function blok(m){const id='v-'+m.imya;let sec=W[id];
 if(!sec){sec=document.createElement('section');sec.className='w';sec.dataset.w=id;sec.dataset.v=m.imya;
  sec.insertAdjacentHTML('beforeend','<div class="ry" title="Потяни, чтобы поменять высоту"></div><div class="rxw" title="Потяни, чтобы поменять ширину"></div>');W[id]=sec;pool.append(sec)}
 sec.dataset.t=m.t;sec.querySelector(':scope>.wh')?.remove();sec.querySelector(':scope>.panel')?.remove();
 sec.insertAdjacentHTML('afterbegin',`<div class="wh"><span>⠿ ${esc(m.t)}</span><button type="button" data-hide title="Убрать блок с карты; вернуть — кнопкой сверху">скрыть</button></div>${ramka(m)}`);
 VID[m.imya]={m,el:sec};podklyuchit(sec,m.imya);return sec}
function stranicaV(m){const id='p-'+m.imya;let s=document.getElementById(id);
 if(!s){s=document.createElement('section');s.id=id;s.className='vpage';s.hidden=true;s.dataset.v=id;$('#vMap').before(s);
  $('.tabs').insertAdjacentHTML('beforeend',`<button class="tab" data-v="${id}"></button>`)}
 $(`.tab[data-v="${id}"]`).textContent=m.t;s.innerHTML=ramka(m);VID[m.imya]={m,el:s};podklyuchit(s,m.imya)}

async function zagruzit(){let s;try{s=(await(await fetch('/api/vidzhety')).json()).vidzhety||[]}catch{return}
 const est=new Set(s.map(m=>m.imya)),staryeId=new Set(vSpisok.map(m=>m.imya));
 for(const m of vSpisok)if(!est.has(m.imya))snyat(m);
 const novye=[];
 for(const m of s){const pr=vSpisok.find(x=>x.imya===m.imya);if(pr&&JSON.stringify(pr)===JSON.stringify(m))continue;
  if(m.vid==='stranica')stranicaV(m);else{const sec=blok(m);if(!staryeId.has(m.imya))novye.push([m,sec])}}
 vSpisok=s;
 if(vPervyy){vPervyy=false;let L=null;try{L=JSON.parse(localStorage.getItem('dzh-layout')||'null')}catch{}
  if(novye.length)applyLayout(L&&L.cols?L:DEF);for(const[m,sec]of novye)if(m.zamenyaet)zamena(m,sec);
  try{const v=localStorage.getItem('dzh-view');if(v&&v.startsWith('p-')&&document.getElementById(v))setView(v)}catch{}}
 else for(const[m,sec]of novye){if(m.zamenyaet&&W[m.zamenyaet]&&main.contains(W[m.zamenyaet]))zamena(m,sec);else postavitNaKartu(sec);saveLayout()}
 izmKnopki();renderTray()}
function snyat(m){delete VID[m.imya];
 if(m.vid==='stranica'){document.getElementById('p-'+m.imya)?.remove();$(`.tab[data-v="p-${m.imya}"]`)?.remove();if(!$('#vMap').hidden||document.querySelector('.vpage:not([hidden])'))return;setView('map');return}
 const sec=W['v-'+m.imya];if(!sec)return;const b=m.zamenyaet&&W[m.zamenyaet];
 if(b&&main.contains(sec)&&!main.contains(b)){b.style.flexGrow=sec.style.flexGrow;sec.replaceWith(b)}else sec.remove();
 delete W['v-'+m.imya];tidyRows();markVoid();renderTray();saveLayout()}

// кнопки внутри рамки виджета
document.addEventListener('click',async e=>{const b=e.target.closest('[data-va]');if(!b)return;const el=b.closest('.w[data-v],.vpage');if(!el)return;
 const imya=el.dataset.v.replace(/^p-/,''),v=VID[imya];if(!v)return;const a=b.dataset.va;
 if(a==='izm')return dlg(`Изменить «${v.m.t}»`,`[Изменить ${v.m.vid==='stranica'?'страницу':'виджет'} ${imya} «${v.m.t}»]`,'Что поменять? Прежняя версия сохранится, вернуть можно кнопкой ↶.');
 const body=a==='da'||a==='net'?{deystvie:'razreshit',imya,host:b.dataset.h,da:a==='da'}:{deystvie:a,imya};
 if(a==='ubrat'&&!confirmUbrat(b))return;
 try{await post('/vidzhet',body)}catch{};zagruzit()});
// «Убрать» — второе нажатие подтверждает (без системных окон: они вешают окно)
function confirmUbrat(b){if(b.dataset.ok)return true;b.dataset.ok=1;b.textContent='Точно убрать?';setTimeout(()=>{delete b.dataset.ok;b.textContent=b.classList.contains('vi')?'×':'Убрать'},3000);return false}

// страницы — вкладки в шапке
const _setView=setView;
setView=function(v){const str=String(v).startsWith('p-');_setView(str?'none':v);
 document.querySelectorAll('.vpage').forEach(s=>s.hidden=s.id!==v);document.querySelectorAll('.tab[data-v]').forEach(t=>t.classList.toggle('on',t.dataset.v===v));
 if(str)try{localStorage.setItem('dzh-view',v)}catch{}};
$('.tabs').addEventListener('click',e=>{const t=e.target.closest('.tab[data-v]');if(t)setView(t.dataset.v)});

const es=window.dzhEs||new EventSource('/events');   // общий поток окна; свой — только если окно без okno.js
es.addEventListener('vidzhety',()=>zagruzit());
es.addEventListener('vidzhet-dannye',e=>otdat(JSON.parse(e.data).imya));
// внутренние данные (задачи, ресурс, ход) меняются в окне — раз в 30 с отдаём их виджетам, которые их просили
setInterval(()=>{if(document.hidden||!document.hasFocus())return;for(const k in VID)if((VID[k].m.istochniki||[]).some(s=>s.vnutr))otdat(k)},30000);
const _setEdit=setEdit;setEdit=function(on){_setEdit(on);if(on)izmKnopki()};
$('#bEdit').onclick=()=>setEdit(!edit);$('#eDone').onclick=()=>setEdit(false);
izmKnopki();zagruzit();
})();
