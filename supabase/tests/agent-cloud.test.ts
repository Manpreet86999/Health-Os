import {modelQualificationFixture,modelEndpointsFixture} from './model-fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
const originalFetch=globalThis.fetch;
(globalThis as any).Deno={env:{get:(name:string)=>name==='SUPABASE_URL'?'https://cloud.test':'publishable'},serve:()=>{}};
const {handler}=await import('../functions/body-os-ai/index.ts');
const body=(action:string,extra:unknown={})=>new Request('https://cloud.test/functions/v1/body-os-ai',{method:'POST',headers:{Authorization:'Bearer owner-token'},body:JSON.stringify({action,...extra as any})});
const step={requestId:'test',phase:'reason',question:'Explain general recovery',power:'general',mode:'ask',policy:{mode:'none',domains:[],recordIds:[],date:'2026-10-11',research:'off'},conversation:[],toolResults:[],memories:[],attachments:[],consent:true};
const prefs={aiProvider:'openrouter',aiModel:'legacy/paid',openRouterApiKey:'SECRET'};
test('the provider schema requires a measurable initial durable plan and registered-tool fields before execution',async()=>{
 const calls:{url:string;data:any}[]=[];
 mock({responseType:'tools',summary:'Read existing goals before proposing a change.',toolCalls:[{name:'profile.get_goals',arguments:{}}],evidence:[],proposedActions:[],confidence:'high',needsEscalation:false,executionPlan:{successCriteria:[{id:'read',description:'Read owned goals',kind:'read',tool:'profile.get_goals',minimumCount:1}],assumptions:[],steps:[{id:'read',description:'Read goals',type:'read',tool:'profile.get_goals',dependsOn:[]}]}},calls);
 try{
  const response=await handler(body('/ai/agent-step',{...step,mode:'act',policy:{...step.policy,mode:'domains',domains:['goals']},currentTask:{role:'assistant',personal:true,domains:['goals'],sourceIds:[],content:'Create an owner-approved consistency goal.'}}));
  assert.equal(response.status,200);
  const format=calls.find(c=>c.url.includes('/chat/completions'))!.data.response_format;
  assert.equal(format.type,'json_schema');assert.equal(format.json_schema.strict,true);
  assert.ok(format.json_schema.schema.required.includes('executionPlan'));
  const variants=format.json_schema.schema.properties.executionPlan.properties.steps.items.oneOf;
  for(const variant of variants.filter((v:any)=>['read','action'].includes(v.properties.type.const)))assert.ok(variant.required.includes('tool'));
 }finally{globalThis.fetch=originalFetch;}
});
function mock(result:unknown,requests:{url:string;data:any}[]){globalThis.fetch=async(input,init)=>{const url=String(input),data=init?.body?JSON.parse(String(init.body)):null;requests.push({url,data});if(url.endsWith('/endpoints'))return Response.json(modelEndpointsFixture(new URL(url).pathname.slice('/api/v1/models/'.length,-'/endpoints'.length)));if(url.includes('/health_ai_model_qualification'))return Response.json(modelQualificationFixture());if(url.includes('/auth/v1/user'))return Response.json({id:'owner'});if(url.includes('/body_os_records'))return Response.json([{entity_type:'sharedPreferences',record_id:'shared-preferences',payload:prefs}]);if(url.endsWith('/models'))return Response.json({data:['qwen/qwen3-235b-a22b-2507','qwen/qwen3-235b-a22b-2507'].map(id=>({id,pricing:{prompt:'0.000000016',completion:'0.00000064'},supported_parameters:['response_format'],architecture:{input_modalities:['text']}}))});if(url.includes('/rpc/health_ai_provider_secret_get'))return Response.json('SECRET');if(url.includes('/rpc/'))return new Response(null,{status:204});return Response.json({choices:[{message:{content:data?.response_format?.json_schema?.name==='health_os_verifier'?JSON.stringify({approved:true,grounded:true,missingEvidence:[],unsupportedClaims:[],risk:'low',needsRevision:false}):typeof result==='string'?JSON.stringify({answer:result}):JSON.stringify(result)}}],usage:{total_tokens:100}});};}
test('authenticated Context=None sends no cloud profile, health rows, extra context or provider keys to the model',async()=>{const calls:{url:string;data:any}[]=[];mock({responseType:'analysis',summary:'General recovery guidance.',evidence:[],toolCalls:[],proposedActions:[],confidence:'medium',needsEscalation:false},calls);try{const response=await handler(body('/ai/agent-step',step));assert.equal(response.status,200);const request=calls.find(c=>c.url.includes('/chat/completions'))!.data;assert.equal(request.model,'qwen/qwen3-235b-a22b-2507');assert.equal(JSON.stringify(request).includes('SECRET'),false);const input=JSON.parse(request.messages[1].content);assert.deepEqual(input.policy.domains,[]);assert.deepEqual(input.toolResults,[]);assert.equal(Object.hasOwn(input,'context'),false);for(const c of calls.filter(c=>c.url.includes('/body_os_records')))assert.ok(c.url.includes('entity_type=in.(sharedPreferences)'));}finally{globalThis.fetch=originalFetch;}});
test('legacy biology coach no longer silently appends account context',async()=>{const calls:{url:string;data:any}[]=[];mock('Approved evidence only',calls);try{const response=await handler(body('/biology/coach',{question:'Explain',consent:true,evidence:{context:'none'}}));assert.equal(response.status,200);const payload=JSON.parse(calls.find(c=>c.url.includes('/chat/completions'))!.data.messages[1].content);assert.equal(Object.hasOwn(payload,'context'),false);assert.equal(Object.hasOwn(payload,'currentWorkout'),false);assert.equal(payload.evidence,'{"context":"none"}');}finally{globalThis.fetch=originalFetch;}});
test('server rejects a forged tool bundle that exceeds selected domains before invoking the provider',async()=>{const calls:{url:string;data:any}[]=[];mock({},calls);try{const response=await handler(body('/ai/agent-step',{...step,policy:{...step.policy,mode:'domains',domains:['care']},toolResults:[{name:'medical.get_reports',domains:['medical'],sourceIds:['private-report'],data:'private'}]}));assert.notEqual(response.status,200);assert.equal(calls.some(c=>c.url.includes('/chat/completions')),false);}finally{globalThis.fetch=originalFetch;}});
test('agent endpoint requires consent and authenticated ownership',async()=>{const calls:{url:string;data:any}[]=[];mock({},calls);try{assert.notEqual((await handler(body('/ai/agent-step',{...step,consent:false}))).status,200);assert.equal(calls.some(c=>c.url.includes('/chat/completions')),false);assert.equal((await handler(new Request('https://cloud.test',{method:'POST',body:'{}'}))).status,401);}finally{globalThis.fetch=originalFetch;}});

