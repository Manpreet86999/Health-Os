import { waterMillilitres, sleepDurationHours } from './biology.js';
import { dateOf, live, mean, num, preferredVitals, readiness, type BioRecord, type BioKind } from './biology.js';
import { atTime, shiftDay, trainingLoad } from './biological-intelligence.js';
import { careTasksForDate } from './skin.js';
import { epley1rm, isFinishedSession, parseRepRange, buildProgressionRules, generateWarmupSets, plateCalculator } from './training.js';
import type { PlannedExercise, SetLog, Target } from './types.js';
import type { Dataset, Evidence } from './automation-model.js';

export interface Rule {metric?:string;event?:string;threshold?:number;conditionThreshold?:number;comparator?:'>='|'<='|'>'|'<'|'=';aggregation?:'latest'|'average'|'weekly_average'|'maximum'|'minimum'|'total'|'adherence_percent'|'streak';windowDays?:number;exercise?:string;and?:Rule[];or?:Rule[];}
export function validateRule(input:unknown,depth=0):Rule {
  if(!input||typeof input!=='object'||Array.isArray(input)||depth>4)throw new Error('Invalid evidence rule or excessive nesting.');
  const r=input as Rule;
  if(r.and||r.or){const children=r.and||r.or;if(r.and&&r.or||!Array.isArray(children)||!children.length||children.length>10)throw new Error('Choose up to ten AND or OR conditions.');return r.and?{and:children.map(c=>validateRule(c,depth+1))}:{or:children.map(c=>validateRule(c,depth+1))};}
  if(typeof r.metric!=='string'&&typeof r.event!=='string')throw new Error('Each rule needs a metric or event.');
  if(r.threshold!==undefined&&(!Number.isFinite(r.threshold)||r.threshold<0)||r.conditionThreshold!==undefined&&(!Number.isFinite(r.conditionThreshold)||r.conditionThreshold<0))throw new Error('Rule thresholds must be finite nonnegative numbers.');
  if(r.windowDays!==undefined&&(!Number.isInteger(r.windowDays)||r.windowDays<1||r.windowDays>366))throw new Error('Choose a window from 1 to 366 days.');
  if(r.comparator&&!['>=','<=','>','<','='].includes(r.comparator)||r.aggregation&&!['latest','average','weekly_average','maximum','minimum','total','adherence_percent','streak'].includes(r.aggregation))throw new Error('Invalid comparison or aggregation.');
  return r;
}
export interface Progress {value:number|null;target:number;percent:number|null;met:boolean;samples:number;evidence:Evidence;}
export const compare=(value:number,target:number,op='>=')=>op==='<='?value<=target:op==='<'?value<target:op==='>'?value>target:op==='='?value===target:value>=target;
export function scheduledDoseTimes(parent:BioRecord,date:string):string[]{
  const days=String(parent.metadata.daysOfWeek||'').split(',').filter(Boolean).map(Number);
  if(parent.deletedAt||parent.metadata.enabled===false||parent.metadata.start&&String(parent.metadata.start)>date||parent.metadata.end&&String(parent.metadata.end)<date||days.length&&!days.includes(new Date(`${date}T12:00:00`).getDay()))return [];
  return [...new Set(String(parent.metadata.times||parent.metadata.time||'09:00').split(',').map(t=>t.trim()).filter(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))];
}
export function confirmedDose(records:BioRecord[],parent:BioRecord,date:string,time:string):BioRecord|undefined {
  const single=scheduledDoseTimes(parent,date).length===1;
  return live(records).filter(r=>r.type==='dose'&&r.metadata.parentId===parent.id&&dateOf(r.timestamp)===date&&(r.metadata.scheduledTime===time||!r.metadata.scheduledTime&&single)&&['taken','skipped'].includes(String(r.metadata.status).toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.timestamp.localeCompare(a.timestamp))[0];
}
export function dailyMetric(data:Dataset,metric:string,date:string,exercise?:string):{value:number|null;ids:string[]} {
  if(data.dailyAggregates&&!exercise){const day=data.dailyAggregates[date];if(day&&Object.hasOwn(day.metrics,metric))return {value:day.metrics[metric],ids:day.metricRefs[metric]||[]};if(!day&&['Water','Sleep','Steps','Resting HR','HRV','Weight','Calories','Protein','Volume','Workouts','Care adherence','Energy','Stress','Soreness'].includes(metric))return {value:null,ids:[]};}
  const rows=live(data.records).filter(r=>dateOf(r.timestamp)===date);
  const sessions=data.db.sessions.filter(s=>s.date===date&&isFinishedSession(s));
  const selected=rows.filter(r=>r.type==='meal');
  const nutrients:Record<string,string>={Calories:'calories',Protein:'protein',Carbohydrates:'carbs',Fat:'fat',Fibre:'fibre'};
  if(Object.hasOwn(nutrients,metric))return {value:selected.some(r=>num(r,nutrients[metric])!==null)?selected.reduce((n,r)=>n+(num(r,nutrients[metric])||0),0):null,ids:selected.map(r=>r.id)};
  if(metric==='Water'){const rs=rows.filter(r=>r.type==='water'&&waterMillilitres(r)!==null);return {value:rs.length?rs.reduce((n,r)=>n+(waterMillilitres(r)??0),0):null,ids:rs.map(r=>r.id)};}
  if(metric==='Sleep'){const rs=rows.filter(r=>r.type==='sleep'&&!r.metadata.nap).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));return {value:rs[0]?sleepDurationHours(rs[0]):null,ids:rs.slice(0,1).map(r=>r.id)};}
  if(metric==='Sleep timing'){const sleep=rows.filter(r=>r.type==='sleep'&&!r.metadata.nap).sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];const time=String(sleep?.metadata.bedtime||'');const start=sleep?.metadata.startTime?new Date(String(sleep.metadata.startTime)):null;const value=/^\d{2}:\d{2}$/.test(time)?Number(time.slice(0,2))*60+Number(time.slice(3)):start&&!Number.isNaN(start.getTime())?start.getHours()*60+start.getMinutes():null;return {value,ids:sleep&&value!==null?[sleep.id]:[]};}
  if(metric==='Readiness'){const r=readiness(data.records,date);return {value:r.score,ids:r.contributors.flatMap(c=>c.ids)};}
  if(metric==='Care severity'){const observations=data.skin.care.checkIns.filter(c=>c.date===date&&c.severity!==null);return {value:mean(observations.map(c=>c.severity!)),ids:observations.map(c=>c.id)};}
  if(metric==='Humidity'){const r=rows.filter(r=>r.type==='environment').at(-1);return {value:r?num(r,'humidity'):null,ids:r?[r.id]:[]};}
  if(metric==='Strength'){const rs=sessions.flatMap(s=>s.logs.filter(l=>l.status!=='skipped').flatMap(l=>{const sets=l.sets.filter(t=>t.type!=='warmup').map(t=>epley1rm(Number(t.w),Number(t.r))).filter(v=>v>0);return sets.length?[Math.max(...sets)]:[];}));return {value:mean(rs),ids:sessions.map(s=>s.id)};}
  if(metric==='Workouts'||metric==='Volume'||metric==='Workout frequency')return {value:metric==='Volume'?sessions.reduce((n,s)=>n+s.logs.filter(l=>l.status!=='skipped').reduce((m,l)=>m+l.sets.filter(t=>t.type!=='warmup').reduce((a,t)=>a+Number(t.w||0)*Number(t.r||0),0),0),0):sessions.length,ids:sessions.map(s=>s.id)};
  if(metric==='Lift'||metric==='e1RM'){
    const sets=sessions.flatMap(s=>s.logs.filter(l=>l.status!=='skipped'&&(!exercise||l.name.toLowerCase()===exercise.toLowerCase())).flatMap(l=>l.sets.filter(t=>t.type!=='warmup').map(t=>({value:metric==='Lift'?Number(t.w):epley1rm(Number(t.w),Number(t.r)),id:s.id}))));
    return {value:sets.length?Math.max(...sets.map(s=>s.value)):null,ids:[...new Set(sets.map(s=>s.id))]};
  }
  if(metric==='Care adherence'||metric==='Morning care'){
    const tasks=careTasksForDate(data.skin.care,date,data.skin.products).filter(t=>metric!=='Morning care'||t.time==='morning');
    const done=data.skin.care.events.filter(e=>e.date===date&&e.status==='done'&&tasks.some(t=>t.id===e.taskId));
    return {value:tasks.length?new Set(done.map(e=>e.taskId)).size/tasks.length*100:null,ids:done.map(e=>e.id)};
  }
  if(metric==='Medication adherence'||metric==='Supplement adherence'){
    const kind=metric.startsWith('Medication')?'medication':'supplement',parents=live(data.records).filter(r=>r.type===kind),slots=parents.flatMap(parent=>scheduledDoseTimes(parent,date).map(time=>({parent,time})));
    const confirmations=slots.map(s=>confirmedDose(data.records,s.parent,date,s.time));
    return {value:slots.length?confirmations.filter(r=>String(r?.metadata.status).toLowerCase()==='taken').length/slots.length*100:null,ids:confirmations.filter((r):r is BioRecord=>Boolean(r)).map(r=>r.id).concat(parents.map(p=>p.id))};
  }
  const subjective:Record<string,string>={Energy:'energy',Stress:'stress',Soreness:'soreness',Motivation:'motivation',Mood:'mood'};
  if(Object.hasOwn(subjective,metric)){const check=rows.filter(r=>r.type==='checkIn').sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).at(-1);return {value:check?num(check,subjective[metric]):null,ids:check?[check.id]:[]};}
  const vitals=preferredVitals(data.records,metric).filter(r=>dateOf(r.timestamp)===date);
  if(vitals.length)return {value:metric==='Weight'&&vitals[0].unit==='lb'?Number(vitals[0].value)/2.2046226218:vitals[0].value!,ids:vitals.map(r=>r.id)};
  if(['Waist','Neck','Chest','Arms','Hips','Body fat'].includes(metric)){
    const bio=rows.filter(r=>r.type==='bodyMeasurement'&&(r.metadata.metric===metric||r.name.toLowerCase()===metric.toLowerCase())).sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).at(-1);
    const field:Record<string,string>={Waist:'waist',Neck:'neck',Chest:'chest',Arms:'arms',Hips:'hips','Body fat':'bodyFat'};
    const old=data.db.measurements.filter(r=>r.date===date).at(-1) as unknown as Record<string,unknown>|undefined;
    return {value:bio?.value??(typeof old?.[field[metric]]==='number'?Number(old[field[metric]]):null),ids:bio?[bio.id]:old?[String(old.id)]:[]};
  }
  return {value:null,ids:[]};
}
export function ruleProgress(rule:Rule,data:Dataset,date:string):Progress {
  if(rule.and||rule.or){const results=(rule.and||rule.or||[]).slice(0,10).map(r=>ruleProgress(r,data,date));const met=results.length>0&&(rule.and?results.every(r=>r.met):results.some(r=>r.met));return {value:results.filter(r=>r.met).length,target:results.length,percent:results.length?results.filter(r=>r.met).length/results.length*100:null,met,samples:results.length,evidence:{ids:[...new Set(results.flatMap(r=>r.evidence.ids))],explanation:rule.and?'All linked conditions':'At least one linked condition',quality:'high'}};}
  const metric=rule.metric||({ 'workout.completed':'Workouts','care.action_completed':'Care adherence','water.logged':'Water','sleep.logged':'Sleep','supplement.taken':'Supplement adherence','medication.taken':'Medication adherence'} as Record<string,string>)[rule.event||'']||'';
  const threshold=Number(rule.threshold??1),days=Math.max(1,Math.min(366,Number(rule.windowDays)||1)),points=Array.from({length:days},(_,i)=>dailyMetric(data,metric,shiftDay(date,-days+1+i),rule.exercise)),observed=points.filter(p=>p.value!==null),values=observed.map(p=>p.value!);
  let value:number|null=null;const agg=rule.aggregation||'latest';
  if(values.length)value=agg==='maximum'?Math.max(...values):agg==='minimum'?Math.min(...values):agg==='total'?values.reduce((n,v)=>n+v,0):agg==='adherence_percent'?values.filter(v=>compare(v,rule.conditionThreshold??threshold,rule.comparator)).length/days*100:agg==='streak'?(()=>{let n=0;for(let i=points.length-1;i>=0&&points[i].value!==null&&compare(points[i].value!,rule.conditionThreshold??threshold,rule.comparator);i--)n++;return n;})():['average','weekly_average'].includes(agg)?mean(values):values.at(-1)!;
  const target=agg==='adherence_percent'?Number(rule.threshold??90):threshold;
  return {value,target,percent:value===null||target<=0?null:Math.max(0,Math.min(100,(rule.comparator==='<='||rule.comparator==='<')?(value<=target?100:target/value*100):value/target*100)),met:value!==null&&compare(value,target,rule.comparator),samples:values.length,evidence:{ids:[...new Set(observed.flatMap(p=>p.ids))],explanation:`${metric} · ${agg} · ${days} day window; ${values.length} observed days`,quality:values.length>=Math.min(days,7)?'high':'low'}};
}
export function linkedRule(record:BioRecord):Rule|null {
  if(record.metadata.completion_mode==='manual')return null;
  try{if(record.metadata.rule)return validateRule(JSON.parse(String(record.metadata.rule)));}catch{return null;}
  if(record.metadata.completion_mode==='manual'||record.metadata.metric==='Custom')return null;
  if(!record.metadata.metric&&!record.metadata.event)return null;
  return {metric:String(record.metadata.metric||''),event:String(record.metadata.event||''),threshold:Number(record.metadata.threshold??record.metadata.target??1),aggregation:String(record.metadata.aggregation||'latest') as Rule['aggregation'],windowDays:Number(record.metadata.time_window||record.metadata.windowDays||1),comparator:String(record.metadata.comparator||(record.metadata.direction==='Decrease'?'<=':'>=')) as Rule['comparator'],exercise:String(record.metadata.exercise||'')};
}
export function targetRule(t:Target):Rule|null {
  const extended=t as Target & {automationRule?:Rule};if(extended.automationRule)return extended.automationRule;
  if(t.linkedExercise)return {metric:'Lift',exercise:t.linkedExercise,aggregation:'maximum',windowDays:366,threshold:Number(t.target)};
  if(['body','weight','weight-loss','weight-gain','body-fat'].includes(t.type))return {metric:t.type==='body-fat'?'Body fat':'Weight',aggregation:'latest',windowDays:90,threshold:Number(t.target),comparator:t.type.includes('loss')||t.type==='body-fat'||Number(t.target)<Number(t.current)?'<=':'>='};
  return null;
}
export function adaptiveInputs(data:Dataset,date:string){
  const signals=['Sleep','Steps','Resting HR','HRV','Heart Rate','Energy','Soreness','Stress','Motivation','Mood'];
  const inputs=signals.map(metric=>{const p=dailyMetric(data,metric,date);const rows=data.records.filter(r=>p.ids.includes(r.id));const reliable=p.value!==null&&rows.every(r=>r.quality!=='estimated');return {metric,...p,reliable,kind:p.value===null?'missing':rows.some(r=>r.quality==='estimated')?'estimated':rows.some(r=>r.quality==='measured'||r.quality==='imported')?'measured':'self-reported'};});
  const sessions=data.db.sessions.filter(s=>isFinishedSession(s)&&s.date<=date&&s.date>=shiftDay(date,-6)),load=trainingLoad({...data.db,sessions:data.db.sessions.filter(isFinishedSession)},date);
  inputs.push({metric:'Training load',value:sessions.length?load.volume:null,ids:sessions.map(s=>s.id),reliable:sessions.length>0,kind:sessions.length?'recorded training':'missing'});
  return {inputs,checkin_completeness:inputs.filter(i=>i.value!==null).length/inputs.length,readiness_confidence:inputs.filter(i=>i.reliable).length>=7?'high':inputs.filter(i=>i.reliable).length>=4?'medium':'low'};
}
export function preparedWorkout(data:Dataset,date:string,readinessScore:number|null){
  const week=data.db.weeks.find(w=>w.id===data.db.meta.activeWeekId)||data.db.weeks[0];
  const schedule=data.db.scheduledWorkouts.find(w=>w.date===date&&w.status==='planned');
  const chosen=schedule?data.db.weeks.find(w=>w.id===schedule.weekId)||week:week;
  const key=schedule?.dayKey||['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(`${date}T12:00:00`).getDay()];
  const day=chosen?.days.find(d=>d.key===key);
  const tips=buildProgressionRules(data.db);
  const original=day?.exercises.map(e=>({...e,suggestedWeight:tips.find(t=>t.exercise===e.name)?.suggestedWeight,rirTarget:e.rirTarget??2}))||[];
  const adapted=original.map(e=>({...e,vol:e.vol.replace(/^(\d+)\s*[×x]/i,(_m,n)=>`${Math.max(1,Number(n)-1)} x`),rirTarget:Math.min(5,Number(e.rirTarget||2)+1)}));
  return {weekId:chosen?.id,weekName:chosen?.name,weekNumber:chosen?.weekNumber,dayKey:day?.key,dayTitle:day?.title,original,adapted,adaptationRecommended:readinessScore!==null&&readinessScore<60,reason:readinessScore===null?'Readiness is incomplete; retain your prescribed plan.':`Readiness ${readinessScore}/100. Adaptation is optional.`};
}
export function setSuggestion(ex:PlannedExercise,previous:SetLog|undefined,increment=2.5,suggestedWeight?:number){
  const range=parseRepRange(ex.vol),timing=/(?:x|×)\s*(\d+(?:\.\d+)?)\s*(s|sec|seconds|m|min|minutes)/i.exec(ex.vol);const mode=ex.trackingMode||'weight_reps';
  const weight=mode==='weight_reps'?Math.round(Number(suggestedWeight??previous?.w??0)/increment)*increment:undefined;
  return {weight:weight||undefined,reps:mode==='time'?undefined:previous?.r?Math.max(range.low,Math.min(range.high,Number(previous.r))):range.high||undefined,durationSec:mode==='time'?Number(previous?.durationSec||previous?.r)||(timing?Number(timing[1])*(/^m/i.test(timing[2])?60:1):undefined):undefined,rir:ex.rirTarget??previous?.rir,rpe:ex.rpeTarget??previous?.rpe,source:previous?'Previous performance and progression':'Program prescription',warmups:weight?generateWarmupSets(weight):[],plates:weight?plateCalculator(weight):null};
}
export interface CaptureDraft {kind:BioKind;defaults:Record<string,string|number|boolean>;confidence:string;explanation:string;}
export function normalizeCaptureDraft(draft:CaptureDraft,weightUnit='kg'):CaptureDraft {
  const defaults={...draft.defaults},value=Number(defaults.value),unit=String(defaults.unit||'').trim().toLowerCase();
  if(defaults.value!==undefined&&defaults.value!==''&&Number.isFinite(value)){
    if(draft.kind==='water'){
      const factor=unit===''||['ml','millilitres','milliliters'].includes(unit)?1:['l','litre','liter','litres','liters'].includes(unit)?1000:['oz','fl oz'].includes(unit)?29.5735:null;
      defaults.value=factor===null?'':Number((value*factor).toFixed(3));defaults.unit='mL';
    }else if(draft.kind==='sleep'){
      const factor=unit===''||['h','hr','hrs','hour','hours'].includes(unit)?1:['min','minutes','minute'].includes(unit)?1/60:['s','seconds','second'].includes(unit)?1/3600:null;
      defaults.value=factor===null?'':value*factor;defaults.unit='hours';
    }else if(draft.kind==='vital'&&String(defaults.metric||defaults.name).toLowerCase()==='weight'){
      defaults.metric='Weight';defaults.unit=['lb','lbs','pound','pounds'].includes(unit)?'lb':['kg','kgs','kilogram','kilograms','g','grams'].includes(unit)?'kg':weightUnit;
      if(['g','grams'].includes(unit))defaults.value=value/1000;
      else if(unit&&!['lb','lbs','pound','pounds','kg','kgs','kilogram','kilograms'].includes(unit))defaults.value='';
    }
  }
  return {...draft,defaults,explanation:draft.explanation+(defaults.value===''?' Confirm the amount in the displayed unit.':'')};
}
export function parseCapture(text:string,data?:Dataset):CaptureDraft{
  const input=text.trim().slice(0,4000),weight=/\bweight(?:\s+today)?\s*(?:is|:)?\s*(\d+(?:\.\d+)?)\s*(kg|lb)?\b/i.exec(input),water=/(?:drank|water)\s*(\d+(?:\.\d+)?)\s*(ml|l|litres?|liters?|oz)\b/i.exec(input),sleep=/(?:slept|sleep)\s*(\d+(?:\.\d+)?)\s*(hours?|h|minutes?|min)\b/i.exec(input);
  if(weight)return {kind:'vital' as const,defaults:{name:'Weight',metric:'Weight',value:Number(weight[1]),unit:weight[2]||data?.db.profile.units||'kg'},confidence:'high',explanation:'Explicit weight and unit. Review before saving.'};
  if(water)return {kind:'water' as const,defaults:{name:'Water',value:Number(water[1])*(water[2].toLowerCase()==='l'||/^lit/.test(water[2])?1000:water[2].toLowerCase()==='oz'?29.5735:1),unit:'mL'},confidence:'high',explanation:'Explicit amount, converted to millilitres.'};
  if(sleep)return {kind:'sleep' as const,defaults:{name:'Sleep',value:Number(sleep[1])*(/^m/i.test(sleep[2])?1/60:1),unit:'hours'},confidence:'high',explanation:'Explicit duration. Review date and duration.'};
  if(/\b(hurt|hurts|pain)\b/i.test(input)){const area=/(shoulder|knee|neck|back|hip|elbow|wrist|ankle|chest)/i.exec(input)?.[1]||'',side=/\b(left|right)\b/i.exec(input)?.[1]||'',words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};const rated=/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out of ten|out of 10|\/10)/i.exec(input);return {kind:'recoveryNote' as const,defaults:{name:area?`${side} ${area}`.trim():'Pain observation',region:area,side,category:'pain',notes:input,...(rated?{severity:words[rated[1].toLowerCase()]??Number(rated[1])}:{})},confidence:area&&rated?'high':'low',explanation:'Your own pain description; confirm area, side and severity.'};}
  if(/\b(took|taken)\b/i.test(input)){const candidates=live(data?.records||[]).filter(r=>['medication','supplement'].includes(r.type)&&input.toLowerCase().includes(r.name.toLowerCase()));return {kind:'dose' as const,defaults:{name:candidates[0]?.name||input,parentId:candidates.length===1?candidates[0].id:'',status:'Taken',notes:input},confidence:candidates.length===1?'high':'low',explanation:candidates.length===1?'Matched one saved schedule. Confirm the dose.':'Select the exact medication or supplement; no adherence has been saved.'};}
  if(/\b(ate|eat|breakfast|lunch|dinner|snack)\b/i.test(input))return {kind:'meal' as const,defaults:{name:input.replace(/^I\s+ate\s+/i,''),notes:input},confidence:'low',explanation:'Meal description only; add verified nutrition or request an editable AI estimate.'};
  return {kind:'journal' as const,defaults:{name:'Quick note',notes:input},confidence:'low',explanation:'Saved only after your confirmation.'};
}
export const dueStamp=(date:string,time:string)=>atTime(date,/^\d{2}:\d{2}$/.test(time)?time:'09:00');
