import { dateOf, live, num, type BioRecord } from './biology.js';
import { buildTimeline, daySeries, dueMedicationReminder, shiftDay } from './biological-intelligence.js';
import { dailyMetric, preparedWorkout } from './automation-rules.js';
import { baselineComparison, todayPriority } from './personal-intelligence.js';
import { proteinEnergyInsight } from './nutrition-insights.js';
import type { Dataset } from './automation-model.js';
import type { Page } from './types.js';
import { effectiveBiology } from './legacy-biology.js';

export interface HealthRecommendation {
  id:string; recommendation:string; priority:number; confidence:'low'|'medium'|'high';
  why:string[]; supportingSignals:{metric:string;value:number|null;unit:string;recordIds:string[]}[];
  action:{label:string;page:Page;panel?:string}; limitations:string[];
}
export const intelligenceMetrics=[
  {metric:'Sleep',unit:'h',floor:.5},{metric:'Resting HR',unit:'bpm',floor:3},
  {metric:'HRV',unit:'ms',floor:5},{metric:'Weight',unit:'kg',floor:.5},
  {metric:'Protein',unit:'g',floor:10},{metric:'Calories',unit:'kcal',floor:100},
  {metric:'Water',unit:'mL',floor:250},{metric:'Energy',unit:'/10',floor:1},
  {metric:'Stress',unit:'/10',floor:1},{metric:'Soreness',unit:'/10',floor:1},
  {metric:'Body fat',unit:'%',floor:1},
] as const;

/** Call only with an account-authorized database and care state. No writes or AI calls. */
export function buildHealthIntelligence(input:Dataset&{activeWorkout?:string},date:string,now=new Date()) {
  const records=effectiveBiology(input.db,live(input.records).filter(row=>row.userId===input.userId&&(row.metadata.requiresConfirmation!==true||row.metadata.confirmed===true)));
  const data={...input,records,dailyAggregates:undefined};
  // Estimated readings are useful in a diary, but cannot establish personal normality.
  const observed={...data,records:records.filter(row=>row.quality!=='estimated')};
  const series=daySeries(observed.records,data.db,data.skin,date,29);
  const baselines=intelligenceMetrics.map(definition=>{
    const points=series.map(row=>({date:row.date,value:definition.metric in row?row[definition.metric as keyof typeof row] as number|null:dailyMetric(observed,definition.metric,row.date).value}));
    return {...definition,...baselineComparison(points,date,definition.floor)};
  });
  const ready=dailyMetric(observed,'Readiness',date);
  const signals=(metrics:string[])=>metrics.map(metric=>{
    const value=dailyMetric(observed,metric,date),definition=intelligenceMetrics.find(item=>item.metric===metric);
    return {metric,value:value.value,unit:definition?.unit||'',recordIds:value.ids};
  });
  const candidates:HealthRecommendation[]=[];
  const add=(id:string,recommendation:string,priority:number,confidence:HealthRecommendation['confidence'],why:string[],metrics:string[],action:HealthRecommendation['action'],limitations:string[]=[])=>candidates.push({id,recommendation,priority,confidence,why,supportingSignals:signals(metrics),action,limitations});
  const timeline=buildTimeline(records,data.db,data.skin,date);
  if(input.activeWorkout)add('active-workout',input.activeWorkout,110,'high',['Continue your existing session before starting another workout.'],[],{label:'Resume workout',page:'Tracker'});
  const reminder=dueMedicationReminder(timeline,date,now);
  if(reminder)add('medication','Review your saved reminder',100,'high',[reminder,'Follow your prescribed schedule. A reminder does not establish a missed dose.'],[],{label:'Review schedule',page:'Timeline'});
  const sleep=baselines.find(item=>item.metric==='Sleep')!,rhr=baselines.find(item=>item.metric==='Resting HR')!;
  const reasons=[...(sleep.position==='below'?[`Sleep was ${Math.round(-sleep.deviation!*60)} min below your prior 28-day average.`]:[]),...(rhr.position==='above'?[`Resting HR was ${rhr.deviation!.toFixed(1)} bpm above your prior 28-day average.`]:[])];
  if(reasons.length)add('personal-recovery','Make room to recover',85,reasons.length>1?'medium':'low',reasons,['Sleep','Resting HR'],{label:'View recovery',page:'Recover'},['Personal deviations are observations, not diagnoses.','You can keep or edit your training plan.']);
  const check=records.filter(row=>row.type==='checkIn'&&dateOf(row.timestamp)===date).sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
  if(check&&(num(check,'soreness')??0)>=7)add('soreness','Consider a lighter session',80,'medium',['Your recorded soreness is at least 7/10.'],['Soreness'],{label:'Review training',page:'Dashboard'},['Do not train through pain. Adaptation is optional.']);
  const target=records.filter(row=>row.type==='nutritionTarget'&&dateOf(row.timestamp)<=date).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  const protein=dailyMetric(observed,'Protein',date),water=dailyMetric(observed,'Water',date);
  // Only current-day, later-day reminders; absent logs are unknown, never zero intake.
  if(date===dateOf(now.toISOString())&&now.getHours()>=16){
    const waterTarget=target?num(target,'water'):null,proteinTarget=target?num(target,'protein'):null;
    if(waterTarget&&water.value!==null&&water.value<waterTarget*.75)add('hydration','Review your hydration target',55,'low',[`${Math.round(waterTarget-water.value)} mL below your saved target in recorded drinks.`],['Water'],{label:'Review water',page:'Eat',panel:'Water'},['Unlogged drinks are unknown. Your saved target may need adjustment.']);
    if(proteinTarget&&protein.value!==null&&protein.value<proteinTarget)add('protein',`${Math.round(proteinTarget-protein.value)} g protein remaining`,50,'low',['Based on today’s logged meals and your saved target.'],['Protein'],{label:'Plan your next meal',page:'Eat',panel:'Meal Planner'},['Food entries may be incomplete or estimated.']);
  }
  // The compatibility priority retains its existing active-session behavior.
  const training=preparedWorkout(observed,date,ready.value);
  const planned=timeline.find(event=>event.type==='plannedWorkout')?.title||(training.original.length?training.dayTitle:undefined);
  const fallback=todayPriority({plannedWorkout:planned,readiness:ready.value,readinessCategory:ready.value!==null&&ready.value<60?'Reduced':'Ready',confidence:'Low'});
  add('daily-plan',fallback.title,10,'low',[fallback.description],['Sleep','Energy','Stress'],{label:fallback.action,page:fallback.destination==='checkIn'?'Recover':fallback.destination},['Review your current check-in before changing a plan.']);
  candidates.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  const smartInsight=proteinEnergyInsight(series.filter(row=>row.date<date));
  return {version:1 as const,date,userId:input.userId,baselines,recommendations:candidates,priority:candidates[0],smartInsight,training};
}

/** Typed evidence companion for the context-aware assistant; caller controls sharing. */
export function assistantEvidence(context:ReturnType<typeof buildHealthIntelligence>) {
  return {version:context.version,date:context.date,recommendation:context.priority,baselines:context.baselines.map(({metric,unit,from,to,samples,missingness,confidence,range,current,deviation,trend})=>({metric,unit,from,to,samples,missingness,confidence,range,current,deviation,trend})),association:context.smartInsight,limitations:['Only supplied account-authorized records are used.','Missing logs do not establish absence.','Associations do not establish causation.','No diagnosis or automatic change to treatment or programs.']};
}
