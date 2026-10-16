import {z} from 'zod';
import type {AgentRequest,AgentRoute,AgentToolResult} from './agent-contracts.js';
import {chatDomains} from '../intelligence-chat.js';
export const contextRequestPlanSchema=z.object({goal:z.string().max(4000),from:z.string(),to:z.string(),required:z.array(z.object({domain:z.enum(chatDomains),tool:z.string(),reason:z.string().max(300)}).strict()).max(20),optional:z.array(z.object({domain:z.enum(chatDomains),tool:z.string(),reason:z.string().max(300)}).strict()).max(10),missingPermissions:z.array(z.enum(chatDomains)).max(8)}).strict();
export function planContext(request:AgentRequest,route:AgentRoute){
 const days=/\b(?:four|4)\s*(?:weeks?|wk)|\b28\s*days?/i.test(request.question)?28:/\b(?:four|4)\s*(?:nights?|days?)/i.test(request.question)?4:/\b90\s*days?|three months/i.test(request.question)?90:14;
 const date=new Date(request.policy.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-days+1);const from=date.toISOString().slice(0,10);
 const tools:Record<string,string>={training:'training.get_history',nutrition:'nutrition.get_history',sleep:'sleep.get_trend',recovery:'recovery.get_history',body:'body.get_weight_history',care:'care.get_observations',medical:'medical.get_lab_history',goals:'profile.get_goals'};
 const permitted=route.domains.filter(d=>request.policy.domains.includes(d));
 return contextRequestPlanSchema.parse({goal:request.question,from,to:request.policy.date,required:permitted.map(domain=>({domain,tool:tools[domain],reason:'Relevant to the semantic goal; align evidence to the requested window.'})),optional:permitted.includes('goals')?[{domain:'goals',tool:'profile.get',reason:'Use explicitly supplied preferences and goal constraints.'}]:[],missingPermissions:route.domains.filter(d=>!permitted.includes(d))});
}
/** Deterministic relevance/budget reduction; keep latest evidence and declare omissions. */
export function compressContext(results:AgentToolResult[],maxBytes=100000):{results:AgentToolResult[];omitted:string[];bytes:number}{
 const chosen:AgentToolResult[]=[],omitted:string[]=[];let bytes=0;
 for(const result of [...results].reverse()){
  const size=new TextEncoder().encode(JSON.stringify(result)).length;
  if(bytes+size<=maxBytes){chosen.unshift(result);bytes+=size;}else omitted.push(result.name);
 }
 return {results:chosen,omitted:[...new Set(omitted)],bytes};
}
