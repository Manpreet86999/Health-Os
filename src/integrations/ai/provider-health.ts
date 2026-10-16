import type {AgentModelRole} from '../../shared/intelligence/agent-contracts.js';
export type ProviderOutcome='valid'|'invalid_output'|'schema_failure'|'grounding_failure'|'tool_failure'|'semantic_failure'|'network_failure'|'rate_limited'|'timeout'|'unauthorized'|'unavailable'|'escalated';
export interface ProviderAttempt {provider:'openrouter'|'nvidia';model:string;role:AgentModelRole;providerRoute?:string;at:string;outcome:ProviderOutcome;latencyMs:number;}
export interface ProviderHealth {provider:string;model:string;role:string;samples:number;valid:number;invalid:number;latencyP95Ms:number|null;cooldownUntil:string|null;status:'unknown'|'available'|'degraded'|'cooldown';semanticQuality:'not_evaluated';}
/** Availability and schema reliability are separate from semantic correctness. */
export function providerHealth(attempts:ProviderAttempt[],now=Date.now()):ProviderHealth[]{
 const groups=new Map<string,ProviderAttempt[]>();
 for(const attempt of attempts){const stamp=Date.parse(attempt.at);if(!Number.isFinite(stamp)||stamp>now||stamp<now-7*86400000)continue;const key=[attempt.provider,attempt.model,attempt.role].join(':');groups.set(key,[...(groups.get(key)||[]),attempt]);}
 return [...groups.values()].map(rows=>{rows.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));const recent=rows.slice(0,20),latest=recent[0],valid=recent.filter(r=>r.outcome==='valid').length,invalid=recent.filter(r=>['invalid_output','schema_failure'].includes(r.outcome)).length;
  const coolFor=latest.outcome==='rate_limited'?300000:latest.outcome==='unauthorized'?3600000:['timeout','unavailable','network_failure'].includes(latest.outcome)?60000:0;
  const cooldown=Date.parse(latest.at)+coolFor,latencies=recent.map(r=>r.latencyMs).filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
  return {provider:latest.provider,model:latest.model,role:latest.role,samples:recent.length,valid,invalid,latencyP95Ms:latencies.length?latencies[Math.min(latencies.length-1,Math.ceil(latencies.length*.95)-1)]:null,cooldownUntil:coolFor&&cooldown>now?new Date(cooldown).toISOString():null,status:coolFor&&cooldown>now?'cooldown':recent.length<3?'unknown':valid/recent.length>=.8?'available':'degraded',semanticQuality:'not_evaluated'};
 });
}
export function classifyProviderFailure(error:unknown):ProviderOutcome{
 const message=error instanceof Error?error.message:String(error);
 if(['grounding_failure','semantic_failure','tool_failure'].includes((error as any)?.providerOutcome))return (error as any).providerOutcome;
 if((error as any)?.issues)return 'schema_failure';
 if(error instanceof SyntaxError||/structured model|Invalid structured/i.test(message))return 'invalid_output';
 if(/rate limit|quota|429/i.test(message))return 'rate_limited';
 if(/401|403/.test(message))return 'unauthorized';
 if(/AbortError|TimeoutError/.test((error as any)?.name||'')||/timeout/i.test(message))return 'timeout';
 if(error instanceof TypeError||/network|fetch failed/i.test(message))return 'network_failure';
 if(/requested escalation/i.test(message))return 'escalated';
 return 'unavailable';
}
