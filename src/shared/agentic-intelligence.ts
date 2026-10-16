import type {DocumentSource} from './intelligence/attachment-retrieval.js';
import { z } from 'zod';
import { live, num, type BioRecord } from './biology.js';
import { buildHealthIntelligence, assistantEvidence } from './health-intelligence.js';
import { dailyMetric } from './automation-rules.js';
import type { Dataset } from './automation-model.js';
import { effectiveBiology } from './legacy-biology.js';
import { shiftDay } from './biological-intelligence.js';
import {HealthStateService,type CurrentHealthState} from './intelligence/state.js';
import {workoutAnswer,careAnswer} from './intelligence-answers.js';
import {routeChat} from './intelligence-chat.js';
const canonicalState=new HealthStateService();

export const intelligencePowers = [
  {id:'general',label:'General',description:'Connect the whole picture',icon:'AI',prompts:['What matters today?', 'Explain my health signals', 'Prepare my day']},
  {id:'train',label:'Train',description:'Training with your context',icon:'Train',prompts:['Show today’s workout plan', 'Should I train today?', 'Make today lighter']},
  {id:'nutri',label:'Nutri',description:'Food that fits your goals',icon:'Eat',prompts:['How is my nutrition today?', 'Plan dinner', 'What protein is left?']},
  {id:'recover',label:'Recover',description:'Find room to recharge',icon:'Recover',prompts:['Review my recovery', 'Save a recovery plan', 'What changed in my sleep?']},
  {id:'body',label:'Body',description:'Understand your trajectory',icon:'Body',prompts:['Review my body trend', 'What changed from my baseline?', 'Create a mission']},
  {id:'medical',label:'Health',description:'Organize evidence for care',icon:'Health',prompts:['Organize my health information', 'Prepare clinician questions', 'Review my health timeline']},
  {id:'care',label:'Care',description:'Keep your routine connected',icon:'Care',prompts:['Build my AM/PM skincare routine', 'Review my care today', 'Create a mission']},
] as const;
export type IntelligencePower = typeof intelligencePowers[number]['id'];
const payloadSchema=z.object({
  type:z.enum(['mealPlan','recoveryNote','goal','journal']), domain:z.enum(['Eat','Recover','Today','Care']),
  name:z.string().min(1).max(250), metadata:z.record(z.string(),z.union([z.string().max(20000),z.number().finite(),z.boolean(),z.null()])),
});
export const agentProposalSchema=z.object({
  id:z.string().min(1),title:z.string().min(1),explanation:z.string(),
  tool:z.enum(['plan_meal','save_recovery_plan','create_mission','adapt_training','save_care_routine','replace_workout','set_sleep_target','update_goal','canonical_action']),
  payload:payloadSchema, sourceIds:z.array(z.string()), sourceFingerprint:z.string(),
  status:z.enum(['proposed','rejected','executed','undone','failed']),
  resultRevision:z.number().int().positive().optional(),
  receiptId:z.string().optional(),
});
export type AgentProposal=z.infer<typeof agentProposalSchema>;
export interface IntelligenceReply {documentSources?:DocumentSource[];answer:string; evidence:string[]; sources?:{title:string;url:string;content:string}[]; proposal?:AgentProposal; needsModel?:boolean; specialist:IntelligencePower;}
export const recordFingerprint=(records:BioRecord[],ids:string[])=>JSON.stringify(ids.map(id=>{const r=records.find(row=>row.id===id);return r?[r.id,r.revision,r.deletedAt||null]:null;}));
export function actionPolicy(proposal:AgentProposal,approved:boolean,records:BioRecord[]) {
  const p=agentProposalSchema.parse(proposal);
  const allowed={plan_meal:['mealPlan','Eat'],save_recovery_plan:['recoveryNote','Recover'],create_mission:['goal','Today'],adapt_training:['recoveryNote','Recover'],save_care_routine:['journal','Care'],replace_workout:['journal','Today'],set_sleep_target:['journal','Recover'],update_goal:['journal','Today'],canonical_action:['journal','Today']} as const;
  if(p.payload.type!==allowed[p.tool][0]||p.payload.domain!==allowed[p.tool][1])throw new Error('This tool cannot write to that domain.');
  if(!approved)throw new Error('Approve the proposed change before applying it.');
  if(p.status!=='proposed')throw new Error('This proposal has already been resolved.');
  if(recordFingerprint(records,p.sourceIds)!==p.sourceFingerprint)throw new Error('The source records changed. Ask for a fresh proposal.');
  return p;
}
export function verifyAgentWrite(expected:{id:string;type:string;name:string;metadata:BioRecord['metadata']},actual:BioRecord|undefined){
  return Boolean(actual&&!actual.deletedAt&&actual.id===expected.id&&actual.type===expected.type&&actual.name===expected.name&&Object.keys(actual.metadata).length===Object.keys(expected.metadata).length&&Object.entries(expected.metadata).every(([key,value])=>actual.metadata[key]===value));
}
export function intelligenceSnapshot(data:Dataset&{activeWorkout?:unknown},date:string,stateOverride?:CurrentHealthState){
  const context=buildHealthIntelligence(data,date),observed={...data,records:effectiveBiology(data.db,live(data.records).filter(r=>r.userId===data.userId&&(r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true)))};
  const state=stateOverride||canonicalState.observe(data,date),values=[state.readiness.score,state.sleep.duration,state.nutrition.proteinConsumed,state.readiness.energy];
  const metrics=['Readiness','Sleep','Protein','Energy'].map((metric,i)=>({...dailyMetric(observed,metric,date),metric,value:values[i].value,ids:values[i].sources.map(s=>s.id)}));
  return {context,metrics,evidence:assistantEvidence(context),priorities:context.recommendations.slice(0,3)};
}
/** Narrow specialists share one authorized state; no model can invoke a write. */
export function orchestrateIntelligence(data:Dataset,date:string,question:string,power:IntelligencePower):IntelligenceReply {
  const input=question.trim().slice(0,4000),text=input.toLowerCase();
  const commandDate=/\btomorrow\b/.test(text)?shiftDay(date,1):date;
  const snapshot=intelligenceSnapshot(data,commandDate);
  const specialist=routeChat(input,power);
  const evidence=snapshot.priorities.flatMap(p=>p.why).slice(0,4);
  const proposal=(tool:AgentProposal['tool'],title:string,explanation:string,payload:AgentProposal['payload'],sources:BioRecord[]=[]):AgentProposal=>({id:crypto.randomUUID(),tool,title,explanation,payload,sourceIds:sources.map(r=>r.id),sourceFingerprint:recordFingerprint(data.records,sources.map(r=>r.id)),status:'proposed'});
  if(/\b(diagnos\w*|dosage|prescrib\w*|stop.*medication|change.*dose)\b/.test(text))return {specialist:'medical',answer:'I can organize your recorded information and prepare questions for your clinician. Medication and treatment changes need clinical review.',evidence};
  if(specialist==='care'&&!/\bmission\b/.test(text))return {specialist,...careAnswer(data,commandDate,/\b(build|create|make|prepare|plan)\b/.test(text))};
  if(/\b(create|start|add)\b.*\bmission\b/.test(text)) {
    const objective=input.replace(/^.*?mission\s*[:\-]?\s*/i,'').trim()||'Build a consistent health routine';
    return {specialist,answer:'Here is a mission to coordinate your next steps. Review the objective before adding it to your goals.',evidence,proposal:proposal('create_mission',objective,'A saved mission gives your health work one shared objective.',{type:'goal',domain:'Today',name:objective,metadata:{intelligenceMission:true,objective,status:'active',startDate:date}})};
  }
  if(/\b(plan|prepare)\b.*\b(dinner|meal|food)\b/.test(text)) {
    const recipes=live(data.records).filter(r=>r.type==='recipe');
    const meal=recipes.find(r=>text.includes(r.name.toLowerCase()))||recipes[0];
    if(!meal)return {specialist:'nutri',answer:'Save a recipe in your food library first. I can then prepare a dinner proposal using that recipe, without logging it as eaten.',evidence};
    return {specialist:'nutri',answer:`I can put ${meal.name} into the dinner plan for ${commandDate}. Confirm the ingredients and portion before applying.`,evidence,proposal:proposal('plan_meal',`Plan ${meal.name} for dinner`,'Uses your saved recipe. Planning a meal does not record consumption.',{type:'mealPlan',domain:'Eat',name:meal.name,metadata:{date:commandDate,meal:'Dinner',recipeId:meal.id,portions:1,time:'20:00'}},[meal])};
  }
  if(/\b(save|make|prepare)\b.*\b(recovery plan|lighter|recovery note)\b/.test(text))return {specialist:'recover',answer:'I prepared a recovery note for today. Your prescribed training program stays under your control.',evidence,proposal:proposal('save_recovery_plan','Save today’s recovery plan',snapshot.context.priority.why.join(' '),{type:'recoveryNote',domain:'Recover',name:'Intelligence recovery plan',metadata:{date,notes:snapshot.context.priority.why.join(' '),category:'plan',intelligencePlan:true}})};
  if(/\b(protein|nutrition)\b/.test(text)) {
    const protein=dailyMetric(data,'Protein',date),target=live(data.records).filter(r=>r.type==='nutritionTarget').sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).find(r=>r.timestamp.slice(0,10)<=date);
    const goal=target?num(target,'protein'):null;
    return {specialist:'nutri',answer:protein.value===null?'No protein intake is recorded for today. Unlogged meals are unknown.':`${Math.round(protein.value)} g protein recorded today.${goal?` Your saved target is ${goal} g; ${Math.max(0,Math.round(goal-protein.value))} g remains in recorded intake.`:' Set a nutrition target to compare your intake.'}`,evidence:['Today’s meal records',...(target?['Your saved nutrition target']:[])]};
  }
  if(specialist==='train'&&/\b(train|workout|session|lighter)\b/.test(text))return {specialist,...workoutAnswer(data,commandDate,snapshot.metrics.find(m=>m.metric==='Readiness')?.value??null)};
  if(/\b(sleep|recovery|recover|baseline|trend|signals|body)\b/.test(text)) {
    const metrics=specialist==='body'?['Weight','Body fat']:specialist==='recover'?['Sleep','Resting HR','Energy']:['Sleep','Weight','Protein'];
    return {specialist,answer:snapshot.context.baselines.filter(b=>metrics.includes(b.metric)).map(b=>`${b.metric}: ${b.current===null?'no current observation':`${Number(b.current).toFixed(1)} ${b.unit}`}. ${b.samples} prior baseline observations.${b.deviation!==null?` Difference from baseline: ${b.deviation.toFixed(1)} ${b.unit}.`:''}`).join('\n\n'),evidence:['Your recorded observations and prior 28-day baselines. Associations do not establish causes.']};
  }
  if(specialist==='care') {
    return {specialist,...careAnswer(data,commandDate,false)};
  }
  if(/what matters|attention|prepare my day|health today|care today/i.test(text))return {specialist,answer:snapshot.priorities.map(p=>`${p.recommendation}\n${p.why.join(' ')}`).join('\n\n'),evidence};
  if(specialist==='medical')return {specialist,answer:'For your clinician: Which recorded trends need follow-up? Are any symptoms relevant to my current plan? Which measurements should I track before the next visit? Open Health to review your original records alongside these questions.',evidence};
  return {specialist,answer:'This question needs a contextual AI answer. You can approve sharing the compact evidence summary with your configured provider below.',evidence,needsModel:true};
}
