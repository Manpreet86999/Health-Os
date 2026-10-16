import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {AgentModelRouter} from '../integrations/ai/model-router.js';
import {PRIMARY_MODEL,PRODUCTION_MODELS,SUPPORTED_MODELS,productionModelStatus,productionRoleModel} from './intelligence/production-models.js';
import {modelRoles} from './intelligence/agent-contracts.js';
import {verifyGroundedResponse} from './intelligence/grounding.js';
const config={provider:'openrouter' as const,model:PRIMARY_MODEL,paid:true,inputUsdPerMillion:.22,outputUsdPerMillion:.88,reasoningSupported:false};
const policy={allowProvisional:true,preferFree:false,allowPaid:true,dailyPaidLimitUsd:5,allowedModels:PRODUCTION_MODELS,roles:Object.fromEntries(modelRoles.map(role=>[role,config]))};
const ledger={reserve:async()=>{},settle:async()=>{},readQualifications:async()=>[]};
test('only Qwen is active across roles; historical models remain supported and QUALIFIED is stronger',()=>{
 assert.deepEqual(PRODUCTION_MODELS,[PRIMARY_MODEL]);assert.equal(SUPPORTED_MODELS.length,3);
 for(const role of modelRoles){assert.equal(productionRoleModel(role),PRIMARY_MODEL);if(role==='vision')continue;assert.equal(productionModelStatus(PRIMARY_MODEL,role,[]),'PROVISIONAL');assert.equal(productionModelStatus(PRIMARY_MODEL,role,[{model:PRIMARY_MODEL,roles:[role]}]),'QUALIFIED');}
 assert.equal(productionModelStatus(PRIMARY_MODEL,'vision',[]),undefined);
});
test('explicit provisional admission reads qualification history but never invents qualifying evidence or sends unsupported reasoning controls',async()=>{
 let reads=0;const calls:any[]=[];
 const router=new AgentModelRouter(policy,{openrouter:'test'},{...ledger,readQualifications:async()=>{reads++;return [];}},async(_url,init)=>{calls.push(JSON.parse(String(init?.body)));return Response.json({model:PRIMARY_MODEL,choices:[{message:{content:'{"ok":true}'}}]});});
 assert.equal((await router.run('provisional','planner',z.object({ok:z.boolean()}),[])).result.ok,true);assert.equal(reads,1);assert.equal(calls.length,1);assert.equal(calls[0].model,PRIMARY_MODEL);assert.equal(calls[0].reasoning,undefined);assert.equal(calls[0].response_format.json_schema.strict,true);
});
test('provisional admission cannot activate historical models, skip unavailable history or admit a model without explicit server opt-in',async()=>{
 for(const candidate of [{...policy,allowProvisional:false},{...policy,roles:{router:{...config,model:SUPPORTED_MODELS[1]}},allowedModels:SUPPORTED_MODELS}]){
  const router=new AgentModelRouter(candidate,{openrouter:'test'},ledger,async()=>{throw Error('Unexpected provider call');});await assert.rejects(router.run('denied','router',z.object({ok:z.boolean()}),[]),/qualification gate/);
 }
 const router=new AgentModelRouter(policy,{openrouter:'test'},{...ledger,readQualifications:async()=>{throw Error('qualification unavailable');}},async()=>{throw Error('Unexpected provider call');});await assert.rejects(router.run('history','router',z.object({ok:z.boolean()}),[]),/qualification unavailable/);
});
test('provisional numerical hallucinations and invalid schemas fail closed with at most two attempts, retaining failures',async()=>{
 for(const content of ['{"summary":"Your HRV was 85 ms."}','{"wrongField":true}']){
  let calls=0;const failures:string[]=[];
  const router=new AgentModelRouter(policy,{openrouter:'test'},{...ledger,recordOutcome:async(_id,event)=>{failures.push(event.outcome);}},async()=>{calls++;return Response.json({model:PRIMARY_MODEL,choices:[{message:{content}}]});});
  await assert.rejects(router.run('invalid','fast_reasoner',z.object({summary:z.string()}).strict(),[],{validateResult:r=>{if(!verifyGroundedResponse(r.summary,[],[]).accepted)throw Object.assign(Error('Grounding verification failed'),{providerOutcome:'grounding_failure'});}}),/unavailable/);
  assert.equal(calls,2);assert.equal(failures.length,2);assert.ok(failures.every(f=>f=== (content.includes('85')?'grounding_failure':'schema_failure')));
 }
});
test('provisional mode preserves zero budget pause, cooldown, vision restrictions and unavailable fallback',async()=>{
 const history=[{provider:'openrouter' as const,model:PRIMARY_MODEL,role:'router' as const,at:new Date().toISOString(),outcome:'rate_limited' as const,latencyMs:1}];
 for(const [candidate,events,role] of [[{...policy,dailyPaidLimitUsd:0},[],'router'],[policy,history,'router'],[policy,[],'vision']] as const){
  let calls=0;const router=new AgentModelRouter(candidate,{openrouter:'test'},{...ledger,readHealth:async()=>[...events]},async()=>{calls++;throw Error('Unexpected call');});await assert.rejects(router.run('guard',role,z.object({ok:z.boolean()}),[]));assert.equal(calls,0);
 }
});
