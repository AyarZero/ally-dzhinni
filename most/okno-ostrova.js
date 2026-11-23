/* острова: навыки висят архипелагами на орбите вокруг ядра; к острову, где я работаю, от ядра идёт световая дуга */
/* «Кто работает»: я — бирюзовый луч из ядра; каждый помощник — свой янтарный спутник, летит к острову, где
 работает, и тянет нитку от меня; фоновые дела (расшифровка и т. п.) — зелёные счётчики на внешнем кольце */
const AMB=(al)=>`rgba(255,184,77,${Math.max(0,Math.min(1,al)).toFixed(3)})`;
const O={cv:$('#oCv'),agenty:{},ag:new Map(),isl:[],arh:[],akt:null,sledy:[],seg:{},feed:[],az:-1.2,el:.52,zoom:1,ruka:0,drag:null,hover:null,run:false,t0:0,
 stars:Array.from({length:520},(_,i)=>{const u=Math.random()*6.283,v=Math.acos(Math.random()*2-1);return[Math.sin(v)*Math.cos(u)*2200,Math.cos(v)*1300,Math.sin(v)*Math.sin(u)*2200,Math.random()]}),
 core:Array.from({length:420},(_,i)=>{const y=1-(i+.5)/420*2,r=Math.sqrt(1-y*y),f=i*2.39996;return[Math.cos(f)*r,y,Math.sin(f)*r]})};
O.c=O.cv.getContext('2d');
const PROCHIE='Прочие навыки';
function ostrStroit(d){
 const by=new Map();for(const n of d.navyki){const a=n.arh||PROCHIE;if(!by.has(a))by.set(a,[]);by.get(a).push(n)}
 // большие архипелаги чередуются с малыми, чтобы кольцо было ровным
 const sv=[...by].sort((a,b)=>b[1].length-a[1].length),gr=[];while(sv.length){gr.push(sv.shift());if(sv.length)gr.push(sv.pop())}
 const N=gr.length,R=N>6?320:260;
 O.arh=[];O.isl=[];
 gr.forEach(([nm,sp],i)=>{const u=i/N*6.283,A={nm,u,cx:Math.cos(u)*R,cz:Math.sin(u)*R,r:20+Math.sqrt(sp.length)*13,isl:[]};O.arh.push(A);
  sp.forEach((n,j)=>{const f=j*2.39996,rr=sp.length>1?A.r*Math.sqrt((j+.5)/sp.length):0;
   const I={name:n.name,imya:n.imya,opis:n.opis,rod:n.rod,A,x:A.cx+Math.cos(f)*rr,y:((j*37)%11-5)*1.4,z:A.cz+Math.sin(f)*rr,ph:j*1.7+i,heat:0,glow:0};A.isl.push(I);O.isl.push(I)})});
 Object.entries(d.osobye||{}).forEach(([k,nm],i)=>{const u=i*Math.PI+.9,A={nm,u,cx:Math.cos(u)*125,cz:Math.sin(u)*125,r:12,isl:[],osob:1};O.arh.push(A);
  const I={name:k,label:nm,opis:k==='_pamyat'?'Память: что я знаю о тебе и о делах':'Задачи: что в работе',A,x:A.cx,y:0,z:A.cz,ph:i*3,heat:0,glow:0};A.isl.push(I);O.isl.push(I)});
 O.agenty=d.agenty||{};O.seg=d.segodnya||{};O.isl.forEach(ostrTeplo);
 const nav=d.navyki.length,arh=O.arh.filter(a=>!a.osob).length;$('#oSum').textContent=`${nav} ${plur(nav,'остров','острова','островов')} · ${arh} ${plur(arh,'архипелаг','архипелага','архипелагов')}`;ostrSegodnya();
 for(const h of d.hod||[])if(h.text)h.text=chel(h.text);
 O.feed=(d.hod||[]).filter(h=>!h.konec).slice(-9);const last=[...(d.hod||[])].reverse().find(h=>!h.agent&&(h.ostrov||h.konec));
 if(last&&!last.konec)ostrCel(last);
 const shest=Date.now()-6e5;for(const h of d.hod||[])if(h.agent&&h.at>shest)agHod(h,1);ostrPanel()}
