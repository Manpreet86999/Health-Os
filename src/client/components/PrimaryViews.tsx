import { legacyViewIds } from '../lib/legacy-view-ids';
import { viewIdentity } from '../lib/os-navigation';
import { Activity, useRef, type ReactNode } from 'react';
import type { Page } from '../lib/types';
import type { locationFor } from '../lib/os-navigation';
import { navigation, sections } from '../lib/os-navigation';

/** Preserve tab drafts while suspending effects and background work in hidden tabs. */
export function PrimaryViews({location,choose,viewKey,children}:{
  location:ReturnType<typeof locationFor>;
  choose:(page:Page,panel?:string)=>void;
  viewKey:string;
  children:ReactNode;
}) {
  const visited=useRef(new Map<string,ReactNode>());
  visited.current.delete(viewKey); visited.current.set(viewKey,children);
  while (visited.current.size > 6) visited.current.delete(visited.current.keys().next().value!);
  const {primary,view}=location;

  const screenId = legacyViewIds[viewIdentity(view)] || viewIdentity(view);
  return <div className="primary-workspace stack">
    {(location.section==='Train')&&<nav className="web-train-modes" aria-label="Training workflow">{[{label:'Plan',page:'Planner' as const},{label:'Train',page:'Dashboard' as const},{label:'Review',page:'Analyzer' as const}].map(item=><button className="btn btn-soft" key={item.label} onClick={()=>choose(item.page)}>{item.label}</button>)}</nav>}
    {(<nav className="stitch-section-nav" aria-label={`${location.section} pages`}>
      {navigation[location.section].map(item => <button type="button" key={item.label} aria-current={item === primary ? 'page' : undefined} onClick={() => choose(item.page, item.panel)}>{item.label}</button>)}
    </nav>)}
    {primary.views.length>1&&<nav className="primary-view-tabs page-tabs" aria-label={`${primary.label} views`}>
      {primary.views.map(tab=><button type="button" key={tab.label} className={`page-tab ${tab.label===view.label?'active':''}`} aria-current={tab.label===view.label?'page':undefined} onClick={()=>choose(tab.page,tab.panel)}>{tab.label}</button>)}
    </nav>}
    {Array.from(visited.current,([key,node])=><Activity key={key} mode={key===viewKey?'visible':'hidden'}><div data-view-key={key} data-stitch-screen={key===viewKey ? screenId : undefined} data-route-identity={key===viewKey ? viewIdentity(view) : undefined} >{node}</div></Activity>)}
  </div>;
}
