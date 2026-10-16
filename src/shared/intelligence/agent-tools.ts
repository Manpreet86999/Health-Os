import {validateCanonicalAction,canonicalActionDomain} from './canonical-action-policy.js';
import {searchAttachments} from './attachment-retrieval.js';
import {z} from 'zod';
import type {Dataset} from '../automation-model.js';
import {fingerprint} from '../automation-model.js';
import {ContextPolicyEngine} from './context-policy.js';
import {HealthStateService} from './state.js';
import {recordChatDomain,type ChatDomain} from '../intelligence-chat.js';
import {validateAgentCareProposal,careFingerprint} from './care-safety.js';
import {adaptTrainingSession} from '../training-adaptation.js';
import {recordFingerprint,type AgentProposal} from '../agentic-intelligence.js';
import {toolCallSchema,type ContextPolicy,type AgentToolResult,type AgentStep} from './agent-contracts.js';
import {workoutAnswer} from '../intelligence-answers.js';
import {actionDefinitions,type ActionId} from '../mcp-contracts.js';
import {executeHealthAction} from '../health-action-registry.js';
import {intelligenceReadDefinitions,type IntelligenceReadId} from './read-contracts.js';
import {executeIntelligenceRead} from './read-execution.js';
import {deriveMemories} from './memory.js';