test('agent rejects an account switch before reading preferences or calling the provider',async()=>{const calls:{url:string;data:any}[]=[];mock({},calls);try{const response=await handler(body('/ai/agent-step',{...step,expectedOwnerId:'other-owner'}));assert.equal(response.status,403);assert.equal(calls.some(c=>c.url.includes('/body_os_records')||c.url.includes('/chat/completions')),false);}finally{globalThis.fetch=originalFetch;}});
test('a generic greeting after a verified action triggers bounded repair instead of losing the remaining goal',async()=>{
 const calls:{url:string;data:any}[]=[];
 const next={responseType:'plan',summary:'Preparing the remaining training consistency mission for your separate approval.',toolCalls:[],evidence:[],proposedActions:[{kind:'mission',name:'Training consistency',objective:'Track training consistency.'}],confidence:'high',needsEscalation:false};
 mock(next,calls);const base=globalThis.fetch,models:string[]=[];
 globalThis.fetch=async(input,init)=>{const data=init?.body?JSON.parse(String(init.body)):null;if(String(input).endsWith('/chat/completions')){models.push(data.model);if(models.length===1)return Response.json({model:data.model,choices:[{message:{content:JSON.stringify({...next,responseType:'clarification',summary:'I am ready to help. What would you like to explore or plan today?',proposedActions:[]})}}]});}return base(input,init);};
 try{
  const response=await handler(body('/ai/agent-step',{...step,mode:'act',question:'Create separate sleep consistency and training consistency missions, with an approval for each.',route:{intent:'Create both missions',domains:['goals'],taskType:'plan',complexity:1,requiresReasoning:true,requiresTools:true,requiresResearch:false,risk:'low'},policy:{...step.policy,mode:'domains',domains:['goals']},goalPlan:{successCriteria:[{id:'both',description:'Verify both approved missions',kind:'verified_action',tool:'create_mission',minimumCount:2}],assumptions:[],steps:[{id:'first',type:'action',description:'Create sleep consistency',tool:'create_mission',dependsOn:[]},{id:'second',type:'action',description:'Create training consistency',tool:'create_mission',dependsOn:['first']}]},toolResults:[{name:'action.verify',domains:[],sourceIds:['receipt-first'],data:{success:true,receiptId:'receipt-first',summary:'Saved sleep consistency mission.'}}]}));
  assert.equal(response.status,200);assert.equal((await response.json()).result.proposedActions[0].name,'Training consistency');assert.deepEqual(models,['qwen/qwen3-235b-a22b-2507','qwen/qwen3-235b-a22b-2507']);
 }finally{globalThis.fetch=originalFetch;}
});
test('incomplete initial multi-action plans are independently rejected, repaired and verified before any action',async()=>{
 const calls:{url:string;data:any}[]=[];
 const partial={responseType:'tools',summary:'Read owned goals.',toolCalls:[{name:'profile.get_goals',arguments:{}}],evidence:[],proposedActions:[],confidence:'high',needsEscalation:false,executionPlan:{successCriteria:[{id:'actions',description:'Create first mission',kind:'verified_action',tool:'create_mission',minimumCount:1}],assumptions:[],steps:[{id:'read',type:'read',description:'Read goals',tool:'profile.get_goals',dependsOn:[]},{id:'first',type:'action',description:'Create first mission',tool:'create_mission',dependsOn:['read']}]}};
 mock(partial,calls);const base=globalThis.fetch,providerCalls:any[]=[];let verifierCount=0;
 globalThis.fetch=async(input,init)=>{const data=init?.body?JSON.parse(String(init.body)):null;if(String(input).endsWith('/chat/completions')){providerCalls.push(data);const isVerifier=data.response_format.json_schema.name==='health_os_verifier';let result:any=partial;
   if(isVerifier){verifierCount++;const approved=verifierCount===2;result={approved,grounded:true,missingEvidence:[],unsupportedClaims:approved?[]:['The initial plan omits the requested second mission.'],risk:'low',needsRevision:!approved};}
   else if(providerCalls.length>=3)result={...partial,executionPlan:{...partial.executionPlan,successCriteria:[{...partial.executionPlan.successCriteria[0],description:'Create both requested missions',minimumCount:2}],steps:[...partial.executionPlan.steps,{id:'second',type:'action',description:'Create second mission',tool:'create_mission',dependsOn:['first']}]}};
   return Response.json({model:data.model,choices:[{message:{content:JSON.stringify(result)}}],usage:{total_tokens:100}});
  }return base(input,init);};
 try{
  const response=await handler(body('/ai/agent-step',{...step,mode:'act',question:'Create two separately approved consistency missions.',policy:{...step.policy,mode:'domains',domains:['goals']},currentTask:{role:'assistant',personal:true,domains:['goals'],sourceIds:[],content:'Create both missions.'}}));
  assert.equal(response.status,200);const output=await response.json();assert.equal(output.result.executionPlan.successCriteria[0].minimumCount,2);assert.equal(output.verification.approved,true);assert.equal(verifierCount,2);assert.deepEqual(providerCalls.map(c=>c.model),['qwen/qwen3-235b-a22b-2507','qwen/qwen3-235b-a22b-2507','qwen/qwen3-235b-a22b-2507','qwen/qwen3-235b-a22b-2507']);
  for(const verification of providerCalls.filter(c=>c.response_format.json_schema.name==='health_os_verifier')){const payload=JSON.parse(verification.messages[1].content);assert.equal(payload.goal,'Create two separately approved consistency missions.');assert.ok(payload.executionPlan);}
  assert.ok(!calls.some(c=>/health_action_commit|health_agent_run_save/.test(c.url)));
 }finally{globalThis.fetch=originalFetch;}
});

