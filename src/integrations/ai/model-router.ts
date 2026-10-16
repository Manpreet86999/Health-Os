import {PRIMARY_MODEL,provisionalModelAdmission} from '../../shared/intelligence/production-models.js';
import {providerJsonSchema} from './provider-json-schema.js';
import { z } from 'zod';
import type {AgentModelRole,ModelUsage} from '../../shared/intelligence/agent-contracts.js';
import {providerHealth,classifyProviderFailure,type ProviderAttempt} from './provider-health.js';
export type ModelRole='structured_extraction'|'food_vision'|'medical_document_extraction'|'health_reasoning';
export interface ModelConfiguration {provider:'openrouter'|'nvidia';apiKey:string;model?:string;roles?:Partial<Record<ModelRole,string>>;}
export interface ModelMessage {role:'system'|'user'|'assistant';content:string|{type:string;[key:string]:unknown}[];}
/** Server-only credentials, one compatible transport, role-based selection, strict validation. */
export class HealthOSModelRouter {
  constructor(private configuration:ModelConfiguration,private transport:typeof fetch=fetch){}
  model(role:ModelRole) {const model=this.configuration.roles?.[role]||this.configuration.model||(this.configuration.provider==='openrouter'?PRIMARY_MODEL:'');if(!model)throw new Error('Choose an AI model in Settings → Connections.');return model;}
  async runStructured<T>(role:ModelRole,schema:z.ZodType<T>,messages:ModelMessage[],options:{consent:boolean;signal?:AbortSignal}):Promise<T> {
    if(!options.consent)throw new Error('Approve sharing this input before using your provider.');
    if(!this.configuration.apiKey)throw new Error('Configure your AI provider in Settings → Connections.');
    const endpoint=this.configuration.provider==='nvidia'?'https://integrate.api.nvidia.com/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions';
    const response=await this.transport(endpoint,{method:'POST',headers:{Authorization:`Bearer ${this.configuration.apiKey}`,'Content-Type':'application/json','X-Title':'Health OS'},body:JSON.stringify({model:this.model(role),temperature:.1,max_tokens:3000,messages}),signal:options.signal||AbortSignal.timeout(65000)});
    if(!response.ok)throw new Error(`Your provider could not process this input (${response.status}). Check the model and credits, or use saved foods.`);
    const raw=await response.json(),answer=raw.choices?.[0]?.message?.content;
    if(typeof answer!=='string')throw new Error('No structured result returned.');
    return schema.parse(JSON.parse(answer.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'')));
  }
}

