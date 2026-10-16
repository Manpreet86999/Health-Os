import { useEffect, useRef } from 'react';
import { registerOverlay } from '../lib/overlays';
import { navigation, sections, locationFor, type Section } from '../lib/os-navigation';
import type { Page } from '../lib/types';
import { OSIcon } from './OSIcon';
import { HealthBrand } from './HealthBrand';

export function OSNavigation({ section, page, panel, open, choose, close }: { section: Section; page: Page; panel: string; open: boolean; choose: (page: Page, panel?: string) => void; close: () => void }) {
  const drawer = useRef<HTMLElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    if (open && drawer.current && window.innerWidth < 1024) return registerOverlay(drawer.current, () => closeRef.current());
  }, [open]);
  const select = (next: Page, detail?: string) => { choose(next, detail); close(); };
  const current = locationFor(page, panel);
  return <div className={`os-navigation hos-navigation ${open ? 'is-open' : ''}`}>
    {open && <button className="hos-nav-scrim" aria-label="Close section navigation" onClick={close}/>}
    <aside className="hos-sidebar" ref={drawer} aria-label="Workspace navigation">
      <a href="#Today" className="hos-brand" aria-label="Health OS home" onClick={e => { e.preventDefault(); select('Today'); }}><HealthBrand/></a>
      <p className="hos-nav-caption">YOUR DAILY SPACE</p>
      <nav aria-label="Health OS domains">{sections.map(s => <div className="hos-nav-group" key={s.name}>
        <button data-domain={s.name} className={`hos-nav-link ${section === s.name ? 'selected' : ''}`} aria-label={s.name} aria-current={section === s.name ? 'page' : undefined} onClick={() => select(s.home)}><OSIcon name={s.name}/><span>{s.name}</span>{section === s.name && <i/>}</button>
        {section === s.name && !['Settings', 'Search'].includes(s.name) && <nav className="hos-nav-children" aria-label={`${s.name} pages`}>{navigation[s.name].map(item => <button key={item.label} aria-current={current.primary === item ? 'page' : undefined} onClick={() => select(item.page, item.panel)}>{item.label}</button>)}</nav>}
      </div>)}</nav>
      <div className="hos-sidebar-footer"><span className="hos-brand-dot"/><span>Your health.<br/><strong>A little clearer, every day.</strong></span></div>
    </aside>
  </div>;
}
