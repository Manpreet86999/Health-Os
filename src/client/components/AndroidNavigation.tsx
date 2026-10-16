import { useEffect, useRef, useState } from 'react';
import { OSIcon, type OSIconName } from './OSIcon';
import { navigation, locationFor, sections } from '../lib/os-navigation';
import type { Page } from '../lib/types';

const destinations = sections.map(section=>({label:section.name,page:section.home,icon:section.name as OSIconName}));
export function AndroidTopbar({choose}:{choose:(page:Page,panel?:string)=>void}) {
  return <header className="android-topbar"><button className="android-brand" onClick={()=>choose('Today')}>Health <span>OS</span></button><nav aria-label="Global tools">
    <button aria-label="Quick Log" onClick={()=>window.dispatchEvent(new Event('health-os-open-capture'))}><OSIcon name="Plus"/></button>
    <button aria-label="Universal Search" onClick={()=>choose('Search')}><OSIcon name="Search"/></button>
    <button aria-label="Open profile settings" onClick={()=>choose('Settings')}><OSIcon name="Profile"/></button>
    <button aria-label="Global Calendar" onClick={()=>choose('Calendar')}><OSIcon name="Calendar"/></button>
  </nav></header>;
}
export function AndroidNavigation({page,panel,choose}:{page:Page;panel:string;choose:(page:Page,panel?:string)=>void}) {
  const rail=useRef<HTMLElement>(null),[keyboard,setKeyboard]=useState(false);
  const selected=locationFor(page,panel).section;
  useEffect(()=>{rail.current?.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[selected]);
  useEffect(()=>{const viewport=window.visualViewport;const changed=()=>setKeyboard(!!viewport&&window.innerHeight-viewport.height>150);viewport?.addEventListener('resize',changed);return()=>viewport?.removeEventListener('resize',changed);},[]);
  return <nav className="android-bottom-nav" aria-label="Main navigation" ref={rail} hidden={keyboard}>{destinations.map(item=><button key={item.label} data-destination={item.label} aria-current={selected===item.label?'page':undefined} onClick={()=>choose(item.page)}><OSIcon name={item.icon}/><span>{item.label}</span></button>)}</nav>;
}
export function AndroidModuleTools({page,panel,choose}:{page:Page;panel:string;choose:(page:Page,panel?:string)=>void}) {
  const location=locationFor(page,panel),rail=useRef<HTMLElement>(null);
  useEffect(()=>{rail.current?.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});},[page,panel]);
  if(['Settings','Search'].includes(location.section))return null;
  const icon=(label:string):OSIconName=>/sleep/i.test(label)?'Sleep':/nutrition/i.test(label)?'Eat':/habit|goal/i.test(label)?'Goal':/review|report|history/i.test(label)?'Report':/calendar|planner/i.test(label)?'Calendar':location.section;
  return <nav className="hos-module-tabs" aria-label={`${location.section} pages`} ref={rail}>{navigation[location.section].flatMap(item=>item.views).map(view=><button key={`${view.page}:${view.panel}`} aria-current={view.page===location.view.page&&view.panel===location.view.panel?'page':undefined} onClick={()=>choose(view.page,view.panel)}><OSIcon name={icon(view.label)} size={17}/><span>{view.label}</span></button>)}</nav>;
}
