import { registerOverlay } from '../lib/overlays';
import { useEffect, useRef, useState } from 'react';
import { navigation, sections, locationFor, type Section } from '../lib/os-navigation';
import type { Page } from '../lib/types';
import { OSIcon } from './OSIcon';
import { HealthBrand } from './HealthBrand';

export function OSNavigation({ section, page, panel, open, choose, close }: { section: Section; page: Page; panel: string; open: boolean; choose: (page: Page, panel?: string) => void; close: () => void }) {
  const [preview, setPreview] = useState<Section|null>(null);
  const [touchMenu, setTouchMenu] = useState<Section|null>(null);
  const [wide, setWide] = useState(() => window.innerWidth >= 1280);
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem('health-os-sidebar-pinned') !== '0'; } catch { return true; } });
  useEffect(() => { const change = () => setWide(window.innerWidth >= 1280); window.addEventListener('resize', change); return () => window.removeEventListener('resize', change); }, []);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const container = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const dismissRef = useRef(() => {});
  const cancel = () => { if(timer.current) clearTimeout(timer.current); timer.current=null; };
  const hide = () => { cancel(); timer.current=setTimeout(()=>{setPreview(null);close();},160); };
  const dismiss = () => { cancel();setPreview(null);setTouchMenu(null);close(); };
  const reveal = (name:Section) => { cancel();setPreview(name); };
  const visible = touchMenu || preview || (wide && pinned ? section : open ? section : null);
  dismissRef.current = dismiss;
  useEffect(() => {
    if (!(open || touchMenu) || window.innerWidth >= 1280 || !drawer.current) return;
    return registerOverlay(drawer.current,()=>dismissRef.current());
  }, [open, touchMenu, wide]);
  useEffect(()=>{ const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')dismiss();}; const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))dismiss();}; document.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside);return()=>{cancel();document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside);}; },[open]);
  const select=(next:Page,detail?:string)=>{choose(next,detail);dismiss();};
  const hoverDevice=()=>window.innerWidth >= 1024 && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const activeIndex=visible ? navigation[visible].findIndex(item=>item===locationFor(page,panel).primary) : -1;
  return <div className="os-navigation" data-pinned={wide && pinned} ref={container} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)){setPreview(null);close();}}}>
    <nav className="os-rail" aria-label="Health OS domains" onPointerEnter={cancel} onPointerLeave={e=>{if(e.pointerType!=='touch' && hoverDevice())hide();}}>
      <a className="os-logo-link" aria-label="Health OS home" href="#Today" onClick={e=>{e.preventDefault();select('Today');}} title="Health OS"><HealthBrand symbolOnly/></a>
      {sections.map((s,i)=><button key={s.name} data-domain={s.name} className={`os-rail-item ${section===s.name?'selected':''} ${visible===s.name?'previewing':''} ${i===8?'os-utility-start':''}`} aria-label={s.name} title={s.name} aria-pressed={section===s.name} aria-expanded={visible===s.name} aria-controls={visible===s.name?'os-section-menu':undefined} onPointerEnter={e=>{if(e.pointerType!=='touch' && hoverDevice())reveal(s.name);}} onFocus={()=>{if(hoverDevice())reveal(s.name);}} onClick={()=>{if(hoverDevice()){choose(s.home);setTouchMenu(window.innerWidth<1280?s.name:null);reveal(s.name);}else {setPreview(null);setTouchMenu(touchMenu===s.name?null:s.name);close();}}}><OSIcon name={s.name}/></button>)}
    </nav>
    {visible&&<><button className="os-drawer-scrim" aria-label="Close section navigation" onClick={dismiss}/><aside ref={drawer} id="os-section-menu" className="os-sidebar open" aria-label={`${visible} pages`} onPointerEnter={cancel} onPointerLeave={e=>{if(e.pointerType!=='touch' && hoverDevice())hide();}}>
      <a className="os-sidebar-brand" aria-label="Health OS overview" href="#Today" onClick={e=>{e.preventDefault();select('Today');}}><HealthBrand/></a>
      <div className="os-sidebar-heading"><div><span className="bio-eyebrow">YOUR HEALTH, CONNECTED</span><strong>{visible}</strong></div><button className="btn btn-soft ux-pin" aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'} aria-pressed={pinned} onClick={() => { const next = !pinned; setPinned(next); try { localStorage.setItem('health-os-sidebar-pinned', next ? '1' : '0'); } catch {} }}>{pinned ? 'Unpin' : 'Pin'}</button><button className="icon-btn os-sidebar-close" aria-label="Close section menu" onClick={dismiss}>×</button></div>
      <nav>{navigation[visible].map((item,i)=><div key={`${item.page}-${item.panel||''}`}>{item.group&&<p className="os-nav-group">{item.group}</p>}<button aria-current={i===activeIndex?'page':undefined} className={`os-page-link ${i===activeIndex?'selected':''}`} onClick={()=>select(item.page,item.panel)}>{item.label}<span aria-hidden="true">↗</span></button></div>)}</nav>
      {visible==='Today'&&<div className="os-sidebar-shortcuts"><p className="os-nav-group">YOUR DAILY TOOLS</p><button className="os-page-link" onClick={()=>select('Recover','Sleep')}><OSIcon name="Sleep" size={17}/>Sleep</button><button className="os-page-link" onClick={()=>select('Health','Supplements')}><OSIcon name="Supplements" size={17}/>Supplements</button><button className="os-page-link" onClick={()=>select('Insights')}><OSIcon name="Insights" size={17}/>Insights</button><button className="os-page-link" onClick={()=>select('Sync')}><OSIcon name="Sync" size={17}/>Sync & devices</button></div>}
      <button className="os-sidebar-assistant" onClick={()=>select('BodyCoach')}><span><OSIcon name="AI"/></span><div><strong>Your health assistant</strong><small>A little clarity, every day</small></div><OSIcon name="Forward" size={16}/></button>
      <p className="os-sidebar-foot"><i/> Your body. Your record.</p>
    </aside></>}
  </div>;
}