test('an approved flag cannot bypass unresolved evidence in initial plan verification',async()=>{
 const calls:{url:string;data:any}[]=[];
 const plan={responseType:'tools',summary:'Read goals before preparing a separately approved mission.',toolCalls:[{name:'profile.get_goals',arguments:{}}],evidence:[],proposedActions:[],confidence:'high',needsEscalation:false,executionPlan:{successCriteria:[{id:'goal',description:'Create the approved mission',kind:'verified_action',tool:'create_mission',minimumCount:1}],assumptions:['Existing goals have not been retrieved.'],steps:[{id:'read',type:'read',description:'Read owned goals',tool:'profile.get_goals',dependsOn:[]},{id:'create',type:'action',description:'Create consistency mission after separate approval',tool:'create_mission',dependsOn:['read']}]}};
 mock(plan,calls);const base=globalThis.fetch;let reviews=0;
 globalThis.fetch=async(input,init)=>{
  const payload=init?.body?JSON.parse(String(init.body)):null;
  if(String(input).endsWith('/chat/completions')&&payload.response_format.json_schema.name==='health_os_verifier'){
   reviews++;return Response.json({model:payload.model,choices:[{message:{content:JSON.stringify({approved:true,grounded:true,missingEvidence:['An unresolved constraint necessary to approve this plan.'],unsupportedClaims:[],risk:'low',needsRevision:false})}}],usage:{total_tokens:100}});
  }return base(input,init);
 };
 try{
  const response=await handler(body('/ai/agent-step',{...step,mode:'act',question:'Create a consistency mission with separate approval.',policy:{...step.policy,mode:'domains',domains:['goals']},currentTask:{role:'assistant',personal:true,domains:['goals'],sourceIds:[],content:'Create the approved mission.'}}));
  assert.notEqual(response.status,200);assert.equal(reviews,2);assert.ok(!calls.some(c=>/health_action_commit|health_agent_run_save/.test(c.url)));
 }finally{globalThis.fetch=originalFetch;}
});