const noArgs=z.object({}).strict(),query=z.object({query:z.string().min(1).max(1500)}).strict(),product=z.object({productId:z.string().min(1).max(200)}).strict();
const definitions:Record<string,{domains:ChatDomain[];description:string;schema:z.ZodType}>={};
function tool(names:string[],domains:ChatDomain[],description:string,schema:z.ZodType=noArgs){for(const name of names)definitions[name]={domains,description,schema};}
tool(['health.get_current_state','health.get_context','health.get_priorities'],['training','nutrition','recovery','sleep','body','medical','care','goals'],'Read only approved domain slices of canonical health state; no extra profile.');
tool(['training.get_today'],['training'],'Read the saved prescribed workout with sets, reps and RIR.');
tool(['training.get_recent_history','training.get_recent_load','training.get_load','training.get_progression','training.get_muscle_recovery'],['training'],'Read deterministic recorded working load, history and muscle recovery estimates.');
tool(['training.create_today_adaptation'],['training'],'Calculate a conservative draft adaptation for review. Never applies it.');
tool(['nutrition.get_today','nutrition.get_remaining_targets','nutrition.get_recent_meals','nutrition.get_usual_meals'],['nutrition'],'Read authoritative Food Intelligence totals, remaining targets or saved meals. Unknown totals remain null.');
tool(['nutrition.search_food'],['nutrition'],'Search owned canonical food/recipe library.',query);
tool(['recovery.get_current','recovery.get_soreness','recovery.get_recent_history'],['recovery'],'Read current or recent recorded recovery evidence.');
tool(['sleep.get_latest','sleep.get_baseline','sleep.get_debt','sleep.get_trend'],['sleep'],'Read deterministic sleep durations, personal baseline and debt with coverage.');
tool(['body.get_current','body.get_weight_trend','body.get_measurement_trends'],['body'],'Read deterministic body trends.');
tool(['care.get_products','care.get_existing_routine','care.get_recent_observations','care.get_user_concerns'],['care'],'Read owned products, saved routine/commitment, observations or concerns. Ingredients not recorded are explicitly unknown.');
tool(['care.get_product_details'],['care'],'Read recorded details of one owned product. Does not invent ingredients.',product);
tool(['medical.get_lab_trends','medical.get_reports','medical.get_timeline','medical.get_recent_symptoms'],['medical'],'Read bounded health observations and report metadata; no raw documents/photos or treatment tools.');
tool(['attachment.search'],[],'Retrieve exact relevant excerpts from files explicitly attached to this conversation; citation IDs and line positions remain inspectable.',query);
tool(['research.search'],[],'Search public sources only when Research is enabled. Never sends health records.',query);
// The canonical contracts replace local schema/semantic copies. Compatibility names
// not present in MCP remain explicitly described adapters until callers migrate.
for(const [name,definition] of Object.entries(actionDefinitions))if(definition.risk==='R0'){
 const prefix=definition.scope.split('.')[0];
 const domains:ChatDomain[]=name in intelligenceReadDefinitions?[...intelligenceReadDefinitions[name as IntelligenceReadId].domains]:prefix==='training'?['training']:prefix==='nutrition'?['nutrition']:prefix==='sleep'?['sleep']:prefix==='recovery'?['recovery']:prefix==='body'?['body']:prefix==='medical'?['medical']:prefix==='care'?['care']:prefix==='goals'?['goals']:['training','nutrition','recovery','sleep','body','goals'];
 definitions[name]={domains,description:definition.description,schema:definition.schema};
}
export const agentToolCatalog=Object.fromEntries(Object.entries(definitions).map(([name,d])=>[name,{domains:d.domains,description:d.description,parameters:z.toJSONSchema(d.schema),version:'1.0',operation:name==='research.search'?'research':name.includes('adaptation')?'preview':'read',risk:'R0',requiresApproval:false,cloudCapable:name in actionDefinitions&&name!=='training.get_active_workout'&&name!=='training.create_adaptation_plan',deviceCapable:true,offlineCapable:name!=='research.search',timeoutMs:name==='research.search'?25000:15000,retryPolicy:{maxAttempts:2,transientReadsOnly:true},provenance:'owned source IDs and domain metadata',idempotency:'read-only'}]));
export function permittedTools(p:ContextPolicy,hasAttachments=false){return Object.fromEntries(Object.entries(agentToolCatalog).filter(([name,d])=>name==='attachment.search'?hasAttachments:name==='research.search'?p.research!=='off':(name.startsWith('health.')||['knowledge.search','medical.search_knowledge'].includes(name))?p.mode!=='none'&&p.domains.length>0:p.mode!=='none'&&d.domains.every(domain=>p.domains.includes(domain))));}
/** Provider output uses the same registered argument schemas as actual execution. */
export function permittedToolCalls(p:ContextPolicy,hasAttachments=false){
 const options=Object.keys(permittedTools(p,hasAttachments)).map(name=>z.object({name:z.literal(name),arguments:definitions[name].schema as z.ZodType<Record<string,unknown>>}).strict());
 return options.length?z.array(options.length===1?options[0]:z.union(options as [typeof options[number],typeof options[number],...typeof options[number][]])).max(8):z.array(toolCallSchema).max(0);
}
const cleanRecord=(r:Dataset['records'][number])=>({id:r.id,type:r.type,name:r.name,date:r.timestamp.slice(0,10),value:r.value,unit:r.unit,metadata:Object.fromEntries(Object.entries(r.metadata).filter(([key])=>!/(document|photo|dataurl|raw|ocr|storage|file|secret|key|token)/i.test(key)))});
export class AgentReadTools {
 data:Dataset;
 state:ReturnType<HealthStateService['observe']>;
 readonly results:AgentToolResult[]=[];
 private completedReads=new Set<string>();
 constructor(private original:Dataset,readonly policy:ContextPolicy,private research?:(q:string)=>Promise<unknown>,private attachments:{name:string;text:string}[]=[]){this.data=ContextPolicyEngine.dataset(original,policy);this.state=new HealthStateService().observe(this.data,policy.date);}
 advanceDate(date:string){this.policy.date=date;this.refreshAuthorized(this.original);}
 refreshAuthorized(data:Dataset){if(data.userId!==this.original.userId)throw new Error('Tool snapshot owner changed.');this.original=data;this.data=ContextPolicyEngine.dataset(data,this.policy);this.state=new HealthStateService().observe(this.data,this.policy.date);}
 narrow(domains:ChatDomain[]){this.policy.domains=this.policy.domains.filter(d=>domains.includes(d));this.data=ContextPolicyEngine.dataset(this.original,this.policy);this.state=new HealthStateService().observe(this.data,this.policy.date);}
 reasoningMemories(){
  // Receipt/proposal journals are internal provenance and may be outside the health
  // record slice. Derive locally, then expose only authorized, non-Medical memories.
  if(this.policy.mode!=='auto')return [];
  return deriveMemories(this.original,this.policy.date).filter(m=>m.domain!=='readiness'&&m.domain!=='medical'&&this.policy.domains.includes(m.domain));
 }
 async execute(name:string,raw:unknown):Promise<AgentToolResult>{
  const def=definitions[name];if(!def||!Object.hasOwn(permittedTools(this.policy,this.attachments.length>0),name))throw new Error('This tool is outside the approved context.');
  const args=def.schema.parse(raw) as {query?:string;productId?:string;domains?:ChatDomain[]};
  if(['knowledge.search','medical.search_knowledge'].includes(name)&&args.domains?.some(d=>!this.policy.domains.includes(d)))throw new Error('Knowledge domains exceed the approved context.');
  const readIdentity=fingerprint({name,args});if(this.completedReads.has(readIdentity))throw new Error('This exact read already succeeded in the current evidence snapshot. Use its observation or choose different arguments; do not repeat the same read.');
  const domains=['knowledge.search','medical.search_knowledge'].includes(name)?args.domains!:name.startsWith('health.')?this.policy.domains:def.domains;
  const sourceIds=this.data.records.filter(r=>domains.includes(recordChatDomain(r))).map(r=>r.id).slice(0,500);
  if(this.policy.mode==='records'&&!sourceIds.length&&!['research.search','attachment.search'].includes(name))throw new Error('No selected records authorize this read.');
  let data:unknown,provenance:AgentToolResult['provenance'];
  if(name==='attachment.search'){data=searchAttachments(this.attachments,args.query!);sourceIds.splice(0,sourceIds.length,...(data as ReturnType<typeof searchAttachments>).sources.map(s=>s.id));}
  else if(name==='research.search'){if(!this.research)throw new Error('Research is unavailable.');data=await this.research!(args.query!);}
  else if(name in intelligenceReadDefinitions){const read=executeIntelligenceRead(name as IntelligenceReadId,args,this.data,this.policy.date);data=read.data;provenance=read.provenance;sourceIds.splice(0,sourceIds.length,...read.provenance.map(p=>p.sourceId));}
  else if(name in actionDefinitions){const result=await executeHealthAction(name as ActionId,args,{dataset:this.data,today:this.policy.date,readRecords:async()=>this.data.records,saveMany:async()=>{throw new Error('Read tools cannot write.');},readWorkout:()=>this.data.activeWorkout as any,getState:()=>this.state},'agent-read');if(!result.success)throw new Error(result.error?.message||'Canonical read failed.');data=result.data;}
  else if(name.startsWith('health.'))data=Object.fromEntries(domains.map(d=>[d,this.state[d]]));
  else if(name==='training.get_today')data=this.state.training.nextWorkout;
  else if(name==='training.get_recent_history')data=this.data.db.sessions.slice(-30);
  else if(name==='training.create_today_adaptation')data=adaptTrainingSession(this.state.training.nextWorkout.original,this.data.db.exercises,{recoveryReduced:true});
  else if(name.startsWith('training.'))data=name==='training.get_muscle_recovery'?this.state.training.muscleRecovery:this.state.training;
  else if(name==='nutrition.get_remaining_targets'){const n=this.state.nutrition;data={protein:n.proteinConsumed.value===null||n.proteinTarget.value===null?null:Math.max(0,n.proteinTarget.value-n.proteinConsumed.value),calories:n.caloriesConsumed.value===null||n.calorieTarget.value===null?null:Math.max(0,n.calorieTarget.value-n.caloriesConsumed.value),unit:'g protein / kcal',coverage:'Recorded intake only',sources:[...n.proteinConsumed.sources,...n.proteinTarget.sources,...n.caloriesConsumed.sources,...n.calorieTarget.sources]};}
  else if(name==='nutrition.get_today')data=this.state.nutrition;
  else if(name.startsWith('nutrition.'))data=this.data.records.filter(r=>name==='nutrition.get_recent_meals'?r.type==='meal':['food','recipe'].includes(r.type)).filter(r=>!args.query||r.name.toLowerCase().includes(args.query.toLowerCase())).slice(-40).map(cleanRecord);
  else if(name==='recovery.get_recent_history')data=this.data.records.filter(r=>recordChatDomain(r)==='recovery').slice(-30).map(cleanRecord);
  else if(name.startsWith('recovery.'))data=this.state.recovery;
  else if(name.startsWith('sleep.'))data=this.state.sleep;
  else if(name.startsWith('body.'))data=this.state.body;
  else if(name==='care.get_existing_routine')data={tasks:this.data.skin.care.tasks,routines:this.data.skin.routines,commitment:this.data.skin.care.commitment,revision:this.data.skin.care.revision,updatedAt:this.data.skin.care.updatedAt};
  else if(name==='care.get_recent_observations')data={checkIns:this.data.skin.care.checkIns.slice(-14),logs:this.data.skin.logs.slice(-14),reviews:this.data.skin.care.reviews.slice(-5)};
  else if(name==='care.get_user_concerns')data={profile:this.data.skin.profile,goals:this.data.skin.care.goals};
  else if(name.startsWith('care.'))data=this.data.skin.products.filter(p=>!args.productId||p.id===args.productId).map(p=>({...p,ingredientInformation:p.actives.length?'Recorded actives only; full ingredient list unknown':'Ingredients unknown',expired:!!p.expiresAt&&p.expiresAt<this.policy.date}));
  else data=this.data.records.filter(r=>recordChatDomain(r)==='medical'&&(name!=='medical.get_recent_symptoms'||r.type==='symptom')).slice(-40).map(cleanRecord);
  if(Array.isArray(data))provenance=[...(provenance||[]),{sourceId:'collection:'+name+':'+fingerprint([this.data.userId,this.policy.date,data]),fingerprint:fingerprint(data),kind:'calculated',date:this.policy.date}];
  const result={name,arguments:args,domains,sourceIds,data,...(provenance?{provenance}:{}),freshness:this.data.freshness||'historical' as const,asOf:new Date().toISOString()};if(new TextEncoder().encode(JSON.stringify(result)).length>48000)throw new Error('Tool evidence is too large. Narrow the selected context.');this.completedReads.add(readIdentity);this.results.push(result);return result;
 }
 prepare(action:AgentStep['proposedActions'][number],id:string):AgentProposal {const proposal=this.buildProposal(action,id);if(proposal.sourceIds.length>80||JSON.stringify(proposal).length>18000)throw new Error('This review contains too many source records or too much detail. Narrow the evidence window before preparing a change.');return proposal;}
 private buildProposal(action:AgentStep['proposedActions'][number],id:string):AgentProposal {
  const sources=[...new Set(this.results.flatMap(r=>r.sourceIds))].filter(id=>this.data.records.some(r=>r.id===id&&r.userId===this.data.userId)),base={id,sourceIds:sources,sourceFingerprint:recordFingerprint(this.data.records,sources),status:'proposed' as const};
  const seen=(names:string[])=>names.every(n=>this.results.some(r=>r.name===n));
  if(action.kind==='canonical_action'){const key='agent-'+fingerprint(id),input=validateCanonicalAction(action.action,action.input,this.policy.domains,key,this.policy.date);const encoded=JSON.stringify(input);if(encoded.length>18000)throw new Error('The proposed change is too large to review.');return {...base,tool:'canonical_action',title:'Review '+action.action.replaceAll('_',' ').replaceAll('.',' · '),explanation:action.reason,payload:{type:'journal',domain:'Today',name:action.action,metadata:{canonicalAction:action.action,canonicalInput:encoded,canonicalDomain:canonicalActionDomain(action.action)}}};}
  if(action.kind==='care_routine'){
   if(this.policy.mode==='records'||!seen(['care.get_products','care.get_existing_routine','care.get_recent_observations','care.get_user_concerns']))throw new Error('Read products, routine, observations and concerns before proposing a routine.');
   const proposal=validateAgentCareProposal(action,this.data.skin,this.policy.date);
   for(const task of proposal.tasks){const p=this.data.skin.products.find(p=>p.id===task.productId);if(p?.expiresAt&&p.expiresAt<this.policy.date)throw new Error('Expired products cannot be scheduled.');}
   return {...base,tool:'save_care_routine',title:'Review AM/PM routine',explanation:action.reason,payload:{type:'journal',domain:'Care',name:'Model-reasoned routine',metadata:{proposal:JSON.stringify(proposal),expectedCareFingerprint:careFingerprint(this.data.skin.care)}}};
  }
  if(action.kind==='training_adaptation'){
   if(!seen(['training.get_today','training.get_recent_load','sleep.get_latest','recovery.get_current','training.get_muscle_recovery','training.create_today_adaptation']))throw new Error('Read training, sleep, recovery and the adaptation preview before proposing changes.');
   return {...base,tool:'adapt_training',title:'Review today’s adapted session',explanation:action.reason,payload:{type:'recoveryNote',domain:'Recover',name:this.state.training.nextWorkout.dayTitle||'Today’s workout',metadata:{date:this.policy.date,modelRequested:true}}};
  }
  if(action.kind==='meal_plan'){const recipe=this.data.records.find(r=>r.id===action.recipeId&&r.type==='recipe');if(!recipe||!seen(['nutrition.get_today','nutrition.get_remaining_targets','nutrition.get_usual_meals']))throw new Error('Read nutrition and an owned recipe before planning a meal.');return {...base,tool:'plan_meal',title:`Plan ${recipe.name}`,explanation:action.reason,payload:{type:'mealPlan',domain:'Eat',name:recipe.name,metadata:{date:this.policy.date,meal:action.meal,recipeId:recipe.id,portions:action.portions}}};}
  if(action.kind==='recovery_plan'){if(!seen(['recovery.get_current']))throw new Error('Read recovery evidence before proposing a plan.');return {...base,tool:'save_recovery_plan',title:'Review recovery plan',explanation:action.note,payload:{type:'recoveryNote',domain:'Recover',name:'Recovery plan',metadata:{date:this.policy.date,notes:action.note}}};}
  if(action.kind==='workout_draft'){
   if(!this.policy.domains.includes('training')||!seen(['training.search_exercises','sleep.get_latest','recovery.get_current']))throw new Error('Read the exercise library, sleep and recovery before preparing a workout.');
   const exercises=action.exercises.map(row=>{const e=this.data.db.exercises.find(e=>e.id===row.exerciseId);if(!e||e.trackingMode&&e.trackingMode!=='weight_reps')throw new Error('Workout must reference an available weight/reps exercise.');return {exerciseId:e.id,name:e.name,target:e.muscles.join(', '),vol:`${row.sets} x ${row.reps}`,rirTarget:row.rirTarget,restSec:row.restSec};});
   return {...base,tool:'replace_workout',title:'Review today’s workout draft',explanation:action.reason,payload:{type:'journal',domain:'Today',name:'Reviewed workout draft',metadata:{date:this.policy.date,exercises:JSON.stringify(exercises),expectedStateFingerprint:this.state.fingerprint,expectedWorkoutFingerprint:fingerprint(this.data.activeWorkout||null)}}};
  }
  if(action.kind==='sleep_target'){if(!this.policy.domains.includes('sleep')||!seen(['sleep.get_latest']))throw new Error('Read sleep before proposing a target.');return {...base,tool:'set_sleep_target',title:'Review sleep target',explanation:action.reason,payload:{type:'journal',domain:'Recover',name:'Reviewed sleep target',metadata:{hours:action.hours}}};}
  if(action.kind==='goal_update'){if(!this.policy.domains.includes('goals')||!this.data.records.some(r=>r.id===action.goalId&&r.type==='goal'))throw new Error('Read an owned goal before updating it.');return {...base,tool:'update_goal',title:'Review goal change',explanation:action.reason,payload:{type:'journal',domain:'Today',name:action.name,metadata:{goalId:action.goalId,status:action.status}}};}
  return {...base,tool:'create_mission',title:action.name,explanation:action.objective,payload:{type:'goal',domain:'Today',name:action.name,metadata:{objective:action.objective}}};
 }
}
/** Level zero is a closed set of exact lookups, never a catch-all keyword router. */
export function deterministicLookup(question:string,tools:AgentReadTools):{answer:string;evidence:string[];specialist:'body'|'nutri'|'train'|'recover'|'general'}|null {
 const q=question.trim().toLowerCase().replace(/[?!.]+$/,'');const s=tools.state;
 const format=(v:{value:unknown},unit:string)=>v.value===null?'No observation is available in the selected context.':`${v.value} ${unit}`;
 if(/^(what is my weight|show my weight)$/.test(q))return {answer:format(s.body.weight,'kg'),evidence:['Recorded weight'],specialist:'body'};
 if(/^(what is my readiness score|show my readiness score)$/.test(q))return {answer:format(s.readiness.score,'readiness score'),evidence:['Deterministic readiness calculation'],specialist:'general'};
 if(/^(what was my sleep duration|how long did i sleep|what is my sleep duration)$/.test(q))return {answer:format(s.sleep.duration,'hours'),evidence:['Recorded sleep duration'],specialist:'recover'};
 if(/^(what workout is scheduled today|show today[’']s workout plan|show today[’']s workout)$/.test(q))return {...workoutAnswer(tools.data,tools.policy.date,null),specialist:'train'};
 if(/^(how much protein do i have left|what protein is left|how much protein is left|what is my protein remaining)$/.test(q)){const n=s.nutrition;return {answer:n.proteinConsumed.value===null||n.proteinTarget.value===null?'Recorded intake or target is missing in the selected context.':`${Math.max(0,Math.round(n.proteinTarget.value-n.proteinConsumed.value))} g protein remains against your saved target (recorded intake only).`,evidence:['Deterministic nutrition totals and saved target'],specialist:'nutri'};}
 return null;
}
