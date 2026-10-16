import {useEffect,useState,type CSSProperties} from 'react';
import {dailyNutrition,dailyNutritionKeys,dailyNutritionRecord} from '../../shared/biology';
import {nutritionTotalWrite} from '../../shared/daily-nutrition';
import {useBiologicalData} from '../lib/use-biological-data';
import {NutritionGoalsPanel} from './DailyReportExperience';
const fields={calories:['Calories','kcal',20000],protein:['Protein','g',1000],carbs:['Carbs','g',3000],fat:['Fat','g',1000],fibre:['Fiber','g',300],water:['Water','mL',20000]} as const;
export function NutritionTotals({date,onSaved}:{date:string;onSaved?:()=>void}){
 const {bio,records}=useBiologicalData(),[values,setValues]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[dirty,setDirty]=useState(false);
 const signature=JSON.stringify([dailyNutrition(records,date),dailyNutritionRecord(records,date)?.metadata.notes]);
 const totals=dailyNutrition(records,date);
 useEffect(()=>{if(dirty)return;const totals=dailyNutrition(records,date),row=dailyNutritionRecord(records,date);setValues({...Object.fromEntries(dailyNutritionKeys.map(k=>[k,totals[k]===null?'':String(totals[k])])),note:String(row?.metadata.notes||'')});},[date,signature,dirty]);
 return <><NutritionGoalsPanel/><form className="glass card stack" aria-label="Daily nutrition totals" onSubmit={async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');setSaved(false);
  try{const input=Object.fromEntries(dailyNutritionKeys.filter(k=>values[k]!==''&&values[k]!==undefined).map(k=>[k,Number(values[k])]));if(!Object.keys(input).length)throw new Error('Enter at least one total.');
    const latest=await bio.readRecords();await bio.save(nutritionTotalWrite(latest,date,{...input,note:values.note||''}));setDirty(false);setSaved(true);onSaved?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }}><div className="hos-nutrition-summary"><div className="hos-nutrition-energy"><span>RECORDED ENERGY · {date}</span><strong>{totals.calories===null?'—':totals.calories.toLocaleString()} <small>kcal</small></strong></div><div className="hos-nutrition-macros">{(['protein','carbs','fat'] as const).map(k=><div key={k} style={{'--macro-tone':`var(--hos-${k})`} as CSSProperties}><strong>{totals[k]===null?'—':totals[k]} <small>g</small></strong><span>{fields[k][0]}</span></div>)}</div></div><h2>Daily nutrition totals</h2><div className="flow-field-grid">{dailyNutritionKeys.map(k=><label className="flow-field" key={k}>{fields[k][0]} ({fields[k][1]})<input className="input" aria-label={`${fields[k][0]} (${fields[k][1]})`} type="number" min="0" max={fields[k][2]} step="any" value={values[k]||''} onChange={e=>{setDirty(true);setSaved(false);setValues(v=>({...v,[k]:e.target.value}));}}/></label>)}</div>
 <label>Note (optional)<textarea className="input" maxLength={2000} value={values.note||''} onChange={e=>{setDirty(true);setValues(v=>({...v,note:e.target.value}));}}/></label>
 <small>Blank fields keep their saved value. Water is in millilitres: 3 L = 3,000 mL.</small>
 {error&&<p role="alert">{error}</p>}{saved&&<p role="status">Nutrition totals saved. Account sync follows automatically.</p>}
 <button className="btn btn-hot" disabled={busy||!bio.ready}>{busy?'Saving…':'Save totals'}</button></form></>;
}
