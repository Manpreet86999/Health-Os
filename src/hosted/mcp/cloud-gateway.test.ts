import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudActionGateway,CloudBackendUnavailable,compactHealthSamples} from './cloud-gateway.js';
import {DEFAULT_SUPABASE_CONFIG} from '../../shared/supabase-project.js';
import {bioSchema,type BioRecord} from '../../shared/biology.js';
import {recordFood,recalculate,serializeItems} from '../../shared/food-intelligence.js';
import type {SupabaseAccountSession} from '../../shared/supabase-auth.js';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
function fixture(extraWorkspace:any[]=[]){
 const rows:BioRecord[]=[],requests:URL[]=[],workspaceRequests:any[]=[],biologyRequests:any[]=[],session:SupabaseAccountSession={uid:owner,email:'test@example.test',accessToken:'owner-token',refreshToken:'test-refresh',expiresAt:Date.now()+100000,config:DEFAULT_SUPABASE_CONFIG};let commits=0,failVerification=false,forceConflict=false,foreign=false;const cloudRevisions=new Map<string,number>();
 const seed=(r:any)=>{const now=new Date().toISOString();const value=bioSchema.parse({id:crypto.randomUUID(),userId:owner,deviceId:'test',source:'test',quality:'manual',revision:1,syncState:'saved',createdAt:now,updatedAt:now,timestamp:now,unit:'',metadata:{},...r});rows.push(value);return value;};
 const fetcher:typeof fetch=async(url,init)=>{const uri=new URL(String(url));requests.push(uri);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer owner-token');
  if(uri.pathname.endsWith('/rpc/health_os_commit_biological_records')){const b=JSON.parse(String(init?.body));if(forceConflict)return Response.json({code:'40001'},{status:409});for(const e of b.p_expectations)assert.equal(cloudRevisions.get(e.id)??rows.find(r=>r.id===e.id)?.revision??null,e.revision);const saved=b.p_writes.map((r:any)=>bioSchema.parse(r));for(const r of saved){const old=rows.find(row=>row.id===r.id);if(old)Object.assign(old,r);else rows.push(r);const expected=b.p_expectations.find((e:any)=>e.id===r.id);cloudRevisions.set(r.id,(expected.revision??0)+1);}commits++;return Response.json({records:saved});}
  if(uri.pathname.endsWith('/rpc/health_os_mcp_workspace_page')){workspaceRequests.push(JSON.parse(String(init?.body)));return Response.json([]);}
  if(uri.pathname.endsWith('/body_os_records'))return Response.json(extraWorkspace.filter(r=>String(uri.searchParams.get('entity_type')).includes(r.entity_type)));
  if(uri.pathname.endsWith('/health_os_biological_records')||uri.pathname.endsWith('/rpc/health_os_mcp_biology_page')){
   const projected=uri.pathname.endsWith('/rpc/health_os_mcp_biology_page')?JSON.parse(String(init?.body)):undefined;if(projected)biologyRequests.push(projected);const filter=projected?.p_after?'gt.'+projected.p_after:uri.searchParams.get('record_id')||'';if(failVerification&&filter.startsWith('in.'))throw new TypeError('verification network unavailable');
   let selected=rows.filter(r=>r.userId===owner);if(filter.startsWith('eq.'))selected=selected.filter(r=>r.id===filter.slice(3));else if(filter.startsWith('in.'))selected=selected.filter(r=>filter.slice(4,-1).split(',').includes(r.id));else if(filter.startsWith('gt.'))selected=selected.filter(r=>r.id>filter.slice(3));selected.sort((a,b)=>a.id.localeCompare(b.id));if(foreign)selected=[seed({userId:other,type:'vital',domain:'Body',name:'Weight',value:99,unit:'kg',metadata:{metric:'Weight'}})];return Response.json(selected.map(r=>({user_id:r.userId,record_id:r.id,revision:cloudRevisions.get(r.id)??r.revision,payload:r})));
  }throw new Error('Unexpected fixed API route');
 };
 const gateway=new CloudActionGateway(fetcher),context={userId:owner,clientId:crypto.randomUUID(),scopes:['body.read','body.write','nutrition.read','nutrition.write','recovery.read','recovery.write','sleep.read','sleep.write','intelligence.read','health.read','training.read','goals.read'],timeZone:'Asia/Kolkata',authorize:()=>{}};
 const call=(action:any,input:any,receiptId=crypto.randomUUID())=>gateway.execute({id:crypto.randomUUID(),action,input,receiptId},session,context);
 return {rows,seed,session,context,call,commits:()=>commits,requests,workspaceRequests,biologyRequests,failVerification:()=>failVerification=true,conflict:()=>forceConflict=true,foreign:()=>foreign=true,distinctRevisions:()=>{for(const r of rows)cloudRevisions.set(r.id,r.revision+8);}};
}
test('cloud weight write atomically creates ordinary records and a verified receipt without a device',async()=>{
 const f=fixture(),receipt=crypto.randomUUID(),input={weight:75,unit:'kg',date:'2026-10-12',idempotencyKey:'gateway-weight-001'},first=await f.call('body.log_weight',input,receipt);assert.equal(first.success,true);assert.equal(first.execution?.executor,'cloud');assert.equal(first.execution?.verified,true);assert.equal(f.rows.filter(r=>r.type==='vital').length,1);const saved=f.rows.find(r=>r.type==='vital')!;assert.equal(saved.timestamp,'2026-10-12T06:30:00.000Z');const audit=f.rows.find(r=>r.metadata.mcpReceipt)!;assert.equal(audit.metadata.verificationStatus,'verified');assert.equal(audit.metadata.clientId,f.context.clientId);assert.equal(audit.metadata.executor,'cloud');assert.equal(audit.userId,owner);assert.equal(JSON.parse(String(audit.metadata.result)).actionReceiptId,receipt);
 await f.call('body.log_weight',input,receipt);assert.equal(f.rows.filter(r=>r.type==='vital').length,1);
});
test('cloud R0 reads use synchronized data and expose no broker/private credentials',async()=>{
 const f=fixture();f.seed({type:'vital',domain:'Body',name:'Weight',value:75,unit:'kg',metadata:{metric:'Weight'}});const result=await f.call('body.get_weight_trend',{});assert.equal(result.data.latest.weight,75);assert.equal(result.execution?.source,'synchronized');assert.equal(f.commits(),0);assert.ok(!JSON.stringify(result).includes('owner-token'));assert.ok(f.requests.every(r=>r.pathname.includes('/rpc/health_os_mcp_')||r.searchParams.get('user_id')==='eq.'+owner));
});
test('cloud gateway denies other owners, missing scopes, device writes and malformed model authority',async()=>{
 const f=fixture();await assert.rejects(f.call('body.log_weight',{weight:75,idempotencyKey:'invalid-owner-001',user_id:other}),/schema/);f.context.scopes=[];await assert.rejects(f.call('body.log_weight',{weight:75,idempotencyKey:'missing-scope-001'}),/authorization/);await assert.rejects(f.call('training.start_workout',{idempotencyKey:'requires-device-001'}),/device/);assert.equal(f.rows.length,0);
});
test('foreign synchronized rows cannot be used even when an upstream endpoint misbehaves',async()=>{
 const f=fixture();f.foreign();await assert.rejects(f.call('body.get_weight_trend',{}),/owner/);
});
test('unresolved food requests never create guessed macros',async()=>{
 const f=fixture();await assert.rejects(f.call('nutrition.log_natural_language',{text:'some unknown mystery-food',meal:'Lunch',idempotencyKey:'unknown-food-001'}),/Review the food/);assert.equal(f.commits(),0);
});
test('saved usual meals preserve Food Intelligence authoritative provenance in the cloud',async()=>{
 const f=fixture(),record=f.seed({type:'food',domain:'Eat',name:'Yogurt',value:100,unit:'g',source:'Verified saved label',metadata:{calories:80,protein:10}}),food=recordFood(record),item=recalculate({id:'food-item',name:food.name,foodId:food.id,food,amount:200,unit:'g',confirmed:true,identityConfidence:1,portionConfidence:1,alternatives:[],snapshot:{},profile:null});
 const template=f.seed({type:'routine',domain:'Eat',name:'Usual breakfast',metadata:{subtype:'foodTemplate',meal:'Breakfast',foodItems:serializeItems([item])}});await f.call('nutrition.log_usual_meal',{templateId:template.id,meal:'Breakfast',idempotencyKey:'usual-cloud-001'});const meal=f.rows.find(r=>r.type==='meal')!;assert.equal(meal.metadata.protein,20);assert.match(String(meal.metadata.foodItems),/Verified saved label/);
});
test('cloud conflict and post-commit verification failure never report success or allow unsafe fallback',async()=>{
 const conflicted=fixture();conflicted.conflict();await assert.rejects(conflicted.call('body.log_weight',{weight:75,idempotencyKey:'conflicted-weight-001'}),/changed/);assert.equal(conflicted.rows.length,0);
 const uncertain=fixture();uncertain.failVerification();try{await uncertain.call('body.log_weight',{weight:75,idempotencyKey:'verify-weight-001'});assert.fail('Verification should fail');}catch(error){assert.ok(error instanceof CloudBackendUnavailable);assert.equal(error.safeToFallback,false);}assert.equal(uncertain.rows.filter(r=>r.type==='vital').length,1);assert.equal(uncertain.rows.find(r=>r.metadata.mcpReceipt)!.metadata.verificationStatus,'pending');
});
test('authorization is rechecked before a cloud transaction and before result delivery',async()=>{
 const f=fixture();let checks=0;f.context.authorize=()=>{if(++checks>=2)throw new Error('client revoked');};await assert.rejects(f.call('body.log_weight',{weight:75,idempotencyKey:'revoked-weight-001'}),/revoked/);assert.equal(f.rows.length,0);
});

