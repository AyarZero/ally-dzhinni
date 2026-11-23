/* ядро */
const cv=$('#core'),cx=cv.getContext('2d');const PN=1000,pr=Array.from({length:PN},()=>[Math.random(),Math.random(),Math.random()]);let rgb=[0,229,255],level=.25;
const hex=h=>{const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]};
// вне фокуса анимация полностью остановлена; в фокусе ограничиваем частоту.
function fpsNado(spokoy){return oknoMotion.active()?(spokoy?20:40):0}
function frame(ts){
 const fps=fpsNado(phase==='idle'||phase==='stop'),w=cv.clientWidth,h=cv.clientHeight,d=Math.min(devicePixelRatio||1,2);
 const resized=Boolean(w&&h&&(cv.width!==Math.round(w*d)||cv.height!==Math.round(h*d)));
 if(!fps||!cv.offsetParent||(!resized&&ts-(frame.l||0)<1000/fps-2))return;frame.l=ts;
 const t=ts/1000;
 if(w&&h){if(resized){cv.width=Math.round(w*d);cv.height=Math.round(h*d)}
 const c=cx;c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,w,h);const tg=hex(PH[phase][1]);for(let i=0;i<3;i++)rgb[i]+=(tg[i]-rgb[i])*.06;
 const[r,g,b]=rgb.map(Math.round),col=a=>`rgba(${r},${g},${b},${Math.max(0,Math.min(1,a)).toFixed(3)})`;
 level+=(({idle:.25,think:.7,work:.85,speak:1,ask:.6,stop:.12})[phase]-level)*.05;const X=w/2,Y=h/2,R=Math.min(w,h)*.335,glowMax=Math.min(w,h)*.49;
 const gr=c.createRadialGradient(X,Y,R*.48,X,Y,glowMax);gr.addColorStop(0,col(.16*(.6+level)));gr.addColorStop(.55,col(.06*(.6+level)));gr.addColorStop(1,col(0));c.fillStyle=gr;c.fillRect(0,0,w,h);
 c.lineWidth=1;for(let i=0;i<22;i++){c.strokeStyle=col(.04+.06*(.5+.5*Math.sin(i*1.3+t*(.5+level))));c.beginPath();c.arc(X,Y,R*(.16+i*.03),0,7);c.stroke()}
 for(let k=0;k<3;k++){c.strokeStyle=col(.25+.4*level);c.lineWidth=k?1:2;const st=t*(.2+level*1.3)*(k%2?-1:1)+k*2.1;c.beginPath();c.arc(X,Y,R*(.8-k*.08),st,st+Math.PI*(.35+.2*k));c.stroke()}
 c.save();c.translate(X,Y);c.rotate(t*.04);c.lineWidth=1;for(let i=0;i<120;i++){const a=i/120*Math.PI*2,lg=i%10==0;c.strokeStyle=col(lg?.55:.2);c.beginPath();c.moveTo(Math.cos(a)*R*1.22,Math.sin(a)*R*1.22);c.lineTo(Math.cos(a)*R*(lg?1.31:1.26),Math.sin(a)*R*(lg?1.31:1.26));c.stroke()}c.restore();
 c.lineWidth=R*.1;c.strokeStyle=col(.22+.15*level);c.shadowColor=col(.85);c.shadowBlur=R*.22;c.beginPath();c.arc(X,Y,R,0,7);c.stroke();c.shadowBlur=0;
 c.globalCompositeOperation='lighter';for(let i=0;i<PN;i++){const p=pr[i],a=p[0]*Math.PI*2+t*.03,nz=Math.sin(a*3+t*.7)*.5+Math.sin(a*7-t*1.1)*.3+Math.sin(a*13+t*1.9)*.2,sp=(p[1]-.5)*R*.16,rr=R+sp+Math.max(0,nz)*R*(.05+.14*level)*p[2];c.fillStyle=col(.2+.65*p[2]*(1-Math.abs(sp)/(R*.1)));c.fillRect(X+Math.cos(a)*rr,Y+Math.sin(a)*rr,p[2]<.85?1:1.8,p[2]<.85?1:1.8)}
 c.globalCompositeOperation='source-over';c.lineWidth=1.2;c.strokeStyle=col(.85);c.beginPath();c.arc(X,Y,R*.94,0,7);c.stroke();
 if(level>.4){c.beginPath();for(let i=0;i<=90;i++){const x=X-R*.55+i*(R*1.1/90),y=Y+Math.sin(i*.45+t*7)*Math.sin(i/90*Math.PI)*R*.13*level*Math.sin(t*2.7+i*.08);i?c.lineTo(x,y):c.moveTo(x,y)}c.strokeStyle=col(.8);c.lineWidth=1.5;c.stroke()}}}
const coreAnimation=oknoMotion.loop(frame);coreAnimation.start();

