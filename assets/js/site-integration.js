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
  const lightbox=document.querySelector('#lightbox');
  lightbox?.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!lightbox.classList.contains('is-open'))return;
    const controls=[...lightbox.querySelectorAll('button')];
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
