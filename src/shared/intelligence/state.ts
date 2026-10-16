import {dateOf,live,num,readiness,mean,sleepDurationHours,type BioRecord} from '../biology.js';
import {effectiveBiology} from '../legacy-biology.js';
import {dailyMetric,preparedWorkout} from '../automation-rules.js';
import {shiftDay,trainingLoad,weightTrend,goalProgress} from '../biological-intelligence.js';
import {isFinishedSession,workSets} from '../training.js';
import {careTasksForDate} from '../skin.js';
import {recordFood,selectProfile,scaleProfile,sumNutrition} from '../food-intelligence.js';
import {fingerprint} from '../automation-model.js';
import {domains,owned,valueOf,unknownValue,recordHash,IntelligenceMetrics,type StateDomain,type StateValue,type EvidenceReference,type HealthData} from './contracts.js';
import {affectedDomains,type HealthEvent} from './events.js';

export interface MuscleRecovery {hoursSince:number|null;workingSets:number;status:'recent_load'|'recovering'|'unknown';confidence:number;sources:EvidenceReference[];}
export interface CurrentHealthState {
  version:1;userId:string;date:string;generatedAt:string;fingerprint:string;
  readiness:{score:StateValue;status:string;contributors:ReturnType<typeof readiness>['contributors'];energy:StateValue};
  training:{currentLoad:StateValue;recentLoad:StateValue;loadChange:StateValue;muscleRecovery:Record<string,MuscleRecovery>;currentWorkout:unknown;nextWorkout:ReturnType<typeof preparedWorkout>;sources:EvidenceReference[]};
  nutrition:{caloriesConsumed:StateValue;calorieTarget:StateValue;proteinConsumed:StateValue;proteinTarget:StateValue;carbsConsumed:StateValue;fatConsumed:StateValue;fibreConsumed:StateValue;plannedCalories:StateValue;plannedProtein:StateValue;complete:StateValue<boolean>;loggedMeals:{id:string;meal:string;name:string;sources:EvidenceReference[]}[];confidence:number};
  recovery:{soreness:StateValue;regionalSoreness:Record<string,StateValue>;fatigue:StateValue;recoveryNeeds:string[];confidence:number};
  sleep:{duration:StateValue;baseline:StateValue;debt:StateValue;quality:StateValue;target:StateValue};
  body:{weight:StateValue;weightTrend:StateValue;weeklyChange:StateValue;waistTrend:StateValue;bodyCompositionTrend:StateValue};
  medical:{signals:EvidenceReference[];unresolvedItems:EvidenceReference[]};
  care:{dueItems:ReturnType<typeof careTasksForDate>;recentObservations:unknown[];sources:EvidenceReference[]};
  goals:{activeGoals:BioRecord[];progressSignals:unknown[]};
  attention:{id:string;domain:StateDomain;priority:number}[];overallConfidence:number;
}
const durableKinds=new Set(['recipe','food','nutritionTarget','sleepPreference','goal','nudgePreference','routine','medication','supplement']);
export function boundedHealthData(data:HealthData,date:string):HealthData {
  const from=shiftDay(date,-89);
  const raw=owned(data.records,data.userId).filter(r=>{if(durableKinds.has(r.type))return true;const day=dateOf(r.timestamp);return day>=from&&day<=date;});
  const db={...data.db,sessions:data.db.sessions.filter(s=>s.date>=from&&s.date<=date),readiness:data.db.readiness.filter(r=>r.date>=from&&r.date<=date),measurements:data.db.measurements.filter(r=>r.date>=from&&r.date<=date)};
  return {...data,db,records:effectiveBiology(db,live(raw).filter(r=>r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true))};
}
export function evidenceFor(records:BioRecord[],ids:string[],domain:StateDomain,label:string):EvidenceReference[]{return [...new Set(ids)].map(id=>{const r=records.find(row=>row.id===id);return {id,domain,label,fingerprint:r?recordHash(r):fingerprint(id),...(r?.value!==undefined?{value:r.value,unit:r.unit}:{})};});}
export function slope(points:{date:string;value:number}[]):number|null{const days=new Map(points.map(p=>[p.date,p.value]));const rows=[...days].sort(([a],[b])=>a.localeCompare(b));if(rows.length<3)return null;const xs=rows.map(([d])=>(Date.parse(d)-Date.parse(rows[0][0]))/86400000),ys=rows.map(([,v])=>v),mx=mean(xs)!,my=mean(ys)!,den=xs.reduce((s,x)=>s+(x-mx)**2,0);return den?xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/den:null;}
function compute(domain:StateDomain,data:HealthData,date:string):CurrentHealthState[StateDomain]{
  const records=data.records,today=records.filter(r=>dateOf(r.timestamp)===date),refs=(ids:string[],label:string)=>evidenceFor(records,ids,domain,label);
  const metric=(name:string)=>{const result=dailyMetric(data,name,date);return valueOf(result.value,refs(result.ids,name),result.ids.length?.8:0);};
  const field=(r:BioRecord|undefined,key:string)=>valueOf(r?num(r,key):null,refs(r?[r.id]:[],key),r?.quality==='estimated'?.35:.8);
  const latest=(type:string)=>records.filter(r=>r.type===type&&dateOf(r.timestamp)<=date).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||b.updatedAt.localeCompare(a.updatedAt))[0];
  if(domain==='readiness'){const ready=readiness(records,date);return {score:valueOf(ready.score,refs(ready.contributors.flatMap(c=>c.ids),'Readiness inputs'),ready.confidence==='Moderate'?.75:ready.score===null?0:.45),status:ready.category,contributors:ready.contributors,energy:metric('Energy')};}
  if(domain==='nutrition'){
    const target=latest('nutritionTarget'),plans=records.filter(r=>r.type==='mealPlan'&&r.metadata.date===date&&r.metadata.confirmed!==true);
    const projected=plans.flatMap(p=>{const food=records.find(r=>r.id===p.metadata.recipeId);if(!food)return [];const canonical=recordFood(food),profile=selectProfile(canonical);if(!profile)return [];try{return [{values:scaleProfile(profile,Number(p.metadata.portions)||1,canonical.type==='recipe'?'serving':canonical.defaultUnit,canonical.conversions),ids:[p.id,food.id]}];}catch{return [];}});
    const totals=sumNutrition(projected.map(p=>p.values)),source=refs(projected.flatMap(p=>p.ids),'Saved meal plans and Food Intelligence profiles');
    const nutritionDay=today.filter(r=>r.type==='nutritionDay').at(-1),calories=metric('Calories'),protein=metric('Protein'),loggedMeals=today.filter(r=>r.type==='meal').map(r=>({id:r.id,meal:String(r.metadata.meal||''),name:r.name,sources:refs([r.id],'Explicitly recorded meal')}));
    return {caloriesConsumed:calories,calorieTarget:field(target,'calories'),proteinConsumed:protein,proteinTarget:field(target,'protein'),carbsConsumed:metric('Carbohydrates'),fatConsumed:metric('Fat'),fibreConsumed:metric('Fibre'),plannedCalories:valueOf(totals.calories??null,source),plannedProtein:valueOf(totals.protein??null,source),complete:valueOf(nutritionDay?nutritionDay.metadata.complete===true:null,refs(nutritionDay?[nutritionDay.id]:[],'Explicit diary completeness')),loggedMeals,confidence:Math.min(calories.confidence,protein.confidence)};
  }
  if(domain==='sleep'){
    const history=records.filter(r=>r.type==='sleep'&&!r.metadata.nap&&r.quality!=='estimated'&&dateOf(r.timestamp)<date&&dateOf(r.timestamp)>=shiftDay(date,-28));const daily=new Map(history.map(r=>[dateOf(r.timestamp),r]));const rows=[...daily.values()].filter(r=>sleepDurationHours(r)!==null),duration=metric('Sleep'),avg=rows.length>=7?mean(rows.map(r=>sleepDurationHours(r)!)):null;
    const baseline=valueOf(avg,refs(rows.map(r=>r.id),'Prior 28-day sleep baseline'),Math.min(.9,rows.length/20));if(rows.length&&rows.length<7)baseline.status='insufficient_data';
    const latestSleep=today.filter(r=>r.type==='sleep'&&!r.metadata.nap).at(-1),target=field(latest('sleepPreference'),'target');
    return {duration,baseline,debt:valueOf(duration.value!==null&&avg!==null?Math.max(0,avg-duration.value):null,[...duration.sources,...baseline.sources],Math.min(duration.confidence,baseline.confidence)),quality:field(latestSleep,'quality'),target};
  }
  if(domain==='recovery'){
    const soreness=metric('Soreness'),regionalSoreness:Record<string,StateValue>={};for(const r of today.filter(r=>r.type==='recoveryNote'&&typeof r.metadata.severity==='number'))regionalSoreness[String(r.metadata.region||r.name).toLowerCase()]=field(r,'severity');
    const energy=metric('Energy');return {soreness,regionalSoreness,fatigue:valueOf(energy.value===null?null:10-energy.value,energy.sources,energy.confidence),recoveryNeeds:[...(soreness.value!==null&&soreness.value>=7?['Review soreness before training']:[]),...Object.keys(regionalSoreness).filter(k=>regionalSoreness[k].value!>=7).map(k=>`Review ${k} soreness`)],confidence:Math.max(soreness.confidence,...Object.values(regionalSoreness).map(r=>r.confidence),0)};
  }
  if(domain==='training'){
    const sessions=data.db.sessions.filter(isFinishedSession),load=trainingLoad(data.db,date),sources=sessions.filter(s=>s.date>=shiftDay(date,-34)).map(s=>({id:s.id,domain,label:`Completed workout ${s.date}`,fingerprint:fingerprint(s)}));
    const muscleRecovery:Record<string,MuscleRecovery>={};for(const session of sessions.sort((a,b)=>a.date.localeCompare(b.date)))for(const log of session.logs.filter(l=>l.status!=='skipped')){const sets=log.sets.filter(s=>s.type!=='warmup').length;if(!sets)continue;for(const muscle of log.target.split(',').map(m=>m.trim().toLowerCase()).filter(Boolean)){const hoursSince=Math.max(0,(Date.parse(date+'T12:00:00')-Date.parse(session.date+'T12:00:00'))/3600000);muscleRecovery[muscle]={hoursSince,workingSets:sets,status:hoursSince<=48?'recent_load':'recovering',confidence:.45,sources:[{id:session.id,domain,label:`${sets} recorded working sets; elapsed calendar time estimate`,fingerprint:fingerprint(session)}]};}}
    const todaySessions=sessions.filter(s=>s.date===date);return {currentLoad:valueOf(todaySessions.length?todaySessions.reduce((n,s)=>n+s.logs.reduce((n,l)=>n+workSets(l.sets).length,0),0):null,sources.filter(s=>todaySessions.some(t=>t.id===s.id))),recentLoad:valueOf(load.history.length?load.sets:null,sources),loadChange:valueOf(load.change,sources,.65),muscleRecovery,currentWorkout:data.activeWorkout||null,nextWorkout:preparedWorkout(data,date,readiness(records,date).score),sources};
  }
  if(domain==='body'){
    const trend=weightTrend(records,date),points=trend.points.filter(p=>p.date>=shiftDay(date,-27)),raw=records.filter(r=>r.type==='vital'&&r.metadata.metric==='Weight'),source=refs(raw.map(r=>r.id),'Recorded weight, normalized to kg');
    const rate=slope(points.map(p=>({date:p.date,value:p.weight}))),waist=records.filter(r=>r.type==='bodyMeasurement'&&typeof r.metadata.waist==='number'),bodyFat=records.filter(r=>r.type==='vital'&&r.metadata.metric==='Body fat'&&r.value!==undefined&&r.unit==='%');
    return {weight:metric('Weight'),weightTrend:valueOf(trend.trend,source,points.length>=7?.8:.4),weeklyChange:valueOf(rate===null?null:rate*7,source,points.length>=14?.75:.35),waistTrend:valueOf(slope(waist.map(r=>({date:dateOf(r.timestamp),value:Number(r.metadata.waist)}))),refs(waist.map(r=>r.id),'Waist observations')),bodyCompositionTrend:valueOf(slope(bodyFat.map(r=>({date:dateOf(r.timestamp),value:r.value!}))),refs(bodyFat.map(r=>r.id),'Recorded body fat percentage trend'),bodyFat.length>=7?.65:.35)};
  }
  if(domain==='medical'){const signals=refs(records.filter(r=>['vital','symptom','illness'].includes(r.type)&&dateOf(r.timestamp)>=shiftDay(date,-7)).map(r=>r.id),'Recorded health observation');return {signals,unresolvedItems:refs(records.filter(r=>['symptom','illness'].includes(r.type)&&r.metadata.resolved!==true).map(r=>r.id),'Unresolved recorded observation')};}
  if(domain==='care')return {dueItems:careTasksForDate(data.skin.care,date,data.skin.products),recentObservations:data.skin.care.checkIns.filter(r=>r.date>=shiftDay(date,-6)&&r.date<=date),sources:data.skin.care.tasks.map(r=>({id:r.id,domain,label:'Saved care task',fingerprint:fingerprint(r)}))};
  const activeGoals=records.filter(r=>r.type==='goal'&&!['completed','cancelled','archived'].includes(String(r.metadata.status)));return {activeGoals,progressSignals:activeGoals.filter(r=>r.metadata.metric).map(r=>({id:r.id,...goalProgress(r,records,data.db,data.skin,date)}))};
}
const kinds:Record<StateDomain,string[]>={readiness:['checkIn','sleep','vital'],nutrition:['meal','mealPlan','nutritionDay','nutritionTarget','food','recipe'],training:['checkIn','sleep','vital','recoveryNote'],recovery:['checkIn','recoveryNote'],sleep:['sleep','sleepPreference'],body:['vital','bodyMeasurement'],medical:['vital','symptom','illness'],care:['routine'],goals:['goal','goalCheckIn','meal','nutritionDay','checkIn','vital','habitDone']};
export class HealthStateService {
  private states=new Map<string,CurrentHealthState>();private signatures=new Map<string,Record<string,string>>();
  constructor(public readonly metrics=new IntelligenceMetrics()){}
  observe(input:HealthData,date:string,events:HealthEvent[]=[]){return this.metrics.time('health_state_build_ms',()=>{
    const data=boundedHealthData(input,date),key=(input.scope||input.userId)+'|'+date,old=this.states.get(key),sigs=this.signatures.get(key)||{},nextSigs:Record<string,string>={},values:Partial<CurrentHealthState>={};const dirty=new Set(events.filter(e=>e.userId===input.userId).flatMap(affectedDomains));
    for(const domain of domains){const extra=domain==='training'?[data.db.sessions,data.db.weeks,data.db.scheduledWorkouts,data.activeWorkout]:domain==='care'?[data.skin.care,data.skin.products]:domain==='goals'?[data.db.sessions,data.db.targets]:[];const sig=fingerprint([date,data.records.filter(r=>kinds[domain].includes(r.type)),extra]);nextSigs[domain]=sig;
      (values as Record<string,unknown>)[domain]=old&&sigs[domain]===sig&&!dirty.has(domain)?old[domain]:compute(domain,data,date);if(!old||sigs[domain]!==sig||dirty.has(domain))this.metrics.count('state_rebuild_'+domain);
    }
    const state={version:1,userId:input.userId,date,generatedAt:new Date().toISOString(),fingerprint:fingerprint(nextSigs),...values,attention:old?.attention||[],overallConfidence:0} as CurrentHealthState;
    state.overallConfidence=mean([state.readiness.score.confidence,state.nutrition.confidence,state.sleep.duration.confidence,state.body.weight.confidence,state.recovery.confidence])||0;
    this.states.set(key,state);this.signatures.set(key,nextSigs);while(this.states.size>8){const first=this.states.keys().next().value!;this.states.delete(first);this.signatures.delete(first);}return state;
  });}
  getCurrentHealthState(userId:string,date:string,scope=userId){const state=this.states.get(scope+'|'+date);if(!state||state.userId!==userId)throw new Error('No authorized state is loaded for this account.');return state;}
  getHealthStateSlice<D extends StateDomain>(userId:string,date:string,domain:D,scope=userId){return this.getCurrentHealthState(userId,date,scope)[domain];}
  recalculateHealthState(data:HealthData,date:string,affected:StateDomain[]){const key=(data.scope||data.userId)+'|'+date,sigs=this.signatures.get(key);if(sigs)affected.forEach(d=>delete sigs[d]);return this.observe(data,date);}
  clear(){this.states.clear();this.signatures.clear();}
}