// шаг помощника: его спутник летит к острову; без острова кружит у ядра
// старые записи хода хранят голый текст команды — в окне его не показываем
const chel=t=>{t=String(t||"");if(!/^команда:/.test(t))return t.replace(/^инструмент (playwright|claude-in-chrome) · .*/,"смотрю страницу в браузере");const m=t.match(/([\w.-]+\.(?:py|mjs|js|ps1|sh|bat))/i);return m?"запускаю скрипт "+m[1]:"выполняю команду"};
function agHod(h,tiho){let g=O.ag.get(h.agent);
 if(!g){g={imya:h.agent,start:h.at||Date.now(),s:.12,ang:O.ag.size*2.3+.7,konec:0,I:null,text:''};O.ag.set(h.agent,g)}
 g.text=h.text||g.text;g.at=h.at||Date.now();g.konec=0;
 if(h.ostrov){const I=O.isl.find(i=>i.name===h.ostrov)||null;if(I&&I!==g.I){g.I=I;g.s=tiho?.8:.12}}}
// помощник сдал работу (мост ставит progress 100) или молчит — гасим спутник
function agSverit(){const now=performance.now();
 for(const p of Object.values(live.processes||{})){if(!p.ag)continue;const im=String(p.name).replace(/^Помощник:\s*/,'');
  let g=O.ag.get(im);if(!g&&p.progress<100&&!p.stoit){g={imya:im,start:p.start||Date.now(),s:.12,ang:O.ag.size*2.3+.7,konec:0,I:null,text:p.note||''};O.ag.set(im,g)}
  if(g&&(p.progress>=100||p.stoit)&&!g.konec)g.konec=now;if(g&&!g.konec&&p.note)g.shag=p.note}
 for(const[k,g]of O.ag)if(g.konec&&now-g.konec>9000)O.ag.delete(k)}
const ostrTeplo=I=>{I.heat=Math.min(1,Math.log2(1+(O.seg[I.name]?.n||0))/4)};
function ostrSegodnya(){const n=Object.values(O.seg).reduce((s,o)=>s+o.n,0),k=Object.keys(O.seg).length;$('#oSeg').textContent=n?`сегодня ${n} ${plur(n,'обращение','обращения','обращений')} к ${k} ${plur(k,'острову','островам','островам')}`:'сегодня обращений не было'}
const imyaOstr=I=>I.label||I.imya||I.name;
const imyaAg=k=>O.agenty[k]||k,kakAg=n=>n==='Помощник'?n:`Помощник «${n}»`;
function ostrCel(h){const I=O.isl.find(i=>i.name===h.ostrov)||null;
 if(O.akt?.I&&O.akt.I!==I)O.sledy.push({I:O.akt.I,at:performance.now()});O.sledy=O.sledy.slice(-12);
 O.akt={I,ostrov:h.ostrov,agent:h.agent?imyaAg(h.agent):null,text:h.text,at:performance.now(),konec:0}}
function ostrHod(h){
 if(h.konec){if(O.akt&&!O.akt.konec)O.akt.konec=performance.now();ostrPanel();return}
 if(h.text)h.text=chel(h.text);O.feed.push(h);O.feed=O.feed.slice(-9);
 if(h.ostrov){const s=(O.seg[h.ostrov]??={n:0,posl:0});s.n++;s.posl=h.at;const I=O.isl.find(i=>i.name===h.ostrov);if(I)ostrTeplo(I);ostrSegodnya()}
 if(h.agent)agHod(h);
 else if(h.ostrov)ostrCel(h);
 else if(O.akt&&!O.akt.konec){O.akt.text=h.text;O.akt.at=performance.now()}
 else O.akt={I:null,ostrov:null,agent:null,text:h.text,at:performance.now(),konec:0};
 ostrPanel()}