test('post-write criteria drift is rejected inside bounded provider repair without losing the remaining goal',async()=>{
 const calls:{url:string;data:any}[]=[];
 const plan={successCriteria:[{id:'both',description:'Both separately approved goals verified',kind:'verified_action',tool:'create_mission',minimumCount:2}],assumptions:[],steps:[{id:'one',type:'action',description:'Create first goal',tool:'create_mission',dependsOn:[]},{id:'two',type:'action',description:'Create second goal',tool:'create_mission',dependsOn:['one']}]};
 const next={responseType:'plan',summary:'Prepare the remaining goal for separate approval.',toolCalls:[],evidence:[],proposedActions:[{kind:'mission',name:'Second consistency',objective:'Consistency'}],confidence:'high',needsEscalation:false};
 mock(next,calls);const base=globalThis.fetch;let attempts=0;
 globalThis.fetch=async(input,init)=>{
  const data=init?.body?JSON.parse(String(init.body)):null;
  if(String(input).endsWith('/chat/completions')){attempts++;if(attempts===1)return Response.json({model:data.model,choices:[{message:{content:JSON.stringify({...next,executionPlan:{...plan,successCriteria:[{...plan.successCriteria[0],minimumCount:1}]}})}}],usage:{total_tokens:100}});}
  return base(input,init);
 };
 try{
  const response=await handler(body('/ai/agent-step',{...step,mode:'act',question:'Create two consistency goals with separate approvals.',policy:{...step.policy,mode:'domains',domains:['goals']},goalPlan:plan,toolResults:[{name:'action.verify',domains:[],sourceIds:['first-receipt'],data:{success:true,receiptId:'first-receipt'}}]}));
  assert.equal(response.status,200);const output=await response.json();assert.equal(output.result.proposedActions[0].name,'Second consistency');assert.equal(output.result.executionPlan,undefined);assert.equal(attempts,2);assert.ok(!calls.some(c=>/health_action_commit|health_agent_run_save/.test(c.url)));
 }finally{globalThis.fetch=originalFetch;}
});