test('Today cloud reads bound dated workspace and biology before pagination, preserving durable records',async()=>{
 const f=fixture();f.context.scopes.push('today.read');await f.call('health.get_today',{date:'2026-10-12'});
 const workspace=f.workspaceRequests[0];
 const biology=f.biologyRequests[0];
 assert.equal(workspace.p_from,'2026-07-07');
 assert.equal(workspace.p_through,'2026-10-12');
 assert.equal(workspace.p_time_zone,'Asia/Kolkata');assert.ok(!('user_id' in workspace));
 assert.ok(biology.p_types.includes('nutritionTarget'));assert.ok(biology.p_types.includes('mealPlan'));
 assert.equal(biology.p_from,'2026-07-06T00:00:00.000Z');
 assert.equal(biology.p_until,'2026-10-14T00:00:00.000Z');
 assert.equal(f.commits(),0);
});

test('Explicit long cloud analysis keeps the requested history rather than narrowing to Today',async()=>{
 const f=fixture();await f.call('intelligence.analyze_period',{date:'2026-10-12',days:366});
 const workspace=f.workspaceRequests[0];
 assert.equal(workspace.p_from,'2025-10-11');
});

test('Weight trend does not load unrelated workspace history or the nutrition catalog',async()=>{
 const f=fixture();await f.call('body.get_weight_trend',{date:'2026-10-12'});
 const workspace=f.workspaceRequests[0];
 const biology=f.requests.find(r=>r.pathname.endsWith('/health_os_biological_records'))!;
 assert.deepEqual(workspace.p_types,['profile']);
 assert.equal(biology.searchParams.get('mcp_record_type'),'in.(vital)');
 assert.equal(biology.searchParams.get('mcp_metric'),'eq.Weight');
});

