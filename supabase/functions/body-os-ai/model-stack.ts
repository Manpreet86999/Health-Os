import {modelRoles,type AgentModelRole} from '../../../src/shared/intelligence/agent-contracts.ts';
import {PRODUCTION_MODELS,productionRoleModel} from '../../../src/shared/intelligence/production-models.ts';
import type {AgentModelConfig} from '../../../src/integrations/ai/model-router.ts';
let catalog:{expires:number;models:Map<string,AgentModelConfig>}|undefined;
/** Prices and capabilities come from the current catalog; no free-model discovery. */
export async function productionModelStack(){
 if(!catalog||catalog.expires<Date.now()){
  const models=new Map<string,AgentModelConfig>();
  await Promise.allSettled(PRODUCTION_MODELS.map(async id=>{
   const response=await fetch('https://openrouter.ai/api/v1/models/'+id+'/endpoints',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Production provider pricing/capabilities are unavailable.');
   const found=(await response.json()).data;if(found?.id!==id)throw new Error('Production model metadata does not match its configured ID.');const endpoints=found.endpoints;
   const permitted=Array.isArray(endpoints)?endpoints.filter((e:any)=>{const input=Number(e.pricing?.prompt),output=Number(e.pricing?.completion),fee=Number(e.pricing?.request||0);return e.status===0&&typeof e.tag==='string'&&e.supported_parameters?.includes('response_format')&&e.supported_parameters?.includes('structured_outputs')&&Number.isFinite(input)&&Number.isFinite(output)&&input>=0&&output>=0&&fee===0&&input*10000+output*2000<=.005&&(e.max_completion_tokens==null||e.max_completion_tokens>=7000);}):[];
   if(!permitted.length)throw new Error('No priced production provider currently supports the required structured-output contract within its cost ceiling.');
   // A healthy catalog entry can still have no recent availability evidence.
   // Prefer measured uptime before catalog order; per-owner success can refine it.
   const uptime=(endpoint:any)=>{const samples=[endpoint.uptime_last_5m,endpoint.uptime_last_30m,endpoint.uptime_last_1d].filter(value=>typeof value==='number'&&Number.isFinite(value));return samples.length?samples.reduce((sum:number,value:number)=>sum+value,0)/samples.length:-1;};
   permitted.sort((a:any,b:any)=>uptime(b)-uptime(a));
   // Catalog floor prices can belong to an endpoint without JSON support. Reserve
   // the actual upper envelope of eligible endpoints, never an arbitrary model.
   models.set(id,{provider:'openrouter',model:id,paid:true,reasoningSupported:permitted.every((e:any)=>e.supported_parameters.includes('reasoning_effort')),inputUsdPerMillion:Math.max(...permitted.map((e:any)=>Number(e.pricing.prompt)))*1e6,outputUsdPerMillion:Math.max(...permitted.map((e:any)=>Number(e.pricing.completion)))*1e6,providerTags:[...new Set<string>(permitted.map((e:any)=>e.tag))],providerRoutes:Object.fromEntries(permitted.filter((e:any)=>typeof e.provider_name==='string'&&/^[A-Za-z0-9 ._/-]{1,120}$/.test(e.provider_name)).map((e:any)=>[e.tag,e.provider_name])),vision:found.architecture?.input_modalities?.includes('image')===true});
  }));catalog={expires:Date.now()+(models.size===PRODUCTION_MODELS.length?300000:30000),models};
 }
 return Object.fromEntries(modelRoles.flatMap(role=>{const model=catalog!.models.get(productionRoleModel(role));return model?[[role,{...model,...(role==='router'||role==='classifier'?{reasoningEnabled:false}:{}),reasoningEffort:role==='complex_reasoner'?'high':'low'}]]:[];})) as Partial<Record<AgentModelRole,AgentModelConfig>>;
}
