import { z } from 'zod';
import { dateOf, live, preferredVitals, type BioRecord } from './biology.js';
import { labTrends, type MedicalReport } from './medical.js';

const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return s.length?s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2:null;};
export function statistics(values:number[]){
  const center=median(values);if(center===null)return {samples:0,median:null,mad:null,mean:null,sd:null,ewma:null};
  const average=values.reduce((a,b)=>a+b,0)/values.length;
  return {samples:values.length,median:center,mad:median(values.map(v=>Math.abs(v-center)))!,mean:average,sd:Math.sqrt(values.reduce((s,v)=>s+(v-average)**2,0)/values.length),ewma:values.reduce((s,v)=>.2*v+.8*s,values[0])};
}
const METRICS=[{name:'Resting HR',unit:'/min',floor:2},{name:'HRV',unit:'ms',floor:5},{name:'Respiration',unit:'/min',floor:1},{name:'Temperature',unit:'Cel',floor:.2},{name:'Skin Temperature',unit:'Cel',floor:.2},{name:'Sleep',unit:'h',floor:.5},{name:'Steps',unit:'{steps}',floor:1000},{name:'Oxygen',unit:'%',floor:1}] as const;
export function physiologicalSignals(records:BioRecord[],date:string){
  const signals=METRICS.map(metric=>{
    const rows=metric.name==='Sleep'?live(records).filter(r=>r.type==='sleep'&&r.metadata.nap!==true&&r.value!==undefined).map(r=>({...r,unit:'h'})):preferredVitals(records,metric.name);
    const current=rows.filter(r=>dateOf(r.timestamp)===date).sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
    // Keep a single source/device/unit stream so switching devices cannot invent a deviation.
    const compatible=rows.filter(r=>current&&r.source===current.source&&r.deviceId===current.deviceId&&r.unit===current.unit&&dateOf(r.timestamp)<date);
    const daily=new Map<string,BioRecord>();for(const r of compatible.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)))daily.set(dateOf(r.timestamp),r);
    const windows=[7,14,28,90].map(days=>({days,...statistics([...daily.values()].filter(r=>{const age=(Date.parse(date)-Date.parse(dateOf(r.timestamp)))/86400000;return age>0&&age<=days;}).map(r=>r.value!))}));
    const baseline=windows[2];const delta=current&&baseline.median!==null?current.value!-baseline.median:null;
    const unitOk=metric.name==='Sleep'||({'bpm':'/min','breaths/min':'/min','°C':'Cel','steps':'{steps}'} as Record<string,string>)[current?.unit||'']===metric.unit||current?.unit===metric.unit;
    const z=delta===null||!unitOk||baseline.samples<14?null:delta/Math.max(metric.floor,1.4826*baseline.mad!);
    const historical=[...daily.values()].filter(r=>(Date.parse(date)-Date.parse(dateOf(r.timestamp)))/86400000<=7);
    const cusum=z===null?null:historical.reduce((sum,r)=>Math.max(0,sum+Math.abs((r.value!-baseline.median!)/Math.max(metric.floor,1.4826*baseline.mad!))-.5),0);
    return {metric:metric.name,unit:current?.unit||metric.unit,current:current?.value??null,recordId:current?.id,source:current?.source,deviceId:current?.deviceId,baselineRecordIds:[...daily.values()].filter(r=>(Date.parse(date)-Date.parse(dateOf(r.timestamp)))/86400000<=28).map(r=>r.id),windows,delta,percent:delta!==null&&baseline.median?delta/Math.abs(baseline.median)*100:null,robustZ:z,cusum,unusual:z!==null&&Math.abs(z)>=3,reason:!current?'No reading today':!unitOk?'Unsupported unit':baseline.samples<14?'At least 14 prior comparable days required':'Compared with prior days; today excluded'};
  });
  const available=signals.filter(s=>s.robustZ!==null),unusual=available.filter(s=>s.unusual);
  const score=available.length?Math.sqrt(available.reduce((sum,s)=>sum+Math.min(10,Math.abs(s.robustZ!))**2,0)/available.length):null;
  return {date,version:'robust-baseline-1.0',signals,score,level:available.length<2?'insufficient':unusual.length>=3?'high':unusual.length?'changed':'usual',unusual:unusual.length,coverage:available.length,explanation:'This research signal detects physiological change. It does not predict or diagnose disease. Travel, exercise, medication, device changes and missing data can affect it.'};
}
export interface RuleDefinition {id:string;version:string;clinicalSource:string;guidelineVersion:string;population:string;requiredInputs:string[];calculation:string;output:string;limitations:string; evidenceLevel:string;reviewedBy:string|null;lastReviewed:string|null;status:'educational'|'pending-clinical-review'}
export const CLINICAL_RULES:RuleDefinition[]=[
  {id:'supplied-lab-range',version:'1.0',clinicalSource:'https://hl7.org/fhir/R4/observation.html',guidelineVersion:'FHIR R4 4.0.1',population:'Report owner with a verified numeric laboratory interval',requiredInputs:['result','unit','reference range'],calculation:'Compare with laboratory supplied interval',output:'Evidence of low / high result',limitations:'Does not infer a diagnosis; comparator results and missing ranges remain unknown.',evidenceLevel:'Source document',reviewedBy:null,lastReviewed:null,status:'educational'},
  {id:'breathing-emergency',version:'1.0',clinicalSource:'https://www.nhs.uk/symptoms/shortness-of-breath/',guidelineVersion:'Source accessed 2026-10-01',population:'Current severe breathing difficulty explicitly reported by user',requiredInputs:['active symptom','emergencyBreathing=true'],calculation:'Explicit emergency symptom check',output:'Seek emergency assessment',limitations:'Not a comprehensive triage service. No automatic severity inference from free text.',evidenceLevel:'Public patient guidance',reviewedBy:null,lastReviewed:null,status:'pending-clinical-review'},
];
export function evidenceCards(reports:MedicalReport[],records:BioRecord[],date:string){
  const cards=labTrends(reports).filter(t=>t.flag==='low'||t.flag==='high').map(t=>({id:`range-${t.points.at(-1)!.reportId}-${t.points.at(-1)!.id}`,ruleId:'supplied-lab-range',version:'1.0',urgency:'routine',summary:t.explanation,detail:t.question,evidenceIds:t.points.map(p=>`${p.reportId}#${p.reportRevision}`),source:CLINICAL_RULES[0].clinicalSource}));
  for(const r of live(records).filter(r=>r.type==='symptom'&&r.metadata.status!=='Resolved'&&r.metadata.emergencyBreathing===true&&dateOf(r.timestamp)===date))cards.unshift({id:`urgent-${r.id}`,ruleId:'breathing-emergency',version:'1.0',urgency:'urgent',summary:'Severe breathing difficulty was reported.',detail:'Seek emergency medical help now using your local emergency service. This message follows the symptom you reported.',evidenceIds:[r.id],source:CLINICAL_RULES[1].clinicalSource});
  return cards;
}
export const calculatorSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('BMI'),weightKg:z.number().finite().positive().max(700),heightCm:z.number().finite().min(50).max(260),age:z.number().int().min(18).max(120)}),
  z.object({type:z.literal('waist-height'),waistCm:z.number().finite().positive().max(400),heightCm:z.number().finite().min(50).max(260),age:z.number().int().min(18).max(120)}),
  z.object({type:z.literal('eGFR'),age:z.number().int().min(18).max(120),sex:z.enum(['female','male']),creatinine:z.number().finite().positive().max(3000),unit:z.enum(['mg/dL','umol/L'])}),
  z.object({type:z.literal('FIB-4'),age:z.number().int().min(35).max(65),ast:z.number().finite().positive().max(10000),alt:z.number().finite().positive().max(10000),platelets:z.number().finite().positive().max(2000)}),
]);
export function calculateMedical(input:unknown){
  const v=calculatorSchema.parse(input);
  if(v.type==='BMI')return {type:v.type,value:v.weightKg/(v.heightCm/100)**2,unit:'kg/m²',version:'Quetelet',population:'Adults 18+',source:'https://www.cdc.gov/bmi/adult-calculator/index.html',limitations:'Screening measure; pregnancy, muscle mass and body composition affect interpretation.'};
  if(v.type==='waist-height')return {type:v.type,value:v.waistCm/v.heightCm,unit:'ratio',version:'1.0',population:'Adults 18+',source:'https://www.nice.org.uk/guidance/ng246',limitations:'Requires comparable measurement technique. No risk category is assigned.'};
  if(v.type==='FIB-4')return {type:v.type,value:v.age*v.ast/(v.platelets*Math.sqrt(v.alt)),unit:'score',version:'Sterling 2006',population:'Conservative app input range 35–65; original HIV/HCV cohort',source:'https://www.hepatitisc.uw.edu/page/clinical-calculators/fib-4',limitations:'AST and ALT in U/L, platelets in 10^9/L from the same draw. Acute illness and other causes of altered inputs can invalidate interpretation; no fibrosis diagnosis.'};
  const scr=v.unit==='umol/L'?v.creatinine/88.4:v.creatinine,female=v.sex==='female',k=female?.7:.9,alpha=female?-.241:-.302;
  return {type:v.type,value:142*Math.min(scr/k,1)**alpha*Math.max(scr/k,1)**-1.2*.9938**v.age*(female?1.012:1),unit:'mL/min/1.73 m²',version:'CKD-EPI creatinine 2021',population:'Adults 18+ with IDMS standardized creatinine',source:'https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/adults',limitations:'Estimate, not a diagnosis or dosing instruction. Unreliable with unstable creatinine and some muscle mass extremes.'};
}
export function medicationReview(records:BioRecord[],asOf=new Date()){
  const today=dateOf(asOf.toISOString());
  const meds=live(records).filter(r=>{const start=String(r.metadata.start||dateOf(r.timestamp)),end=String(r.metadata.end||'');return r.type==='medication'&&start<=today&&(!end||end>=today)&&r.metadata.status!=='Stopped';});const groups=new Map<string,BioRecord[]>();
  for(const r of meds){const key=String(r.metadata.ingredient||r.name).trim().toLowerCase();groups.set(key,[...(groups.get(key)||[]),r]);}
  return {duplicates:[...groups.values()].filter(g=>g.length>1).map(g=>({name:g[0].name,ids:g.map(r=>r.id),message:'Possibly duplicate schedule. Check the active ingredient and prescription with a pharmacist.'})),interactionStatus:'unavailable',message:'A licensed medication knowledge provider is required for drug and supplement interactions. No interaction check has been performed.'};
}
