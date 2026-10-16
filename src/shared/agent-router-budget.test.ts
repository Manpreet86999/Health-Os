import test from 'node:test';
import assert from 'node:assert/strict';
import {AgentModelRouter} from '../integrations/ai/model-router.js';
import {z} from 'zod';
test('blank reasoning completion increases visible output budget without exposing internal reasoning',async()=>{
 const budgets:number[]=[],reserves:number[]=[];let attempts=0;
 const router=new AgentModelRouter({preferFree:false,allowPaid:true,dailyPaidLimitUsd:1,roles:{router:{provider:'openrouter',model:'fixture/paid',paid:true,inputUsdPerMillion:1,outputUsdPerMillion:2}}},{openrouter:'test'},{reserve:async(_id,maximum)=>{reserves.push(maximum);},settle:async()=>{}},async(_url,init)=>{budgets.push(JSON.parse(String(init?.body)).max_tokens);return Response.json({choices:[{finish_reason:attempts++?'stop':'length',message:{content:attempts===1?null:'{"ready":true}',reasoning:'Must never appear in the answer'}}]});});
 const reply=await router.run('budget-check','router',z.object({ready:z.boolean()}),[{role:'user',content:'Check readiness'}]);assert.deepEqual(budgets,[2000,7000]);assert.ok(reserves[1]>=.014);assert.equal(reply.result.ready,true);assert.doesNotMatch(JSON.stringify(reply),/Must never appear/);
});

test('classification can disable optional reasoning without disabling required verifier reasoning',async()=>{
 const requests:any[]=[];
 const router=new AgentModelRouter({preferFree:false,allowPaid:true,dailyPaidLimitUsd:1,allowedModels:['deepseek/deepseek-v4-flash-0731','z-ai/glm-5.3-flash'],roles:{router:{provider:'openrouter',model:'deepseek/deepseek-v4-flash-0731',paid:true,inputUsdPerMillion:.1,outputUsdPerMillion:.5,reasoningEnabled:false},verifier:{provider:'openrouter',model:'z-ai/glm-5.3-flash',paid:true,inputUsdPerMillion:.1,outputUsdPerMillion:.5,reasoningEffort:'low'}}},{openrouter:'synthetic-fixture'},{reserve:async()=>{},settle:async()=>{}},async(_url,init)=>{const request=JSON.parse(String(init?.body));requests.push(request);return Response.json({model:request.model,choices:[{message:{content:'{"ready":true}'}}]});});
 for(const role of ['router','verifier'] as const)await router.run('reasoning-control-'+role,role,z.object({ready:z.boolean()}),[{role:'user',content:'Synthetic check'}]);
 assert.deepEqual(requests[0].reasoning,{enabled:false,exclude:true});assert.deepEqual(requests[1].reasoning,{effort:'low',exclude:true});assert.ok(requests.every(r=>r.response_format.type==='json_schema'&&r.response_format.json_schema.strict));
});
