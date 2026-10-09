import { useEffect, useState } from 'react';
import { OSIcon } from './OSIcon';
import type { Page } from '../lib/types';
export function MobileNavigation({ page, choose, more, moreOpen, focusedLogging=false }: { page: Page; choose: (page: Page) => void; more: () => void; moreOpen: boolean; focusedLogging?:boolean }) {
  const [keyboardOpen,setKeyboardOpen]=useState(false);
  useEffect(()=>{const viewport=window.visualViewport;const changed=()=>setKeyboardOpen(!!viewport&&window.innerHeight-viewport.height>150);viewport?.addEventListener('resize',changed);return()=>viewport?.removeEventListener('resize',changed);},[]);
  const plan = () => { sessionStorage.setItem('health-os-plan-open', '1'); choose('Timeline'); window.dispatchEvent(new Event('health-os-plan-open')); };
  return <nav className="ux-mobile-nav" aria-label="Main navigation" data-focused-logging={focusedLogging||undefined} style={keyboardOpen?{visibility:'hidden'}:undefined}>
    <button aria-current={page === 'Today' ? 'page' : undefined} onClick={() => choose('Today')}><OSIcon name="Today"/><span>Today</span></button>
    <button aria-current={page === 'Timeline' ? 'page' : undefined} onClick={plan}><OSIcon name="Calendar"/><span>Plan</span></button>
    {!focusedLogging&&<button className="ux-mobile-log" aria-label="Log an entry" onClick={() => window.dispatchEvent(new Event('health-os-open-capture'))}><OSIcon name="Plus"/><span>Log</span></button>}
    <button aria-current={page === 'Insights' || page === 'Analyzer' ? 'page' : undefined} onClick={() => choose('Insights')}><OSIcon name="Insights"/><span>Progress</span></button>
    <button aria-expanded={moreOpen} onClick={more}><OSIcon name="Menu"/><span>More</span></button>
  </nav>;
}