export interface AgentModelConfig {provider:'openrouter'|'nvidia';model:string;paid:boolean;inputUsdPerMillion?:number;outputUsdPerMillion?:number;providerTags?:string[];providerRoutes?:Record<string,string>;vision?:boolean;reasoningSupported?:boolean;reasoningEnabled?:boolean;reasoningEffort?:'low'|'medium'|'high';}
export interface AgentModelPolicy {allowProvisional?:boolean;preferFree:boolean;allowPaid:boolean;dailyPaidLimitUsd:number;roles:Partial<Record<AgentModelRole,AgentModelConfig>>;allowedModels?:readonly string[];minimumConfidence?:'medium'|'high';deadlineAt?:number;}
export interface UsageLedger {reserve(id:string,maximumUsd:number,limitUsd:number,metadata:ModelUsage):Promise<void>;settle(id:string,usage:ModelUsage):Promise<void>;readHealth?():Promise<ProviderAttempt[]>;readQualifications?():Promise<{model:string;roles:AgentModelRole[]}[]>;recordOutcome?(id:string,attempt:ProviderAttempt):Promise<void>;}
/** Compatible transport shared by domain extraction and the reasoning agent; credentials stay server-side. */
export class AgentModelRouter {
 constructor(private policy:AgentModelPolicy,private keys:Partial<Record<'openrouter'|'nvidia',string>>,private ledger:UsageLedger,private transport:typeof fetch=fetch){}
 candidates(role:AgentModelRole){
  const roles:AgentModelRole[]=role==='fallback'?['fallback']:role==='router'||role==='classifier'?['classifier','router','fast_reasoner','general_reasoner','fallback']:role==='complex_reasoner'?['complex_reasoner','general_reasoner','fallback']:role==='vision'?['vision']:role==='research'?['research','complex_reasoner','general_reasoner','fallback']:role==='planner'?['planner','complex_reasoner','general_reasoner','fallback']:role==='verifier'||role==='safety_reviewer'?[role,'fallback']:role==='structured_extractor'?['structured_extractor','fast_reasoner','general_reasoner','fallback']:['fast_reasoner','general_reasoner','complex_reasoner','fallback'];
  let configs=roles.flatMap(r=>this.policy.roles[r]?[{role:r,config:{...this.policy.roles[r]!,paid:this.policy.roles[r]!.paid||(this.policy.roles[r]!.provider==='openrouter'&&this.policy.roles[r]!.model!=='openrouter/free'&&!this.policy.roles[r]!.model.endsWith(':free'))}}]:[]).filter(v=>!!this.keys[v.config.provider]&&(role!=='vision'||v.config.vision));
  configs=configs.filter(({config})=>!config.paid||this.policy.allowPaid&&this.policy.dailyPaidLimitUsd>0&&Number.isFinite(config.inputUsdPerMillion)&&Number.isFinite(config.outputUsdPerMillion)&&config.inputUsdPerMillion!>=0&&config.outputUsdPerMillion!>=0);
  if(this.policy.allowedModels)configs=configs.filter(({config})=>config.provider==='openrouter'&&this.policy.allowedModels!.includes(config.model));
  // Preserve role capability ordering. Free-first applies within a role tier,
  // not by moving a weaker general role ahead of a configured complex role.
  if(this.policy.preferFree)configs.sort((a,b)=>roles.indexOf(a.role)-roles.indexOf(b.role)||Number(a.config.paid)-Number(b.config.paid));
  return configs.filter((v,i,a)=>a.findIndex(x=>x.config.provider===v.config.provider&&x.config.model===v.config.model)===i);
 }
 async run<T>(requestId:string,role:AgentModelRole,schema:z.ZodType<T>,messages:ModelMessage[],options:{validateResult?:(result:T)=>void}={}):Promise<{result:T;usage:ModelUsage[]}>{
  const deadline=this.policy.deadlineAt??(this.policy.allowedModels?Date.now()+120000:undefined);
  const containsCredential=(text:string)=>Object.values(this.keys).some(key=>key&&key.length>=16&&text.includes(key));
  if(containsCredential(JSON.stringify(messages)))throw new Error('Credential-like input was withheld before provider access.');
  const responseFormat=this.policy.allowedModels?{type:'json_schema',json_schema:{name:'health_os_'+role,strict:true,schema:providerJsonSchema(z.toJSONSchema(schema))}}:{type:'json_object'};
  const schemaFailures:{model:string;role:string;issues:{code:string;path:string}[]}[]=[];
  const history=await this.ledger.readHealth?.().catch(()=>[])||[],health=providerHealth(history);
  const qualifications=await this.ledger.readQualifications?.();
  const candidates=this.candidates(role).filter(({role:assigned,config})=>(!qualifications||qualifications.some(q=>q.model===config.model&&q.roles.includes(assigned))||this.policy.allowProvisional===true&&provisionalModelAdmission(config.model,assigned))&&!health.some(h=>h.provider===config.provider&&h.model===config.model&&(h.status==='cooldown'||h.role===assigned&&h.status==='degraded'&&!config.providerRoutes))),usage:ModelUsage[]=[];let failure=health.some(h=>h.status==='cooldown')?'Configured providers are cooling down after a rate limit or availability failure.':qualifications?'No permitted model currently meets its role qualification gate.':'No permitted model is configured.';
  for(const [index,candidate] of candidates.entries()){
   const {config}=candidate;let repair='';
   const blockedRoutes=new Set<string>();
   const recent=history.filter(a=>a.model===config.model&&a.role===candidate.role&&a.providerRoute&&Date.parse(a.at)<=Date.now()&&Date.parse(a.at)>Date.now()-600000);
   for(const name of new Set(recent.map(a=>a.providerRoute!))){const samples=recent.filter(a=>a.providerRoute===name).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));if(samples[0]?.outcome!=='valid'&&samples.filter(a=>['invalid_output','schema_failure','grounding_failure','semantic_failure'].includes(a.outcome)).length>=2)blockedRoutes.add(name);}
   for(let attempt=0;attempt<2;attempt++){
    if(deadline!==undefined&&Date.now()>=deadline){failure='The bounded model request deadline was reached.';break;}
    const providerTags=config.providerTags?.filter(tag=>!blockedRoutes.has(config.providerRoutes?.[tag]||tag));
    if(config.providerTags?.length&&!providerTags?.length){failure='No eligible endpoint remains for the assigned model after structured or semantic failures.';break;}
    // Prefer measured role success and latency over the gateway's price-weighted lottery.
    // This ranks endpoints only; the independent model-role qualification gate still applies.
    const endpointRank=(tag:string)=>{const name=config.providerRoutes?.[tag]||tag,samples=recent.filter(a=>a.providerRoute===name),valid=samples.filter(a=>a.outcome==='valid'),ratio=samples.length?valid.length/samples.length:0;return {tier:valid.length&&ratio>=.8?0:samples.length?2:1,ratio,latency:valid.length?valid.reduce((sum,a)=>sum+a.latencyMs,0)/valid.length:Infinity};};
    const providerOrder=providerTags?.map((tag,index)=>({tag,index,rank:endpointRank(tag)})).sort((a,b)=>a.rank.tier-b.rank.tier||b.rank.ratio-a.rank.ratio||a.rank.latency-b.rank.latency||a.index-b.index).map(entry=>entry.tag);
    const start=Date.now(),id=`${requestId}:${index}:${attempt}`,meta:ModelUsage={requestId:id,role:candidate.role,model:config.model,provider:config.provider,latencyMs:0,paid:config.paid,reason:index?'Previous permitted model failed':'Task complexity and configured role',...(index?{escalationReason:failure}:{})};
    const selectedMessages=repair?[...messages,{role:'user' as const,content:repair}]:messages;
    const schemaBytes=this.policy.allowedModels?new TextEncoder().encode(JSON.stringify(responseFormat)).length:0;
    const bytes=new TextEncoder().encode(JSON.stringify(selectedMessages)).length+schemaBytes;
    const textBytes=new TextEncoder().encode(JSON.stringify(selectedMessages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(part=>part.type==='image_url'?{type:'image_url',image_url:{url:'[image]'}}:part):m.content})))).length;
    if(textBytes+schemaBytes>180000||bytes>3100000)throw new Error('Model context exceeds the bounded request limit.');
    const outputBudget=attempt||role==='complex_reasoner'?7000:role==='router'||role==='classifier'?2000:3500;
    const maximum=config.paid?(bytes*config.inputUsdPerMillion!+Math.max(4000,outputBudget)*config.outputUsdPerMillion!)/1e6:0;
    try{await this.ledger.reserve(id,maximum,this.policy.dailyPaidLimitUsd,meta);}catch{failure='The configured paid budget cannot authorize this model. Review the Intelligence budget in Settings.';break;}
    let incurred=true;
    try{
     const remaining=deadline===undefined?Infinity:deadline-Date.now();
     if(remaining<=0){incurred=false;throw Object.assign(new Error('The bounded model request deadline was reached.'),{name:'TimeoutError'});}
     const response=await this.transport(config.provider==='nvidia'?'https://integrate.api.nvidia.com/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${this.keys[config.provider]}`,'Content-Type':'application/json','X-Title':'Health OS'},body:JSON.stringify({model:config.model,temperature:.1,max_tokens:outputBudget,...(config.provider==='openrouter'?{response_format:responseFormat,...(config.paid?{provider:{require_parameters:true,...(providerTags?.length?{only:providerTags,order:providerOrder}:{}),max_price:{prompt:config.inputUsdPerMillion,completion:config.outputUsdPerMillion,request:0}}}:{}),...(config.reasoningSupported===false?{}:{reasoning:config.reasoningEnabled===false?{enabled:false,exclude:true}:{effort:config.reasoningEffort||(role==='complex_reasoner'?'medium':'low'),exclude:true}})}:{}),messages:selectedMessages}),signal:AbortSignal.timeout(Math.max(1,Math.min(role==='router'?35000:65000,remaining)))});
     meta.latencyMs=Date.now()-start;
     if(!response.ok){incurred=false;throw new Error(response.status===429?'Provider rate limit or quota reached. Retry after the provider limit resets.':`Provider request failed (${response.status}).`);}
     const raw=await response.json();if(typeof raw.provider==='string'&&/^[A-Za-z0-9 ._/-]{1,120}$/.test(raw.provider)&&!containsCredential(raw.provider))meta.providerRoute=raw.provider;if(raw.error){incurred=false;const code=Number(raw.error.code);throw new Error(code===429?'Provider rate limit or quota reached. Retry after the provider limit resets.':`Provider response failed (${Number.isFinite(code)?code:502}).`);}if(typeof raw.model==='string'){if(this.policy.allowedModels&&!this.policy.allowedModels.includes(raw.model))throw new Error('Provider reported a model outside the production policy.');if(this.policy.allowedModels&&raw.model!==config.model)throw new Error('Provider reported a different model from the assigned production role.');meta.model=raw.model.slice(0,200);}meta.tokens=Number.isFinite(raw.usage?.total_tokens)?raw.usage.total_tokens:undefined;
     meta.estimatedCostUsd=config.paid?maximum:0;
     if(config.paid&&Number.isFinite(raw.usage?.prompt_tokens)&&Number.isFinite(raw.usage?.completion_tokens))meta.estimatedCostUsd=(raw.usage.prompt_tokens*config.inputUsdPerMillion!+raw.usage.completion_tokens*config.outputUsdPerMillion!)/1e6;
     // Provider-reported cost is retained when available; reserve the upper bound if usage is absent.
     if(config.paid&&Number.isFinite(raw.usage?.cost)&&raw.usage.cost>=0)meta.estimatedCostUsd=raw.usage.cost;
     const content=raw.choices?.[0]?.message?.content;if(typeof content!=='string')throw new Error('Missing structured model result (finish reason: '+String(raw.choices?.[0]?.finish_reason||'unknown').slice(0,40)+').');
     if(containsCredential(content))throw new Error('Provider returned credential-like content; the response was withheld.');
     const result=schema.parse(JSON.parse(content));options.validateResult?.(result);
     if(this.policy.minimumConfidence&&((result as any).confidence==='low'||this.policy.minimumConfidence==='high'&&(result as any).confidence==='medium'))throw new Error('Model requested escalation: confidence below policy threshold.');
     if((result as any).needsEscalation===true)throw new Error('Model requested escalation: '+String((result as any).escalationReason||'insufficient capability').slice(0,200));
     meta.latencyMs=Date.now()-start;
     await this.ledger.settle(id,meta);await this.ledger.recordOutcome?.(id,{provider:config.provider,model:config.model,role:candidate.role,...(meta.providerRoute?{providerRoute:meta.providerRoute}:{}),at:new Date().toISOString(),outcome:'valid',latencyMs:meta.latencyMs}).catch(()=>{});usage.push(meta);return {result,usage};
    }catch(e){if(meta.providerRoute&&['invalid_output','schema_failure','grounding_failure','semantic_failure'].includes(classifyProviderFailure(e)))blockedRoutes.add(meta.providerRoute);const issues=(e as any)?.issues;if(issues)schemaFailures.push({model:config.model,role:candidate.role,issues:issues.slice(0,20).map((i:any)=>({code:String(i.code).slice(0,80),path:(i.path||[]).map((p:unknown)=>String(p).slice(0,80)).join('.')}))});failure=issues||e instanceof SyntaxError?'Invalid structured model output':e instanceof Error?e.message:'Model unavailable';if(containsCredential(failure))failure='Provider details were withheld.';meta.latencyMs=Date.now()-start;meta.estimatedCostUsd??=incurred?maximum:0;await this.ledger.settle(id,meta);await this.ledger.recordOutcome?.(id,{provider:config.provider,model:config.model,role:candidate.role,...(meta.providerRoute?{providerRoute:meta.providerRoute}:{}),at:new Date().toISOString(),outcome:classifyProviderFailure(e),latencyMs:meta.latencyMs}).catch(()=>{});usage.push(meta);if(e instanceof Error&&(['AbortError','TimeoutError'].includes(e.name)||/Provider request failed \((401|402|403|404)\)|Provider rate limit/.test(e.message)))break;repair='The previous response was invalid or inadequate. Return only valid JSON matching the ORIGINAL supplied schema and stage. Return the complete original object with all required fields. Do not switch from classification to answering, planning or tool selection. Correct the failed fields inside their original bounds; shorten text rather than changing the output shape. Do not fabricate values.'+(issues?' Validation errors: '+JSON.stringify(issues.map((i:any)=>({code:i.code,path:i.path,keys:i.keys,expected:i.expected,message:String(i.message||'').slice(0,300)}))).slice(0,2500):' Validation feedback: '+failure.slice(0,1000));}
   }
  }
  throw new Error('AI reasoning is currently unavailable. '+(containsCredential(failure)?'Provider details were withheld.':failure),{cause:{schemaFailures}});
 }
}
