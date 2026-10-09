import { baselineQuality } from './personal-intelligence.js';
import { proteinEnergyInsight } from './nutrition-insights.js';
import { adaptiveTdee, correlation, preferredVitals, dateOf, live, mean, num, nutrition, readiness, type BioRecord } from './biology.js';
import { atTime, correlationDefinitions, buildTimeline, shiftDay, trainingLoad, weightTrend } from './biological-intelligence.js';
import { careTasksForDate } from './skin.js';
import { epley1rm, isFinishedSession } from './training.js';
import { adaptiveInputs, scheduledDoseTimes, confirmedDose, dailyMetric, linkedRule, preparedWorkout, ruleProgress, targetRule } from './automation-rules.js';
import { automationPreferences, domainEventSchema, fingerprint, type AutomationState, type Dataset, type DomainEvent, type Evidence, type InboxItem } from './automation-model.js';

export const AUTOMATION_SYSTEMS=['Universal Quick Capture','Confirmation Inbox','Evidence-linked habits','Automatic goal progress','Adaptive check-in','Workout preparation','Smart set prefill','Food patterns','Natural-language capture','Recurring meals','Dose confirmation','Measurement scheduling','Anomaly questions','Care execution plan','Batch confirmation','Automatic reports','Automatic insights','Personal baselines','Smart defaults','Event propagation'] as const;
const metrics=['Readiness','Strength','Carbohydrates','Care severity','Humidity','Sleep timing','Sleep','Steps','Resting HR','HRV','Weight','Calories','Protein','Volume','Workouts','Care adherence','Water','Energy','Stress','Soreness'];
type Daily={metricRefs:Record<string,string[]>;metrics:Record<string,number|null>;nutrition:ReturnType<typeof nutrition>;water:number;readiness:ReturnType<typeof readiness>;refs:string[];};
type Context={data:Dataset;state:AutomationState;event:DomainEvent;now:Date;date:string;dirtyDates:string[];fullRebuild:boolean;put:(kind:string,value:unknown,evidence?:Evidence,id?:string,date?:string)=>void;};
export interface AutomationDefinition {key:string;version:number;listensTo:string[];flag?:keyof ReturnType<typeof automationPreferences>;deferred?:boolean;run:(ctx:Context)=>void;}
const evidence=(ids:string[],explanation:string,quality:Evidence['quality']='high'):Evidence=>({ids:[...new Set(ids)],explanation,quality});
const definition=(key:string,run:AutomationDefinition['run'],flag?:AutomationDefinition['flag'],deferred=false):AutomationDefinition=>({key,version:1,listensTo:['*'],run,flag,deferred});
const dailyValue=(state:AutomationState,date:string)=>state.derived[`daily:${date}`]?.value as Daily|undefined;
const inputDates=(data:Dataset)=>[...new Set([...data.records.map(r=>dateOf(r.timestamp)),...data.db.sessions.map(r=>r.date),...data.db.measurements.map(r=>r.date),...data.skin.care.events.map(r=>r.date)])].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d));

