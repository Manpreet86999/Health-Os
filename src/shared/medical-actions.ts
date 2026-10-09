import { z } from 'zod';
import { dateOf, live, type BioRecord } from './biology.js';
import { fingerprint } from './automation-model.js';
import { labTrends, normalizeLab, type MedicalReport } from './medical.js';
import { CLINICAL_RULES, physiologicalSignals } from './medical-intelligence.js';

export const MEDICAL_ACTION_VERSION = 1;
export const evidenceRefSchema = z.object({kind:z.enum(['report','record','followup','checkin']),id:z.string().min(1).max(150),revision:z.number().int().positive().optional(),resultId:z.string().max(64).optional()});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export const followupInputSchema = z.object({title:z.string().trim().min(1).max(250),type:z.enum(['repeat_test','doctor_visit','medication_review','symptom_review','measurement','custom']),dueAt:z.string().datetime({offset:true}).optional(),sourceRefs:z.array(evidenceRefSchema).max(300).default([]),notes:z.string().max(4000).default('')});
export interface MedicalFollowUp extends z.infer<typeof followupInputSchema> {id:string;createdAt:string;status:'pending'|'scheduled'|'completed'|'snoozed'|'cancelled'|'overdue';provenance:'user'|'report'|'clinical_rule'|'doctor_instruction'|'system_suggestion';completedAt?:string;snoozedUntil?:string;completionSourceRefs?:EvidenceRef[];candidates?:EvidenceRef[];sourceInvalid?:boolean}
export interface MedicalInboxItem {id:string;userId:string;type:string;priority:'informational'|'low'|'medium'|'high';title:string;summary:string;sourceRefs:EvidenceRef[];sourceEventIds:string[];generatedAt:string;dueAt?:string;status:'pending'|'reviewed'|'completed'|'snoozed'|'dismissed'|'expired';snoozedUntil?:string;resolvedAt?:string;deduplicationKey:string;sourceFingerprint:string;automationKey:string;automationVersion:number;cooldownUntil?:string;metadata?:Record<string,unknown>}
export interface FeelingCheckin {id:string;at:string;date:string;feeling:'Normal'|'Tired'|'Unwell';source:'user';noIllnessConfirmed:boolean;sourceRefs:EvidenceRef[]}
export interface ResearchEnrollment {active:boolean;participantId:string;consentedAt:string;endedAt?:string;purpose:string;fields:string[];version:number}
export interface DoctorQuestion {id:string;text:string;createdAt:string;source:'user'|'template';sourceRefs:EvidenceRef[];answered:boolean}
export interface IllnessOutcome {recordId:string;onset:string;recovery?:string;confirmedAt:string;labelQuality:'self-reported';labelSource:'self_report'}
export interface MedicalActionState {inbox:MedicalInboxItem[];followups:MedicalFollowUp[];checkins:FeelingCheckin[];questions:DoctorQuestion[];enrollment:ResearchEnrollment|null;outcomes?:IllnessOutcome[];labCache?:{fingerprint:string;trends:ReturnType<typeof labTrends>};signalCache:Record<string,{fingerprint:string;value:ReturnType<typeof physiologicalSignals>}>;signalSources?:Record<string,{fingerprint:string;date:string}>;updatedAt:string}
export const emptyMedicalActions=():MedicalActionState=>({inbox:[],followups:[],checkins:[],questions:[],enrollment:null,outcomes:[],signalCache:{},updatedAt:''});
export const researchFields=['participantId','date','prior-only physiological deviations','confirmed symptom state','explicitly confirmed illness onset/recovery','explicit feeling check-ins'];
export function cachedMedicalSignals(state:MedicalActionState,records:BioRecord[],date:string){
  const from=new Date(Date.parse(date)-90*86400000).toISOString().slice(0,10);
  const relevant=records.filter(r=>['vital','sleep','sourcePriority'].includes(r.type)&&(r.type==='sourcePriority'||dateOf(r.timestamp)>=from&&dateOf(r.timestamp)<=date));
  const key=fingerprint({schemaVersion:1,sources:relevant.map(r=>[r.id,r.revision,r.updatedAt,r.deletedAt,r.value,r.unit,r.metadata,r.source,r.deviceId,r.timestamp,r.quality])});
  if(state.signalCache[date]?.fingerprint!==key)state.signalCache[date]={fingerprint:key,value:physiologicalSignals(relevant.filter(r=>r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true),date)};
  return state.signalCache[date].value;
}
export function followupStatus(f:MedicalFollowUp,now:string):MedicalFollowUp['status'] {
  if(['completed','cancelled'].includes(f.status))return f.status;
  if(f.snoozedUntil&&f.snoozedUntil>now)return 'snoozed';
  return f.dueAt&&f.dueAt<now?'overdue':f.status==='scheduled'?'scheduled':'pending';
}
export function matchingRepeatResults(f:MedicalFollowUp,reports:MedicalReport[]):EvidenceRef[]{
  const origin=f.sourceRefs.find(r=>r.kind==='report'&&r.resultId);
  const report=reports.find(r=>r.id===origin?.id&&r.status==='reviewed');
  const raw=report?.results.find(r=>r.id===origin?.resultId);if(!raw||f.type!=='repeat_test')return [];
  const previous=normalizeLab(raw);
  return reports.filter(r=>r.status==='reviewed'&&r.id!==report!.id).flatMap(r=>r.results.filter(raw=>{
    const next=normalizeLab(raw);
    return next.value!==undefined&&!next.comparator&&Date.parse(next.collectedAt)>Date.parse(previous.collectedAt)&&Date.parse(r.reviewedAt||r.createdAt)>=Date.parse(f.createdAt)&&
      (previous.loinc?next.loinc===previous.loinc:next.name.toLowerCase()===previous.name.toLowerCase()&&!next.loinc)&&next.unit===previous.unit&&next.method===previous.method&&next.specimen===previous.specimen&&next.laboratory===previous.laboratory;
  }).map(row=>({kind:'report' as const,id:r.id,resultId:row.id,revision:r.revision})));
}
/** Rebuildable projections. User decisions survive replay until their evidence changes. */
export function reconcileMedicalActions(state:MedicalActionState,reports:MedicalReport[],records:BioRecord[],now=new Date().toISOString(),eventIds:Record<string,string[]>={}){
  const wanted=new Set<string>(),today=dateOf(now),active=live(records).filter(r=>r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true);
  const sources=Object.fromEntries(records.filter(r=>['vital','sleep','sourcePriority'].includes(r.type)).map(r=>[r.id,{date:r.type==='sourcePriority'?'all':dateOf(r.timestamp),fingerprint:fingerprint(r)}]));
  const affected=new Set<string>();for(const id of new Set([...Object.keys(sources),...Object.keys(state.signalSources||{})]))if(sources[id]?.fingerprint!==state.signalSources?.[id]?.fingerprint){if(sources[id])affected.add(sources[id].date);if(state.signalSources?.[id])affected.add(state.signalSources[id].date);}
  for(const date of Object.keys(state.signalCache))if(affected.has('all')||[...affected].some(d=>d<=date&&Date.parse(date)-Date.parse(d)<=90*86400000))cachedMedicalSignals(state,records,date);
  state.signalSources=sources;
  const add=(key:string,type:string,title:string,summary:string,refs:EvidenceRef[],priority:MedicalInboxItem['priority']='low',dueAt?:string,metadata?:Record<string,unknown>)=>{
    wanted.add(key);const sourceFingerprint=fingerprint({title,summary,refs,metadata});let item=state.inbox.find(i=>i.deduplicationKey===key);
    if(!item){item={id:`medical:${key}`,userId:'local-user',type,title,summary,sourceRefs:refs,sourceEventIds:refs.flatMap(r=>eventIds[r.id]||[]),priority,dueAt,generatedAt:now,status:'pending',deduplicationKey:key,sourceFingerprint,automationKey:'medical-actions',automationVersion:MEDICAL_ACTION_VERSION,metadata};state.inbox.push(item);}
    else if(item.sourceFingerprint!==sourceFingerprint||item.status==='expired'){Object.assign(item,{title,summary,sourceRefs:refs,sourceEventIds:refs.flatMap(r=>eventIds[r.id]||[]),priority,dueAt,sourceFingerprint,metadata,status:'pending',generatedAt:now,resolvedAt:undefined,snoozedUntil:undefined});}
    else if(item.status==='snoozed'&&(!item.snoozedUntil||item.snoozedUntil<=now))item.status='pending';
  };
  for(const r of reports.filter(r=>r.status==='reviewed'))add(`report:${r.id}`,'new_reviewed_report',r.title,'Reviewed report available. Open the evidence and record any follow-up you choose.',[{kind:'report',id:r.id,revision:r.revision}],'informational');
  const reportFingerprint=fingerprint(reports.map(r=>[r.id,r.revision,r.status]));
  if(state.labCache?.fingerprint!==reportFingerprint)state.labCache={fingerprint:reportFingerprint,trends:labTrends(reports)};
  for(const t of state.labCache.trends){
    const p=t.points.at(-1)!;if(t.flag!=='low'&&t.flag!=='high')continue;
    add(`range:${p.reportId}:${p.id}`,'abnormal_result',`${t.name}: ${p.value} ${t.unit}`,`${t.explanation}${t.points.length>=3?` ${t.direction} across comparable reviewed results.`:''}`,t.points.map(p=>({kind:'report',id:p.reportId,resultId:p.id,revision:p.reportRevision})),'medium',undefined,{rule:CLINICAL_RULES[0],question:t.question,direction:t.direction});
  }
  for(const r of active.filter(r=>['symptom','illness'].includes(r.type)&&!r.metadata.end&&!['Resolved','Recovered'].includes(String(r.metadata.status))))add(`context:${r.id}`,`${r.type}_followup`,r.name,'User-reported context. Update how this is progressing or create a follow-up.',[{kind:'record',id:r.id,revision:r.revision}]);
  for(const r of active.filter(r=>r.type==='symptom'&&r.metadata.emergencyBreathing===true&&r.metadata.status!=='Resolved'&&dateOf(r.timestamp)===today))add(`breathing:${r.id}`,'explicit_red_flag','Severe breathing difficulty was reported.','Seek emergency medical help now using your local emergency service. This follows the symptom you explicitly reported.',[{kind:'record',id:r.id,revision:r.revision}],'high',undefined,{rule:CLINICAL_RULES[1]});
  for(const r of active.filter(r=>r.type==='medication'&&r.metadata.end&&String(r.metadata.end)>=today&&String(r.metadata.end)<=new Date(Date.parse(today)+7*86400000).toISOString().slice(0,10)))add(`course:${r.id}`,'medication_course_ending',`${r.name}: recorded course ending`,'Review the saved course with your clinician or pharmacist. Health OS does not change your medication.',[{kind:'record',id:r.id,revision:r.revision}]);
  for(const f of state.followups){
    f.sourceInvalid=[...f.sourceRefs,...(f.completionSourceRefs||[])].some(ref=>ref.kind==='report'&&!reports.some(r=>r.id===ref.id&&r.status==='reviewed'&&(!ref.resultId||r.results.some(x=>x.id===ref.resultId)))||ref.kind==='record'&&!active.some(r=>r.id===ref.id));
    if(f.provenance==='report'&&!f.sourceRefs.some(ref=>ref.kind==='report'&&reports.some(r=>r.id===ref.id&&r.status==='reviewed'&&r.narrative.includes(f.notes))))f.sourceInvalid=true;
    if(f.sourceInvalid&&f.provenance==='report'&&f.status!=='completed')f.status='cancelled';
    f.status=followupStatus(f,now);f.candidates=f.sourceInvalid?[]:matchingRepeatResults(f,reports);
    if(f.status==='completed'&&!f.sourceInvalid&&f.completedAt&&Date.parse(now)-Date.parse(f.completedAt)<7*86400000)add(`completed:${f.id}`,'followup_completed',f.title,'Follow-up completed by explicit user confirmation. Review the linked evidence.',[{kind:'followup',id:f.id},...f.sourceRefs,...(f.completionSourceRefs||[])],'informational');
    if(f.sourceInvalid||['cancelled','completed','snoozed'].includes(f.status))continue;
    if(f.candidates.length)add(`match:${f.id}`,'matching_result',`New matching result: ${f.title}`,'Comparable reviewed result found. Confirm whether it completes this follow-up.',[{kind:'followup',id:f.id},...f.candidates],'medium');
    if(f.dueAt&&Date.parse(f.dueAt)-Date.parse(now)<=7*86400000)add(`due:${f.id}`,'followup_due',f.title,f.status==='overdue'?'Follow-up overdue.':'Follow-up due within seven days.',[{kind:'followup',id:f.id},...f.sourceRefs],f.status==='overdue'?'medium':'low',f.dueAt);
  }
  const signals=cachedMedicalSignals(state,records,today);
  if(state.enrollment?.active&&signals.coverage>=2&&signals.unusual>=2){
    // One pattern prompt in a 72-hour period, unless the number of unusual signals materially changes.
    const pattern=signals.signals.filter(s=>s.unusual).map(s=>s.metric).sort().join('|');
    const recent=state.inbox.filter(i=>i.type==='research_feeling_check'&&i.cooldownUntil!>now).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))[0];
    const key=recent&&recent.metadata?.pattern===pattern?recent.deduplicationKey:`feeling:${today}:${fingerprint(pattern)}`;
    if(!recent||recent.metadata?.pattern!==pattern||recent.status==='pending'||recent.status==='snoozed'){
      add(key,'research_feeling_check','Several measurements are outside your recent personal range.','How are you feeling? Research observation; this does not diagnose illness.',signals.signals.filter(s=>s.unusual&&s.recordId).flatMap(s=>[s.recordId!,...s.baselineRecordIds].map(id=>({kind:'record' as const,id}))),'low',undefined,{pattern,version:signals.version,threshold:'At least two compatible signals with |robust z| ≥ 3 and 14 prior days; engineering threshold, not clinically validated',state:signals.unusual>=3?'HIGH':'MODERATE',signals:signals.signals.filter(s=>s.unusual)});
      const item=state.inbox.find(i=>i.deduplicationKey===key)!;item.cooldownUntil=new Date(Date.parse(item.generatedAt)+72*3600000).toISOString();
    }else wanted.add(key);
  }
  for(const item of state.inbox)if(!wanted.has(item.deduplicationKey)&&item.status!=='expired'){item.status='expired';item.resolvedAt=now;}
  state.updatedAt=now;return state;
}
export function rankedMedicalInbox(state:MedicalActionState){const rank={high:0,medium:1,low:2,informational:3};return state.inbox.filter(i=>i.status==='pending').sort((a,b)=>rank[a.priority]-rank[b.priority]||(a.dueAt||'9999').localeCompare(b.dueAt||'9999')||b.generatedAt.localeCompare(a.generatedAt)||a.id.localeCompare(b.id));}
export interface MedicalTimelineEntry {id:string;at:string;title:string;detail:string;category:'MEASURED'|'SELF-REPORTED'|'IMPORTED'|'REPORT-DERIVED'|'CALCULATED'|'ESTIMATED';sourceRefs:EvidenceRef[]}
export function medicalTimeline(reports:MedicalReport[],records:BioRecord[],state:MedicalActionState):MedicalTimelineEntry[]{
  const rows:MedicalTimelineEntry[]=live(records).filter(r=>['vital','sleep','symptom','illness','medication','supplement','dose','bodyMeasurement','journal','checkIn','recoveryNote'].includes(r.type)).map(r=>({id:r.id,at:r.timestamp,title:r.name,detail:`${r.value??''} ${r.unit} · ${r.source} · ${String(r.metadata.status||'')} · ${String(r.metadata.concept||'')}`,category:r.quality==='estimated'?'ESTIMATED':r.quality==='imported'?'IMPORTED':['symptom','illness','journal','checkIn','dose'].includes(r.type)?'SELF-REPORTED':'MEASURED',sourceRefs:[{kind:'record',id:r.id,revision:r.revision}]}));
  for(const r of reports.filter(r=>r.status==='reviewed')){rows.push({id:`report:${r.id}`,at:r.reviewedAt||r.createdAt,title:`${r.title} reviewed`,detail:'Reviewed source report; collected '+r.collectedAt,category:'REPORT-DERIVED',sourceRefs:[{kind:'report',id:r.id,revision:r.revision}]});for(const v of r.results)rows.push({id:`lab:${r.id}:${v.id}`,at:v.collectedAt,title:v.name,detail:`${v.comparator||''}${v.value??v.valueText} ${v.unit} · supplied interval ${v.referenceText||`${v.referenceLow??'?'}–${v.referenceHigh??'?'}`} · ${v.laboratory||r.laboratory} · ${v.method} · ${v.specimen} · reviewed`,category:'REPORT-DERIVED',sourceRefs:[{kind:'report',id:r.id,resultId:v.id,revision:r.revision}]});}
  for(const f of state.followups)rows.push({id:f.id,at:f.completedAt||f.createdAt,title:f.title,detail:`Follow-up ${f.status} · ${f.provenance}${f.sourceInvalid?' · source unavailable':''}`,category:'SELF-REPORTED',sourceRefs:[{kind:'followup',id:f.id},...f.sourceRefs]});
  for(const c of state.checkins)rows.push({id:c.id,at:c.at,title:`Feeling ${c.feeling}`,detail:'Explicit user response',category:'SELF-REPORTED',sourceRefs:[{kind:'checkin',id:c.id}]});
  for(const [date,cache] of Object.entries(state.signalCache))if(cache.value.coverage>=2)rows.push({id:`signals:${date}`,at:`${date}T23:59:00+05:30`,title:'Physiological deviation',detail:`${cache.value.level} · ${cache.value.explanation}`,category:'CALCULATED',sourceRefs:cache.value.signals.filter(s=>s.recordId).map(s=>({kind:'record',id:s.recordId!}))});
  return rows.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
}
/** Day d uses only observations on or before d-1; absent outcomes remain null. */
export function prospectiveResearchRows(state:MedicalActionState,records:BioRecord[],dates:string[]){
  const enrollment=state.enrollment;if(!enrollment)return [];
  const episodes=live(records).filter(r=>r.type==='illness'&&state.outcomes?.some(o=>o.recordId===r.id&&o.onset===String(r.metadata.start||dateOf(r.timestamp))&&o.recovery===(r.metadata.end?String(r.metadata.end):undefined)));
  return dates.filter(d=>d>=dateOf(enrollment.consentedAt)&&(!enrollment.endedAt||d<=dateOf(enrollment.endedAt))).map(date=>{
    const prior=new Date(Date.parse(date)-86400000).toISOString().slice(0,10),signals=cachedMedicalSignals(state,records,prior);
    const outcome=(days:number)=>{const horizon=new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);if(episodes.some(r=>String(r.metadata.start||dateOf(r.timestamp))>=date&&String(r.metadata.start||dateOf(r.timestamp))<=horizon))return 1;const daysToObserve=Array.from({length:days+1},(_,i)=>new Date(Date.parse(date)+i*86400000).toISOString().slice(0,10));return daysToObserve.every(d=>state.checkins.some(c=>c.date===d&&c.noIllnessConfirmed))?0:null;};
    const feature=(metric:string,days=1)=>{const values=Array.from({length:days},(_,i)=>cachedMedicalSignals(state,records,new Date(Date.parse(date)-(i+1)*86400000).toISOString().slice(0,10)).signals.find(s=>s.metric===metric)).filter(s=>s?.robustZ!==null&&s?.delta!==null&&s!==undefined);return values.length===days?values.reduce((sum,s)=>sum+s!.delta!,0)/days:null;};
    return {participantId:enrollment.participantId,date,featureThrough:prior,calculationVersion:signals.version,rhrDeviation1d:feature('Resting HR'),rhrDeviation3d:feature('Resting HR',3),rhrDeviation7d:feature('Resting HR',7),hrvDeviation1d:feature('HRV'),hrvDeviation3d:feature('HRV',3),sleepDeviation:feature('Sleep'),activityDeviation:feature('Steps'),temperatureDeviation:feature('Temperature'),respirationDeviation:feature('Respiration'),oxygenDeviation:feature('Oxygen'),feelingPriorDay:state.checkins.find(c=>c.date===prior)?.feeling??null,symptomState:live(records).some(r=>r.type==='symptom'&&dateOf(r.timestamp)===prior)?'self-reported':null,outcomeIllnessWithin1Day:outcome(1),outcomeIllnessWithin3Days:outcome(3),outcomeIllnessWithin7Days:outcome(7)};
  });
}
