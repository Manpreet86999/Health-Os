import { sleepDurationHours } from './biology.js';
import { isFinishedSession } from './training.js';
import { epley1rm } from './training.js';
import { baseline, correlation, dateOf, live, mean, num, nutrition, preferredVitals, readiness, type BioDomain, type BioRecord } from './biology.js';
import type { AppDb, Page, Session } from './types.js';
import { careTasksForDate, type SkinState } from './skin.js';

export const shiftDay=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return dateOf(d.toISOString());};
export const atTime=(date:string,time='12:00')=>new Date(`${date}T${/^\d{2}:\d{2}$/.test(time)?time:'12:00'}:00`).toISOString();
export const domainPage:Record<BioDomain,Page>={Today:'Today',Train:'Dashboard',Eat:'Eat',Recover:'Recover',Health:'Health',Body:'Body',Care:'SkinOverview',Insights:'Insights'};
export const workingVolume=(session:Session)=>session.logs.filter(log=>log.status!=='skipped').reduce((sum,log)=>sum+log.sets.filter(s=>s.type!=='warmup').reduce((n,s)=>n+(Number(s.w)||0)*(Number(s.r)||0),0),0);
export const workingSets=(session:Session)=>session.logs.filter(log=>log.status!=='skipped').reduce((sum,log)=>sum+log.sets.filter(s=>s.type!=='warmup').length,0);
export function trainingLoad(db:AppDb,date:string){
  const sessions=db.sessions.filter(s=>s.date<=date&&isFinishedSession(s));
  const recent=sessions.filter(s=>s.date>=shiftDay(date,-6)),prior=sessions.filter(s=>s.date>=shiftDay(date,-34)&&s.date<shiftDay(date,-6));
  const volume=recent.reduce((s,r)=>s+workingVolume(r),0),average=prior.reduce((s,r)=>s+workingVolume(r),0)/4;
  const effort=sessions.filter(s=>s.date>=shiftDay(date,-27)).map(s=>({date:s.date,load:workingVolume(s),sets:workingSets(s),minutes:s.durationMinutes??null}));
  return {volume,sessions:recent.length,sets:recent.reduce((s,r)=>s+workingSets(r),0),priorWeeklyAverage:average,change:average>0?(volume-average)/average*100:null,history:effort};
}
export function sleepStats(records:BioRecord[],date:string){
  const rows=live(records).filter(r=>r.type==='sleep'&&dateOf(r.timestamp)<=date&&sleepDurationHours(r)!==null).map(r=>({...r,value:sleepDurationHours(r)!,unit:'hours'})).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  const daily=new Map<string,BioRecord>();for(const r of rows.filter(r=>!r.metadata.nap))daily.set(dateOf(r.timestamp),r);
  const recent=[...daily.values()].filter(r=>dateOf(r.timestamp)>=shiftDay(date,-6));
  const preference=live(records).filter(r=>r.type==='sleepPreference').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  const target=num(preference||({metadata:{}} as BioRecord),'target')||8;
  const minute=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
  const circular=(a:number,b:number)=>Math.min(Math.abs(a-b),1440-Math.abs(a-b));
  const bedtimes=recent.filter(r=>/^\d{2}:\d{2}$/.test(String(r.metadata.bedtime))).map(r=>minute(String(r.metadata.bedtime)));
  const deviation=bedtimes.length>=3?mean(bedtimes.slice(1).map((v,i)=>circular(v,bedtimes[i]))):null;
  return {target,latest:daily.get(date),average:mean(recent.map(r=>r.value!)),observedDays:recent.length,consistency:deviation===null?null:Math.round(Math.max(0,100-deviation/120*100)),debt:recent.length>=3?recent.reduce((s,r)=>s+Math.max(0,target-r.value!),0):null,history:[...daily.values()].slice(-28),naps:rows.filter(r=>r.metadata.nap&&dateOf(r.timestamp)===date),preference};
}
export interface TimelineEvent {id:string;domain:BioDomain;type:string;title:string;timestamp:string;endTime?:string;summary:string;status:'logged'|'planned'|'done'|'skipped';page:Page;record?:BioRecord;targetId?:string;details?:string[];}
export function dueMedicationReminder(events:TimelineEvent[],date:string,now=new Date()) {
  if(date!==dateOf(now.toISOString()))return undefined;
  return events.find(event=>event.type==='medication'&&event.status==='planned'&&Date.parse(event.timestamp)<=now.getTime())?.title;
}
const setupKinds=new Set(['food','recipe','nutritionTarget','sourcePriority','researchConsent','nudgePreference','habit','goal','supplement','medication','experiment','automation','sleepPreference','mealPlan','routine']);
export function buildTimeline(records:BioRecord[],db:AppDb,skin:SkinState,date:string):TimelineEvent[]{
  const rows=live(records);const events:TimelineEvent[]=[];
  for(const r of rows.filter(r=>!setupKinds.has(r.type)&&!(r.type==='automationEvent'&&r.metadata.subtype==='careAction'||r.type==='journal'&&r.metadata.subtype==='careObservation')&&dateOf(r.timestamp)===date)){
    let summary=r.value!==undefined?`${r.value.toLocaleString()} ${r.unit}`:String(r.metadata.notes||'');
    if(r.type==='meal')summary=`${num(r,'calories')??'—'} kcal · ${num(r,'protein')??'—'} g protein${r.metadata.meal?` · ${r.metadata.meal}`:''}`;
    if(r.type==='checkIn')summary=`Energy ${num(r,'energy')??'—'}/10 · stress ${num(r,'stress')??'—'}/10 · soreness ${num(r,'soreness')??'—'}/10`;
    if(r.type==='dose')summary=String(r.metadata.status||'Logged');
    if(r.type==='vital')summary=`${r.metadata.metric||r.name}: ${r.value??'—'} ${r.unit}${r.metadata.context?` · ${r.metadata.context}`:''}`;
    events.push({id:r.id,domain:r.domain,type:r.type,title:r.name,timestamp:r.timestamp,endTime:r.endTime,summary,status:r.type==='dose'&&r.metadata.status==='Skipped'?'skipped':'logged',page:domainPage[r.domain],record:r,details:[`Source: ${r.source}`,`Quality: ${r.quality}`,`Recorded: ${new Date(r.timestamp).toLocaleString()}`,`Sync: ${r.syncState==='saved'?'Saved':'Pending'}`]});
  }
  for(const s of db.sessions.filter(s=>s.date===date)){
    if(s.startedAt)events.push({id:`session-start-${s.id}`,domain:'Train',type:'workoutStart',title:`${s.name||s.dayTitle} started`,timestamp:s.startedAt,summary:`${s.logs.length} exercises`,status:'logged',page:'Records'});
    events.push({id:`session-${s.id}`,domain:'Train',type:'workout',title:s.name||s.dayTitle,timestamp:s.endedAt||s.startedAt||atTime(date),summary:`${workingSets(s)} sets · ${workingVolume(s).toLocaleString()} ${db.profile.units} volume${s.durationMinutes?` · ${s.durationMinutes} min`:''}`,status:'done',page:'Records',details:s.logs.map(l=>`${l.name}: ${l.sets.length} sets`)});
  }
  for(const c of db.cardio.filter(c=>c.date===date))events.push({id:`cardio-${c.id}`,domain:'Train',type:'cardio',title:c.activity,timestamp:c.createdAt&&dateOf(c.createdAt)===date?c.createdAt:atTime(date),summary:`${c.durationMinutes} min${c.distance?` · ${c.distance} distance`:''}`,status:'logged',page:'Recover',details:[c.notes||'']});
  for(const h of db.habitLogs.filter(h=>h.date===date))events.push({id:`habit-${h.id}`,domain:'Today',type:'habitDone',title:db.habits.find(d=>d.id===h.habitId)?.name||'Habit completed',timestamp:h.createdAt,summary:`${h.value} ${db.habits.find(d=>d.id===h.habitId)?.unit||''}`,status:'done',page:'Habits'});
  for(const c of skin.care.checkIns.filter(c=>c.date===date))events.push({id:`care-check-${c.id}`,domain:'Care',type:'observation',title:c.concern||'Care observation',timestamp:c.createdAt,summary:`${c.area}${c.severity!==null?` · ${c.severity}/10`:''}${c.note?` · ${c.note}`:''}`,status:'logged',page:'SkinProgress'});
  for(const task of careTasksForDate(skin.care,date,skin.products)){
    const done=skin.care.events.find(e=>e.taskId===task.id&&e.date===date);const time=task.time==='morning'?'08:00':task.time==='evening'?'21:00':'12:00';
    events.push({id:`care-${task.id}-${date}`,domain:'Care',type:'careTask',title:task.label,timestamp:done?.createdAt||atTime(date,time),summary:`${task.area} · ${task.minutes} min${task.productId?` · ${skin.products.find(p=>p.id===task.productId)?.name||''}`:''}`,status:done?.status==='done'?'done':done?.status==='skipped'?'skipped':'planned',page:'SkinRoutine',targetId:task.id,details:[task.notes]});
  }
  for(const r of rows.filter(r=>['supplement','medication','habit','automation','mealPlan'].includes(r.type))){
    if(r.type==='medication'&&r.metadata.status==='Stopped')continue;
    if(r.metadata.enabled===false||(r.metadata.start&&String(r.metadata.start)>date)||(r.metadata.end&&String(r.metadata.end)<date))continue;
    const days=String(r.metadata.daysOfWeek||'').split(',').filter(Boolean).map(Number);if(days.length&&!days.includes(new Date(`${date}T12:00:00`).getDay()))continue;
    if(r.type==='mealPlan'&&(r.metadata.date!==date||rows.some(m=>m.type==='meal'&&m.metadata.planId===r.id&&dateOf(m.timestamp)===date)))continue;
    if(r.type==='automation'&&r.metadata.trigger!=='time')continue;
    if(r.type==='habit'&&rows.some(d=>d.type==='habitDone'&&d.metadata.parentId===r.id&&dateOf(d.timestamp)===date))continue;
    const times=String(r.metadata.times||r.metadata.time||(r.type==='habit'?'09:00':r.type==='mealPlan'?'13:00':'12:00')).split(',').map(t=>t.trim()).filter(t=>/^\d{2}:\d{2}$/.test(t));
    for(const time of times){
      const dose=rows.find(d=>d.type==='dose'&&d.metadata.parentId===r.id&&dateOf(d.timestamp)===date&&(d.metadata.scheduledTime===time||(!d.metadata.scheduledTime&&times.length===1)));
      if(dose)continue;
      const completed=rows.find(d=>d.type==='automationEvent'&&d.metadata.parentId===r.id&&d.metadata.scheduledTime===time&&dateOf(d.timestamp)===date&&d.metadata.status==='done');if(completed)continue;
      events.push({id:`plan-${r.id}-${date}-${time}`,domain:r.domain,type:r.type,title:r.name,timestamp:atTime(date,time),summary:r.type==='medication'?String(r.metadata.dose||'Follow your prescribed schedule'):r.type==='supplement'?`${r.metadata.serving||''} ${r.metadata.unit||r.unit||''}${r.metadata.food?` · ${r.metadata.food}`:''}`:r.type==='automation'?String(r.metadata.message||'Your scheduled reminder'):r.type==='mealPlan'?`${r.metadata.meal||'Meal'} · planned`:'Daily habit',status:'planned',page:domainPage[r.domain],record:r,targetId:r.id});
    }
  }
  for(const w of db.scheduledWorkouts.filter(w=>w.date===date&&w.status==='planned'))if(!db.sessions.some(s=>s.date===date&&s.weekId===w.weekId&&s.dayKey===w.dayKey))events.push({id:`scheduled-${w.id}`,domain:'Train',type:'plannedWorkout',title:w.title,timestamp:atTime(date,db.trainingConfig.reminders.trainTime||'17:00'),summary:w.notes||'Your planned session',status:'planned',page:'Dashboard',targetId:w.id});
  return events.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id));
}
export function daySeries(records:BioRecord[],db:AppDb,skin:SkinState,end:string,days=90){
  const rows=live(records);const series=[];
  const byDate=new Map<string,BioRecord[]>();
  for(const row of rows){const date=dateOf(row.timestamp),group=byDate.get(date);if(group)group.push(row);else byDate.set(date,[row]);}
  const vitals=new Map(['HRV','Resting HR','Steps','Weight'].map(metric=>[metric,preferredVitals(rows,metric)]));
  const dailyVitals=new Map([...vitals].map(([metric,points])=>[metric,new Map(points.map(point=>[dateOf(point.timestamp),point]))]));
  for(let i=days-1;i>=0;i--){const date=shiftDay(end,-i),today=byDate.get(date)||[],sessions=db.sessions.filter(s=>s.date===date&&isFinishedSession(s));
    const val=(metric:string)=>{const record=dailyVitals.get(metric)?.get(date);return record?.value===undefined?null:metric==='Weight'&&record.unit==='lb'?record.value/2.2046226218:record.value;};
    const sleepRecord=today.filter(r=>r.type==='sleep'&&!r.metadata.nap).sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).at(-1);
    const sleep=sleepRecord?sleepDurationHours(sleepRecord):null;
    const checks=today.filter(r=>r.type==='checkIn').sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).at(-1),food=today.some(r=>r.type==='meal')?nutrition(today,date):null;
    const nutrient=(key:'protein'|'calories'|'carbs')=>today.some(r=>r.type==='meal'&&num(r,key)!==null)?food?.[key]??null:null;
    const observations=skin.care.checkIns.filter(c=>c.date===date&&c.severity!==null);
    const environment=today.filter(r=>r.type==='environment').at(-1);
    series.push({date,Sleep:sleep,Readiness:readiness(rows,date,{entries:today,vitals}).score,Energy:checks?num(checks,'energy'):null,Stress:checks?num(checks,'stress'):null,Protein:nutrient('protein'),Calories:nutrient('calories'),Carbohydrates:nutrient('carbs'),HRV:val('HRV'),'Resting HR':val('Resting HR'),Steps:val('Steps'),Weight:val('Weight'),Volume:sessions.length?sessions.reduce((s,r)=>s+workingVolume(r),0):null,Strength:mean(sessions.flatMap(s=>s.logs.flatMap(l=>{const values=l.sets.filter(set=>set.type!=='warmup').map(set=>epley1rm(Number(set.w),Number(set.r))).filter(v=>v>0);return values.length?[Math.max(...values)]:[]}))),'Care severity':mean(observations.map(c=>c.severity!)),Humidity:environment?num(environment,'humidity'):null});
  }
  return series;
}
export const correlationDefinitions=[['Sleep','Readiness'],['Sleep','Strength'],['Calories','Weight'],['Carbohydrates','Strength'],['Protein','Energy'],['Volume','HRV'],['Volume','Resting HR'],['Steps','Weight'],['Stress','Sleep'],['Care severity','Sleep'],['Care severity','Humidity']] as const;
export function correlations(records:BioRecord[],db:AppDb,skin:SkinState,end:string,days=90){
  const series=daySeries(records,db,skin,end,days);
  return correlationDefinitions.map(([x,y])=>({x,y,...correlation(series.flatMap(d=>d[x]!==null&&d[y]!==null?[{date:d.date,x:d[x]!,y:d[y]!}]:[]))}));
}
export function anomalySignals(records:BioRecord[],date:string){
  const metrics=[...new Set(live(records).filter(r=>r.type==='vital').map(r=>String(r.metadata.metric)))];
  return metrics.map(m=>baseline(records,m,date)).filter(b=>b.anomalous);
}
export function weightTrend(records:BioRecord[],date:string){
  const points=preferredVitals(records,'Weight').filter(r=>dateOf(r.timestamp)<=date).map(r=>({date:dateOf(r.timestamp),weight:r.unit==='lb'?r.value!/2.2046226218:r.value!}));
  const avg=(start:string,end:string)=>mean(points.filter(p=>p.date>=start&&p.date<=end).map(p=>p.weight));
  const current=avg(shiftDay(date,-6),date);
  const change=(days:number)=>{const old=avg(shiftDay(date,-days-6),shiftDay(date,-days));return old!==null&&current!==null?current-old:null;};
  return {points,latest:points.at(-1),trend:current,change30:change(30),change90:change(90)};
}
export function goalProgress(goal:BioRecord,records:BioRecord[],db:AppDb,skin:SkinState,date:string){
  const metric=String(goal.metadata.metric),days=Math.max(1,Number(goal.metadata.windowDays)||7);const series=daySeries(records,db,skin,date,days);
  let value:number|null=null;
  if(metric==='Workouts')value=db.sessions.filter(s=>s.date>=shiftDay(date,-days+1)&&s.date<=date).length;
  else if(metric==='Care adherence'){const dates=series.map(s=>s.date);const planned=dates.reduce((n,d)=>n+careTasksForDate(skin.care,d,skin.products).length,0);value=planned?skin.care.events.filter(e=>dates.includes(e.date)&&e.status==='done').length/planned*100:null;}
  else if(metric==='Custom')value=live(records).filter(r=>r.type==='goalCheckIn'&&r.metadata.parentId===goal.id&&dateOf(r.timestamp)<=date).sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0]?.value??null;
  else if(metric==='Weight')value=weightTrend(records,date).trend;
  else if(metric in series[0])value=mean(series.map(s=>s[metric as keyof typeof s]).filter((v):v is number=>typeof v==='number'));
  const target=num(goal,'target')||0,lower=goal.metadata.direction==='Decrease';
  return {value,target,percent:value===null||!target?null:Math.min(100,Math.max(0,lower?target/value*100:value/target*100)),met:value!==null&&(lower?value<=target:value>=target),observedDays:series.filter(s=>typeof s[metric as keyof typeof s]==='number').length};
}
export function summarizeRange(records:BioRecord[],db:AppDb,skin:SkinState,from:string,to:string){
  const days=Math.min(366,Math.max(1,Math.round((Date.parse(to)-Date.parse(from))/86400000)+1));const series=daySeries(records,db,skin,to,days).filter(r=>r.date>=from);
  const rows=live(records).filter(r=>dateOf(r.timestamp)>=from&&dateOf(r.timestamp)<=to);
  const avg=(key:keyof typeof series[number])=>mean(series.map(d=>d[key]).filter((v):v is number=>typeof v==='number'));
  const doseSchedules=live(records).filter(r=>r.type==='medication'||r.type==='supplement');
  const dosesDue=series.reduce((n,d)=>n+buildTimeline(records,{...db,sessions:[],cardio:[],habitLogs:[],scheduledWorkouts:[]},skin,d.date).filter(e=>e.status==='planned'&&['supplement','medication'].includes(e.type)).length,0);
  const taken=rows.filter(r=>r.type==='dose'&&r.metadata.status==='Taken').length,skipped=rows.filter(r=>r.type==='dose'&&r.metadata.status==='Skipped').length;
  const plannedCare=series.reduce((n,d)=>n+careTasksForDate(skin.care,d.date,skin.products).length,0),doneCare=skin.care.events.filter(e=>e.date>=from&&e.date<=to&&e.status==='done').length;
  return {from,to,days:series.length,workouts:db.sessions.filter(s=>s.date>=from&&s.date<=to&&isFinishedSession(s)).length,averageSleep:avg('Sleep'),averageReadiness:avg('Readiness'),averageSteps:avg('Steps'),averageCalories:avg('Calories'),averageProtein:avg('Protein'),nutritionDays:series.filter(s=>s.Calories!==null).length,completeNutritionDays:rows.filter(r=>r.type==='nutritionDay'&&r.metadata.complete).length,careAdherence:plannedCare?Math.min(100,doneCare/plannedCare*100):null,supplementAdherence:doseSchedules.length&&taken+skipped+dosesDue?Math.round(taken/(taken+skipped+dosesDue)*100):null,weight:weightTrend(records,to),series};
}
export function scaleNutrition(metadata:BioRecord['metadata'],factor:number){
  const keys=['calories','protein','carbs','fat','fibre','saturatedFat','sugars','sodium','iron','calcium','potassium','magnesium','zinc','folate','vitaminB12','vitaminC','vitaminD'];
  return {...metadata,...Object.fromEntries(keys.filter(k=>typeof metadata[k]==='number').map(k=>[k,Math.round(Number(metadata[k])*factor*100)/100]))};
}
export function recipeFit(recipe:BioRecord,remaining:{calories:number;protein:number;fibre:number},filters:{diet?:string;allergies?:string;minutes?:number;cuisine?:string;budget?:number;ingredients?:string}={}){
  const allergens=String(recipe.metadata.allergens||'').toLowerCase(),ingredients=String(recipe.metadata.ingredients||'').toLowerCase();
  if(filters.diet&&filters.diet!=='Any'&&recipe.metadata.diet!==filters.diet)return null;
  if(filters.allergies?.split(',').some(a=>a.trim()&&(allergens.includes(a.trim().toLowerCase())||ingredients.includes(a.trim().toLowerCase()))))return null;
  if(filters.minutes&&Number(recipe.metadata.minutes||Infinity)>filters.minutes)return null;
  if(filters.cuisine&&!String(recipe.metadata.cuisine||'').toLowerCase().includes(filters.cuisine.toLowerCase()))return null;
  if(filters.budget&&Number(recipe.metadata.cost||Infinity)>filters.budget)return null;
  const missing=filters.ingredients?.split(',').filter(a=>a.trim()&&!ingredients.includes(a.trim().toLowerCase())).length||0;
  return Math.abs((num(recipe,'calories')||0)-remaining.calories)/Math.max(200,remaining.calories)+Math.abs((num(recipe,'protein')||0)-remaining.protein)/Math.max(20,remaining.protein)+Math.abs((num(recipe,'fibre')||0)-remaining.fibre)/Math.max(8,remaining.fibre)+missing*.2;
}