function ostrSay(t){$('#oSay').textContent=t||'Пока не отвечала. Напиши мне в поле внизу.'}
const minut=st=>{const m=Math.max(0,Math.round((Date.now()-(st||Date.now()))/6e4));return m<1?'только что':m+' мин'};
function ostrPanel(){const a=O.akt,zhivo=a&&!a.konec&&performance.now()-a.at<12e4;agSverit();
 const ya=`<div class="akt ya"><i></i><div><b>Джинни</b>${zhivo?` → ${esc(a.I?imyaOstr(a.I):a.ostrov||'думает')}`:''}<small>${esc(zhivo?a.text||'работаю':'жду тебя')}</small></div></div>`;
 const ag=[...O.ag.values()].map(g=>`<div class="akt pm${g.konec?' gotov':''}"><i></i><div><b>${esc(g.imya)}</b>${g.I?` → ${esc(imyaOstr(g.I))}`:''}<small>${g.konec?'готово':esc(g.text||g.shag||'начинает')} · ${minut(g.start)}</small></div></div>`);
 const fon=Object.values(live.processes||{}).filter(p=>p.fon&&(p.progress<100||Date.now()-p.at<6e5)).map(p=>`<div class="akt fn${p.progress>=100?' gotov':''}"><i></i><div><b>${esc(p.name)}</b> ${p.stoit?'⛔ встало':Math.round(p.progress)+'%'}<small>${esc(p.note||'')}${p.progress<100&&!p.stoit?ostalos(p):''}</small><u style="--p:${p.progress}%"></u></div></div>`);
 $('#oNow').innerHTML=ya+ag.join('')+fon.join('');
 $('#oFeed').innerHTML=O.feed.slice().reverse().map(h=>`<div${h.agent?' class="ag"':''}><b>${tm(h.at)}</b><span>${esc(h.text)}${h.ostrov?`<u>${esc((I=>I?imyaOstr(I):h.ostrov)(O.isl.find(i=>i.name===h.ostrov)))}</u>`:''}</span></div>`).join('')||'<div><b></b><span style="color:var(--dim)">Пока пусто.</span></div>'}
