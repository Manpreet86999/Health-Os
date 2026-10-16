import {useEffect,useRef} from 'react';
import {OSIcon} from './OSIcon';
import type {Page} from '../lib/types';
import {sections,locationFor} from '../lib/os-navigation';
export function MobileNavigation({page,panel,choose,focusedLogging=false}:{page:Page;panel:string;choose:(page:Page)=>void;focusedLogging?:boolean}){
 const active=locationFor(page,panel).section,rail=useRef<HTMLElement>(null);
 useEffect(()=>{rail.current?.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[active]);
 return <><button className="hos-mobile-capture" aria-label="Quick Log" onClick={()=>window.dispatchEvent(new Event('health-os-open-capture'))}><OSIcon name="Plus" size={24}/></button><nav ref={rail} className="ux-mobile-nav" aria-label="Main navigation" data-focused-logging={focusedLogging||undefined}>{sections.map(s=><button key={s.name} aria-current={s.name===active?'page':undefined} onClick={()=>choose(s.home)}><OSIcon name={s.name}/><span>{s.name}</span></button>)}</nav></>;
}
