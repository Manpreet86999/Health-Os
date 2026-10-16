import {dailyNutrition,nutrition,dateOf,type BioRecord} from '../shared/biology';
import {createReportExperience} from '../shared/report-experience';
import {istDate,weekNeedsGoals} from '../shared/daily-report-policy';
import {nutritionTotalWrite} from '../shared/daily-nutrition';
import {daySeries} from '../shared/biological-intelligence';
import {executeHealthAction} from '../shared/health-action-registry';
import {cloudSupports,executionClass} from '../shared/mcp-execution';
import {actionDefinitions,retainedActionIds,isRetainedMcpAction,describeMcpCapabilities,mcpVersion,safeError} from '../shared/mcp-contracts';
export {sections,navigation,canonicalRoute,locationFor,routeHref,readRoute} from '../client/lib/os-navigation';

// The supplied APK owns React, contexts and all styling. This adapter adds no CSS.
let runtime:any,React:any,reportFeatures:any;
export function bindRuntime(value:any){runtime=value;React=value.react;reportFeatures=createReportExperience(React,runtime.useData,async(body:any)=>{const result=await runtime.invoke('body-os-email',body);if(body.action==='week-goals')window.dispatchEvent(new Event('health-os-sync-request'));return result;});}
export function ReportGates(){return React.createElement(React.Fragment,null,React.createElement(reportFeatures.WeekGoalsGate),React.createElement(reportFeatures.DailyReportGate));}
export function Reports(){return React.createElement(reportFeatures.DailyReportsPanel);}
export {istDate,weekNeedsGoals};
export function savedDate(key:string,fallback:string){const value=sessionStorage.getItem(key);return value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:fallback;}
export {dailyNutrition,nutrition,nutritionTotalWrite,daySeries,executeHealthAction,actionDefinitions,retainedActionIds,isRetainedMcpAction,describeMcpCapabilities,mcpVersion};
export {cloudSupports,executionClass};
export function isRetainedPage(page:string){return ['Today','Dashboard','Tracker','Planner','Programs','Calendar','Library','Records','ExerciseHistory','Analyzer','Recover','Body','Insights','Reports','Search','Settings','Targets','Habits','Sync','Profile','Permissions'].includes(page);}

const fields={calories:['Calories','kcal',20000],protein:['Protein','g',1000],carbs:['Carbs','g',3000],fat:['Fat','g',1000],fibre:['Fiber','g',300],water:['Water','mL',20000]} as const;
export function NutritionTotals(){
 const {bio,records,selectedDate:date,setSelectedDate}=runtime.useData();
 const [values,setValues]=React.useState({} as Record<string,string>),[dirty,setDirty]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[saved,setSaved]=React.useState(false);
 const signature=JSON.stringify(dailyNutrition(records,date));
 React.useEffect(()=>{if(dirty)return;const totals=dailyNutrition(records,date);setValues({...Object.fromEntries(Object.keys(fields).map(k=>[k,(totals as any)[k]===null?'':String((totals as any)[k])])),note:String(records.find((r:BioRecord)=>r.type==='nutritionDay'&&r.metadata.dailyTotals&&dateOf(r.timestamp)===date)?.metadata.notes||'')});},[date,signature,dirty]);
 const totals=dailyNutrition(records,date);
 return <section className="flow-workspace stack"><NutritionGoals/><header className="bio-page-head"><h1>Nutrition totals</h1><label>Recovery date<input className="input" aria-label="Recovery date" type="date" value={date} onChange={(e:any)=>{if(e.target.value){setDirty(false);setSaved(false);setSelectedDate(e.target.value);}}}/></label></header><div className="journey-day-summary"><span><strong>{totals.calories??'—'}</strong> kcal</span><span><strong>{totals.protein??'—'}</strong> g protein</span><span><strong>{totals.water??'—'}</strong> mL water</span></div><form className="glass card stack" aria-label="Daily nutrition totals" onSubmit={async(e:any)=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');setSaved(false);
  try{const input=Object.fromEntries(Object.keys(fields).filter(k=>values[k]!==''&&values[k]!==undefined).map(k=>[k,Number(values[k])]));if(!Object.keys(input).length)throw new Error('Enter at least one total.');const latest=await bio.readRecords();await bio.save(nutritionTotalWrite(latest,date,{...input,note:values.note||''}));setDirty(false);setSaved(true);}catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }}><h2>Daily nutrition totals</h2><div className="flow-field-grid">{Object.entries(fields).map(([key,[label,unit,max]])=><label className="flow-field" key={key}>{label} ({unit})<input className="input" aria-label={`${label} (${unit})`} type="number" min="0" max={max} step="any" value={values[key]||''} onChange={(e:any)=>{setDirty(true);setSaved(false);setValues((v:Record<string,string>)=>({...v,[key]:e.target.value}));}}/></label>)}</div><label>Note (optional)<textarea className="input" maxLength={2000} value={values.note||''} onChange={(e:any)=>{setDirty(true);setValues((v:Record<string,string>)=>({...v,note:e.target.value}));}}/></label><small>Blank fields keep their saved value. Water is in millilitres.</small>{error&&<p role="alert">{error}</p>}{saved&&<p role="status">Nutrition totals saved.</p>}<button className="btn btn-hot" disabled={busy||!bio.ready}>{busy?'Saving…':'Save totals'}</button></form></section>;
}