async function ostrZagruzit(){try{ostrStroit(await (await fetch('/api/ostrova')).json())}catch{$('#oSum').textContent='Мост не отдал острова: старый мост? Перезапусти Джинни ярлыком.'}}
setInterval(()=>{if(O.run&&oknoMotion.active())ostrPanel()},2000);
const ostrAnimation=oknoMotion.loop(ostrKadr);
function ostrVkl(on){if(on===O.run)return;O.run=on;if(!on){ostrAnimation.stop();return}ostrZagruzit();ostrSay($('#say').textContent||'');ostrAnimation.start()}
// камера: поворот вокруг оси (az), наклон (el), приближение
function P(x,y,z){const ca=Math.cos(O.az),sa=Math.sin(O.az),ce=Math.cos(O.el),se=Math.sin(O.el),x1=x*ca-z*sa,z1=x*sa+z*ca,y2=y*ce+z1*se,z2=z1*ce-y*se,s=O.f/(O.D+z2);return{x:O.X+x1*s,y:O.Y-y2*s,s:s*O.D/O.f,z:z2}}
const ugol=a=>Math.atan2(Math.sin(a),Math.cos(a));
const bez=(a,b,c,t)=>(1-t)*(1-t)*a+2*(1-t)*t*b+t*t*c;
function ostrKadr(ts){if(!O.run)return;
 {const fps=fpsNado(!(O.ag&&O.ag.size)&&phase==='idle');if(!fps||ts-(O.kl||0)<1000/fps-2)return;O.kl=ts}
 const sec=$('#vOstr'),hb=document.querySelector('header').getBoundingClientRect().bottom,fb=document.querySelector('footer')?.offsetHeight||0;
 if(sec.style.top!==hb+'px')sec.style.top=hb+'px';if(sec.style.bottom!==fb+'px')sec.style.bottom=fb+'px';
 const cv=O.cv,w=cv.clientWidth,h=cv.clientHeight,d=Math.min(devicePixelRatio||1,2);if(!w||!h)return;
 if(cv.width!==Math.round(w*d)||cv.height!==Math.round(h*d)){cv.width=Math.round(w*d);cv.height=Math.round(h*d)}
 const c=O.c,t=ts/1000,dt=Math.min(.05,(ts-(O.t0||ts))/1000),now=ts,uzk=w<900;O.t0=ts;
 c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,w,h);
 O.X=uzk?w/2:(w-Math.min(340,w*.38))/2;O.Y=uzk?h*.32:h*.47;O.D=1000/O.zoom;O.f=Math.min(uzk?w:w*.7,h*1.4)*1.1;
 // сама поворачиваюсь к острову, где работаю; без дела — медленно плыву
 const a=O.akt,zhivo=a&&!a.konec,sila=!a?0:a.konec?Math.max(0,1-(now-a.konec)/5000):1;
 if(!O.drag&&performance.now()-O.ruka>7000){if(zhivo&&a.I){O.az+=ugol(-Math.PI/2-Math.atan2(a.I.z,a.I.x)+.6-O.az)*Math.min(1,dt*1.2)}else O.az+=dt*.035}
 const cyan=(al)=>`rgba(${themeAccentRgb},${Math.max(0,Math.min(1,al)).toFixed(3)})`,zel=(al)=>`rgba(90,255,200,${Math.max(0,Math.min(1,al)).toFixed(3)})`;
 // звёзды
 for(const s of O.stars){const p=P(s[0],s[1],s[2]);if(p.z<-O.D*.9||p.x<0||p.x>w||p.y<0||p.y>h)continue;c.fillStyle=`rgba(160,230,245,${(.15+.5*s[3]*(.6+.4*Math.sin(t*1.3+s[3]*40))).toFixed(3)})`;const r=s[3]>.93?1.6:1;c.fillRect(p.x,p.y,r,r)}
 // пол: круги орбит, лучи и бегущий радар
 const FY=-46;c.lineWidth=1;
 for(let k=1;k<=7;k++){const r=k*72;c.beginPath();for(let i=0;i<=96;i++){const u=i/96*6.283,p=P(Math.cos(u)*r,FY,Math.sin(u)*r);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.strokeStyle=cyan(k===4?.12:.055);c.stroke()}
 for(let i=0;i<36;i++){const u=i/36*6.283,p1=P(Math.cos(u)*72,FY,Math.sin(u)*72),p2=P(Math.cos(u)*504,FY,Math.sin(u)*504);c.beginPath();c.moveTo(p1.x,p1.y);c.lineTo(p2.x,p2.y);c.strokeStyle=cyan(i%9?.03:.08);c.stroke()}
 const sw=t*.45;for(let k=0;k<26;k++){const u=sw-k*.022,p1=P(0,FY,0),p2=P(Math.cos(u)*504,FY,Math.sin(u)*504);c.beginPath();c.moveTo(p1.x,p1.y);c.lineTo(p2.x,p2.y);c.strokeStyle=cyan(.16*(1-k/26));c.stroke()}
 // архипелаги: пунктирный круг вокруг каждого
 c.setLineDash([3,5]);for(const A of O.arh){const hot=zhivo&&a.I&&a.I.A===A;c.beginPath();for(let i=0;i<=48;i++){const u=i/48*6.283,p=P(A.cx+Math.cos(u)*(A.r+12),FY+4,A.cz+Math.sin(u)*(A.r+12));i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.strokeStyle=cyan(hot?.5:.14);c.stroke()}c.setLineDash([]);
 // дуги: следы прошлых обращений гаснут за минуту
 // мост: почти ровный луч от края ядра к острову
 const YC=34,tochka=(m,I,s)=>P(bez(m.sx,m.mx,I.x,s),bez(YC,m.my,I.y+6,s),bez(m.sz,m.mz,I.z,s)),
 duga=(I,al,cvet,sh)=>{const L=Math.hypot(I.x,I.z)||1,sx=I.x/L*50,sz=I.z/L*50,m={sx,sz,mx:(sx+I.x)/2,mz:(sz+I.z)/2,my:(YC+I.y+6)/2+12};
  c.beginPath();for(let i=0;i<=44;i++){const p=tochka(m,I,i/44);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.strokeStyle=cvet(al);c.lineWidth=sh?1.4:1;
  if(sh){c.shadowColor=cvet(.9);c.shadowBlur=8;c.setLineDash([2,7]);c.lineDashOffset=-performance.now()*.03}c.stroke();c.setLineDash([]);c.shadowBlur=0;c.lineWidth=1;return m};
 O.sledy=O.sledy.filter(s=>now-s.at<60000);for(const s of O.sledy)duga(s.I,.22*(1-(now-s.at)/60000),cyan,0);
 // острова и ядро — по глубине, дальние раньше
 const agI=new Set([...O.ag.values()].filter(g=>!g.konec&&g.I).map(g=>g.I));const sp=O.isl.map(I=>{I.glow+=(((zhivo&&a.I===I)||agI.has(I)?1:0)-I.glow)*Math.min(1,dt*4);const p=P(I.x,I.y+Math.sin(t*.9+I.ph)*3,I.z);I.p=p;return[p.z,I]});
 const pc=P(0,YC,0);sp.push([pc.z,null]);sp.sort((x,y)=>y[0]-x[0]);
 c.font="11px 'JetBrains Mono',monospace";c.textAlign='center';
 for(const[,I]of sp){
  if(!I){// ядро: шар из точек, два кольца, свечение
   const R=40*pc.s,bl=phase==='idle'?.5:1,g=c.createRadialGradient(pc.x,pc.y,0,pc.x,pc.y,R*3.2);g.addColorStop(0,cyan(.28*bl));g.addColorStop(1,cyan(0));c.fillStyle=g;c.fillRect(pc.x-R*3.2,pc.y-R*3.2,R*6.4,R*6.4);
   const rot=t*(phase==='idle'?.25:.8),cr=Math.cos(rot),sr=Math.sin(rot);c.globalCompositeOperation='lighter';
   for(const q of O.core){const x=q[0]*cr-q[2]*sr,z=q[0]*sr+q[2]*cr,br=1+Math.sin(t*2+q[1]*6)*.06*bl,p=P(x*40*br,YC+q[1]*40*br,z*40*br);c.fillStyle=cyan(.25+.5*(1-(p.z-pc.z+40)/80));c.fillRect(p.x,p.y,1.4,1.4)}
   c.globalCompositeOperation='source-over';
   for(const[k,tilt,rad]of[[0,.5,62],[1,-.7,76]]){c.beginPath();for(let i=0;i<=72;i++){const u=i/72*6.283+t*(k?-.3:.4),x=Math.cos(u)*rad,yy=Math.sin(u)*rad*Math.sin(tilt),z=Math.sin(u)*rad*Math.cos(tilt),p=P(x,YC+yy,z);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.strokeStyle=cyan(.32);c.stroke()}
   c.font="600 12px 'Chakra Petch',sans-serif";c.letterSpacing='5px';c.fillStyle=cyan(.9);const pl=P(0,YC+64,0);c.fillText('ДЖИННИ',pl.x,pl.y-8);c.letterSpacing='0px';c.font="11px 'JetBrains Mono',monospace";continue}
  const p=I.p,k=p.s,hv=O.hover===I,mo=zhivo&&a.I===I,gl=I.glow*(mo?sila:1),ht=I.heat;
  const pf=P(I.x,FY+4,I.z);c.beginPath();c.moveTo(pf.x,pf.y);c.lineTo(p.x,p.y);c.strokeStyle=cyan(.06+ht*.12+gl*.3);c.stroke();// ножка к полу
  c.beginPath();c.ellipse(p.x,p.y+2*k,8*k,8*k*Math.sin(O.el),0,0,6.283);c.strokeStyle=cyan(.18+ht*.45+gl*.5);c.stroke();
  if(gl>.02){const f=(t*1.1)%1;c.beginPath();c.ellipse(p.x,p.y+2*k,8*k*(1+f*3.5),8*k*(1+f*3.5)*Math.sin(O.el),0,0,6.283);c.strokeStyle=(mo?cyan:AMB)(gl*(1-f)*.8);c.stroke();
   const top=P(I.x,I.y+120,I.z),lg=c.createLinearGradient(p.x,p.y,top.x,top.y);lg.addColorStop(0,cyan(.7*gl));lg.addColorStop(1,cyan(0));c.strokeStyle=lg;c.lineWidth=3*k;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(top.x,top.y);c.stroke();c.lineWidth=1}
  const r=(I.A.osob?4.2:3)*k*(1+gl*.6+(hv?.4:0));c.fillStyle=gl>.05?'#e8fdff':cyan(.35+ht*.65);if(gl>.05||ht>.5||hv){c.shadowColor=cyan(1);c.shadowBlur=(8+gl*16)*k}
  c.beginPath();c.arc(p.x,p.y,r,0,6.283);c.fill();c.shadowBlur=0;
  if(gl>.05||hv||I.A.osob||(zhivo&&a.I&&a.I.A===I.A&&O.seg[I.name])){c.fillStyle=gl>.05||hv?'#e8fdff':cyan(I.A.osob?.75:.55);c.fillText(imyaOstr(I),p.x,p.y-10*k-4)}}
 // подписи архипелагов: снаружи орбиты, с чёрточкой
 c.font="500 11px 'Chakra Petch',sans-serif";c.letterSpacing='3px';
 for(const A of O.arh){if(A.osob)continue;const ou=Math.atan2(A.cz,A.cx),e=P(A.cx+Math.cos(ou)*(A.r+14),FY+4,A.cz+Math.sin(ou)*(A.r+14)),l=P(A.cx+Math.cos(ou)*(A.r+44),FY+4,A.cz+Math.sin(ou)*(A.r+44));
  const hot=zhivo&&a.I&&a.I.A===A,n=A.isl.reduce((s,I)=>s+(O.seg[I.name]?.n||0),0);c.beginPath();c.moveTo(e.x,e.y);c.lineTo(l.x,l.y);c.lineTo(l.x+(l.x>e.x?18:-18),l.y);c.strokeStyle=cyan(hot?.8:.3);c.stroke();
  const vpr=l.x>e.x,tw=c.measureText(A.nm.toUpperCase()).width+A.nm.length*3;c.textAlign=vpr?'left':'right';const tx=vpr?Math.min(l.x+22,w-12-tw):Math.max(l.x-22,12+tw);c.fillStyle=hot?'#e8fdff':cyan(.75);l.y=Math.min(l.y,h-26);c.fillText(A.nm.toUpperCase(),tx,l.y+4);
  c.letterSpacing='0px';c.font="10px 'JetBrains Mono',monospace";c.fillStyle=cyan(.4);c.fillText(`${A.isl.length} ${plur(A.isl.length,'остров','острова','островов')}${n?` · ${n} сегодня`:''}`,tx,l.y+17);c.font="500 11px 'Chakra Petch',sans-serif";c.letterSpacing='3px'}
 c.letterSpacing='0px';c.textAlign='center';
 // живой мост: по лучу бегут три светлых импульса с хвостами; помощник — зелёный ромб посередине
 if(a&&a.I&&sila>0){const I=a.I,m=duga(I,.5*sila,a.agent?zel:cyan,1);c.globalCompositeOperation='lighter';
  for(let i=0;i<3;i++){const s0=(t*.4+i/3)%1;for(let j=0;j<10;j++){const s=s0-j*.012;if(s<0)break;const p=tochka(m,I,s),cv=(a.agent&&s>.5?zel:cyan);
   c.fillStyle=cv(sila*(1-j/10)*(j?.5:1));if(!j){c.shadowColor=cv(1);c.shadowBlur=10}c.beginPath();c.arc(p.x,p.y,(j?1.3:2.2)*p.s,0,6.283);c.fill();c.shadowBlur=0}}
  c.globalCompositeOperation='source-over';
  }
 // помощники: янтарный ромб-спутник летит по нитке от ядра к своему острову и висит у него; без острова — кружит у ядра
 const kor=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
 for(const g of O.ag.values()){const al=g.konec?Math.max(0,1-(now-g.konec)/9000):1;if(al<=0)continue;let p;
  if(g.I){g.s+=(.8-g.s)*Math.min(1,dt*.9);const m=duga(g.I,.55*al,AMB,1);p=tochka(m,g.I,g.s)}
  else{const u=g.ang+t*.35;p=P(Math.cos(u)*105,YC+18,Math.sin(u)*105)}
  const s=11*p.s;c.save();c.translate(p.x,p.y);c.rotate(Math.PI/4+Math.sin(t*2+g.ang)*.25);c.shadowColor=AMB(1);c.shadowBlur=14*al;c.fillStyle=AMB(.25*al);c.strokeStyle=AMB(al);c.lineWidth=1.6;
  c.fillRect(-s/2,-s/2,s,s);c.strokeRect(-s/2,-s/2,s,s);c.restore();c.shadowBlur=0;
  c.font="600 11px 'Chakra Petch',sans-serif";c.fillStyle=AMB(al);c.fillText(kor(g.imya,26),p.x,p.y-s-8);
  c.font="10px 'JetBrains Mono',monospace";c.fillStyle=AMB(.6*al);c.fillText(kor(g.konec?'готово':(g.text||g.shag||''),40),p.x,p.y+s+12)}
 // фоновые дела: зелёный счётчик с дугой прогресса на внешнем кольце
 const fon=Object.values(live.processes||{}).filter(q=>q.fon&&(q.progress<100||Date.now()-q.at<6e5));
 fon.forEach((q,i)=>{const p={x:(uzk?w*.5:O.X)+(i-(fon.length-1)/2)*190,y:uzk?h*.06+20:52},r=15,al=q.progress>=100?.45:1;
  c.beginPath();c.arc(p.x,p.y,r,0,6.283);c.strokeStyle=zel(.25*al);c.lineWidth=2;c.stroke();
  c.beginPath();c.arc(p.x,p.y,r,-Math.PI/2,-Math.PI/2+6.283*q.progress/100);c.strokeStyle=zel(al);c.shadowColor=zel(1);c.shadowBlur=10;c.lineWidth=2.4;c.stroke();c.shadowBlur=0;c.lineWidth=1;
  c.font="10px 'JetBrains Mono',monospace";c.fillStyle=zel(al);c.fillText(q.stoit?'⛔':Math.round(q.progress)+'%',p.x,p.y+3.5);
  c.font="600 11px 'Chakra Petch',sans-serif";c.fillText(kor(q.name,30),p.x,p.y-r-8)});
 c.font="11px 'JetBrains Mono',monospace";
}
// мышь: тянуть — повернуть, колесо — ближе, наведение — подсказка, нажатие — позвать навык
const oNaid=(x,y)=>{let best=null,bd=196;for(const I of O.isl){if(!I.p)continue;const dd=(I.p.x-x)**2+(I.p.y-y)**2;if(dd<bd){bd=dd;best=I}}return best};
O.cv.addEventListener('pointerdown',e=>{O.drag={x:e.clientX,y:e.clientY,az:O.az,el:O.el,moved:0};O.cv.setPointerCapture(e.pointerId);O.cv.classList.add('tyanu')});
O.cv.addEventListener('pointermove',e=>{const r=O.cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
 if(O.drag){const dx=e.clientX-O.drag.x,dy=e.clientY-O.drag.y;if(Math.abs(dx)+Math.abs(dy)>4)O.drag.moved=1;O.az=O.drag.az+dx*.006;O.el=Math.max(.12,Math.min(1.25,O.drag.el+dy*.004));O.ruka=performance.now();$('#oTip').hidden=true;return}
 const I=oNaid(x,y);O.hover=I;O.cv.style.cursor=I?'pointer':'';const tip=$('#oTip');
 if(!I){tip.hidden=true;return}const n=O.seg[I.name]?.n||0;
 tip.innerHTML=`<b>${esc(imyaOstr(I))}</b>${esc(I.opis||'')}<small>${I.A.osob?'':esc(I.A.nm)+' · '+esc(I.name)+' · '}${n?`сегодня ${n} ${plur(n,'обращение','обращения','обращений')}`:'сегодня не обращалась'}${I.A.osob?'':' · нажми, чтобы позвать'}</small>`;
 tip.hidden=false;tip.style.left=Math.min(x+16,r.width-300)+'px';tip.style.top=Math.max(8,y-10)+'px'});
O.cv.addEventListener('pointerup',e=>{const d=O.drag;O.drag=null;O.cv.classList.remove('tyanu');if(d&&!d.moved&&O.hover&&!O.hover.A.osob)fillQ(`Навык «${imyaOstr(O.hover)}» (${O.hover.name}): `)});
O.cv.addEventListener('pointerleave',()=>{O.hover=null;$('#oTip').hidden=true});
O.cv.addEventListener('wheel',e=>{e.preventDefault();O.zoom=Math.max(.6,Math.min(2.2,O.zoom*Math.exp(-e.deltaY*.0012)));O.ruka=performance.now()},{passive:false});
