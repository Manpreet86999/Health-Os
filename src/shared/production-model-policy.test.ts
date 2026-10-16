import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {routeSchema} from './intelligence/agent-contracts.js';
import {verifyGroundedResponse} from './intelligence/grounding.js';
import {AgentModelRouter} from '../integrations/ai/model-router.js';
// Historical stack coverage remains for future restoration; active Qwen policy has separate tests.
const PRIMARY_MODEL='deepseek/deepseek-v4-flash-0731',SECONDARY_MODEL='z-ai/glm-5.3-flash';
const PRODUCTION_MODELS=[PRIMARY_MODEL,SECONDARY_MODEL];
const priced=(model:string)=>({provider:'openrouter' as const,model,paid:true,inputUsdPerMillion:.1,outputUsdPerMillion:1,reasoningEffort:'low' as const});
const roles={router:priced(PRIMARY_MODEL),fast_reasoner:priced(PRIMARY_MODEL),general_reasoner:priced(PRIMARY_MODEL),verifier:priced(SECONDARY_MODEL),fallback:priced(SECONDARY_MODEL)};
const policy={preferFree:false,allowPaid:true,dailyPaidLimitUsd:5,roles,allowedModels:PRODUCTION_MODELS,minimumConfidence:'medium' as const};
const ledger={reserve:async()=>{},settle:async()=>{}};
test('grounding failure stays inside bounded model repair and falls back without accepting an invented HRV',async()=>{
 const calls:string[]=[],outcomes:string[]=[];
 const router=new AgentModelRouter(policy,{openrouter:'test'},{...ledger,recordOutcome:async(_id,attempt)=>{outcomes.push(attempt.outcome);}},async(_url,init)=>{const model=JSON.parse(String(init?.body)).model;calls.push(model);return Response.json({choices:[{message:{content:JSON.stringify({summary:model===PRIMARY_MODEL?'Your HRV was 85 ms.':'HRV is unavailable.'})}}]});});
 const result=await router.run('grounding-repair','fast_reasoner',z.object({summary:z.string()}),[],{validateResult:result=>{const checked=verifyGroundedResponse(result.summary,[],[]);if(!checked.accepted)throw Object.assign(new Error('Grounding failed: '+checked.errors.join(' ')),{providerOutcome:'grounding_failure'});}});
 assert.equal(result.result.summary,'HRV is unavailable.');assert.deepEqual(calls,[PRIMARY_MODEL,PRIMARY_MODEL,SECONDARY_MODEL]);assert.deepEqual(outcomes,['grounding_failure','grounding_failure','valid']);
});
test('classification repair retains the route contract rather than asking the fallback to select tools',async()=>{
 const calls:any[]=[],route={intent:'Retrieve owned product details',domains:['care'],taskType:'lookup',complexity:0,requiresReasoning:false,requiresTools:true,requiresResearch:false,risk:'low'};
 const router=new AgentModelRouter(policy,{openrouter:'test'},ledger,async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body);return Response.json({choices:[{message:{content:JSON.stringify({...route,intent:calls.length===1?'x'.repeat(121):route.intent})}}]});});
 const answer=await router.run('route-repair','router',routeSchema,[{role:'system',content:'Classify only. Return the supplied route schema.'}]);
 assert.deepEqual(answer.result,route);assert.equal(calls.length,2);
 const repair=calls[1].messages.at(-1).content;assert.match(repair,/ORIGINAL supplied schema and stage/);assert.doesNotMatch(repair,/Each toolCalls|Select tools/);
});
test('server credentials cannot leave through request context or reflected provider output',async()=>{
 const credential='synthetic-server-only-credential';let calls=0,reservations=0;
 const router=new AgentModelRouter(policy,{openrouter:credential},{reserve:async()=>{reservations++;},settle:async()=>{}},async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify({value:credential})}}]});});
 await assert.rejects(router.run('secret-input','router',z.object({value:z.string()}),[{role:'user',content:credential}]),/withheld before provider access/);
 assert.equal(calls,0);assert.equal(reservations,0);
 await assert.rejects(router.run('secret-output','router',z.object({value:z.string()}),[]),/response was withheld/);
 assert.equal(calls,4);
});
test('production allowlist excludes historical free models and verifier/fallback select only GLM',()=>{const router=new AgentModelRouter({...policy,roles:{...roles,fast_reasoner:{provider:'openrouter',model:'openrouter/free',paid:false}}},{openrouter:'test'},ledger);assert.ok(router.candidates('fast_reasoner').every(c=>PRODUCTION_MODELS.includes(c.config.model as any)));assert.deepEqual(router.candidates('fallback').map(c=>c.config.model),[SECONDARY_MODEL]);assert.deepEqual(router.candidates('verifier').map(c=>c.config.model),[SECONDARY_MODEL]);});
test('DeepSeek malformed output gets one bounded repair then only GLM, with price ceilings',async()=>{const calls:any[]=[];const router=new AgentModelRouter(policy,{openrouter:'test'},ledger,async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body);return Response.json({choices:[{message:{content:body.model===PRIMARY_MODEL?'invalid-json':'{"ok":true}'}}]});});await router.run('test','router',z.object({ok:z.boolean()}),[]);assert.deepEqual(calls.map(c=>c.model),[PRIMARY_MODEL,PRIMARY_MODEL,SECONDARY_MODEL]);assert.deepEqual(calls[0].provider.max_price,{prompt:.1,completion:1,request:0});});
test('bounded repair excludes the failed endpoint while staying within the same permitted model',async()=>{
 const calls:any[]=[];const configuration={...roles.router,providerTags:['bad/fp4','good'],providerRoutes:{'bad/fp4':'Bad Provider',good:'Good Provider'}};
 const router=new AgentModelRouter({...policy,roles:{...roles,classifier:configuration}},{openrouter:'test'},ledger,async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body);return Response.json({provider:calls.length===1?'Bad Provider':'Good Provider',model:PRIMARY_MODEL,choices:[{message:{content:calls.length===1?'```json\n{"ok":true}\n```':'{"ok":true}'}}]});});
 await router.run('endpoint-repair','router',z.object({ok:z.boolean()}),[]);assert.deepEqual(calls.map(c=>c.model),[PRIMARY_MODEL,PRIMARY_MODEL]);assert.deepEqual(calls[0].provider.only,['bad/fp4','good']);assert.deepEqual(calls[1].provider.only,['good']);
});
test('recent endpoint failures cannot escape the provider allowlist when every primary endpoint is blocked',async()=>{
 const calls:any[]=[];const configuration={...roles.router,providerTags:['bad/fp4'],providerRoutes:{'bad/fp4':'Bad Provider'}};
 const history=Array.from({length:2},(_,i)=>({provider:'openrouter' as const,model:PRIMARY_MODEL,role:'classifier' as const,providerRoute:'Bad Provider',at:new Date(Date.now()-i*1000).toISOString(),outcome:'semantic_failure' as const,latencyMs:20}));
 const router=new AgentModelRouter({...policy,roles:{...roles,classifier:configuration}},{openrouter:'test'},{...ledger,readHealth:async()=>history},async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body);return Response.json({model:SECONDARY_MODEL,choices:[{message:{content:'{"ok":true}'}}]});});
 await router.run('endpoint-cooldown','router',z.object({ok:z.boolean()}),[]);assert.deepEqual(calls.map(c=>c.model),[SECONDARY_MODEL]);
});
test('observed endpoint role success outranks price order without bypassing model qualification',async()=>{
 const configuration={...roles.router,providerTags:['cheap','reliable'],providerRoutes:{cheap:'Cheap',reliable:'Reliable'}};
 const history=[{provider:'openrouter' as const,model:PRIMARY_MODEL,role:'classifier' as const,providerRoute:'Cheap',at:new Date().toISOString(),outcome:'schema_failure' as const,latencyMs:5},...Array.from({length:3},(_,i)=>({provider:'openrouter' as const,model:PRIMARY_MODEL,role:'classifier' as const,providerRoute:'Reliable',at:new Date(Date.now()-i*1000).toISOString(),outcome:'valid' as const,latencyMs:20}))];
 let observed:any;const router=new AgentModelRouter({...policy,roles:{...roles,classifier:configuration}},{openrouter:'test'},{...ledger,readHealth:async()=>history,readQualifications:async()=>[{model:PRIMARY_MODEL,roles:['classifier']}]},async(_url,init)=>{observed=JSON.parse(String(init?.body));return Response.json({model:PRIMARY_MODEL,provider:'Reliable',choices:[{message:{content:'{"ok":true}'}}]});});
 await router.run('quality-order','router',z.object({ok:z.boolean()}),[]);assert.deepEqual(observed.provider.only,['cheap','reliable']);assert.deepEqual(observed.provider.order,['reliable','cheap']);assert.equal(observed.model,PRIMARY_MODEL);
});
test('DeepSeek timeout falls back to GLM and both failures remain honest',async()=>{const calls:string[]=[];const router=new AgentModelRouter(policy,{openrouter:'test'},ledger,async(_url,init)=>{calls.push(JSON.parse(String(init?.body)).model);throw Object.assign(new Error('provider timeout'),{name:'TimeoutError'});});await assert.rejects(router.run('test','router',z.object({ok:z.boolean()}),[]),/unavailable/);assert.deepEqual(calls,[PRIMARY_MODEL,SECONDARY_MODEL]);});
test('an expired overall request deadline makes no reservation or provider call',async()=>{
 let calls=0,reservations=0;
 const router=new AgentModelRouter({...policy,deadlineAt:Date.now()-1},{openrouter:'test'},{reserve:async()=>{reservations++;},settle:async()=>{}},async()=>{calls++;throw new Error('Unexpected provider call.');});
 await assert.rejects(router.run('expired','router',z.object({ok:z.boolean()}),[]),/bounded model request deadline/);assert.equal(calls,0);assert.equal(reservations,0);
});
test('low confidence triggers bounded GLM escalation instead of an unqualified answer',async()=>{const calls:string[]=[];const router=new AgentModelRouter(policy,{openrouter:'test'},ledger,async(_url,init)=>{const model=JSON.parse(String(init?.body)).model;calls.push(model);return Response.json({choices:[{message:{content:JSON.stringify({confidence:model===PRIMARY_MODEL?'low':'high'})}}]});});const reply=await router.run('test','fast_reasoner',z.object({confidence:z.enum(['low','high'])}),[]);assert.equal(reply.result.confidence,'high');assert.equal(calls.at(-1),SECONDARY_MODEL);assert.ok(calls.length<=3);});
test('a low-confidence GLM result is also bounded and cannot be treated as qualified success',async()=>{let calls=0;const router=new AgentModelRouter(policy,{openrouter:'test'},ledger,async()=>{calls++;return Response.json({choices:[{message:{content:'{"confidence":"low"}'}}]});});await assert.rejects(router.run('low','fast_reasoner',z.object({confidence:z.literal('low')}),[]),/confidence below policy threshold/);assert.equal(calls,4);});
test('a final GLM escalation request cannot be reported as successful reasoning',async()=>{
 let calls=0;const router=new AgentModelRouter(policy,{openrouter:'test'},ledger,async()=>{calls++;return Response.json({choices:[{message:{content:'{"confidence":"high","needsEscalation":true}'}}]});});
 await assert.rejects(router.run('escalation','fast_reasoner',z.object({confidence:z.literal('high'),needsEscalation:z.literal(true)}),[]),/Model requested escalation/);assert.equal(calls,4);
});
test('invalid provider JSON never copies a response fragment into failure telemetry',async()=>{
 const saved:any[]=[];const router=new AgentModelRouter(policy,{openrouter:'test'},{...ledger,settle:async(_id,usage)=>{saved.push(usage);}},async()=>Response.json({choices:[{message:{content:'Private diagnosis fragment is not JSON'}}]}));
 await assert.rejects(router.run('private-error','fast_reasoner',z.object({answer:z.string()}),[]),error=>{assert.ok(!(error as Error).message.includes('Private diagnosis'));return true;});
 assert.ok(!JSON.stringify(saved).includes('Private diagnosis'));
});
test('fresh qualification evidence is required per assigned role in production',async()=>{let calls=0;const unqualified=new AgentModelRouter(policy,{openrouter:'test'},{...ledger,readQualifications:async()=>[]},async()=>{calls++;throw new Error('Must not call');});await assert.rejects(unqualified.run('gate','router',z.object({ok:z.boolean()}),[]),/qualification gate/);assert.equal(calls,0);const fallback=new AgentModelRouter(policy,{openrouter:'test'},{...ledger,readQualifications:async()=>[{model:SECONDARY_MODEL,roles:['fallback']}]},async(_url,init)=>{assert.equal(JSON.parse(String(init?.body)).model,SECONDARY_MODEL);return Response.json({choices:[{message:{content:'{"ok":true}'}}]});});assert.equal((await fallback.run('qualified-fallback','router',z.object({ok:z.boolean()}),[])).result.ok,true);});