function stampSources(data:Dataset,now:Date):Record<string,{revision:string;date:string;type:string}>{
  const result:ReturnType<typeof stampSources>={};
  const add=(id:string,type:string,date:string,value:unknown)=>{result[id]={revision:fingerprint(value),date,type};};
  for(const r of data.records)add(`bio:${r.id}`,recordEventType(r),dateOf(r.timestamp),r);
  for(const r of data.db.sessions)add(`workout:${r.id}`,isFinishedSession(r)?'workout.completed':'workout.started',r.date,r);
  for(const r of data.db.targets)add(`target:${r.id}`,'goal.updated',dateOf(now.toISOString()),r);
  for(const r of data.db.habits)add(`habit:${r.id}`,'habit.updated',dateOf(now.toISOString()),r);
  for(const r of data.db.habitLogs)add(`habit-log:${r.id}`,'habit.progressed',r.date,r);
  for(const r of data.skin.care.events)add(`care:${r.id}`,r.status==='done'?'care.action_completed':'care.action_skipped',r.date,r);
  for(const r of data.skin.care.checkIns)add(`care-observation:${r.id}`,'care.observation_added',r.date,r);
  for(const photo of data.photoDates||[])add(`photo:${photo.id}`,'measurement.photo_logged',photo.date,photo);
  add('care-plan','routine.generated',dateOf(now.toISOString()),data.skin.care.tasks);
  add('training-plan','program.updated',dateOf(now.toISOString()),[data.db.weeks,data.db.scheduledWorkouts,data.db.trainingConfig]);
  return result;
}
export function recordEventType(r:BioRecord,previous?:BioRecord):string {
  if(r.type==='automationEvent'&&r.metadata.subtype==='careAction')return `care.${r.deletedAt?'action_deleted':r.metadata.status==='skipped'?'action_skipped':'action_completed'}`;
  if(r.type==='journal'&&r.metadata.subtype==='careObservation')return `care.${r.deletedAt?'observation_deleted':'observation_added'}`;
  if(r.deletedAt)return `${r.type==='vital'&&r.metadata.metric==='Weight'?'weight':r.type}.deleted`;
  if(r.type==='dose'){const status=String(r.metadata.status).toLowerCase();return ['taken','skipped'].includes(status)?`${['medication','supplement'].includes(String(r.metadata.doseType))?r.metadata.doseType:'dose'}.${status}`:'dose.logged';}
  if(r.type==='checkIn')return 'readiness.checkin_completed';
  if(r.type==='recoveryNote')return `pain.${previous?'updated':'reported'}`;
  if(r.type==='symptom')return `symptom.${previous?'updated':'reported'}`;
  if(r.type==='vital'&&r.metadata.metric==='Weight')return `weight.${r.quality==='imported'?'imported':previous?'updated':'logged'}`;
  if(r.quality==='imported')return r.type==='sleep'?'sleep.imported':'health_record.imported';
  return `${r.type}.${previous?'updated':r.type==='goal'?'created':r.type==='habitDone'?'progressed':r.type==='experiment'?'started':'logged'}`;
}
function sourceEvents(data:Dataset,state:AutomationState,now:Date):DomainEvent[]{
  const stamps=stampSources(data,now),events:DomainEvent[]=[];
  for(const id of new Set([...Object.keys(stamps),...Object.keys(state.sources)])){
    const current=stamps[id],old=state.sources[id];if(current?.revision===old?.revision)continue;
    const type=current?(old&&current.type==='workout.completed'?'workout.updated':old&&current.type.endsWith('.logged')?current.type.replace(/\.logged$/,'.updated'):old&&current.type==='goal.created'?'goal.updated':current.type):`${(old?.type||'record').split('.')[0]}.deleted`;
    const date=current?.date||old.date;
    events.push({id:`event:${data.userId}:${id}:${current?.revision||'deleted:'+old.revision}:${state.events.length+events.length}`,type,userId:data.userId,source:{kind:current?.type.includes('imported')?'import':'user',recordId:id},occurredAt:atTime(date),createdAt:now.toISOString(),schemaVersion:1,payload:{date,previousDate:old?.date,recordType:id.split(':')[0],revision:current?.revision||'deleted'}});
  }
  state.sources=stamps;return events;
}
function dailyAutomation(ctx:Context){
  const {data,event,put}=ctx;
  const dates=[...new Set(ctx.dirtyDates)];
  if(event.type==='system.rebuild'||event.type.startsWith('sourcePriority.'))dates.push(...inputDates(data));
  for(const date of new Set(dates)){
    const points=Object.fromEntries(metrics.map(m=>[m,dailyMetric(data,m,date)]));
    const refs=[...new Set(Object.values(points).flatMap(p=>p.ids))];
    const value:Daily={metricRefs:Object.fromEntries(Object.entries(points).map(([k,v])=>[k,v.ids])),metrics:Object.fromEntries(Object.entries(points).map(([k,v])=>[k,v.value])),nutrition:nutrition(data.records,date),water:points.Water.value||0,readiness:readiness(data.records,date),refs};
    put('daily',value,evidence(refs,'Source records for this date; missing observations remain unknown'),`daily:${date}`,date);
    put('timeline',buildTimeline(data.records,data.db,data.skin,date),evidence(refs,'Chronological source and explicitly scheduled events'),`timeline:${date}`,date);
  }
}
function trainingAutomation({data,put,date}:Context){
  const sessions=data.db.sessions.filter(isFinishedSession),lifts=sessions.flatMap(s=>s.logs.filter(l=>l.status!=='skipped').flatMap(l=>l.sets.filter(t=>t.type!=='warmup').map(t=>({sessionId:s.id,date:s.date,exercise:l.name,muscle:l.target,weight:Number(t.w)||0,reps:Number(t.r)||0,e1rm:epley1rm(Number(t.w),Number(t.r)),volume:(Number(t.w)||0)*(Number(t.r)||0)}))));
  const prs=[...new Set(lifts.map(l=>l.exercise))].map(exercise=>{const sets=lifts.filter(l=>l.exercise===exercise);return {exercise,bestWeight:Math.max(...sets.map(l=>l.weight)),bestE1rm:Math.max(...sets.map(l=>l.e1rm)),sourceIds:[...new Set(sets.map(l=>l.sessionId))]};});
  const muscleVolume=Object.fromEntries([...new Set(lifts.map(l=>l.muscle))].map(m=>[m,lifts.filter(l=>l.muscle===m&&l.date>=shiftDay(date,-6)&&l.date<=date).reduce((n,l)=>n+l.volume,0)]));
  put('training',{prs,lifts,load:trainingLoad({...data.db,sessions},date),muscleVolume},evidence(sessions.map(s=>s.id),'Completed working sets; warm-ups and skipped exercises excluded'),'training');
}
function progressForDate({data,put}:Context,date:string){
  for(const r of live(data.records).filter(r=>r.type==='goal'||r.type==='habit')){
    const rule=linkedRule(r);if(!rule)continue;
    const progress=ruleProgress(rule,data,date);
    const override=live(data.records).filter(d=>d.type==='habitDone'&&d.metadata.parentId===r.id&&d.metadata.userOverride&&dateOf(d.timestamp)===date).at(-1);
    const result=override?{...progress,met:override.metadata.completed!==false,evidence:evidence([override.id],'Explicit user override')}:progress;
    put(r.type,{name:r.name,recordId:r.id,...result},result.evidence,`${r.type}:${r.id}:${date}`,date);
  }
  for(const t of data.db.targets){const rule=targetRule(t);if(rule){const p=ruleProgress(rule,data,date);put('goal',{name:t.name,recordId:t.id,...p},p.evidence,`goal:${t.id}:${date}`,date);}}
  // Legacy habits may opt in using the same portable rule, without changing manual defaults.
  for(const h of data.db.habits){const rule=(h as typeof h & {automationRule?:Parameters<typeof ruleProgress>[0]}).automationRule;if(rule){const p=ruleProgress(rule,data,date);put('habit',{name:h.name,recordId:h.id,...p},p.evidence,`habit:${h.id}:${date}`,date);}}
}
function progressAutomation(ctx:Context){
  const dirty=Object.values(ctx.state.derived).filter(d=>d.kind==='daily'&&d.updatedAt===ctx.now.toISOString()).map(d=>d.date);
  const dates=new Set([ctx.date,...dirty]);
  const first=dirty.sort()[0];
  if(first)for(const d of Object.values(ctx.state.derived))if(['habit','goal'].includes(d.kind)&&d.date>=first&&d.date<=ctx.date)dates.add(d.date);
  for(const date of dates)progressForDate(ctx,date);
}
function baselineAutomation({state,put,date}:Context){
  for(const metric of metrics)for(const window of [7,14,28,90]){
    const points=Array.from({length:window},(_,i)=>({date:shiftDay(date,-i-1),daily:dailyValue(state,shiftDay(date,-i-1))})).filter(p=>p.daily?.metrics[metric]!==null&&p.daily?.metrics[metric]!==undefined);
    const values=points.map(p=>p.daily!.metrics[metric]!),sorted=[...values].sort((a,b)=>a-b),avg=mean(values),median=values.length?(sorted[Math.floor((values.length-1)/2)]+sorted[Math.floor(values.length/2)])/2:null;
    const sd=avg===null?null:Math.sqrt(values.reduce((n,v)=>n+(v-avg)**2,0)/values.length),mad=median===null?null:mean(values.map(v=>Math.abs(v-median)));
    let center=avg,mid=median,spread=sd,absoluteDeviation=mad;
    if(metric==='Sleep timing'&&values.length){const angle=Math.atan2(values.reduce((n,v)=>n+Math.sin(v/1440*Math.PI*2),0),values.reduce((n,v)=>n+Math.cos(v/1440*Math.PI*2),0));center=(angle/(Math.PI*2)*1440+1440)%1440;const deviations=values.map(v=>(v-center!+2160)%1440-720).sort((a,b)=>a-b);const middle=(deviations[Math.floor((deviations.length-1)/2)]+deviations[Math.floor(deviations.length/2)])/2;mid=(center+middle+1440)%1440;spread=Math.sqrt(deviations.reduce((n,v)=>n+v*v,0)/deviations.length);absoluteDeviation=mean(deviations.map(v=>Math.abs(v-middle)));}
    // Weight uses a mean; episodic training uses a median; missing days never become zero.
    const observations=Array.from({length:window},(_,index)=>{const day=shiftDay(date,index-window);return {date:day,value:dailyValue(state,day)?.metrics[metric]??null};});
    const quality=baselineQuality(observations,shiftDay(date,-window),shiftDay(date,-1));
    if(metric==='Sleep timing'){quality.range=null;quality.trend={...quality.trend,state:'insufficient data',change:null,threshold:null};}
      put('trend',{metric,window,...quality.trend},evidence(points.flatMap(p=>p.daily!.refs),'Observed-day window comparison; missing days are not zero'),'trend:'+metric+':'+window);
    put('baseline',{...quality,metric,window,value:['Volume','Workouts'].includes(metric)?mid:center,mean:center,median:mid,dispersion:spread,mad:absoluteDeviation,sample_count:values.length,quality:values.length>=Math.min(window,14)?'medium':'low'},evidence(points.flatMap(p=>p.daily!.refs),`${window} previous days, ${values.length} observations; ${metric==='Sleep timing'?'circular clock mean':['Volume','Workouts'].includes(metric)?'median':'mean'}`,values.length>=14?'medium':'low'),`baseline:${metric}:${window}`);
  }
}
function smartDefaults({data,put,date}:Context){
  const rows=live(data.records).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  const defaults:Record<string,unknown>={};
  for(const type of ['water','sleep','vital','bodyMeasurement','recoveryNote','meal']){
    const r=rows.find(r=>r.type===type);if(r)defaults[type]={name:r.name,value:r.value,unit:r.unit,...(type==='meal'?{recordQuality:r.quality,source:r.source}:{}),...Object.fromEntries(Object.entries(r.metadata).filter(([k])=>['metric','region','side','serving','bedtime','wake','meal','beverage',...(type==='meal'?['calories','protein','carbs','fat','fibre']:[])].includes(k))),sourceId:r.id};
  }
  for(const r of rows.filter(r=>['vital','bodyMeasurement'].includes(r.type)))if(!defaults[`${r.type}:${r.metadata.metric||r.name}`])defaults[`${r.type}:${r.metadata.metric||r.name}`]={name:r.name,value:r.value,unit:r.unit,metric:r.metadata.metric||r.name,sourceId:r.id};
  put('defaults',defaults,evidence(rows.slice(0,10).map(r=>r.id),'Editable suggestions from prior explicit entries; never actual records'),'defaults');
  const ready=readiness(data.records,date);put('adaptiveCheckin',adaptiveInputs(data,date),evidence(ready.contributors.flatMap(c=>c.ids),'Available reliable inputs; subjective questions require self-report'),'adaptiveCheckin');
}
function inboxAutomation({data,state,date,now,put}:Context){
  const pref=automationPreferences(data.records),rows=live(data.records),candidates:InboxItem[]=[];
  const add=(id:string,type:InboxItem['type'],priority:number,title:string,body:string,payload:Record<string,unknown>,refs:string[],explanation:string,expiresAt=atTime(shiftDay(date,1),'00:00'))=>candidates.push({id,type,priority,title,body,suggestedAction:type==='dose'?'Taken':type==='meal'?'Ate this':payload.metric==='Progress photos'?'Add photo':type==='measurement'?'Log measurement':'Confirm',suggestedPayload:payload,source:evidence(refs,explanation,type==='meal'?'medium':'high'),createdAt:now.toISOString(),expiresAt,status:'pending'});
  if(pref.doseReminders)for(const parent of rows.filter(r=>['supplement','medication'].includes(r.type)&&r.metadata.enabled!==false)){
    for(const time of scheduledDoseTimes(parent,date)){
      if(Date.parse(atTime(date,time))>now.getTime())continue;
      if(confirmedDose(rows,parent,date,time))continue;
      add(`dose:${parent.id}:${date}:${time}`,'dose',parent.type==='medication'?100:85,`${parent.name} due`,String(parent.metadata.dose||parent.metadata.serving||'Review your saved dose'),{parentId:parent.id,scheduledTime:time,doseType:parent.type},[parent.id],'Your explicitly configured schedule; reminder is not adherence');
    }
  }
  const mealGroups=new Map<string,BioRecord[]>();
  for(const r of rows.filter(r=>r.type==='meal'&&dateOf(r.timestamp)>=shiftDay(date,-60)&&dateOf(r.timestamp)<=date)){const sig=fingerprint({name:r.name.toLowerCase().trim(),meal:r.metadata.meal,calories:r.metadata.calories,serving:r.metadata.serving});mealGroups.set(sig,[...(mealGroups.get(sig)||[]),r]);}
  const patterns=[...mealGroups].filter(([,rs])=>new Set(rs.map(r=>dateOf(r.timestamp))).size>=3).map(([signature,rs])=>{const times=rs.map(r=>new Date(r.timestamp).getHours()*60+new Date(r.timestamp).getMinutes()),time=mean(times)!;return {meal_signature:signature,typical_time_window:[Math.max(0,time-60),Math.min(1439,time+60)],weekday_pattern:[...new Set(rs.map(r=>new Date(r.timestamp).getDay()))],frequency:rs.length,last_used:rs.sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0].timestamp,confidence:rs.length>=7?'high':'medium',record:rs[0],refs:rs.map(r=>r.id)};});
  if(pref.mealPatterns)put('foodPatterns',patterns,evidence(patterns.flatMap(p=>p.refs),'Repeated meal signatures and portions over 60 days'),'foodPatterns');
  const minute=now.getHours()*60+now.getMinutes();
  if(pref.mealPatterns)for(const pattern of patterns){
    if(minute<pattern.typical_time_window[0]||minute>pattern.typical_time_window[1]||!pattern.weekday_pattern.includes(now.getDay())||rows.some(r=>r.type==='meal'&&dateOf(r.timestamp)===date&&r.metadata.meal===pattern.record.metadata.meal))continue;
    add(`usual:${pattern.meal_signature}:${date}`,'meal',45,`Usual ${String(pattern.record.metadata.meal||'meal').toLowerCase()}?`,`${pattern.record.name} · ${num(pattern.record,'calories')??'Unknown'} kcal`,{recordId:pattern.record.id},pattern.refs,'A local pattern is a suggestion; it does not establish that you ate this');
  }
  if(pref.recurringMeals)for(const recurring of rows.filter(r=>r.type==='automation'&&r.metadata.subtype==='recurringMeal'&&r.metadata.enabled!==false)){
    const meal=rows.find(r=>r.id===recurring.metadata.recordId);if(!meal)continue;
    const days=String(recurring.metadata.daysOfWeek||'').split(',').filter(Boolean).map(Number);
    if(days.length&&!days.includes(now.getDay())||recurring.metadata.end&&String(recurring.metadata.end)<date||Date.parse(atTime(date,String(recurring.metadata.time||'08:00')))>now.getTime())continue;
    if(rows.some(r=>r.type==='meal'&&r.metadata.recurringId===recurring.id&&dateOf(r.timestamp)===date))continue;
    add(`recurring:${recurring.id}:${date}`,'meal',55,`Usual ${String(recurring.metadata.meal||'meal').toLowerCase()}?`,`${meal.name} · ${num(meal,'calories')??'Unknown'} kcal`,{recordId:meal.id,recurringId:recurring.id},[recurring.id,meal.id],'Your recurrence configuration; explicit confirmation required');
  }
  if(pref.measurementScheduling){
    const schedules=rows.filter(r=>r.type==='automation'&&r.metadata.subtype==='measurementSchedule'&&r.metadata.enabled!==false);
    for(const s of schedules){const metric=String(s.metadata.metric),days=Math.max(1,Number(s.metadata.cadenceDays)||7);const matching=rows.filter(r=>(r.type==='vital'||r.type==='bodyMeasurement')&&(r.metadata.metric===metric||r.name===metric));const legacy=metric==='Weight'?data.db.measurements.filter(m=>m.weight).map(m=>m.date):[];
      const last=[...matching.map(r=>dateOf(r.timestamp)),...legacy,...(metric==='Progress photos'?(data.photoDates||[]).map(p=>p.date):[])].sort().at(-1),due=last?shiftDay(last,days):date;
      if(due>date||Date.parse(atTime(date,String(s.metadata.time||'09:00')))>now.getTime())continue;
      add(`measurement:${s.id}:${last||'first'}`,'measurement',35,`${metric} tracking is due`,last?`Last recorded ${last}; every ${days} days`:`Your ${days}-day cadence is ready`,{metric,scheduleId:s.id},[s.id,...matching.slice(-1).map(r=>r.id)],'A user-defined cadence; an imported matching reading satisfies the task',atTime(shiftDay(date,days),'00:00'));
    }
  }
  if(pref.anomalyPrompts){
    const flags=['HRV','Resting HR','Sleep','Steps'].flatMap(metric=>{const b=state.derived[`baseline:${metric}:28`]?.value as {mean:number|null;dispersion:number|null;sample_count:number}|undefined;const current=dailyMetric(data,metric,date);return b&&b.sample_count>=14&&b.mean!==null&&current.value!==null&&Math.abs(current.value-b.mean)>Math.max((b.dispersion||0)*2,Math.abs(b.mean)*.1)?[{metric,...current,mean:b.mean}]:[];});
    const recent=Object.values(state.inbox).some(i=>i.type==='anomaly'&&i.resolvedAt&&now.getTime()-Date.parse(i.resolvedAt)<3*86400000);
    if(flags.length>=2&&!recent)add(`anomaly:${date}`,'anomaly',65,'Several signals differ from your recent baseline','How are you feeling?',{},flags.flatMap(f=>f.ids),flags.map(f=>`${f.metric}: ${f.value} vs prior mean ${f.mean.toFixed(1)}`).join(' · '));
  }
  for(const r of rows.filter(r=>r.quality==='imported'&&r.metadata.requiresConfirmation===true&&!r.metadata.confirmed))add(`import:${r.id}`,'import',70,`Review imported ${r.name}`,`${r.value??''} ${r.unit} · ${r.source}`,{recordId:r.id},[r.id],'The import explicitly requires review',atTime(shiftDay(date,7),'00:00'));
  const valid=new Set(candidates.map(i=>i.id));
  for(const item of Object.values(state.inbox))if(item.status==='pending'&&(!valid.has(item.id)||Date.parse(item.expiresAt)<=now.getTime())){item.status='expired';item.resolvedAt=now.toISOString();item.resolution='Source or schedule changed, or relevance window elapsed';}
  for(const item of candidates)if(!state.inbox[item.id]||['expired','accepted','modified'].includes(state.inbox[item.id].status)&&Date.parse(item.expiresAt)>now.getTime())state.inbox[item.id]=item;
}
function reportsAutomation({data,state,put,date,now,event,dirtyDates,fullRebuild}:Context){
  const pref=automationPreferences(data.records);
  const periods:[string,string,string][]=[['Daily summary',date,date],['Weekly review draft',shiftDay(date,-6),date],['Weekly training report',shiftDay(date,-6),date],['Weekly nutrition summary',shiftDay(date,-6),date],['Monthly Health OS report',date.slice(0,8)+'01',date],['Body progress report',shiftDay(date,-27),date],['Recovery report',shiftDay(date,-6),date]];
  const cutoff=fullRebuild?'0000-01-01':shiftDay(date,-pref.reportRegenerationDays+1);
  const dirty=new Set(dirtyDates);if(fullRebuild)for(const d of inputDates(data))dirty.add(d);
  for(const d of dirty)if(d>=cutoff&&d<date)periods.push(['Daily summary',d,d]);
  for(const cached of Object.values(state.derived).filter(d=>d.kind==='report')){const r=cached.value as {report_type:string;period_start:string;period_end:string};if(r.period_end>=cutoff&&(event.type==='system.rebuild'||[...dirty].some(d=>d>=r.period_start&&d<=r.period_end))&&!periods.some(p=>p[0]===r.report_type&&p[2]===r.period_end))periods.push([r.report_type,r.period_start,r.period_end]);}
  for(const [report_type,start,end]of periods){const days=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;const dates=Array.from({length:days},(_,i)=>shiftDay(start,i));const rows=live(data.records).filter(r=>dates.includes(dateOf(r.timestamp)));const refs=rows.map(r=>r.id).concat(data.db.sessions.filter(s=>dates.includes(s.date)).map(s=>s.id));
    const average=(metric:string)=>mean(dates.map(d=>dailyMetric(data,metric,d).value).filter((v):v is number=>v!==null));
    let data_snapshot:Record<string,unknown>={from:start,to:end,workouts:data.db.sessions.filter(s=>dates.includes(s.date)&&isFinishedSession(s)).length,averageCalories:average('Calories'),averageProtein:average('Protein'),averageSleep:average('Sleep'),careAdherence:average('Care adherence'),weight:weightTrend(data.records,end),sourceCount:refs.length};
    if(report_type==='Weekly training report'){
      const sessions=data.db.sessions.filter(s=>dates.includes(s.date)&&isFinishedSession(s));
      const sets=sessions.flatMap(s=>s.logs.filter(l=>l.status!=='skipped').flatMap(l=>l.sets.filter(t=>t.type!=='warmup').map(t=>({exercise:l.name,muscle:l.target,weight:Number(t.w)||0,reps:Number(t.r)||0}))));
      data_snapshot={from:start,to:end,workouts:sessions.length,workingSets:sets.length,workingVolume:sets.reduce((n,s)=>n+s.weight*s.reps,0),bestE1rm:Object.fromEntries([...new Set(sets.map(s=>s.exercise))].map(exercise=>[exercise,Math.max(...sets.filter(s=>s.exercise===exercise).map(s=>epley1rm(s.weight,s.reps)))])),sourceCount:sessions.length};
    }else if(report_type==='Weekly nutrition summary')data_snapshot={from:start,to:end,averageCalories:average('Calories'),averageProtein:average('Protein'),averageCarbohydrates:average('Carbohydrates'),recordedDays:dates.filter(d=>dailyMetric(data,'Calories',d).value!==null).length,sourceCount:rows.filter(r=>r.type==='meal').length};
    else if(report_type==='Recovery report')data_snapshot={from:start,to:end,averageSleep:average('Sleep'),averageReadiness:average('Readiness'),averageHRV:average('HRV'),averageRestingHR:average('Resting HR')};
    else if(report_type==='Body progress report'){const trend=weightTrend(data.records,end);data_snapshot={from:start,to:end,weight:{...trend,points:trend.points.filter(p=>p.date>=start)}};}
    const rendered_output=`<!doctype html><html><meta charset="utf-8"><title>Health OS ${report_type}</title><body><h1>${report_type}</h1><p>${start} to ${end}</p><p>Missing observations remain unknown. This is a deterministic review, not a medical interpretation.</p><pre>${JSON.stringify(data_snapshot,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre></body></html>`;
    put('report',{report_type,period_start:start,period_end:end,generated_at:now.toISOString(),data_snapshot,rendered_output,ai_summary:null,status:'ready',regenerationWindow:pref.reportRegenerationDays},evidence(refs,'Deterministic source snapshot; external delivery remains separately configured'),`report:${report_type}:${end}`,end);
  }
}
function insightAutomation({state,data,put,date}:Context){
  const insights:{id:string;category:string;text:string;sample_size:number;evidence_refs:string[];confidence:string;time_window:string;generated_at:string;expires_at:string;comparison?:ReturnType<typeof proteinEnergyInsight>}[]=[];
  const series=Array.from({length:28},(_,i)=>({date:shiftDay(date,-i),day:dailyValue(state,shiftDay(date,-i))}));
  // Sleep is an input to readiness: do not report their built-in relationship as a discovery.
  const smart=proteinEnergyInsight(series.map(point=>({date:point.date,Protein:point.day?.metrics.Protein??null,Energy:point.day?.metrics.Energy??null})));
  if(smart)insights.push({id:'protein-energy',category:'Nutrition',text:`Higher recorded protein days were associated with ${smart.difference.toFixed(1)} more energy points. This does not establish cause.`,sample_size:smart.samples,evidence_refs:series.flatMap(point=>point.day?.metricRefs.Protein||[]).concat(series.flatMap(point=>point.day?.metricRefs.Energy||[])),confidence:'medium',time_window:`${smart.from}–${smart.to}`,generated_at:new Date().toISOString(),expires_at:atTime(shiftDay(date,7)),comparison:smart});
  const target=live(data.records).filter(r=>r.type==='nutritionTarget').at(-1),protein=Number(target?.metadata.protein);
  if(protein>0){const days=series.slice(0,7).filter(p=>p.day?.metrics.Protein!==null&&p.day?.metrics.Protein!==undefined);if(days.length)insights.push({id:'protein-adherence',category:'Nutrition',text:`Protein target reached on ${days.filter(p=>p.day!.metrics.Protein!>=protein).length} of 7 days; ${days.length} days recorded.`,sample_size:days.length,evidence_refs:days.flatMap(p=>p.day!.refs),confidence:days.length===7?'high':'low',time_window:'7 days',generated_at:new Date().toISOString(),expires_at:atTime(shiftDay(date,1))});}
  const priorCare=series.slice(7,14).filter(p=>p.day?.metrics['Care adherence']!=null),currentCare=series.slice(0,7).filter(p=>p.day?.metrics['Care adherence']!=null);
  if(priorCare.length>=4&&currentCare.length>=4){const before=mean(priorCare.map(p=>p.day!.metrics['Care adherence']!))!,after=mean(currentCare.map(p=>p.day!.metrics['Care adherence']!))!;if(Math.abs(after-before)>=5)insights.push({id:'care-adherence',category:'Care',text:`Confirmed care completion changed from ${before.toFixed(0)}% to ${after.toFixed(0)}% across the last two weeks.`,sample_size:priorCare.length+currentCare.length,evidence_refs:[...priorCare,...currentCare].flatMap(p=>p.day!.refs),confidence:'medium',time_window:'14 days',generated_at:new Date().toISOString(),expires_at:atTime(shiftDay(date,7))});}
  const lifts=(state.derived.training?.value as {lifts:{exercise:string;date:string;e1rm:number;sessionId:string}[]}|undefined)?.lifts||[];
  for(const exercise of [...new Set(lifts.map(l=>l.exercise))]){const sets=lifts.filter(l=>l.exercise===exercise&&l.date>=shiftDay(date,-55)&&l.date<=date);const dates=[...new Set(sets.map(l=>l.date))].sort();if(dates.length<3)continue;const first=Math.max(...sets.filter(l=>l.date===dates[0]).map(l=>l.e1rm)),last=Math.max(...sets.filter(l=>l.date===dates.at(-1)).map(l=>l.e1rm));if(first>0&&Math.abs(last-first)/first>=.02)insights.push({id:`strength:${exercise}`,category:'Training',text:`${exercise} estimated 1RM changed ${(last-first)>=0?'+':''}${((last-first)/first*100).toFixed(1)}% across ${dates.length} recorded sessions. This is an estimate from performed working sets.`,sample_size:dates.length,evidence_refs:[...new Set(sets.map(l=>l.sessionId))],confidence:dates.length>=6?'medium':'low',time_window:'56 days',generated_at:new Date().toISOString(),expires_at:atTime(shiftDay(date,7))});}
  insights.sort((a,b)=>(b.confidence==='high'?3:b.confidence==='medium'?2:1)-(a.confidence==='high'?3:a.confidence==='medium'?2:1)||b.sample_size-a.sample_size);
  put('insights',insights.slice(0,5),evidence(insights.flatMap(i=>i.evidence_refs),'Ranked supported observations; no causal or diagnostic claims'),'insights');
}
function correlationAutomation({state,put,date}:Context){
  for(const window of [7,28,90]){
    const series=Array.from({length:window},(_,i)=>({date:shiftDay(date,-i),day:dailyValue(state,shiftDay(date,-i))}));
    const results=correlationDefinitions.map(([x,y])=>({x,y,...correlation(series.flatMap(p=>p.day?.metrics[x]!=null&&p.day?.metrics[y]!=null?[{date:p.date,x:p.day.metrics[x]!,y:p.day.metrics[y]!}]:[]))}));
    put('correlations',results,evidence(series.flatMap(p=>p.day?.refs||[]),`Matched daily observations over ${window} days; association does not establish cause`),`correlations:${window}`);
  }
}
export const automationRegistry:AutomationDefinition[]=[
  definition('daily-aggregates',dailyAutomation),definition('training-history-pr-load',trainingAutomation,undefined,true),
  definition('habit-goal-progress',progressAutomation),definition('body-tdee',({data,date,put})=>{const weight=weightTrend(data.records,date);put('body',{weight,tdee:adaptiveTdee(data.records,weight.points)},evidence(preferredVitals(data.records,'Weight').filter(r=>dateOf(r.timestamp)<=date).map(r=>r.id),'Preferred weight sources and complete nutrition days'),'body');}),
  definition('adaptive-inputs-smart-defaults',smartDefaults),definition('workout-preparation',({data,date,put})=>put('preparedWorkout',preparedWorkout(data,date,readiness(data.records,date).score),evidence([data.db.meta.activeWeekId],'Active program, previous working performance and current readiness'),'preparedWorkout'),'workoutPreparation'),
  definition('care-plan',({data,date,put})=>put('carePlan',careTasksForDate(data.skin.care,date,data.skin.products).map(t=>({...t,status:data.skin.care.events.find(e=>e.taskId===t.id&&e.date===date)?.status||'pending'})),evidence(data.skin.care.tasks.map(t=>t.id),'Scheduled care tasks; no completion is inferred'),'carePlan'),'carePlan'),
  definition('personal-baselines',baselineAutomation,'baselines',true),definition('correlation-analysis',correlationAutomation,'insights',true),definition('insights',insightAutomation,'insights',true),definition('automatic-reports',reportsAutomation,'automaticReports',true),definition('confirmation-inbox',inboxAutomation),
  definition('coach-context',({data,state,date,put})=>put('coachContext',{date,nutrition:nutrition(data.records,date),readiness:readiness(data.records,date),load:(state.derived.training?.value as {load:ReturnType<typeof trainingLoad>}|undefined)?.load||trainingLoad(data.db,date),weight:weightTrend(data.records,date),progress:Object.values(state.derived).filter(d=>['goal','habit'].includes(d.kind)&&d.date===date).map(d=>d.value)},evidence([],'Local deterministic summary; sharing still requires existing explicit AI consent'),'coachContext')),
];
automationRegistry.find(d=>d.key==='training-history-pr-load')!.listensTo=['workout.*','program.*','system.rebuild'];
automationRegistry.find(d=>d.key==='workout-preparation')!.listensTo=['workout.*','program.*','readiness.*','checkIn.*','sleep.*','vital.*','symptom.*','recoveryNote.*','system.rebuild','system.tick'];
automationRegistry.find(d=>d.key==='body-tdee')!.listensTo=['weight.*','measurement.*','bodyMeasurement.*','meal.*','nutritionDay.*','nutritionTarget.*','sourcePriority.*','system.rebuild'];
const subscribed=(def:AutomationDefinition,event:DomainEvent)=>def.listensTo.some(t=>t==='*'||t===event.type||t.endsWith('.*')&&event.type.startsWith(t.slice(0,-1)));
function runDefinition(def:AutomationDefinition,event:DomainEvent,data:Dataset,state:AutomationState,now:Date,force=false,dirtyDates?:string[],fullRebuild=false){
  const runId=`${event.id}:${def.key}:v${def.version}`;if(!force&&state.runs[runId]?.status==='completed')return;
  const pref=automationPreferences(data.records),startedAt=now.toISOString(),outputRefs:string[]=[];
  if(def.flag&&pref[def.flag]===false){state.runs[runId]={id:runId,eventId:event.id,automationKey:def.key,version:def.version,status:'disabled',startedAt,outputRefs};return;}
  try{
    const observed={...data,records:data.records.filter(r=>r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true)};
    if(['habit-goal-progress','automatic-reports'].includes(def.key))observed.dailyAggregates=Object.fromEntries(Object.values(state.derived).filter(d=>d.kind==='daily').map(d=>[d.date,d.value as Daily]));
    def.run({data:def.key==='confirmation-inbox'?data:observed,state,event,now,date:dateOf(now.toISOString()),dirtyDates:dirtyDates||[event.payload.date,...(event.payload.previousDate?[event.payload.previousDate]:[])],fullRebuild,put:(kind,value,why=evidence([],def.key),id=`${kind}:${dateOf(now.toISOString())}`,date=dateOf(now.toISOString()))=>{if(why.ids.some(id=>data.records.some(r=>r.id===id&&r.quality==='estimated')))why={...why,quality:'low',explanation:why.explanation+'; includes estimated source values'};state.derived[id]={id,kind,date,value,eventId:event.id,automationKey:def.key,version:def.version,updatedAt:startedAt,evidence:why};outputRefs.push(id);}});
    state.runs[runId]={id:runId,eventId:event.id,automationKey:def.key,version:def.version,status:'completed',startedAt,completedAt:now.toISOString(),outputRefs};
  }catch(e){state.runs[runId]={id:runId,eventId:event.id,automationKey:def.key,version:def.version,status:'failed',startedAt,outputRefs,error:(e as Error).message};throw e;}
}
export function processDomainEvent(input:DomainEvent,data:Dataset,state:AutomationState,now=new Date()){
  const event=domainEventSchema.parse(input);if(event.userId!==data.userId)throw new Error('Event belongs to another account');
  if(!state.events.some(e=>e.id===event.id))state.events.push(event);
  for(const def of automationRegistry){if(!subscribed(def,event)||state.runs[`${event.id}:${def.key}:v${def.version}`]?.status==='completed')continue;
    if(def.deferred){const jobId=`${data.userId}:${def.key}`;const prior=state.jobs[jobId];state.jobs[jobId]={id:jobId,key:def.key,eventId:event.id,status:'pending',attempts:0,nextAttemptAt:now.toISOString(),affectedDates:[...new Set([...(prior?.status==='pending'?prior.affectedDates||[]:[]),event.payload.date,...(event.payload.previousDate?[event.payload.previousDate]:[])])]};continue;}
    try{runDefinition(def,event,data,state,now);}catch{const jobId=`retry:${event.id}:${def.key}`;state.jobs[jobId]={id:jobId,key:def.key,eventId:event.id,status:'pending',attempts:0,nextAttemptAt:now.toISOString()};}
  }
}
export function drainAutomationJobs(data:Dataset,state:AutomationState,now=new Date()){
  for(const job of Object.values(state.jobs).filter(j=>!j.command&&(j.status==='pending'||j.status==='failed')&&Date.parse(j.nextAttemptAt)<=now.getTime())){
    const event=state.events.find(e=>e.id===job.eventId),def=automationRegistry.find(d=>d.key===job.key);if(!event||!def){job.status='cancelled';continue;}
    try{job.attempts++;runDefinition(def,event,data,state,now,true,job.affectedDates,job.rebuildAll);job.status='completed';job.error=undefined;}catch(e){job.status='failed';job.error=(e as Error).message;job.nextAttemptAt=new Date(now.getTime()+Math.min(3600000,1000*2**Math.min(job.attempts,12))).toISOString();}
  }
  const event=state.events.at(-1);if(event)for(const key of ['confirmation-inbox','coach-context'])try{runDefinition(automationRegistry.find(d=>d.key===key)!,event,data,state,now,true);}catch{}
}
export function reconcileAutomations(data:Dataset,state:AutomationState,now=new Date(),rebuild=false,published:DomainEvent[]=[]){
  const manualRebuild=rebuild;
  if(state.engineVersion!==5){rebuild=true;state.engineVersion=5;}
  const knownEvents=new Set(state.events.map(e=>e.id));
  const events=[...published.filter(e=>e.userId===data.userId&&!knownEvents.has(e.id)),...sourceEvents(data,state,now)],date=dateOf(now.toISOString());
  // A midnight/minute tick handles due schedules without touching source truth.
  if(rebuild||!state.updatedAt)events.unshift({id:`rebuild:${data.userId}:${now.toISOString()}`,type:'system.rebuild',userId:data.userId,source:{kind:'system'},occurredAt:now.toISOString(),createdAt:now.toISOString(),schemaVersion:1,payload:{date}});
  if(!events.length&&(!state.updatedAt||state.updatedAt.slice(0,16)!==now.toISOString().slice(0,16)))events.push({id:`tick:${data.userId}:${now.toISOString().slice(0,16)}`,type:'system.tick',userId:data.userId,source:{kind:'system'},occurredAt:now.toISOString(),createdAt:now.toISOString(),schemaVersion:1,payload:{date}});
  // Refresh affected dates first, then fan out only once for a source batch.
  for(const event of events)if(!knownEvents.has(event.id)){state.events.push(event);knownEvents.add(event.id);}
  const dirtyDates=[...new Set(events.flatMap(e=>e.type==='system.rebuild'||e.type.startsWith('sourcePriority.')?[date,...inputDates(data)]:[e.payload.date,...(e.payload.previousDate?[e.payload.previousDate]:[])]))];
  if(events.length)try{runDefinition(automationRegistry[0],events.at(-1)!,data,state,now,false,dirtyDates);}catch{}
  if(events.length){for(const def of automationRegistry.slice(1)){
    const event=events.filter(e=>subscribed(def,e)&&!(e.type==='system.tick'&&state.derived.preparedWorkout?.date===date&&!['confirmation-inbox'].includes(def.key))).at(-1);if(!event)continue;
    if(def.deferred){const id=`${data.userId}:${def.key}`;const prior=state.jobs[id];state.jobs[id]={id,key:def.key,eventId:event.id,status:'pending',attempts:0,nextAttemptAt:now.toISOString(),affectedDates:[...new Set([...(prior?.status==='pending'?prior.affectedDates||[]:[]),...dirtyDates])],rebuildAll:manualRebuild||prior?.status==='pending'&&prior.rebuildAll};}
    else try{runDefinition(def,event,data,state,now,false,dirtyDates,manualRebuild);}catch{const id=`retry:${data.userId}:${def.key}`;const prior=state.jobs[id];state.jobs[id]={id,key:def.key,eventId:event.id,status:'pending',attempts:0,nextAttemptAt:now.toISOString(),affectedDates:[...new Set([...(prior?.status==='pending'?prior.affectedDates||[]:[]),...dirtyDates])],rebuildAll:manualRebuild||prior?.status==='pending'&&prior.rebuildAll};}
  }}
  // Remove orphaned projections after source deletion or changing a linked rule to manual.
  const validGoals=new Set([...data.db.targets.map(t=>t.id),...live(data.records).filter(r=>r.type==='goal'&&linkedRule(r)).map(r=>r.id)]),validHabits=new Set([...data.db.habits.map(h=>h.id),...live(data.records).filter(r=>r.type==='habit'&&linkedRule(r)).map(r=>r.id)]),pref=automationPreferences(data.records);
  for(const [id,d]of Object.entries(state.derived))if(d.kind==='goal'||d.kind==='habit'){
    const r=d.value as {recordId:string};if(!(d.kind==='goal'?validGoals:validHabits).has(r.recordId)||(d.kind==='goal'?!pref.goals:!pref.habits))delete state.derived[id];
  }
  for(const [id,d]of Object.entries(state.derived)){const def=automationRegistry.find(a=>a.key===d.automationKey);if(def?.flag&&pref[def.flag]===false)delete state.derived[id];}
  state.updatedAt=now.toISOString();return state;
}
export {resolveInbox,pendingInbox} from './automation-inbox.js';
