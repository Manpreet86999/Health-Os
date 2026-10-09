/** Shared mobile gestures. Never reload the document or submit a health form. */
export function initializeMobileInteractions() {
  if (document.getElementById('health-os-mobile-gestures')) return;
  const style = document.createElement('style'); style.id='health-os-mobile-gestures';
  style.textContent=`
    .modal{min-height:0;overflow-y:auto;touch-action:pan-y pinch-zoom;overscroll-behavior:contain}
    .modal.health-capture-drawer{height:72dvh!important;max-height:94dvh!important;transition:height .2s ease;will-change:auto}
    .modal.health-capture-drawer[data-expanded=true]{height:94dvh!important}
    .modal.health-capture-drawer:before{display:none!important}
    .hos-drawer-handle{display:block;width:100%;height:32px;min-height:32px;border:0;background:transparent;touch-action:none;cursor:ns-resize}
    .hos-drawer-handle:before{content:'';display:block;width:44px;height:5px;border-radius:9px;background:var(--text-2,#889080);margin:auto}
    .hos-sync-indicator{position:fixed;top:calc(env(safe-area-inset-top) + 12px);left:50%;transform:translateX(-50%);z-index:10050;border:1px solid var(--accent,#baff32);border-radius:24px;padding:10px 18px;background:var(--bg-1,#101710);color:var(--text-0,#fff);pointer-events:none;font:600 14px system-ui}
    .domain-hero-description[data-brief=true]{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .hos-description-toggle{border:0;background:transparent;color:var(--accent);padding:8px 0;font:600 12px system-ui;min-height:36px}
    .and-capture-picker button svg{width:30px;height:30px}.and-capture-picker button{min-height:80px}
    @media(max-width:700px){.os-frame :is(.glass,.os-topbar,.os-bottom-nav,.and-bottom-nav){backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.and-active-workout h1{font-size:clamp(26px,7vw,36px)!important}.domain-hero-metric strong,.health-metric-number{font-variant-numeric:tabular-nums}}
    @media(prefers-reduced-motion:reduce){.health-capture-drawer{transition:none}}
  `; document.head.append(style);
  let refreshAt=0, indicatorTimer:ReturnType<typeof setTimeout>;
  const refresh=()=>{
    if(Date.now()-refreshAt<4000)return; refreshAt=Date.now();
    window.dispatchEvent(new Event('health-os-sync-request'));
    window.dispatchEvent(new Event('body-os-cloud-refresh'));
    window.dispatchEvent(new Event('focus'));
    document.querySelector('.hos-sync-indicator')?.remove();
    const indicator=document.createElement('div');indicator.className='hos-sync-indicator';indicator.role='status';indicator.textContent=navigator.onLine?'↻  Sync requested':'Offline · changes kept on device';document.body.append(indicator);
    clearTimeout(indicatorTimer);indicatorTimer=setTimeout(()=>indicator.remove(),2200);
  };
  const enhance=()=>{
    document.querySelectorAll<HTMLElement>('.domain-hero-description').forEach(description=>{
      if(description.dataset.brief!==undefined||description.textContent!.length<110)return;
      description.dataset.brief='true';
      const button=document.createElement('button');button.type='button';button.className='hos-description-toggle';button.textContent='Show details';button.setAttribute('aria-expanded','false');
      button.onclick=()=>{const expanded=description.dataset.brief==='true';description.dataset.brief=String(!expanded);button.textContent=expanded?'Less detail':'Show details';button.setAttribute('aria-expanded',String(expanded));};
      description.after(button);
    });
    document.querySelectorAll<HTMLElement>('.health-capture-drawer').forEach(drawer=>{
    if(drawer.querySelector('.hos-drawer-handle'))return;
    const handle=document.createElement('button');handle.type='button';handle.className='hos-drawer-handle';handle.ariaLabel='Expand or collapse Quick Capture';handle.setAttribute('aria-expanded','false');
    handle.style.setProperty('touch-action','none','important');
    const setExpanded=(expanded:boolean)=>{drawer.dataset.expanded=String(expanded);handle.setAttribute('aria-expanded',String(expanded));};
    handle.onclick=()=>setExpanded(drawer.dataset.expanded!=='true');
    let startY=0,startHeight=0,dragged=false;
    handle.onpointerdown=e=>{startY=e.clientY;startHeight=drawer.getBoundingClientRect().height;dragged=false;handle.setPointerCapture(e.pointerId);drawer.style.transition='none';};
    handle.onpointermove=e=>{if(!handle.hasPointerCapture(e.pointerId))return;const delta=startY-e.clientY;dragged ||= Math.abs(delta)>6;drawer.style.setProperty('height',`${Math.max(innerHeight*.42,Math.min(innerHeight*.94,startHeight+delta))}px`,'important');};
    const end=(e:PointerEvent)=>{if(!handle.hasPointerCapture(e.pointerId))return;handle.releasePointerCapture(e.pointerId);drawer.style.transition='';drawer.style.height='';if(dragged){setExpanded(startY-e.clientY>0);handle.onclick=null;setTimeout(()=>{handle.onclick=()=>setExpanded(drawer.dataset.expanded!=='true');},0);}};
    handle.onpointerup=end;handle.onpointercancel=e=>{drawer.style.height='';drawer.style.transition='';if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);};
    drawer.prepend(handle);
    });
  };
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});enhance();
  let gesture:{x:number;y:number;scroller:HTMLElement;top:boolean;bottom:boolean}|undefined;
  document.addEventListener('touchstart',event=>{
    gesture=undefined;if(event.touches.length!==1||document.querySelector('.modal-backdrop'))return;
    const target=event.target instanceof Element?event.target:null;
    if(!target||target.closest('input,textarea,select,button,[contenteditable=true],.flash-deck,.hos-drawer-handle'))return;
    let scroller=target as HTMLElement;
    while(scroller!==document.body&&!(scroller.scrollHeight>scroller.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement||document.body;
    if(scroller===document.body)scroller=document.scrollingElement as HTMLElement;
    gesture={x:event.touches[0].clientX,y:event.touches[0].clientY,scroller,top:scroller.scrollTop<=2,bottom:scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3};
  },{passive:true});
  document.addEventListener('touchend',event=>{
    const start=gesture;gesture=undefined;if(!start||!event.changedTouches.length)return;
    const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;
    // Pull down at the top, or swipe up beyond the bottom; ordinary reading stays native.
    if(Math.abs(dy)>85&&Math.abs(dy)>Math.abs(dx)*1.5&&((dy>0&&start.top)||(dy<0&&start.bottom)))refresh();
  },{passive:true});
  document.addEventListener('touchcancel',()=>{gesture=undefined;},{passive:true});
}
