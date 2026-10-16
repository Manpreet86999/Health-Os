import {searchOwnerKnowledge} from './knowledge-library.js';
import {recordChatDomain,type ChatDomain} from '../intelligence-chat.js';
import type {Dataset} from '../automation-model.js';
import {fingerprint} from '../automation-model.js';
import {live,dateOf,num,sleepDurationHours,type BioRecord} from '../biology.js';
import {effectiveBiology} from '../legacy-biology.js';
import {daySeries,shiftDay,weightTrend} from '../biological-intelligence.js';
import {labTrends,type MedicalReport} from '../medical.js';
import {isFinishedSession,workSets,logTonnage,bestSetE1rm} from '../training.js';
import {HealthStateService,slope} from './state.js';
import {adaptTrainingSession} from '../training-adaptation.js';
import {intelligenceReadDefinitions,type IntelligenceReadId} from './read-contracts.js';

export const cleanObservation=(r:BioRecord)=>({id:r.id,type:r.type,name:r.name,date:dateOf(r.timestamp),value:r.value??null,unit:r.unit,revision:r.revision,source:r.source,metadata:Object.fromEntries(Object.entries(r.metadata).filter(([key])=>!/(document|photo|dataurl|raw|ocr|storage|file|secret|key|token)/i.test(key)))});
export type CanonicalEvidence={sourceId:string;revision?:number;date?:string;unit?:string;fingerprint:string;kind:'record'|'calculated'|'profile'|'report'|'device';};
export interface CanonicalRead {data:unknown;provenance:CanonicalEvidence[];coverage:{from:string;to:string;returned:number;truncated:boolean};freshness:'device'|'synchronized'|'historical';asOf:string;}
/** Domain read implementation shared with MCP. No writes, secrets, SQL or account override. */
export function executeIntelligenceRead(name:IntelligenceReadId,raw:unknown,dataset:Dataset,today:string):CanonicalRead {
 const input=intelligenceReadDefinitions[name].schema.parse(raw) as {from?:string;to?:string;limit?:number;exercise?:string;metric?:string;query?:string;weekId?:string;productId?:string;reportId?:string;type?:string;marker?:string;domains?:ChatDomain[]};
 const from=input.from||shiftDay(today,-27),to=input.to||today,limit=input.limit||40;
 if(from>to||to>today||(Date.parse(to)-Date.parse(from))/86400000>365)throw new Error('Choose a bounded past window of at most 366 days.');
 const within=(day:string)=>day>=from&&day<=to;
 const rows=effectiveBiology(dataset.db,live(dataset.records).filter(r=>r.userId===dataset.userId)).filter(r=>(['knowledge.search','medical.search_knowledge'].includes(name)||r.metadata.knowledgeDocument!==true)&&(r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true));
 const dated=rows.filter(r=>within(dateOf(r.timestamp))).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||a.id.localeCompare(b.id));
 const provenance:CanonicalEvidence[]=[];
 const source=(id:string,value:unknown,kind:CanonicalEvidence['kind']='record',date?:string,revision?:number,unit?:string)=>{if(!provenance.some(p=>p.sourceId===id))provenance.push({sourceId:id,fingerprint:fingerprint(value),kind,...(date?{date}:{}),...(revision?{revision}:{}),...(unit?{unit}:{})});};
 const observations=(items:BioRecord[])=>{for(const r of items)source(r.id,r,'record',dateOf(r.timestamp),r.revision,r.unit);return items.map(cleanObservation);};
 const sessions=dataset.db.sessions.filter(s=>isFinishedSession(s)&&within(s.date)).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const reports=((dataset.medicalReports||[]) as MedicalReport[]).filter(r=>within(r.collectedAt.slice(0,10))&&(!input.type||r.category===input.type));
 const state=()=>new HealthStateService().observe(dataset,today);
 let data:unknown,total=0;
 if(['knowledge.search','medical.search_knowledge'].includes(name)){const permitted=rows.filter(r=>input.domains!.includes(recordChatDomain(r)));data=searchOwnerKnowledge(permitted,dataset.userId,input.query!,input.limit);for(const hit of (data as ReturnType<typeof searchOwnerKnowledge>).sources){const row=permitted.find(r=>r.id===hit.recordId)!;source(row.id,row,'record',dateOf(row.timestamp),row.revision);}}
 else if(name==='reports.get_saved')data=observations(rows.filter(r=>r.metadata.intelligenceSavedReport===true&&within(String(r.metadata.date))).slice(0,limit));
 else if(name==='reminders.get')data=observations(rows.filter(r=>r.metadata.intelligenceReminder===true).slice(0,limit));
 else if(name.startsWith('profile.')){
  if(name==='profile.get_constraints'){const pain=(dataset.db.painLogs||[]).filter(p=>within(p.date));data={pain,recordedRecovery:observations(dated.filter(r=>r.type==='recoveryNote')),limitation:'Recorded constraints only; no injury diagnosis inferred.'};for(const p of pain)source(p.id,p,'record',p.date);}
  else if(name==='profile.get_goals'){const goals=observations(rows.filter(r=>r.type==='goal'&&!['archived','cancelled'].includes(String(r.metadata.status))));data={goals,targets:dataset.db.targets,goalCount:goals.length,targetCount:dataset.db.targets.length,date:today};source('profile:goals:'+dataset.userId,data,'calculated',today);for(const g of dataset.db.targets)source(g.id,g,'record');}
  else {const fields=name==='profile.get'?['displayName','units','height']:['trainingStyle','dietPreferences','trainingSchedule','equipment','dislikedExercises','communicationStyle'];const inputProfile=name==='profile.get'?dataset.db.profile:dataset.preferences||{};data={status:dataset.profileProvided===false?'not_provided':'recorded',fields:dataset.profileProvided===false&&name==='profile.get'?{}:Object.fromEntries(fields.filter(k=>(inputProfile as any)[k]!==undefined&&(inputProfile as any)[k]!=='').map(k=>[k,(inputProfile as any)[k]]))};source('profile:'+dataset.userId,data,'profile');}
 }else if(name.startsWith('training.')){
  if(name==='training.search_exercises')data=dataset.db.exercises.filter(e=>e.name.toLowerCase().includes((input.query||'').toLowerCase())).slice(0,limit).map(e=>({id:e.id,name:e.name,muscles:e.muscles,equipment:e.equipment,trackingMode:e.trackingMode}));
  else if(name==='training.get_muscle_recovery')data=state().training.muscleRecovery;
  else if(name==='training.create_today_adaptation')data=adaptTrainingSession(state().training.nextWorkout.original,dataset.db.exercises,{recoveryReduced:true});
  else if(name==='training.get_plan_week'){data=dataset.db.weeks.find(w=>w.id===(input.weekId||dataset.db.meta.activeWeekId))||null;if(data)source((data as any).id,data,'record');}
  else {for(const s of sessions)source(s.id,s,'record',s.date);if(name==='training.get_load')data={from,to,completedSessions:sessions.length,workingSets:sessions.reduce((n,s)=>n+s.logs.reduce((m,l)=>m+workSets(l.sets).length,0),0),tonnage:sessions.reduce((n,s)=>n+s.logs.reduce((m,l)=>m+logTonnage(l),0),0),unit:dataset.db.profile.units};else {const points=sessions.flatMap(s=>s.logs.filter(l=>!input.exercise||l.name.toLowerCase()===input.exercise.toLowerCase()).map(l=>({sessionId:s.id,date:s.date,exercise:l.name,sets:workSets(l.sets),tonnage:logTonnage(l),estimated1RM:bestSetE1rm(l),unit:dataset.db.profile.units})));total=points.length;data=points.slice(0,limit);}}
 }else if(name.startsWith('nutrition.')){
  if(name==='nutrition.search_food')data=observations(rows.filter(r=>['food','recipe'].includes(r.type)&&r.name.toLowerCase().includes(input.query!.toLowerCase())).slice(0,limit));
  else {const targets=rows.filter(r=>r.type==='nutritionTarget'&&dateOf(r.timestamp)<=to).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)),target=targets[0];if(target)source(target.id,target,'record',dateOf(target.timestamp),target.revision);if(name==='nutrition.get_targets')data=target?cleanObservation(target):null;else {const days=Math.floor((Date.parse(to)-Date.parse(from))/86400000)+1;const series=daySeries(rows,dataset.db,dataset.skin,to,days).map(row=>({date:row.date,calories:row.Calories,protein:row.Protein,complete:rows.some(r=>r.type==='nutritionDay'&&dateOf(r.timestamp)===row.date&&r.metadata.complete===true),sourceIds:dated.filter(r=>['meal','nutritionDay'].includes(r.type)&&dateOf(r.timestamp)===row.date).map(r=>r.id)}));observations(dated.filter(r=>['meal','nutritionDay'].includes(r.type)));data=name==='nutrition.get_adherence'?{series:series.map(s=>({...s,proteinDelta:s.complete&&s.protein!==null&&target&&num(target,'protein')!==null?s.protein-num(target,'protein')!:null})),completeDays:series.filter(s=>s.complete).length,limitation:'Only explicitly complete diaries support adherence.'}:{series,target:target?cleanObservation(target):null};}}
 }else if(name.startsWith('sleep.')){
  const items=dated.filter(r=>r.type==='sleep'&&r.metadata.nap!==true),points=observations(items).map((r,i)=>({...r,hours:sleepDurationHours(items[i])}));total=points.length;
  if(name==='sleep.get_trend')data={points:points.slice(0,limit),slopeHoursPerDay:slope(points.filter(p=>p.hours!==null).map(p=>({date:p.date,value:p.hours!}))),missingDays:Math.floor((Date.parse(to)-Date.parse(from))/86400000)+1-new Set(points.map(p=>p.date)).size};
  else {const target=rows.filter(r=>r.type==='sleepPreference'&&num(r,'target')!==null).sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];if(target)source(target.id,target,'record',dateOf(target.timestamp),target.revision);const hours=target?num(target,'target'):null;data={targetHours:hours,recordedShortfallHours:hours===null?null:points.reduce((n,p)=>n+(p.hours===null?0:Math.max(0,hours-p.hours)),0),points:points.slice(0,limit),limitation:'Cumulative shortfall against saved target on recorded nights only; not clinical sleep debt.'};}
 }else if(name.startsWith('body.')){
  const items=dated.filter(r=>name==='body.get_weight_history'?r.type==='vital'&&r.metadata.metric==='Weight':name==='body.get_activity_history'?r.type==='vital'&&['Steps','Active Calories'].includes(String(r.metadata.metric)):r.type==='bodyMeasurement'||r.type==='vital'&&r.metadata.metric===input.metric);total=items.length;
  data=name==='body.get_trends'?{weight:weightTrend(rows,to),measurements:observations(items.slice(0,limit))}:observations(items.slice(0,limit)).map(r=>name==='body.get_weight_history'?{...r,value:r.value===null?null:r.unit==='lb'?r.value*.45359237:r.unit==='kg'?r.value:null,unit:'kg',originalUnit:r.unit}:r);
 }else if(name.startsWith('care.')){
  if(name==='care.get_products'||name==='care.get_product_details'){data=dataset.skin.products.filter(p=>!input.productId||p.id===input.productId).map(p=>({...p,ingredientInformation:p.actives.length?'Recorded actives only; full ingredient list unknown':'Ingredients unknown',expired:!!p.expiresAt&&p.expiresAt<today}));for(const p of data as any[])source(p.id,p,'record');}
  else if(name==='care.get_existing_routine'||name==='care.get_routines'){data={tasks:dataset.skin.care.tasks,routines:dataset.skin.routines,commitment:dataset.skin.care.commitment,revision:dataset.skin.care.revision,updatedAt:dataset.skin.care.updatedAt};source('care:routine',data,'record',today,dataset.skin.care.revision);}
  else if(name==='care.get_commitment')data=dataset.skin.care.commitment;
  else if(name==='care.get_user_concerns'||name==='care.get_concerns'){data={profile:dataset.skin.profile,goals:dataset.skin.care.goals};source('care:profile',data,'profile');}
  else data={checkIns:dataset.skin.care.checkIns.filter(r=>within(r.date)).slice(-limit),logs:dataset.skin.logs.filter(r=>within(r.date)).slice(-limit),reviews:dataset.skin.care.reviews.filter(r=>within(r.date)).slice(-limit)};
 }else if(name.startsWith('medical.')){
  for(const r of reports)source(r.id,r,'report',r.collectedAt.slice(0,10),r.revision);
  if(name==='medical.get_reports')data=reports.slice(0,limit).map(r=>({id:r.id,title:r.title,category:r.category,collectedAt:r.collectedAt,laboratory:r.laboratory,status:r.status,revision:r.revision,resultCount:r.results.length}));
  else if(name==='medical.get_report_details'){const r=(dataset.medicalReports||[]).find(r=>r.id===input.reportId);data=r?{id:r.id,title:r.title,collectedAt:r.collectedAt,laboratory:r.laboratory,status:r.status,revision:r.revision,results:r.status==='reviewed'?r.results:[],warnings:r.warnings}:null;if(r)source(r.id,r,'report',r.collectedAt.slice(0,10),r.revision);}
  else if(name==='medical.get_lab_trends'||name==='medical.get_lab_history'){const trends=labTrends(reports).filter(t=>!input.marker||t.name.toLowerCase().includes(input.marker.toLowerCase())||t.points.some(p=>p.loinc===input.marker));data=name==='medical.get_lab_trends'?trends:trends.flatMap(t=>t.points).slice(0,limit);}
  else if(name==='medical.get_timeline')data=[...reports.map(r=>({id:r.id,date:r.collectedAt.slice(0,10),type:'report',title:r.title})),...observations(dated.filter(r=>['symptom','illness'].includes(r.type)))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,limit);
  else if(name==='medical.get_notes')data=observations(dated.filter(r=>r.type==='journal'&&r.domain==='Health'&&r.metadata.clinicalInterpretation===false).slice(0,limit));
  else data=observations((name==='medical.get_medications'?rows:dated).filter(r=>r.type===(name==='medical.get_symptoms'?'symptom':name==='medical.get_medications'?'medication':'illness')).slice(0,limit));
 }else if(name.startsWith('habits.'))data=name==='habits.get_schedule'?{canonical:observations(rows.filter(r=>r.type==='habit')),legacy:dataset.db.habits}:observations(dated.filter(r=>r.type==='habitDone'));
 else if(name==='goals.get_history')data=observations(dated.filter(r=>r.type==='goal'||r.type==='goalCheckIn'));
 else if(name.startsWith('experiments.'))data=observations(rows.filter(r=>r.type==='experiment'&&(name==='experiments.get'||within(dateOf(r.timestamp)))));
 else {observations(dated);const days=Math.floor((Date.parse(to)-Date.parse(from))/86400000)+1;data={from,to,series:daySeries(rows,dataset.db,dataset.skin,to,days),limitation:'Aligned observations, not causal evidence.'};}
 const returned=Array.isArray(data)?data.length:1;
 return {data,provenance:provenance.slice(0,500),coverage:{from,to,returned,truncated:total>returned&&returned>=limit},freshness:dataset.freshness||'historical',asOf:new Date().toISOString()};
}
