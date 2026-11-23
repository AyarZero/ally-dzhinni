// Один callback на анимацию; фон не рисует и не накапливает цепочки при смене вкладок.
const oknoMotion = (() => {
 const loops = new Set();
 const active = () => !document.hidden && document.hasFocus();
 function sync() {
  document.documentElement.classList.toggle('dzhinni-paused', !active());
  for (const loop of loops) loop.sync();
 }
 for (const event of ['focus', 'blur', 'pageshow']) addEventListener(event, sync);
 document.addEventListener('visibilitychange', sync);
 const style = document.createElement('style');
 style.textContent = '.dzhinni-paused *,.dzhinni-paused *::before,.dzhinni-paused *::after{animation-play-state:paused!important;transition:none!important}';
 document.head.append(style);
 sync();
 return {
  active,
  loop(draw) {
   let wanted = false, raf = null;
   const tick = ts => {
    raf = null;
    if (!wanted || !active()) return;
    draw(ts);
    loop.sync();
   };
   const loop = {
    sync() {
     if (wanted && active()) { if (raf === null) raf = requestAnimationFrame(tick); }
     else if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    },
    start() { wanted = true; loop.sync(); },
    stop() { wanted = false; loop.sync(); },
   };
   loops.add(loop);
   return loop;
  },
 };
})();