test('rewriting a completed read triggers bounded repair before any action is proposed',async()=>{
 const calls:{url:string;data:any}[]=[];
 const plan={successCriteria:[{id:'goal',description:'Approved goal verified',kind:'verified_action',tool:'create_mission',minimumCount:1}],assumptions:[],steps:[{id:'read',type:'read',description:'Read owned active goals',tool:'goals.get_active',dependsOn:[]},{id:'write',type:'action',description:'Create goal with separate approval',tool:'create_mission',dependsOn:['read']}]};
 const next={responseType:'plan',summary:'Prepare the consistency goal for separate approval.',toolCalls:[],evidence:[],proposedActions:[{kind:'mission',name:'Consistency',objective:'Consistency'}],confidence:'high',needsEscalation:false};
 mock(next,calls);const base=globalThis.fetch;let attempts=0;
 globalThis.fetch=async(input,init)=>{
  const data=init?.body?JSON.parse(String(init.body)):null;
  if(String(input).endsWith('/chat/completions')){attempts++;if(attempts===1)return Response.json({model:data.model,choices:[{message:{content:JSON.stringify({...next,executionPlan:{...plan,steps:[{...plan.steps[0],description:'A rewritten completed read'},plan.steps[1]]}})}}],usage:{total_tokens:100}});}
  return base(input,init);
 };
 try{
  const response=await handler(body('/ai/agent-step',{...step,mode:'act',question:'Create a separately approved consistency goal.',policy:{...step.policy,mode:'domains',domains:['goals']},goalPlan:plan,completedGoalStepIds:['read']}));
  assert.equal(response.status,200);const output=await response.json();assert.equal(output.result.executionPlan,undefined);assert.equal(attempts,2);assert.equal(output.result.proposedActions[0].name,'Consistency');assert.ok(calls.some(c=>c.url.includes('/chat/completions')&&c.data.messages.some((m:any)=>m.content.includes('Retain completedGoalStepIds'))));assert.ok(!calls.some(c=>/health_action_commit|health_agent_run_save/.test(c.url)));
 }finally{globalThis.fetch=originalFetch;}
});

test('independent route review retains the original primary decision so corrections cannot qualify it silently',async()=>{
 const calls:{url:string;data:any}[]=[];
 const primary={intent:'Training decision',domains:['training','sleep'],taskType:'analyze',complexity:2,requiresReasoning:true,requiresTools:true,requiresResearch:false,risk:'low'};
 mock(primary,calls);const base=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  const data=init?.body?JSON.parse(String(init.body)):null;
  if(String(input).endsWith('/chat/completions')&&data.response_format.json_schema.name==='health_os_verifier')return Response.json({model:data.model,choices:[{message:{content:JSON.stringify({...primary,domains:['training','sleep','recovery']})}}],usage:{total_tokens:100}});
  return base(input,init);
 };
 try{
  const response=await handler(body('/ai/agent-step',{...step,phase:'route',question:'Should poor sleep change my training?',policy:{...step.policy,mode:'domains',domains:['training','sleep','recovery']}}));
  assert.equal(response.status,200);const result=await response.json();assert.deepEqual(result.routingReview.primary.domains,['training','sleep']);assert.deepEqual(result.result.domains,['training','sleep','recovery']);assert.deepEqual(result.routingReview.reviewed,result.result);assert.equal(result.usage[0].model,'qwen/qwen3-235b-a22b-2507');assert.equal(result.usage.at(-1).model,'qwen/qwen3-235b-a22b-2507');assert.ok(!calls.some(c=>/health_action_commit|health_agent_run_save/.test(c.url)));
 }finally{globalThis.fetch=originalFetch;}
});
