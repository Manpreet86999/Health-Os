import {createContext,useContext,useState,type ReactNode} from 'react';
import {Modal} from './Modal';
import {NutritionTotals} from './NutritionTotals';
import {DailyReadiness} from './DailyReadiness';
import {useBiologicalData} from '../lib/use-biological-data';
import {useDraftState} from '../lib/use-draft';
import {useToast} from './Toast';
import {type BioKind,type BioRecord} from '../../shared/biology';
import {atTime} from '../../shared/biological-intelligence';
import {OSIcon,type OSIconName} from './OSIcon';
export type LogRequest={kind:BioKind;initial?:BioRecord;date?:string;defaults?:Record<string,string|number|boolean>;onSaved?:()=>void|Promise<void>};
const allowed=new Set<BioKind>(['nutritionDay','water','sleep','checkIn','vital','recoveryNote','bodyMeasurement','journal']);
const Context=createContext<{open:(kind:BioKind,initial?:BioRecord,date?:string,defaults?:LogRequest['defaults'],onSaved?:LogRequest['onSaved'])=>void}>({open:()=>{}});
export const useQuickLog=()=>useContext(Context);
export function QuickLogProvider({children}:{children:ReactNode}){
 const [request,setRequest]=useState<LogRequest|null>(null),{selectedDate}=useBiologicalData();
 const close=()=>setRequest(null);
 return <Context.Provider value={{open:(kind,initial,date=selectedDate,defaults,onSaved)=>{if(allowed.has(kind))setRequest({kind,initial,date,defaults,onSaved});}}}>{children}{request&&(request.kind==='checkIn'?<DailyReadiness key={`${request.initial?.id}:${request.date}`} {...request} close={close}/>:request.kind==='nutritionDay'?<Modal open title="Nutrition" onClose={close}><NutritionTotals key={request.date} date={request.date!} onSaved={close}/></Modal>:<Entry key={`${request.kind}:${request.initial?.id}:${request.date}`} request={request} close={close}/>)}</Context.Provider>;
}
function Entry({request,close}:{request:LogRequest;close:()=>void}){
 const {bio,app}=useBiologicalData(),toast=useToast(),{kind,initial,defaults={}}=request,date=request.date!;
 const draft=useDraftState<Record<string,string|number|boolean>>(`quick:${kind}:${initial?.id||'new'}:${date}`,()=>({id:initial?.id||crypto.randomUUID(),name:initial?.name||({water:'Water',sleep:'Sleep',vital:'Weight',recoveryNote:'Recovery note',bodyMeasurement:'Measurement',journal:'Note'}[kind as 'water'])||'',value:initial?.value??'',unit:initial?.unit||(kind==='water'?'mL':kind==='sleep'?'hours':kind==='vital'?app.db?.profile.units||'kg':'cm'),...initial?.metadata,...defaults}));
 const v=draft.value,set=(key:string,value:string|number|boolean)=>draft.setValue(previous=>({...previous,[key]:value}));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const field=(key:string,label:string,type='text',min=0,max=20000)=><label className="flow-field">{label}<input className="input" aria-label={label} type={type} min={min} max={max} step="any" value={String(v[key]??'')} required={['value','name'].includes(key)} onChange={e=>set(key,e.target.value)}/></label>;
 const title=kind==='vital'?'Weight':kind==='sleep'?'Sleep':kind==='water'?'Water':kind==='bodyMeasurement'?'Measurement':'Recovery note';
 return <Modal open title={title} onClose={close}><p className="subtle">{date}</p><form className="stack" onSubmit={async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');try{
   const metadata:BioRecord['metadata']={...initial?.metadata,notes:String(v.notes||'')};
   if(kind==='vital')metadata.metric='Weight';
   if(kind==='sleep'){metadata.nap=v.nap===true;for(const key of ['quality','deep','rem','light','awake'])if(v[key]!==undefined&&v[key]!=='')metadata[key]=Number(v[key]);}
   if(kind==='recoveryNote'){metadata.region=String(v.region||'');metadata.status=String(v.status||'Active');if(v.severity!==undefined&&v.severity!=='')metadata.severity=Number(v.severity);}
   if(kind==='bodyMeasurement')metadata.metric=String(v.metric||v.name);
   if(kind==='water')metadata.beverage='Water';
   const value=['water','sleep','vital','bodyMeasurement'].includes(kind)?Number(v.value):undefined;
   await bio.save({id:String(v.id),type:kind,domain:['vital','bodyMeasurement'].includes(kind)?'Body':'Recover',name:String(v.name||title),timestamp:initial?.timestamp||atTime(date,'12:00'),source:initial?.source||'Health OS manual',quality:initial?.quality||'manual',value,unit:value===undefined?'':String(v.unit),metadata});
   await draft.clear();await request.onSaved?.();toast.push('Entry saved. Account sync follows automatically.','ok');close();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }}>
 {kind==='water'&&<div className="flow-choices">{[250,350,500,750].map(amount=><button type="button" className="btn btn-soft" key={amount} onClick={()=>set('value',amount)}>{amount} mL</button>)}</div>}
 {['water','sleep','vital','bodyMeasurement'].includes(kind)&&field('value',kind==='water'?'Amount (mL)':kind==='sleep'?'Sleep duration (hours)':kind==='vital'?`Weight (${v.unit})`:`Measurement (${v.unit})`,'number',kind==='sleep'?0:0.01,kind==='sleep'?24:20000)}
 {kind==='sleep'&&<><label className="flow-toggle"><input type="checkbox" checked={v.nap===true} onChange={e=>set('nap',e.target.checked)}/>Nap</label><details><summary>Quality & stages (optional)</summary>{field('quality','Sleep quality (1–10)','number',1,10)}{field('deep','Deep sleep (hours)','number',0,24)}{field('rem','REM sleep (hours)','number',0,24)}{field('light','Light sleep (hours)','number',0,24)}</details></>}
 {kind==='bodyMeasurement'&&<>{field('name','Name')}{field('metric','Measurement type')}{field('unit','Unit')}</>}
 {kind==='recoveryNote'&&<>{field('name','Note title')}{field('region','Body area (optional)')}{field('severity','Severity (0–10)','number',0,10)}<label>Status<select className="input" value={String(v.status||'Active')} onChange={e=>set('status',e.target.value)}><option>Active</option><option>Resolved</option></select></label></>}
 <label>Notes (optional)<textarea className="input" maxLength={2000} value={String(v.notes||'')} onChange={e=>set('notes',e.target.value)}/></label>
 {error&&<p role="alert">{error}</p>}<button className="btn btn-hot" disabled={busy||!draft.ready}>{busy?'Saving…':'Save entry'}</button></form></Modal>;
}
export function QuickActions({date,compact=false}:{date?:string;compact?:boolean}){
 const quick=useQuickLog(),{app}=useBiologicalData();
 const actions:{label:string;icon:OSIconName;run:()=>void}[]=[{label:'Weight',icon:'Body',run:()=>quick.open('vital',undefined,date,{metric:'Weight',unit:app.db?.profile.units||'kg'})},{label:'Sleep',icon:'Sleep',run:()=>quick.open('sleep',undefined,date)},{label:'Recovery',icon:'Recover',run:()=>quick.open('checkIn',undefined,date)},{label:'Nutrition',icon:'Eat',run:()=>quick.open('nutritionDay',undefined,date)},{label:'Water',icon:'Water',run:()=>quick.open('water',undefined,date)},{label:'Note',icon:'Describe',run:()=>quick.open('recoveryNote',undefined,date)}];
 return <div className="flow-actionbar" aria-label="Quick actions">{actions.filter(a=>!compact||a.label!=='Note').map(a=><button key={a.label} onClick={a.run}><OSIcon name={a.icon} size={20}/>{a.label}</button>)}</div>;
}