test('cloud canonical exercise search retrieves actual owned library IDs without unrelated biological history',async()=>{
 const stamp=new Date().toISOString(),f=fixture([{user_id:owner,entity_type:'exercise',record_id:'owned-library-exercise',payload:{id:'owned-library-exercise',name:'Owned row',muscles:['back'],equipment:'dumbbell',trackingMode:'reps'},updated_at:stamp,cloud_updated_at:stamp,revision:1,device_id:'test'}]);
 const result=await f.call('training.search_exercises',{query:'Owned'});
 assert.equal((result.data as any[])[0].id,'owned-library-exercise');assert.equal(f.biologyRequests.length,0);assert.equal(f.requests.some(r=>r.pathname.endsWith('/health_os_biological_records')),false);
 const library=f.requests.find(r=>r.pathname.endsWith('/body_os_records'))!;assert.equal(library.searchParams.get('user_id'),'eq.'+owner);assert.match(library.searchParams.get('entity_type')!,/exercise/);
});

test('cloud preferences expose only health preference fields and never provider secrets',async()=>{
 const stamp=new Date().toISOString(),f=fixture([{user_id:owner,entity_type:'sharedPreferences',record_id:'shared-preferences',payload:{trainingStyle:'strength',aiApiKey:'must-never-leave-context',openRouterApiKey:'another-secret'},updated_at:stamp,cloud_updated_at:stamp,revision:1,device_id:'test'}]);
 const result=await f.call('profile.get_preferences',{});assert.equal((result.data as any).fields.trainingStyle,'strength');assert.doesNotMatch(JSON.stringify(result),/must-never-leave-context|another-secret|aiApiKey|openRouterApiKey/);
});

test('cloud medication reads include durable recorded schedules and stay isolated from nutrition',async()=>{
 const f=fixture();f.context.scopes.push('medical.read');f.seed({type:'medication',domain:'Health',name:'Recorded prescription',timestamp:'2025-01-01T12:00:00Z',metadata:{notes:'As recorded; not treatment advice'}});
 const result=await f.call('medical.get_medications',{});assert.equal((result.data as any[]).length,1);const query=f.requests.find(r=>r.pathname.endsWith('/health_os_biological_records'))!;assert.equal(query.searchParams.get('mcp_record_type'),'in.(medication)');assert.match(query.searchParams.get('or')!,/medication/);
});