export function QuickLog(){
 const [open,setOpen]=React.useState(false),[totals,setTotals]=React.useState(false),quick=runtime.useQuick(),{app,selectedDate}=runtime.useData();
 React.useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('health-os-open-capture',show);return()=>window.removeEventListener('health-os-open-capture',show);},[]);
 const Modal=runtime.Modal,Icon=runtime.Icon;
 const actions=[['Weight','Body',()=>quick.open('vital',undefined,selectedDate,{metric:'Weight',unit:app.db?.profile.units||'kg'})],['Sleep','Sleep',()=>quick.open('sleep',undefined,selectedDate)],['Recovery','Recover',()=>quick.open('checkIn',undefined,selectedDate)],['Nutrition','Eat',()=>setTotals(true)],['Water','Water',()=>quick.open('water',undefined,selectedDate)],['Recovery note','Describe',()=>quick.open('recoveryNote',undefined,selectedDate)]] as const;
 return <><Modal open={open} title="Quick Log" onClose={()=>setOpen(false)}><div className="flow-field-grid">{actions.map(([label,icon,run])=><button className="btn btn-soft" key={label} onClick={()=>{setOpen(false);run();}}><Icon name={icon} size={20}/>{label}</button>)}</div></Modal><Modal open={totals} title="Nutrition" onClose={()=>setTotals(false)}><NutritionTotals/></Modal></>;
}

export function CommandCenter(){
 const [open,setOpen]=React.useState(false),[query,setQuery]=React.useState(''),{app}=runtime.useData(),Modal=runtime.Modal;
 React.useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('health-os-open-command',show);return()=>window.removeEventListener('health-os-open-command',show);},[]);
 const items=runtime.views.filter((v:any)=>`${v.label} ${v.primary} ${v.section}`.toLowerCase().includes(query.toLowerCase())).slice(0,24);
 return <Modal open={open} title="Health OS command center" onClose={()=>setOpen(false)} className="web-command-center"><label className="form-field">Search or act<input className="input" autoFocus placeholder="Workouts, sleep, nutrition totals…" value={query} onChange={(e:any)=>setQuery(e.target.value)}/></label><div className="web-command-results">{items.map((v:any)=><button key={`${v.page}:${v.panel}`} onClick={()=>{setOpen(false);app.setPage(v.page,v.panel);}}><strong>{v.label}</strong><span>{v.section}</span></button>)}</div></Modal>;
}

export async function executeMcp(state:any,owner:string,job:any){
 try{
  if(!owner||!state.app.db)throw new Error('Sign in and load Health OS first.');
  if(!isRetainedMcpAction(job.action))throw new Error('Unknown HEOS tool.');
  return await executeHealthAction(job.action,job.input,{dataset:{userId:owner,db:state.app.db,skin:state.app.skin,records:state.stored},today:new Date().toLocaleDateString('en-CA'),readRecords:()=>state.bio.readRecords(),saveMany:(rows:any)=>state.bio.saveMany(rows),commit:state.bio.commit,readWorkout:state.app.readWorkout,saveWorkout:state.app.compareAndSetWorkout,weightUnit:state.app.db.profile.units,saveProgram:async(program:any)=>{await state.app.api.saveProgram(program);await state.app.refresh();},finishWorkout:async(draft:any)=>{const {session}=await state.app.api.saveSession({...draft,endedAt:new Date().toISOString()});await state.app.refresh();return{id:session.id};}},job.receiptId);
 }catch(error){return safeError(error);}
}

function NutritionGoals(){return React.createElement(reportFeatures.NutritionGoalsPanel);}
