import {deriveInterventionForecastMemories} from './intervention-forecast.js';
import {deriveOutcomeStrategies} from './outcome-strategy.js';
import {deriveGoalMemories} from './goal-memory.js';
import {deriveAgentEpisodes} from './agent-episodes.js';
import {z} from 'zod';
import {dateOf,live,mean,type BioRecord} from '../biology.js';
import {shiftDay,daySeries} from '../biological-intelligence.js';
import {normalizeName,recordFood,portionDefault} from '../food-intelligence.js';
import {isFinishedSession} from '../training.js';
import {fingerprint} from '../automation-model.js';
import {boundedHealthData,slope} from './state.js';
import {owned,json,recordHash,intelligencePreferences,type HealthData,type RecordService,type RecordInput,type StateDomain} from './contracts.js';
export const memorySchema=z.object({id:z.string(),userId:z.string(),category:z.enum(['stable_profile','semantic_health','episodic_agent','outcome_learning','goal_memory']).default('stable_profile'),layer:z.enum(['episodic','pattern','stable']),type:z.string(),domain:z.enum(['readiness','nutrition','training','recovery','sleep','body','medical','care','goals']),summary:z.string().max(1000),value:z.record(z.string(),z.unknown()),provenance:z.enum(['user_explicit','canonical_record','verified_action_receipt','measured_observation','trusted_import','model_inference']).default('canonical_record'),verified:z.boolean().default(true),confidence:z.number().min(0).max(1),evidenceCount:z.number().int().nonnegative(),stability:z.number().min(0).max(1),contradictions:z.number().int().nonnegative(),firstObserved:z.string(),lastObserved:z.string(),sourceIds:z.array(z.string()),sourceFingerprint:z.string(),status:z.enum(['active','contradicted','expired']),supersededBy:z.string().nullable().optional(),expiresAt:z.string().nullable().optional()});
export type HealthMemory=z.infer<typeof memorySchema>;
export interface StructuredMemoryStore {list(userId:string):Promise<HealthMemory[]>;reconcile(userId:string,memories:HealthMemory[]):Promise<void>;reset(userId:string,approved:boolean):Promise<void>;}
export interface SemanticMemoryStore {search(query:string,context:{userId:string;domains:StateDomain[];medicalConsent:boolean}):Promise<HealthMemory[]>;}
export function median(values:number[]){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?sorted.length%2?sorted[Math.floor(sorted.length/2)]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2:null;}
export function ewma(values:number[],alpha=.3){if(alpha<=0||alpha>1)throw new RangeError('EWMA alpha must be between 0 and 1.');return values.filter(Number.isFinite).reduce<number|null>((previous,value)=>previous===null?value:alpha*value+(1-alpha)*previous,null);}
export function rollingStats(points:{date:string;value:number}[],end:string,days:number){const rows=points.filter(p=>p.date>=shiftDay(end,-days+1)&&p.date<=end).sort((a,b)=>a.date.localeCompare(b.date));const values=rows.map(p=>p.value);return {samples:rows.length,average:mean(values),median:median(values),ewma:ewma(values),slope:slope(rows),frequency:rows.length/days,recency:rows.at(-1)?.date||null};}
export function decayedConfidence(memory:HealthMemory,date:string){if(memory.expiresAt&&Date.parse(date+'T23:59:59Z')>Date.parse(memory.expiresAt))return 0;if(memory.supersededBy)return 0;if(['long_term_goal','explicit_preference'].includes(memory.type))return memory.status==='active'?memory.confidence:0;const age=Math.max(0,(Date.parse(date)-Date.parse(memory.lastObserved.slice(0,10)))/86400000);return Math.max(0,memory.confidence*Math.exp(-Math.max(0,age-14)/60)*(1-memory.contradictions/Math.max(1,memory.evidenceCount+memory.contradictions)));}
/** Observational patterns only; all summaries reference existing records. */
export function deriveMemories(input:HealthData,date:string):HealthMemory[]{
  const preferences=intelligencePreferences(owned(input.records,input.userId));if(!preferences.personalization||!preferences.flags.intelligence_memory)return [];
  const data=boundedHealthData(input,date),records=live(data.records).filter(r=>(['food','recipe','nutritionTarget'].includes(r.type)||r.timestamp>preferences.learnSince)&&r.quality!=='estimated'),result:HealthMemory[]=[];
  const add=(type:string,domain:StateDomain,summary:string,value:Record<string,unknown>,sources:BioRecord[],count=sources.length,contradictions=0,layer:HealthMemory['layer']='pattern',suffix='',category:HealthMemory['category']='stable_profile',provenance:HealthMemory['provenance']='measured_observation')=>{
    if(!sources.length)return;const ordered=[...sources].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)),observations=ordered.filter(r=>!['food','recipe','nutritionTarget'].includes(r.type));if(!observations.length)return;const first=observations[0].timestamp,last=observations.at(-1)!.timestamp,stability=count/Math.max(1,count+contradictions),confidence=Math.min(.95,.35+count*.07)*stability;
    result.push({id:`memory-${fingerprint([input.userId,type,suffix])}`,userId:input.userId,category,layer,type,domain,summary,value,provenance,verified:provenance!=='model_inference',confidence,evidenceCount:count,stability,contradictions,firstObserved:first,lastObserved:last,sourceIds:ordered.map(r=>r.id),sourceFingerprint:fingerprint(ordered.map(recordHash)),status:stability<.6?'contradicted':'active'});
  };
  const meals=records.filter(r=>r.type==='meal'),groups=new Map<string,BioRecord[]>();for(const meal of meals){const key=String(meal.metadata.meal||'Meal')+'|'+normalizeName(meal.name);groups.set(key,[...(groups.get(key)||[]),meal]);}
  for(const [key,rows] of groups){const days=new Set(rows.map(r=>dateOf(r.timestamp)));if(days.size<3)continue;const [slot]=key.split('|'),recipe=records.find(r=>r.type==='recipe'&&normalizeName(r.name)===normalizeName(rows[0].name)),competitors=meals.filter(r=>r.metadata.meal===slot&&normalizeName(r.name)!==normalizeName(rows[0].name));const stamps=rows.map(r=>Date.parse(r.timestamp));const span=(Math.max(...stamps)-Math.min(...stamps))/86400000;
    add('usual_meal','nutrition',`${rows[0].name} recurs at ${slot.toLowerCase()} on ${days.size} distinct days.`,{meal:slot,name:rows[0].name,recipeId:recipe?.id||null,weekday:new Date(rows.at(-1)!.timestamp).getDay()},rows,days.size,new Set(competitors.map(r=>dateOf(r.timestamp))).size,days.size>=6&&span>=14?'stable':'pattern',key,'stable_profile','measured_observation');
    const weekdayGroups=new Map<number,BioRecord[]>();for(const row of rows){const day=new Date(row.timestamp).getDay();weekdayGroups.set(day,[...(weekdayGroups.get(day)||[]),row]);}for(const [day,observations] of weekdayGroups)if(new Set(observations.map(r=>dateOf(r.timestamp))).size>=3)add('weekday_meal','nutrition',`${rows[0].name} repeats on weekday ${day} at ${slot.toLowerCase()}.`,{meal:slot,name:rows[0].name,recipeId:recipe?.id||null,weekday:day},observations,new Set(observations.map(r=>dateOf(r.timestamp))).size,0,'pattern',key+'|'+day,'stable_profile','measured_observation');
  }
  for(const food of records.filter(r=>r.type==='food'||r.type==='recipe'))for(const meal of ['Breakfast','Lunch','Dinner','Snacks']){
    const corrections=records.filter(r=>r.type==='journal'&&r.metadata.subtype==='foodCorrection'&&r.metadata.foodId===food.id&&r.metadata.meal===meal),distinct=[...new Map(corrections.map(r=>[String(r.metadata.draftId||r.id),r])).values()];if(distinct.length<3)continue;
    const portion=portionDefault(recordFood(food),records,meal),consistent=distinct.filter(r=>r.metadata.unit===portion.unit&&Math.abs(Number(r.metadata.amount)-portion.amount)<=Math.max(.01,portion.amount*.1));if(!portion.known||consistent.length<3)continue;
    add('portion_default','nutrition',`${food.name}: repeated confirmed portions at ${meal.toLowerCase()}.`,{foodId:food.id,meal,amount:portion.amount,unit:portion.unit},distinct,consistent.length,distinct.length-consistent.length,consistent.length>=6?'stable':'pattern',food.id+'|'+meal,'stable_profile','measured_observation');
  }
  const sleeps=records.filter(r=>r.type==='sleep'&&typeof r.metadata.bedtime==='string'&&/^\d\d:\d\d$/.test(String(r.metadata.bedtime)));if(new Set(sleeps.map(r=>dateOf(r.timestamp))).size>=7){const minutes=sleeps.map(r=>{const [h,m]=String(r.metadata.bedtime).split(':').map(Number);const v=h*60+m;return v<720?v+1440:v;}),typical=median(minutes)!%1440;add('sleep_window','sleep','A recurring bedtime window appears in your recorded sleep.',{bedtimeMinutes:Math.round(typical),variabilityMinutes:median(minutes.map(v=>Math.abs(v-median(minutes)!)))},sleeps,sleeps.length,0,sleeps.length>=14?'stable':'pattern','','stable_profile','measured_observation');}
  const series=daySeries(records,data.db,data.skin,date,28),complete=new Set(records.filter(r=>r.type==='nutritionDay'&&r.metadata.complete===true).map(r=>dateOf(r.timestamp))),target=records.filter(r=>r.type==='nutritionTarget').sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
  const misses=series.filter(row=>row.date<date&&complete.has(row.date)&&row.Protein!==null&&typeof target?.metadata.protein==='number'&&dateOf(target.timestamp)<=row.date&&row.Protein<Number(target.metadata.protein));if(misses.length>=3)add('protein_miss_episode','nutrition',`${misses.length} complete logged days below your saved protein target in the last 28 days.`,{days:misses.map(r=>r.date),target:target!.metadata.protein},[target!,...records.filter(r=>misses.some(d=>d.date===dateOf(r.timestamp))&&['meal','nutritionDay'].includes(r.type))],misses.length,0,'episodic','','episodic_agent','measured_observation');
  const sleepSamples=series.filter(r=>r.Sleep!==null),sleepCutoff=sleepSamples.length>=7?median(sleepSamples.map(r=>r.Sleep!))!-.75:null;const pairs=series.filter(r=>r.Sleep!==null&&r.Strength!==null),low=pairs.filter(r=>sleepCutoff!==null&&r.Sleep!<sleepCutoff),normal=pairs.filter(r=>sleepCutoff!==null&&r.Sleep!>=sleepCutoff);if(low.length>=3&&normal.length>=3){const lower=mean(low.map(r=>r.Strength!))!,upper=mean(normal.map(r=>r.Strength!))!;if(lower<upper*.9)add('sleep_performance_association','training','Lower logged strength coincides with shorter sleep in matched observations; this does not establish a cause.',{lowSleepHours:sleepCutoff,relativeDifference:lower/upper-1,lowSamples:low.length,referenceSamples:normal.length},records.filter(r=>r.type==='sleep'&&pairs.some(p=>p.date===dateOf(r.timestamp))),pairs.length,0,'pattern','','semantic_health','measured_observation');}
  const weights=series.filter(r=>r.Weight!==null);if(weights.length>=7){const rate=slope(weights.map(r=>({date:r.date,value:r.Weight!})));add('weight_trajectory','body','Trend estimated from repeated recorded weights.',{weeklyChange:rate===null?null:rate*7,samples:weights.length},records.filter(r=>r.type==='vital'&&r.metadata.metric==='Weight'),weights.length,0,'episodic','','episodic_agent','measured_observation');}
  const sessions=data.db.sessions.filter(isFinishedSession),legDays=sessions.filter(s=>s.logs.some(l=>/quad|hamstring|glute|leg/i.test(l.target)));const follows=records.filter(r=>r.type==='recoveryNote'&&Number(r.metadata.severity)>=5&&/leg|quad|hamstring|glute/i.test(String(r.metadata.region||r.name))&&legDays.some(s=>dateOf(r.timestamp)===shiftDay(s.date,1)));if(new Set(follows.map(r=>dateOf(r.timestamp))).size>=3)add('leg_soreness_followup','recovery','Recorded leg soreness historically follows lower-body sessions on the next day.',{hours:24,matchedSessionIds:legDays.map(s=>s.id)},follows,new Set(follows.map(r=>dateOf(r.timestamp))).size,0,'pattern','','semantic_health','measured_observation');
  return [...result,...(preferences.flags.intelligence_outcome_learning?[...deriveOutcomeStrategies(data,date),...deriveInterventionForecastMemories(data,date)]:[]),...deriveGoalMemories(data.records,data.userId).filter(m=>m.firstObserved>preferences.learnSince),...deriveAgentEpisodes(data,date).filter(m=>m.firstObserved>preferences.learnSince)];
}
export function parseMemories(records:BioRecord[],userId:string){return owned(live(records),userId).filter(r=>r.metadata.intelligenceMemory===true).flatMap(r=>{try{const memory=memorySchema.parse(JSON.parse(String(r.metadata.memory)));return memory.userId===userId?[memory]:[];}catch{return [];}});}
export function getRelevantMemories(memories:HealthMemory[],purpose:StateDomain|'meal_prediction'|'fatigue'|'weight_change',date:string,timeRange?:{from:string;to:string}){const domain=purpose==='meal_prediction'?'nutrition':purpose==='fatigue'?'recovery':purpose==='weight_change'?'body':purpose;return memories.filter(m=>m.domain===domain&&m.status==='active'&&decayedConfidence(m,date)>=.4&&(!timeRange||m.firstObserved.slice(0,10)<=timeRange.to&&m.lastObserved.slice(0,10)>=timeRange.from)).sort((a,b)=>decayedConfidence(b,date)-decayedConfidence(a,date)).slice(0,12);}
export interface MemoryRankingOptions {query?:string;domain?:StateDomain;goalId?:string;category?:HealthMemory['category'];date:string;maxItems?:number;minConfidence?:number;verifiedOnly?:boolean;}
/** Rank and select the smallest useful set of relevant memories with provenance and confidence weighting. */
export function rankMemories(memories:HealthMemory[],options:MemoryRankingOptions):HealthMemory[]{
  const maxItems=options.maxItems??5,minConfidence=options.minConfidence??.3;
  const active=memories.filter(m=>{
    if(m.status!=='active'||m.supersededBy)return false;
    if(m.expiresAt&&m.expiresAt<options.date)return false;
    if(options.verifiedOnly&&(!m.verified||m.provenance==='model_inference'))return false;
    if(options.category&&m.category!==options.category)return false;
    return decayedConfidence(m,options.date)>=minConfidence;
  });
  const terms=options.query?options.query.toLowerCase().split(/\s+/).filter(Boolean):[];
  const scored=active.map(m=>{
    let score=0;
    if(options.domain&&m.domain===options.domain)score+=30;
    if(options.goalId&&(m.value?.goalId===options.goalId||m.value?.relatedGoalId===options.goalId))score+=25;
    if(terms.length){const text=(m.summary+' '+m.type+' '+JSON.stringify(m.value)).toLowerCase(),hits=terms.filter(t=>text.includes(t)).length;score+=Math.min(30,(hits/terms.length)*30);}
    if(m.verified&&m.provenance!=='model_inference')score+=15;
    const conf=decayedConfidence(m,options.date);score+=conf*20;
    const ageDays=Math.max(0,(Date.parse(options.date)-Date.parse(m.lastObserved.slice(0,10)))/86400000);
    score+=Math.max(0,15*Math.exp(-ageDays/30));
    return {memory:m,score};
  });
  scored.sort((a,b)=>b.score-a.score||a.memory.id.localeCompare(b.memory.id));
  return scored.slice(0,maxItems).map(s=>s.memory);
}
export class BiologicalMemoryStore implements StructuredMemoryStore {
  constructor(private records:RecordService,private actor:string){}
  private check(userId:string){if(userId!==this.actor||userId==='anonymous')throw new Error('Memory belongs to another account.');}
  async list(userId:string){this.check(userId);return parseMemories(await this.records.read(),userId);}
  async reconcile(userId:string,memories:HealthMemory[]){this.check(userId);const all=owned(await this.records.read(),userId),existing=all.filter(r=>r.metadata.intelligenceMemory===true&&!r.deletedAt),writes:RecordInput[]=[],expectations=[];const preferences=intelligencePreferences(all);if(!preferences.personalization||!preferences.flags.intelligence_memory)return;if(memories.some(m=>m.firstObserved<=preferences.learnSince))return;
    for(const memory of memories){if(memory.userId!==userId)throw new Error('Memory owner mismatch.');const old=all.find(r=>r.id===memory.id);if(old&&!old.deletedAt&&old.metadata.memory===json(memory))continue;writes.push({id:memory.id,type:'journal',domain:'Insights',name:'Learned health pattern',source:'Health OS Memory',metadata:{intelligenceMemory:true,memory:json(memory)}});expectations.push({id:memory.id,revision:old?.revision??null});}
    const stale=existing.filter(r=>!memories.some(m=>m.id===r.id)).map(r=>({id:r.id,revision:r.revision}));if(writes.length||stale.length)await this.records.commit(writes,stale,expectations);
  }
  async reset(userId:string,approved:boolean){this.check(userId);if(!approved)throw new Error('Explicit approval is required to reset learned memory.');const rows=owned(await this.records.read(),userId),learned=rows.filter(r=>!r.deletedAt&&r.metadata.intelligenceMemory===true),old=rows.find(r=>r.id==='health-os-intelligence-settings');await this.records.commit([{id:'health-os-intelligence-settings',type:'nudgePreference',domain:'Insights',name:'Intelligence preferences',metadata:{...old?.metadata,learnSince:new Date().toISOString()}}],learned.map(r=>({id:r.id,revision:r.revision})),[{id:'health-os-intelligence-settings',revision:old?.revision??null}]);}
}
export * from './adaptive-strategy.js';
