import {dateOf,live,sleepDurationHours,mean,type BioRecord} from '../biology.js';
import {shiftDay} from '../biological-intelligence.js';
import {readReceipt} from './actions.js';
import {fingerprint} from '../automation-model.js';
import {recordHash,type HealthData} from './contracts.js';
import type {HealthMemory} from './memory.js';
/** Verified interventions plus actual follow-up observations; no implied causation. */
export function deriveAgentEpisodes(data:HealthData,date:string):HealthMemory[]{
 const records=live(data.records).filter(r=>r.userId===data.userId),result:HealthMemory[]=[];
 for(const row of records.filter(r=>r.metadata.intelligenceReceipt===true)){
  const receipt=readReceipt(row);if(!receipt||receipt.status!=='executed'||!receipt.verifiedAt||receipt.createdAt.slice(0,10)>date)continue;
  const domain=receipt.actionId.startsWith('sleep.')?'sleep':receipt.actionId.startsWith('training.')?'training':receipt.actionId.startsWith('nutrition.')?'nutrition':receipt.actionId.startsWith('recovery.')?'recovery':receipt.actionId.startsWith('care.')?'care':receipt.actionId.startsWith('goals.')?'goals':undefined;
  if(!domain||receipt.risk==='R0')continue;
  const intervention=dateOf(receipt.createdAt),sources:BioRecord[]=[row];let outcome:Record<string,unknown>={status:'follow_up_unavailable'};
  if(receipt.actionId==='sleep.set_target'){
   const sleep=records.filter(r=>r.type==='sleep'&&r.metadata.nap!==true&&r.quality!=='estimated'&&sleepDurationHours(r)!==null).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
   const daily=[...new Map(sleep.map(r=>[dateOf(r.timestamp),r] as const).reverse()).values()];
   const before=daily.filter(r=>dateOf(r.timestamp)>=shiftDay(intervention,-7)&&dateOf(r.timestamp)<intervention),after=daily.filter(r=>dateOf(r.timestamp)>intervention&&dateOf(r.timestamp)<=shiftDay(intervention,7)&&dateOf(r.timestamp)<=date);
   if(before.length>=3&&after.length>=3){const baseline=mean(before.map(r=>sleepDurationHours(r)!))!,observed=mean(after.map(r=>sleepDurationHours(r)!))!;outcome={status:'observed_association',baselineHours:baseline,observedHours:observed,changeHours:observed-baseline,beforeDays:before.length,afterDays:after.length,unit:'hours',causal:false};sources.push(...before,...after);}
  }
  const complete=outcome.status==='observed_association',last=sources.map(r=>r.timestamp).sort().at(-1)!;
  result.push({id:'agent-episode-'+fingerprint([data.userId,row.id]),userId:data.userId,category:'episodic_agent',layer:'episodic',type:'agent_intervention_outcome',domain,summary:`Verified ${receipt.actionId} on ${intervention}. ${complete?'Recorded follow-up sleep was '+(Number(outcome.changeHours)>.25?'longer':Number(outcome.changeHours)<-.25?'shorter':'similar')+' than the prior window; this is an association, not evidence of causation.':'A measured follow-up outcome is unavailable; do not infer effectiveness.'}`,value:{actionId:receipt.actionId,receiptId:receipt.id,interventionDate:intervention,outcome},provenance:'verified_action_receipt',verified:true,confidence:complete?.65:.45,evidenceCount:complete?Math.min(Number(outcome.beforeDays),Number(outcome.afterDays)):1,stability:1,contradictions:0,firstObserved:receipt.createdAt,lastObserved:last,sourceIds:sources.map(r=>r.id),sourceFingerprint:fingerprint(sources.map(recordHash)),status:'active'});
 }
 const independent:HealthMemory[]=[];
 for(const episode of result.filter(e=>(e.value.outcome as any).status==='observed_association').sort((a,b)=>a.firstObserved.localeCompare(b.firstObserved)))if(!independent.length||Date.parse(episode.firstObserved)-Date.parse(independent.at(-1)!.firstObserved)>14*86400000)independent.push(episode);
 if(independent.length>=3){const changes=independent.map(e=>Number((e.value.outcome as any).changeHours)),positive=changes.filter(n=>n>.25).length,negative=changes.filter(n=>n<-.25).length,ids=[...new Set(independent.flatMap(e=>e.sourceIds))],consistent=Math.max(positive,negative)/independent.length;
  result.push({id:'agent-outcome-pattern-'+fingerprint([data.userId,'sleep.set_target']),userId:data.userId,category:'outcome_learning',layer:'stable',type:'agent_intervention_pattern',domain:'sleep',summary:`Across ${independent.length} non-overlapping reviewed sleep-target episodes, recorded follow-up sleep was ${positive===independent.length?'consistently longer':negative===independent.length?'consistently shorter':'mixed or unchanged'}. Consider this history when comparing future options; it remains observational and does not justify automatic changes or a causal claim.`,value:{actionId:'sleep.set_target',episodes:independent.map(e=>e.value.receiptId),consistentDirection:positive===independent.length?'longer':negative===independent.length?'shorter':'mixed',causal:false},provenance:'measured_observation',verified:true,confidence:Math.min(.8,.4+independent.length*.07)*Math.max(.5,consistent),evidenceCount:independent.length,stability:Math.max(.5,consistent),contradictions:Math.min(positive,negative),firstObserved:independent[0].firstObserved,lastObserved:independent.map(e=>e.lastObserved).sort().at(-1)!,sourceIds:ids,sourceFingerprint:fingerprint(records.filter(r=>ids.includes(r.id)).map(recordHash)),status:'active'});
 }
 return result;
}
