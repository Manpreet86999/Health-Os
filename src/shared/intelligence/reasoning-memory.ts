import {deriveMemories,rankMemories,type HealthMemory} from './memory.js';
import {evaluateStrategyRecommendation,type StrategyContext} from './adaptive-strategy.js';
import type {AgentRequest} from './agent-contracts.js';
import type {Dataset} from '../automation-model.js';
import type {CurrentHealthState} from './state.js';
import {intelligencePreferences} from './contracts.js';
import type {ChatDomain} from '../intelligence-chat.js';
/** Only observed, consented context is used for matching; unknown dimensions stay absent. */
export function strategyContext(state:CurrentHealthState):StrategyContext{
 const fatigue=state.recovery.fatigue.value;
 return {...(fatigue!==null?{fatigue:fatigue>=7?'high' as const:fatigue>=4?'moderate' as const:'low' as const}:{}),...(state.recovery.soreness.value!==null?{soreness:state.recovery.soreness.value}:{}),...(state.sleep.debt.value!==null?{sleepDebtHours:state.sleep.debt.value}:{})};
}
export function reasoningMemories(request:AgentRequest,data:Dataset,context:StrategyContext,provided?:HealthMemory[]):AgentRequest['memories']{
 const preferences=intelligencePreferences(data.records.filter(r=>r.userId===data.userId));
 if(request.policy.mode!=='auto'||!preferences.personalization||!preferences.flags.intelligence_memory)return [];
 const memories=(provided||deriveMemories(data,request.policy.date)).filter(m=>m.userId===data.userId&&m.domain!=='readiness'&&request.policy.domains.includes(m.domain as ChatDomain)&&m.domain!=='medical');
 const selected=rankMemories(memories,{query:request.question,date:request.policy.date,maxItems:5,verifiedOnly:true});
 // A relevant observed failure must survive the small context budget.
 const outcomes=rankMemories(memories,{query:request.question,date:request.policy.date,maxItems:2,verifiedOnly:true,category:'outcome_learning'});
 const ranked=[...new Map([...outcomes,...selected].map(m=>[m.id,m])).values()].slice(0,5);
 return ranked.map(m=>{
  const intervention=String(m.value.intervention||m.value.actionId||'');
  const evaluation=m.category==='outcome_learning'&&intervention?evaluateStrategyRecommendation(intervention,{...context,domain:m.domain},memories):undefined;
  return {domain:m.domain as ChatDomain,sourceId:m.id,summary:(m.summary+(evaluation?' Strategy review: '+evaluation.status+'. '+evaluation.reasoning:'')).slice(0,1000)};
 });
}