test('Summary reads exclude unreferenced food and recipe catalog entries',async()=>{
 const f=fixture();f.context.scopes.push('today.read');await f.call('health.get_today',{});
 const biology=f.biologyRequests[0];assert.ok(!biology.p_types.includes('food'));assert.ok(!biology.p_types.includes('recipe'));
});


test('Cloud reads accept independently versioned device payload and server sync envelopes',async()=>{
 const f=fixture();f.seed({type:'vital',domain:'Body',name:'Weight',value:75,unit:'kg',metadata:{metric:'Weight'}});f.distinctRevisions();
 const result=await f.call('body.get_weight_trend',{});assert.equal(result.success,true);assert.equal(result.data.latest.weight,75);assert.equal(f.commits(),0);
});


test('Replaying a cloud receipt uses server revisions for CAS when device revisions differ',async()=>{
 const f=fixture(),receipt=crypto.randomUUID(),input={weight:75,unit:'kg',idempotencyKey:'independent-revisions-001'};
 await f.call('body.log_weight',input,receipt);f.distinctRevisions();
 const replay=await f.call('body.log_weight',input,receipt);assert.equal(replay.success,true);assert.equal(f.rows.filter(r=>r.type==='vital').length,1);
});


test('Latest sleep uses one ordered sleep row and cannot load unrelated training history',async()=>{
 const f=fixture();f.seed({type:'sleep',domain:'Recover',name:'Sleep',value:8,unit:'hours'});
 const result=await f.call('sleep.get_latest',{});assert.equal(result.success,true);assert.equal(result.data.value,8);
 const workspace=f.workspaceRequests[0];assert.deepEqual(workspace.p_types,['profile']);
 const biology=f.requests.find(r=>r.pathname.endsWith('/health_os_biological_records'))!;assert.equal(biology.searchParams.get('limit'),'1');assert.equal(biology.searchParams.get('mcp_record_type'),'eq.sleep');assert.match(biology.searchParams.get('order')!,/timestamp.desc/);
});


test('Imported samples compact by source, kind and local day without summing or losing timezone boundaries',()=>{
 const sample=(id:string,startTime:string,source='Watch A',kind='Steps',value=10)=>({user_id:owner,entity_type:'healthReading',record_id:id,change_version:Number(id),payload:{kind,source,startTime,value}});
 const rows=[sample('1','2026-10-12T17:00:00Z'),sample('2','2026-10-12T18:00:00Z','Watch A','Steps',20),sample('3','2026-10-12T19:00:00Z','Watch A','Steps',30),sample('4','2026-10-12T19:00:00Z','Watch B'),sample('5','2026-10-12T19:00:00Z','Watch A','Weight'),{entity_type:'readiness',record_id:'check',change_version:6,payload:{date:'2026-10-12'}}];
 const result=compactHealthSamples(rows,'Asia/Kolkata');assert.deepEqual(result.map(r=>r.record_id),['2','3','4','5','check']);assert.equal(result.find(r=>r.record_id==='2')!.payload.value,20);
 assert.deepEqual(compactHealthSamples([...compactHealthSamples(rows.slice(0,3),'Asia/Kolkata'),...rows.slice(3)],'Asia/Kolkata'),result);
});

test('cloud daily nutrition totals set, edit, replay and verify independently of any device or assistant',async()=>{
 const f=fixture(),receipt=crypto.randomUUID(),input={date:'2026-10-12',idempotencyKey:'gateway-totals-001',calories:2100,protein:160,carbs:215,fat:65,water:3000};
 const first=await f.call('nutrition.set_daily_totals',input,receipt);assert.equal(first.execution.verified,true);
 await f.call('nutrition.set_daily_totals',input,receipt);assert.equal(f.rows.filter(r=>r.type==='nutritionDay').length,1);
 await f.call('nutrition.set_daily_totals',{date:input.date,idempotencyKey:'gateway-totals-002',protein:170});
 const totals=(await f.call('nutrition.get_today',{date:input.date})).data.totals;assert.equal(totals.calories,2100);assert.equal(totals.protein,170);assert.equal(totals.water,3000);
 assert.equal(f.rows.find(r=>r.type==='nutritionDay')!.timestamp,'2026-10-12T06:30:00.000Z');
 const history=(await f.call('nutrition.get_history',{from:input.date,to:input.date})).data.items;assert.equal(history.length,1);assert.equal(history[0].protein,170);
});
