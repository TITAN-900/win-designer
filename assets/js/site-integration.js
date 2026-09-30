// Content/navigation enhancements only; never creates or drives a 3D scene.
function ready(){
  const showcase=document.querySelector('#showcase');
  if(showcase){
    const syncContentView=()=>document.body.classList.toggle('content-in-view',showcase.getBoundingClientRect().bottom<=0);
    window.addEventListener('scroll',syncContentView,{passive:true});
    window.addEventListener('resize',syncContentView,{passive:true});
    syncContentView();
  }
  const menu=document.querySelector('.menu-toggle');
  const nav=document.querySelector('.nav-links');
  function closeMenu(){document.body.classList.remove('menu-open');menu?.setAttribute('aria-expanded','false');}
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('menu-open')){closeMenu();menu?.focus();}
  });
  document.addEventListener('click',event=>{if(!event.target.closest('.site-nav'))closeMenu();});
  window.matchMedia('(min-width:1041px)').addEventListener('change',event=>{if(event.matches)closeMenu();});
  nav?.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!document.body.classList.contains('menu-open'))return;
    const links=[...nav.querySelectorAll('a')];
    if(!event.shiftKey&&document.activeElement===links.at(-1)){event.preventDefault();menu.focus();}
  });
  const range=document.querySelector('#compare-range'),frame=document.querySelector('#renovation-compare');
  range?.addEventListener('input',()=>frame.style.setProperty('--reveal',range.value+'%'));
  if (range && frame) {
    let dragPointer = null;
    frame.addEventListener('dragstart', event => event.preventDefault());
    function revealAt(event) {
      const bounds = frame.getBoundingClientRect();
      const value = Math.round(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)));
      range.value = String(value);
      frame.style.setProperty('--reveal', value + '%');
    }
    frame.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      dragPointer = event.pointerId;
      frame.setPointerCapture(dragPointer);
      revealAt(event);
    });
    frame.addEventListener('pointermove', event => {
      if (event.pointerId === dragPointer) revealAt(event);
    });
    const finishDrag = () => { dragPointer = null; };
    frame.addEventListener('pointerup', finishDrag);
    frame.addEventListener('pointercancel', finishDrag);
    frame.addEventListener('lostpointercapture', finishDrag);
  }
  const lightbox=document.querySelector('#lightbox');
  lightbox?.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!lightbox.classList.contains('is-open'))return;
    const controls=[...lightbox.querySelectorAll('button')];
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
