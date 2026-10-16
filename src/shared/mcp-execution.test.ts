import test from 'node:test';
import assert from 'node:assert/strict';
import {ExecutionRouter,cloudSupports,executionClass,cloudWriteActions,dayInZone,noonInZone,calendarStamp,type ExecutorState} from './mcp-execution.js';
import {actionDefinitions,type ActionId} from './mcp-contracts.js';
import {Broker} from '../server/mcp/broker.js';
import {CloudSessionVault} from '../hosted/mcp/cloud-session.js';
import {DEFAULT_SUPABASE_CONFIG} from './supabase-project.js';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {unlinkSync} from 'node:fs';
const account='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const state=(type:ExecutorState['type'],patch:Partial<ExecutorState>={}):ExecutorState=>({executorId:type,type,account,online:true,lastHeartbeat:Date.now(),lastActiveAt:Date.now(),version:'3.1',capabilities:Object.keys(actionDefinitions) as ActionId[],unsyncedChanges:false,activeWorkoutId:null,...patch});
test('every installed action has one execution classification; cloud writes are selected R1 actions only',()=>{
 for(const id of Object.keys(actionDefinitions) as ActionId[]){assert.ok(executionClass(id));if(cloudSupports(id)&&actionDefinitions[id].risk!=='R0'){assert.equal(actionDefinitions[id].risk,'R1');assert.ok((cloudWriteActions as readonly string[]).includes(id));}}
 for(const id of ['training.log_set','training.finish_workout','sleep.set_target','health.undo_action'] as ActionId[])assert.equal(executionClass(id),'DEVICE_REQUIRED');
});
test('cloud-native reads and append writes route to cloud with both apps offline',()=>{
 const router=new ExecutionRouter();for(const id of ['body.get_weight_trend','body.log_weight','nutrition.get_remaining_targets'] as ActionId[])assert.equal(router.choose(id,account,[state('cloud'),state('web',{online:false}),state('android',{online:false,capabilities:[]})]).executor,'cloud');
});
test('unsynchronized observations prefer the live device; stale or foreign devices cannot execute',()=>{
 const router=new ExecutionRouter();assert.equal(router.choose('nutrition.get_today',account,[state('cloud'),state('web',{unsyncedChanges:true})]).executor,'web');assert.equal(router.choose('nutrition.get_today',account,[state('cloud'),state('web',{unsyncedChanges:true,lastHeartbeat:Date.now()-200000})]).executor,'cloud');assert.equal(router.choose('training.log_set',account,[state('web',{account:other})]).executor,'unavailable');
});
test('router understands Android ownership while its initial empty capability list cannot receive jobs',()=>{
 const router=new ExecutionRouter(),android=state('android',{activeWorkoutId:'android-workout'});assert.equal(router.choose('training.log_set',account,[state('cloud'),android],'android-workout').executor,'android');assert.equal(router.choose('training.log_set',account,[state('web',{activeWorkoutId:'web-workout'}),android],'android-workout').executor,'android');assert.equal(router.choose('training.log_set',account,[state('android',{capabilities:[]})]).executor,'unavailable');assert.equal(router.choose('training.log_set',account,[state('cloud')]).executor,'unavailable');
});
test('cloud failure can select a compatible online web executor and never invent a device capability',()=>{
 const router=new ExecutionRouter();assert.equal(router.choose('body.log_weight',account,[state('cloud',{online:false}),state('web')]).executor,'web');assert.equal(router.choose('body.log_weight',account,[state('cloud',{online:false}),state('web',{capabilities:[]})]).executor,'unavailable');
});
test('cloud account dates and noon timestamps respect user time zones',()=>{
 assert.equal(dayInZone('2026-10-11T20:00:00Z','Asia/Kolkata'),'2026-10-12');assert.equal(calendarStamp('2026-10-11T20:00:00Z','Asia/Kolkata'),'2026-10-12T01:30:00Z');assert.equal(noonInZone('2026-10-12','Asia/Kolkata'),'2026-10-12T06:30:00.000Z');assert.equal(dayInZone(noonInZone('2026-10-12','Pacific/Kiritimati'),'Pacific/Kiritimati'),'2026-10-12');
});
test('cloud and device executors share broker idempotency, receipts and conflict handling',async()=>{
 const b=new Broker(':memory:');try{b.setControls(account,true,true);const pair=b.register(account,{name:'Client',scopes:['body.write'],writeEnabled:true}),p=b.authenticate(pair.token),input={weight:75,idempotencyKey:'cloud-key-0001'};let executions=0;
 const run=async(job:any)=>{executions++;b.authorize(account,job.id,'cloud');const result={success:true,actionReceiptId:job.receiptId,execution:{executor:'cloud',reason:'test',verified:true}};b.complete(account,job.id,result,'cloud');return result;};const first=await b.call(p,'body.log_weight',input,run,'cloud'),replay=await b.call(p,'body.log_weight',input,run,'web',()=>({success:false,status:'executor_unavailable'}));assert.deepEqual(first,replay);assert.equal(executions,1);await assert.rejects(b.call(p,'body.log_weight',{...input,weight:76},run,'cloud'),/different parameters/);await assert.rejects(b.call(p,'body.log_weight',{...input,idempotencyKey:'near-duplicate-key'},run,'cloud'),/Possible repeated/);
 const audit=b.db.prepare('SELECT * FROM execution_audit').all();assert.equal(audit.length,1);assert.equal(audit[0].executor,'cloud');assert.equal(audit[0].receipt_id,first.actionReceiptId);assert.equal(audit[0].status,'executed');assert.ok(audit[0].latency_ms>=0);assert.ok(!JSON.stringify(audit).includes('weight:75'));
 }finally{b.close();}
});
test('uncertain writes stay pinned to their original executor, and web cannot complete a cloud lease',async()=>{
 const b=new Broker(':memory:');try{b.setControls(account,true,true);const pair=b.register(account,{name:'Client',scopes:['body.write'],writeEnabled:true}),p=b.authenticate(pair.token),input={weight:75,idempotencyKey:'pin-cloud-0001'};
 const failed=await b.call(p,'body.log_weight',input,async(job)=>{assert.throws(()=>b.authorize(account,job.id,'web'),/executor/);const result={success:false,error:{code:'CLOUD_UNAVAILABLE',message:'uncertain commit',retryable:true,nextStep:'Retry same key'}};b.complete(account,job.id,result,'cloud');return result;},'cloud');assert.equal(failed.success,false);await assert.rejects(b.call(p,'body.log_weight',input,async()=>undefined,'web'),/original executor/);
 }finally{b.close();}
});
test('rate limits survive broker reconstruction and cannot be bypassed with another tool key',async()=>{
 const file=join(tmpdir(),'heos-mcp-rate-'+crypto.randomUUID()+'.sqlite');let b=new Broker(file);try{b.setControls(account,true,true);const pair=b.register(account,{name:'Client',scopes:['sleep.write'],writeEnabled:true}),p=b.authenticate(pair.token);for(let n=0;n<20;n++)await b.call(p,'sleep.set_target',{hours:4+n/10,idempotencyKey:'rate-pending-'+n});b.close();b=new Broker(file);await assert.rejects(b.call(b.authenticate(pair.token),'sleep.set_target',{hours:8,idempotencyKey:'rate-pending-extra'}),/Too many/);assert.equal(b.db.prepare('SELECT count FROM rate_limits WHERE bucket=?').get(account+':'+p.clientId+':sleep.set_target').count,21);}finally{b.close();unlinkSync(file);}
});
test('delegated sessions are encrypted per client and revocation removes the encrypted credential',async()=>{
 const b=new Broker(':memory:');try{const vault=new CloudSessionVault(b.db),key=CloudSessionVault.newKey(),client=crypto.randomUUID(),session={uid:account,email:'test@example.test',accessToken:'secret-access-test',refreshToken:'secret-refresh-test',expiresAt:Date.now()+3600000,config:DEFAULT_SUPABASE_CONFIG};await vault.store(account,client,key,session);const raw=b.db.prepare('SELECT ciphertext FROM cloud_sessions').get().ciphertext;assert.ok(!raw.includes('secret-access'));assert.ok(!raw.includes('secret-refresh'));assert.equal(vault.ready(other,client),false);await assert.rejects(vault.get(account,client,CloudSessionVault.newKey()),/authorization/);vault.remove(account,client);assert.equal(vault.ready(account,client),false);}finally{b.close();}
});
