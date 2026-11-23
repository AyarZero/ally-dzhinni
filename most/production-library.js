/* Existing production editor globals provide scene scope and persistent save. */
export function setupProductionLibrary({getSelected,getMode,current,stop,toast,changed,render}){
 let tab='styles',sequence=0,abort,scope,offset=0,total=0,groups=[],lastFocus
 const root=document.getElementById('library'),$=id=>document.getElementById(id)
 function node(tag,text,cls){let n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
 function pause(){root.querySelectorAll('video').forEach(v=>v.pause())}
 function correctScope(){return scope&&getSelected()===scope.id&&getMode()===scope.mode}
 function apply(item){if(!correctScope()){toast('Сцена изменилась. Открой библиотеку снова.');return}
  if(item.kind==='styles'){current().style='Библиотека: '+item.title;current().styleRef=item.id}else{current().ref=item.title;current().referenceId=item.id}
  changed('visual');root.close();render();toast('Выбрано для '+current().name)
 }
 function show(item){pause();$('reference-view').replaceChildren();const back=node('button','← К примерам');back.onclick=()=>{pause();$('reference-view').hidden=true;$('reference-browser').hidden=false;lastFocus?.focus()};$('reference-view').append(back,node('h3',item.title));
  if(item.kind==='references'){let video=node('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=item.url;video.poster=item.poster;video.setAttribute('aria-label',item.title);$('reference-view').append(video);video.addEventListener('error',()=>{$('reference-view').append(node('p','Видео не удалось открыть. Попробуй другой пример.','notice'))},{once:true})}
  else{let pictures=node('div',undefined,'reference-images');(item.images||[item.url]).forEach(src=>{let img=node('img');img.src=src;img.alt=item.title;pictures.append(img)});$('reference-view').append(pictures)}
  let use=node('button',scope?'Использовать в этой сцене':'Открыть сцену для выбора');use.className='primary';use.onclick=()=>scope?apply(item):(root.close(),toast('Открой сцену и выбери пример в её библиотеке.'));$('reference-view').append(node('p',item.note,'tiny dim'),use);$('reference-browser').hidden=true;$('reference-view').hidden=false;back.focus()
 }
 async function load(){pause();const seq=++sequence;abort?.abort();abort=new AbortController();$('reference-grid').replaceChildren();$('reference-status').textContent='Загружаю примеры…';$('reference-prev').disabled=true;$('reference-next').disabled=true;
  try{let p=new URLSearchParams({kind:tab,q:$('reference-search').value,group:$('reference-group').value,offset});let r=await fetch('/api/production/library?'+p,{headers:{'x-dzhinni':'1'},signal:abort.signal});if(!r.ok)throw Error('HTTP '+r.status);let data=await r.json();if(seq!==sequence)return;total=data.total;
   if(JSON.stringify(groups)!==JSON.stringify(data.groups)){let previous=$('reference-group').value;groups=data.groups;$('reference-group').replaceChildren(new Option('Все разделы',''),...groups.map(g=>new Option(g,g)));$('reference-group').value=groups.includes(previous)?previous:''}
   $('reference-status').textContent=total?(offset+1)+'–'+Math.min(offset+24,total)+' из '+total:'Примеры не найдены';
   data.items.forEach(item=>{let card=node('article',undefined,'reference-card'),view=node('button',undefined,'reference-cover'),img=node('img');img.src=item.poster||item.url;img.loading='lazy';img.alt=item.title;view.setAttribute('aria-label',(item.kind==='references'?'Смотреть видео: ':'Рассмотреть стиль: ')+item.title);view.append(img);if(item.kind==='references')view.append(node('span','▶ '+Math.round(item.duration)+' сек','reference-play'));view.onclick=()=>{lastFocus=view;show(item)};img.onerror=()=>{img.hidden=true;view.append(node('span',item.kind==='references'?'▶ Смотреть видео':'Открыть изображение'))};let use=node('button','Выбрать для сцены');use.onclick=()=>apply(item);card.append(view,node('strong',item.title),node('small',item.note));if(scope)card.append(use);$('reference-grid').append(card)});
   if(scope)$('reference-choice').textContent=tab==='styles'?'Выбрано: '+(current().style||'общий стиль материала'):'Выбрано: '+(current().ref||'пока ничего');else $('reference-choice').textContent='';
   $('reference-prev').disabled=offset===0;$('reference-next').disabled=offset+24>=total
  }catch(e){if(e.name==='AbortError'||seq!==sequence)return;$('reference-status').textContent='Не удалось загрузить библиотеку.';let retry=node('button','Повторить');retry.onclick=load;$('reference-grid').append(retry)}
 }
 function open(which){if(!getSelected()&&which==='prompts'){toast('Сначала открой часть материала');return}stop();pause();scope=getSelected()?{id:getSelected(),mode:getMode()}:null;tab=which;$('library-scope').textContent=scope?current().name+' · выбор для этой сцены':'Просмотр библиотеки · для выбора открой сцену';['styles','references','prompts'].forEach(k=>{$('lib-'+k).hidden=k!==which;document.querySelector('[data-lib-tab="'+k+'"]').classList.toggle('on',k===which)});document.querySelector('[data-lib-tab="prompts"]').disabled=!scope;
  $('library-prompt').value=scope?current().prompt:'';$('lib-styles').hidden=true;$('lib-references').hidden=true;$('reference-browser').hidden=which==='prompts';$('reference-view').hidden=true;
  if(!root.open)root.showModal();if(which!=='prompts'){offset=0;groups=[];$('reference-search').value='';$('reference-group').replaceChildren(new Option('Все разделы',''));load()}
 }
 let timer;$('reference-search').oninput=()=>{clearTimeout(timer);abort?.abort();sequence++;offset=0;timer=setTimeout(load,250)};$('reference-group').onchange=()=>{offset=0;load()};$('reference-prev').onclick=()=>{offset=Math.max(0,offset-24);load()};$('reference-next').onclick=()=>{offset+=24;load()};
 root.addEventListener('close',()=>{clearTimeout(timer);abort?.abort();sequence++;pause();$('reference-view').replaceChildren()});
 $('library-open').onclick=()=>open('styles');return{open}
}
