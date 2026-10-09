import type { Page } from './types';
import { isPage } from '../../shared/workspaces';
export type Section = 'Today' | 'Train' | 'Eat' | 'Recover' | 'Health' | 'Body' | 'Care' | 'Insights' | 'Search' | 'Sync' | 'Settings' | 'Profile';
export type Route = { page: Page; panel: string };
export type View = Route & { label: string };
export type NavItem = { label: string; page: Page; panel: string; views: View[]; group?: string };
export const sections: { name: Section; icon: string; home: Page }[] = [
  {name:'Today',icon:'⌂',home:'Today'}, {name:'Train',icon:'↗',home:'Dashboard'},
  {name:'Eat',icon:'◒',home:'Eat'}, {name:'Recover',icon:'♡',home:'Recover'},
  {name:'Health',icon:'♥',home:'Health'}, {name:'Body',icon:'⚖',home:'Body'},
  {name:'Care',icon:'✦',home:'SkinOverview'}, {name:'Insights',icon:'▥',home:'Insights'},
  {name:'Search',icon:'⌕',home:'Search'}, {name:'Sync',icon:'☁',home:'Sync'},
  {name:'Settings',icon:'⚙',home:'Settings'}, {name:'Profile',icon:'◉',home:'Profile'},
];
const primary = (label:string, page:Page, panel:string, views:View[]):NavItem => ({label,page,panel,views});
export const navigation: Record<Section, NavItem[]> = {
  Today: [
    primary("Overview","Today","",[{"label": "Overview", "page": "Today", "panel": ""}]),
    primary("Timeline","Timeline","",[{"label": "Timeline", "page": "Timeline", "panel": ""}]),
    primary("Goals & Habits","Targets","",[{"label": "Goals", "page": "Targets", "panel": ""}, {"label": "Habits", "page": "Habits", "panel": ""}]),
    primary("Routines & Reminders","Nudges","",[{"label": "Routines & Reminders", "page": "Nudges", "panel": ""}]),
    primary("Weekly Review","Habits","Weekly Review",[{"label": "Weekly Review", "page": "Habits", "panel": "Weekly Review"}]),
  ],
  Train: [
    primary("Training","Dashboard","",[{"label": "Today", "page": "Dashboard", "panel": ""}, {"label": "Active Workout", "page": "Tracker", "panel": ""}, {"label": "Flexible", "page": "Dashboard", "panel": "Flexible"}]),
    primary("Planner","Planner","",[{"label": "Planner", "page": "Planner", "panel": ""}]),
    primary("Programs & Calendar","Programs","",[{"label": "Programs", "page": "Programs", "panel": ""}, {"label": "Splits", "page": "Library", "panel": "Splits"}, {"label": "Calendar", "page": "Calendar", "panel": ""}, {"label": "Saved Plans", "page": "Library", "panel": "Plans"}]),
    primary("Exercise Library","Library","",[{"label": "Exercise Library", "page": "Library", "panel": ""}]),
    primary("Training History","Records","",[{"label": "Workouts", "page": "Records", "panel": ""}, {"label": "Lifts", "page": "ExerciseHistory", "panel": ""}, {"label": "PRs", "page": "Analyzer", "panel": "PRs"}, {"label": "Cardio", "page": "Recover", "panel": "Cardio"}, {"label": "Coach", "page": "Coach", "panel": ""}]),
  ],
  Eat: [
    primary("Overview","Eat","",[{"label": "Overview", "page": "Eat", "panel": ""}]),
    primary("Food Diary","Eat","Food Diary",[{"label": "Food Diary", "page": "Eat", "panel": "Food Diary"}]),
    primary("Log Food","Eat","Search Food",[{"label": "Search", "page": "Eat", "panel": "Search Food"}, {"label": "Barcode", "page": "Eat", "panel": "Scan Barcode"}, {"label": "Describe", "page": "Eat", "panel": "Describe Meal"}, {"label": "Photo", "page": "Eat", "panel": "Snap Meal"}, {"label": "Quick Add", "page": "Eat", "panel": "Quick Add"}]),
    primary("Food Library","Eat","My Foods",[{"label": "Foods", "page": "Eat", "panel": "My Foods"}, {"label": "Saved Meals", "page": "Eat", "panel": "Saved Meals"}, {"label": "Recipes", "page": "Eat", "panel": "Recipes"}, {"label": "Favorites", "page": "Eat", "panel": "Favorites"}]),
    primary("Nutrition & Planning","Eat","Macros",[{"label": "Nutrition", "page": "Eat", "panel": "Macros"}, {"label": "Micronutrients", "page": "Eat", "panel": "Micronutrients"}, {"label": "Water", "page": "Eat", "panel": "Water"}, {"label": "Planner", "page": "Eat", "panel": "Meal Planner"}, {"label": "Targets", "page": "Eat", "panel": "Targets"}, {"label": "TDEE", "page": "Eat", "panel": "Adaptive TDEE"}]),
  ],
  Recover: [
    primary("Overview","Recover","",[{"label": "Overview", "page": "Recover", "panel": ""}]),
    primary("Check-in","Recover","Daily Check-in",[{"label": "Check-in", "page": "Recover", "panel": "Daily Check-in"}, {"label": "Notes", "page": "Recover", "panel": "Recovery Notes"}]),
    primary("Sleep","Recover","Sleep",[{"label": "Sleep", "page": "Recover", "panel": "Sleep"}]),
    primary("Pain & Recovery","Recover","Pain & Injury",[{"label": "Pain & Recovery", "page": "Recover", "panel": "Pain & Injury"}]),
    primary("Recovery Analysis","Recover","Readiness History",[{"label": "Readiness", "page": "Recover", "panel": "Readiness History"}, {"label": "Load", "page": "Recover", "panel": "Training Load"}, {"label": "Fatigue", "page": "Recover", "panel": "Fatigue"}, {"label": "Trends", "page": "Recover", "panel": "Recovery Trends"}]),
  ],
  Health: [
    primary("Overview","Health","",[{"label": "Overview", "page": "Health", "panel": ""}]),
    primary("Vitals","Health","Heart",[{"label": "Heart", "page": "Health", "panel": "Heart"}, {"label": "Activity", "page": "Health", "panel": "Activity"}, {"label": "BP", "page": "Health", "panel": "Blood Pressure"}, {"label": "Glucose", "page": "Health", "panel": "Blood Glucose"}, {"label": "Oxygen", "page": "Health", "panel": "Oxygen"}, {"label": "Temperature", "page": "Health", "panel": "Temperature"}, {"label": "Respiration", "page": "Health", "panel": "Respiration"}]),
    primary("Symptoms & Illness","Health","Symptoms",[{"label": "Symptoms", "page": "Health", "panel": "Symptoms"}, {"label": "Illness", "page": "Health", "panel": "Illness Events"}]),
    primary("Medications & Supplements","Health","Medications",[{"label": "Medications", "page": "Health", "panel": "Medications"}, {"label": "Supplements", "page": "Health", "panel": "Supplements"}]),
    primary("Health Data","Health","Manual Readings",[{"label": "Readings", "page": "Health", "panel": "Manual Readings"}, {"label": "Sources", "page": "Health", "panel": "Connected Sources"}, {"label": "Priority", "page": "Health", "panel": "Source Priority"}, {"label": "Data Quality", "page": "Health", "panel": "Data Quality"}, {label:"Medical Intelligence",page:"Health",panel:"Medical Intelligence"}]),
  ],
  Body: [
    primary("Overview","Body","",[{"label": "Overview", "page": "Body", "panel": ""}]),
    primary("Weight","Body","Weight",[{"label": "Weight", "page": "Body", "panel": "Weight"}]),
    primary("Measurements","Body","Measurements",[{"label": "Measurements", "page": "Body", "panel": "Measurements"}]),
    primary("Body Composition","Body","Body Composition",[{"label": "Body Composition", "page": "Body", "panel": "Body Composition"}]),
    primary("Body History","Body","Measurement History",[{"label": "Body History", "page": "Body", "panel": "Measurement History"}]),
  ],
  Care: [
    primary("Today","SkinOverview","",[{"label": "Today", "page": "SkinOverview", "panel": ""}]),
    primary("Profile & Goals","SkinProfile","",[{"label": "Profile", "page": "SkinProfile", "panel": ""}, {"label": "Goals", "page": "SkinGoals", "panel": ""}]),
    primary("Care Plan","SkinRoutine","",[{"label": "Care Plan", "page": "SkinRoutine", "panel": ""}]),
    primary("Progress","SkinCheckIn","",[{"label": "Observations", "page": "SkinCheckIn", "panel": ""}, {"label": "Calendar", "page": "SkinCalendar", "panel": ""}, {"label": "Progress", "page": "SkinProgress", "panel": ""}, {"label": "Photos", "page": "SkinProgress", "panel": "Photos"}]),
    primary("Products & Coach","SkinProducts","",[{"label": "Products", "page": "SkinProducts", "panel": ""}, {"label": "Research", "page": "SkinAi", "panel": "Research"}, {"label": "Coach", "page": "SkinAi", "panel": ""}, {"label": "Reviews", "page": "SkinReviews", "panel": ""}]),
  ],
  Insights: [
    primary("Overview","Insights","",[{"label": "Overview", "page": "Insights", "panel": ""}]),
    primary("Analytics","Analyzer","",[{"label": "Training", "page": "Analyzer", "panel": ""}, {"label": "Nutrition", "page": "Insights", "panel": "Analytics Nutrition"}, {"label": "Recovery", "page": "Insights", "panel": "Analytics Recovery"}, {"label": "Sleep", "page": "Insights", "panel": "Analytics Sleep"}, {"label": "Body", "page": "Insights", "panel": "Analytics Body"}, {"label": "Care", "page": "Insights", "panel": "Analytics Care"}]),
    primary("Trends & Baselines","Insights","Trends",[{"label": "Trends", "page": "Insights", "panel": "Trends"}, {"label": "Baselines", "page": "Insights", "panel": "Personal Baselines"}]),
    primary("Correlations & Experiments","Insights","Correlations",[{"label": "Correlations", "page": "Insights", "panel": "Correlations"}, {"label": "Anomalies", "page": "Insights", "panel": "Anomalies"}, {"label": "Experiments", "page": "Experiments", "panel": ""}]),
    primary("Coach & Reports","BodyCoach","",[{"label": "Coach", "page": "BodyCoach", "panel": ""}, {"label": "Health Reports", "page": "Reports", "panel": ""}, {"label": "Workout Reports", "page": "Reports", "panel": "Workout Reports"}, {"label": "Research", "page": "Research", "panel": ""}]),
  ],
  Search: [
    primary("Universal Search","Search","",[{"label": "Universal Search", "page": "Search", "panel": ""}]),
  ],
  Sync: [
    primary("Sync & Backup","Sync","",[{"label": "Sync & Backup", "page": "Sync", "panel": ""}]),
  ],
  Settings: [
    primary("Settings","Settings","",[{"label": "Settings", "page": "Settings", "panel": ""}, {"label": "Privacy", "page": "Permissions", "panel": ""}]),
  ],
  Profile: [
    primary("Profile","Profile","",[{"label": "Profile", "page": "Profile", "panel": ""}]),
  ],
};

