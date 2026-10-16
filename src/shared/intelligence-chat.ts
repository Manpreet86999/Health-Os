import type {Dataset} from './automation-model.js';
import type {IntelligencePower} from './agentic-intelligence.js';
import {emptySkinState} from './skin.js';
import {defaultProfile} from './defaults.js';
import {legacyBiology} from './legacy-biology.js';
import {live,dateOf,type BioRecord} from './biology.js';

export const chatDomains=['training','nutrition','recovery','sleep','body','medical','care','goals'] as const;
export type ChatDomain=typeof chatDomains[number];
export type ChatContext='auto'|'today'|'domains'|'records'|'none';
export type ChatMode='ask'|'analyze'|'plan'|'act';
export type ChatResearch='off'|'web'|'deep'|'products';
export function routeChat(question:string,power:IntelligencePower):IntelligencePower {
 if(power!=='general')return power;
 if(/\b(ldl|hdl|symptom|medical|clinician|lab|prescription)\b/i.test(question))return 'medical';
 if(/\b(moisturizer|sunscreen|shampoo|skin|skincare|hair|ingredient|care)\b|skin\s+care/i.test(question))return 'care';
 if(/\b(protein|food|meal|dinner|nutrition|calorie)\b/i.test(question))return 'nutri';
 if(/\b(train|workout|session|squat|strength)\b/i.test(question))return 'train';
 if(/\b(weight|waist|body|fat)\b/i.test(question))return 'body';
 if(/\b(sleep|tired|recovery|recover|sore|fatigue)\b/i.test(question))return 'recover';
 return 'general';
}
export function relevantChatDomains(question:string,power:IntelligencePower):ChatDomain[]{
 const routed=routeChat(question,power);
 const domains:Record<IntelligencePower,ChatDomain[]>={general:['training','nutrition','recovery','sleep','body','goals'],train:['training','sleep','recovery','nutrition','goals'],nutri:['nutrition','goals'],recover:['sleep','recovery','training','nutrition'],body:['body','nutrition','training','goals'],medical:['medical','body'],care:['care']};
 return /\b(mission|goal)\b/i.test(question)?[...new Set([...domains[routed],'goals' as ChatDomain])]:domains[routed];
}
export function recordChatDomain(r:BioRecord):ChatDomain {
 if(r.metadata.intelligenceReminder===true||r.metadata.intelligenceSavedReport===true)return 'goals';
 if(r.metadata.knowledgeDocument===true&&chatDomains.includes(r.metadata.knowledgeDomain as ChatDomain))return r.metadata.knowledgeDomain as ChatDomain;
 if(['meal','mealPlan','nutritionTarget','nutritionDay','food','recipe','foodCorrection'].includes(r.type))return 'nutrition';
 if(r.type==='sleep')return 'sleep';
 if(['recoveryNote','checkIn'].includes(r.type))return 'recovery';
 if(['medication','dose','supplement','symptom','illness'].includes(r.type))return 'medical';
 if(r.type==='bodyMeasurement')return 'body';
 if(r.type==='goal'||r.type==='goalCheckIn')return 'goals';
 if(r.domain==='Health')return 'medical';
 if(r.domain==='Care')return 'care';
 if(r.domain==='Train')return 'training';
 if(r.type==='vital')return /weight|waist|body fat/i.test(r.name+' '+r.metadata.metric)?'body':'medical';
 if(r.domain==='Body')return 'body';
 return 'medical';
}
/** Restrict the actual computation input, not just the displayed summary. */
export function filterChatContext(data:Dataset,date:string,context:ChatContext,domains:ChatDomain[],selectedIds:string[]=[]):Dataset {
 const allow=(domain:ChatDomain)=>context!=='none'&&context!=='records'&&domains.includes(domain);
 const day=<T extends {date?:string}>(items:T[])=>context==='today'?items.filter(r=>r.date===date):items;
 const records=live(data.records).filter(r=>r.userId===data.userId&&!r.metadata.intelligenceRun&&!r.metadata.intelligenceAction&&!r.metadata.intelligenceMemory&&!r.metadata.intelligenceReceipt&&!r.metadata.intelligenceDecision&&!r.metadata.intelligenceOutcome&&(context==='records'?selectedIds.includes(r.id):context!=='none'&&domains.includes(recordChatDomain(r)))&&(context!=='today'||dateOf(r.timestamp)===date));
 const stripCheckIn=<T extends object>(value:T):T=>{const row={...value} as T&Record<string,unknown>;delete row.notes;if(context!=='records'&&!allow('sleep')){delete row.sleepHours;delete row.sleepQuality;}if(context!=='records'&&!allow('nutrition')){delete row.mealProtein;delete row.hydration;}return row;};
 if(allow('sleep')&&!allow('recovery'))for(const record of legacyBiology(data.db).filter(r=>r.type==='sleep'&&(context!=='today'||dateOf(r.timestamp)===date)))if(!records.some(r=>r.id===record.id))records.push({...record,userId:data.userId});
 const profileAllowed=allow('goals')||allow('body')||allow('training')||allow('nutrition');
 const profile=profileAllowed?{displayName:data.db.profile.displayName,units:data.db.profile.units,createdAt:data.db.profile.createdAt,...(allow('body')||allow('goals')?{height:data.db.profile.height}:{})}:defaultProfile();
 const db={...data.db,profile,notes:[],healthReadings:allow('medical')?day(data.db.healthReadings||[]):[],
  weeks:allow('training')?data.db.weeks:[],sessions:allow('training')?day(data.db.sessions):[],readiness:allow('recovery')?day(data.db.readiness).map(stripCheckIn):[],
  measurements:allow('body')?day(data.db.measurements):[],painLogs:allow('recovery')?day(data.db.painLogs):[],cardio:allow('training')?day(data.db.cardio):[],
  targets:allow('goals')?data.db.targets:[],goalCheckIns:allow('goals')?day(data.db.goalCheckIns):[],habits:allow('goals')?data.db.habits:[],habitLogs:allow('goals')?day(data.db.habitLogs):[],weeklyReviews:allow('training')&&context!=='today'?data.db.weeklyReviews:[],
  programs:allow('training')?data.db.programs:[],scheduledWorkouts:allow('training')?day(data.db.scheduledWorkouts):[],librarySplits:allow('training')?data.db.librarySplits:[],skin:undefined};
 const skin=allow('care')?context==='today'?{...emptySkinState(),logs:data.skin.logs.filter(r=>r.date===date),care:{...emptySkinState().care,checkIns:data.skin.care.checkIns.filter(r=>r.date===date),events:data.skin.care.events.filter(r=>r.date===date)}}:data.skin:emptySkinState();
 return {userId:data.userId,records:records.map(r=>r.type==='checkIn'?{...r,metadata:stripCheckIn(r.metadata)}:r),db,skin,profileProvided:profileAllowed&&data.profileProvided!==false,preferences:allow('goals')?data.preferences:undefined,activeWorkout:allow('training')?data.activeWorkout:undefined,medicalReports:allow('medical')?data.medicalReports?.filter(r=>context!=='today'||r.collectedAt.slice(0,10)===date):undefined,freshness:data.freshness};
}
export function suggestedResearch(question:string):ChatResearch|null {
 if(/\b(find|buy|best|recommend|under|price|shop)\b/i.test(question)&&/\b(moisturizer|sunscreen|shampoo|product|supplement|cream)\b/i.test(question))return 'products';
 if(/latest|current|recent research|new studies/i.test(question))return 'web';
 return null;
}
export function safeSourceUrl(value:unknown){try{const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}}
