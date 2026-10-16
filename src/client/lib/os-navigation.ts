import type { Page } from './types';
import { isPage } from '../../shared/workspaces';
export type Section = 'Today' | 'Train' | 'Recover' | 'Body' | 'Insights' | 'Search' | 'Settings';
export type Route = { page: Page; panel: string };
export type View = Route & { label: string };
export type NavItem = { label: string; page: Page; panel: string; views: View[]; group?: string };
export const sections: { name: Section; icon: string; home: Page }[] = [
  {name:'Today',icon:'⌂',home:'Today'}, {name:'Train',icon:'↗',home:'Dashboard'},
  {name:'Recover',icon:'♡',home:'Recover'}, {name:'Body',icon:'⚖',home:'Body'},
  {name:'Insights',icon:'▥',home:'Insights'}, {name:'Search',icon:'⌕',home:'Search'},
  {name:'Settings',icon:'⚙',home:'Settings'},
];
const item=(label:string,page:Page,panel='',tabs?:[string,Page,string][]):NavItem=>({label,page,panel,views:tabs?tabs.map(([label,page,panel])=>({label,page,panel})):[{label,page,panel}]});
export const navigation: Record<Section, NavItem[]> = {
  Today:[item('Overview','Today'),item('Goals & Habits','Targets','',[['Goals','Targets',''],['Habits','Habits','']]),item('Weekly Review','Habits','Weekly Review')],
  Train:[
    item('Training','Dashboard','',[['Today','Dashboard',''],['Active Workout','Tracker','']]),
    item('Planner & Programs','Planner','',[['Planner','Planner',''],['Programs','Programs',''],['Calendar','Calendar',''],['Splits','Library','Splits'],['Saved Plans','Library','Plans']]),
    item('Exercise Library','Library'),
    item('Training History','Records','',[['Workouts','Records',''],['Lifts','ExerciseHistory',''],['PRs','Analyzer','PRs'],['Cardio','Recover','Cardio']]),
  ],
  Recover:[item('Overview','Recover'),item('Daily Check-in','Recover','Daily Check-in'),item('Sleep','Recover','Sleep'),item('Soreness & Pain','Recover','Pain & Injury'),item('Recovery Notes','Recover','Recovery Notes'),item('Nutrition Totals','Recover','Nutrition Totals'),item('History & Analysis','Recover','Readiness History',[['Readiness','Recover','Readiness History'],['Load','Recover','Training Load'],['Trends','Recover','Recovery Trends']])],
  Body:[item('Weight','Body','Weight'),item('Measurements','Body','Measurements'),item('Body Composition','Body','Body Composition'),item('History','Body','Measurement History')],
  Insights:[item('Overview','Insights'),item('Analytics','Analyzer','',[['Training','Analyzer',''],['Nutrition','Insights','Analytics Nutrition'],['Recovery','Insights','Analytics Recovery'],['Sleep','Insights','Analytics Sleep'],['Body','Insights','Analytics Body']]),item('Trends & Baselines','Insights','Trends',[['Trends','Insights','Trends'],['Baselines','Insights','Personal Baselines']]),item('Correlations','Insights','Correlations'),item('Reports','Reports')],
  Search:[item('Universal Search','Search')],
  Settings:[item('Settings','Settings','',[
    ['My Profile','Settings',''],['Appearance','Settings','Appearance'],['Training','Settings','Training'],['Reports','Settings','Reports'],['Connected Services','Settings','Connections'],['HEOS MCP','Settings','HEOS MCP'],['Data & Backup','Settings','Data & account'],['Privacy & Account','Settings','Privacy'],
  ])],
};
export const viewIdentity = (view: Route) => `${view.page}:${view.panel || 'overview'}`;
export const viewManifest = sections.flatMap(section => navigation[section.name].flatMap(item => item.views.map(view => ({ ...view, section: section.name, primary: item.label, identity: viewIdentity(view), href: routeHref(view.page, view.panel) }))));

/** Feature routes are retained as component addresses; only their public location changes. */
export function canonicalRoute(page:Page,panel=''):Route {
  if(page==='Sync')return {page:'Settings',panel:'Data & account'};
  if(!isPage(page))return {page:'Today',panel:''};
  if(page==='Profile')return {page:'Settings',panel:''};
  if(page==='Permissions')return {page:'Settings',panel:'Privacy'};
  if(page==='Body'&&!panel)return {page:'Body',panel:'Weight'};
  if(page==='Settings'&&panel==='Profile')return {page:'Settings',panel:''};
  const aliases:Partial<Record<Page,Record<string,string>>> = {
    Recover:{Overview:'',Readiness:'',Soreness:'Daily Check-in','Stress & Energy':'Daily Check-in','Recovery Balance':'Training Load','Sleep History':'Sleep'},
    Body:{Overview:'','Body-Fat Estimate':'Measurements'},
    Insights:{Overview:'',Training:'Trends',Nutrition:'Trends',Recovery:'Trends',Sleep:'Trends',Body:'Trends'},
  };
  if(page==='Reports'&&['Daily Report','Weekly Report','Monthly Report','Custom Range'].includes(panel)) panel='';
  panel=aliases[page]?.[panel]??panel;
  if(page==='Body'&&!panel)panel='Weight';
  const allowed=Object.values(navigation).flatMap(items=>items.flatMap(item=>item.views)).some(view=>view.page===page&&view.panel===panel);
  return {page,panel:allowed?panel:''};
}
export function locationFor(page:Page,panel='') {
  const route=canonicalRoute(page,panel);
  for(const section of sections) for(const primary of navigation[section.name]) {
    const view=primary.views.find(v=>v.page===route.page&&v.panel===route.panel);
    if(view) return {section:section.name,primary,view};
  }
  // Keep unexpected legacy internal states accessible, with their domain selected.
  const section=sections.find(s=>s.home===route.page)?.name||'Train';
  return {section,primary:navigation[section][0],view:{...route,label:panel||page}};
}
export function owner(page:Page,panel=''):Section {return locationFor(page,panel).section;}
export function routeHref(page:Page,panel=''):string {
  const route=canonicalRoute(page,panel), found=locationFor(route.page,route.panel);
  if(!found.primary.views.some(v=>v.page===route.page&&v.panel===route.panel)) return '#'+route.page+(route.panel?'/'+encodeURIComponent(route.panel):'');
  const home=sections.find(s=>s.name===found.section)!.home;
  return '#'+home+'/'+encodeURIComponent(found.primary.label)+(found.primary.views.length>1?'?tab='+encodeURIComponent(found.view.label):'');
}
export function readRoute(hash:string):Route|null {
  try {
    const [path,query='']=hash.replace(/^#/,'').split('?');
    const [page,encoded='']=path.split('/');
    if(!isPage(page)) return {page:'Today',panel:''};
    const panel=decodeURIComponent(encoded), section=sections.find(s=>s.home===page);
    const primary=section&&navigation[section.name].find(item=>item.label===panel);
    if(primary) {
      const tab=new URLSearchParams(query).get('tab');
      const view=primary.views.find(v=>v.label===tab)||primary.views[0];
      return {page:view.page,panel:view.panel};
    }
    return canonicalRoute(page,panel);
  } catch {return null;}
}