navigation.Health.push(
  primary('Appointments & Visits','Health','Appointments',[{label:'Appointments',page:'Health',panel:'Appointments'}]),
  primary('Follow-ups','Health','Follow-ups',[{label:'Follow-ups',page:'Health',panel:'Follow-ups'}]),
);
navigation.Today.push(primary('Pods','Today','Pods',[{label:'Pods',page:'Today',panel:'Pods'}]));
navigation.Settings[0].views.push({label:'Reports',page:'Settings',panel:'Reports'});
export const viewIdentity = (view: Route) => `${view.page}:${view.panel || 'overview'}`;
export const viewManifest = sections.flatMap(section => navigation[section.name].flatMap(item => item.views.map(view => ({ ...view, section: section.name, primary: item.label, identity: viewIdentity(view), href: routeHref(view.page, view.panel) }))));

/** Feature routes are retained as component addresses; only their public location changes. */
export function canonicalRoute(page:Page,panel=''):Route {
  const aliases:Partial<Record<Page,Record<string,string>>> = {
    Eat:{Today:'',Overview:'',Breakfast:'Food Diary',Lunch:'Food Diary',Snacks:'Food Diary',Dinner:'Food Diary'},
    Recover:{Overview:'',Readiness:'',Soreness:'Daily Check-in','Stress & Energy':'Daily Check-in','Recovery Balance':'Training Load','Sleep History':'Sleep'},
    Health:{Overview:'','Health Connect':'Connected Sources'},
    Body:{Overview:'','Body-Fat Estimate':'Measurements'},
    Insights:{Overview:'',Training:'Trends',Nutrition:'Trends',Recovery:'Trends',Sleep:'Trends',Health:'Trends',Body:'Trends',Care:'Correlations'},
  };
  if(panel==='Progress Photos') return {page:'SkinProgress',panel:'Photos'};
  if(page==='Reports'&&['Daily Report','Weekly Report','Monthly Report','Custom Range'].includes(panel)) panel='';
  return {page,panel:aliases[page]?.[panel]??panel};
}
export function locationFor(page:Page,panel='') {
  if (page === 'Health' && panel.startsWith('Appointment:')) {
    const primary = navigation.Health.find(item => item.panel === 'Appointments')!;
    return { section: 'Health' as Section, primary, view: { page, panel, label: 'Appointment details' } };
  }
  const route=canonicalRoute(page,panel);
  for(const section of sections) for(const primary of navigation[section.name]) {
    const view=primary.views.find(v=>v.page===route.page&&v.panel===route.panel);
    if(view) return {section:section.name,primary,view};
  }
  // Keep unexpected legacy internal states accessible, with their domain selected.
  const section=page.startsWith('Skin')?'Care':sections.find(s=>s.home===page)?.name||'Train';
  return {section,primary:navigation[section][0],view:{...route,label:panel||page}};
}
export function owner(page:Page,panel=''):Section {return locationFor(page,panel).section;}
export function routeHref(page:Page,panel=''):string {
  const route=canonicalRoute(page,panel), found=locationFor(route.page,route.panel);
  if(!found.primary.views.some(v=>v.page===route.page&&v.panel===route.panel)) return '#'+page+(panel?'/'+encodeURIComponent(panel):'');
  const home=sections.find(s=>s.name===found.section)!.home;
  return '#'+home+'/'+encodeURIComponent(found.primary.label)+(found.primary.views.length>1?'?tab='+encodeURIComponent(found.view.label):'');
}
export function readRoute(hash:string):Route|null {
  try {
    const [path,query='']=hash.replace(/^#/,'').split('?');
    const [page,encoded='']=path.split('/');
    if(!isPage(page)) return null;
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
