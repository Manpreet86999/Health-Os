import test from 'node:test';
import assert from 'node:assert/strict';
import {runStore} from '../functions/body-os-ai/run-store.ts';
test('run deletion carries only the owner-authenticated CAS command and does not read preferences or health rows',async()=>{
 const original=globalThis.fetch,calls:{url:string;body:any}[]=[];
 try{globalThis.fetch=async(input,init)=>{calls.push({url:String(input),body:JSON.parse(String(init?.body))});return Response.json(true);};
  assert.equal(await runStore({action:'/ai/run-store',expectedOwnerId:'owner',operation:'delete',runId:'finished',expectedVersion:4},'owner','https://cloud.test',{Authorization:'Bearer owner-session'}),true);
  assert.deepEqual(calls,[{url:'https://cloud.test/rest/v1/rpc/health_agent_run_delete',body:{p_run_id:'finished',p_expected_version:4}}]);
  await assert.rejects(runStore({operation:'delete',expectedOwnerId:'foreign',runId:'finished',expectedVersion:4},'owner','https://cloud.test',{}),/owner mismatch/);
  await assert.rejects(runStore({operation:'prune',olderThanDays:0},'owner','https://cloud.test',{}));assert.equal(calls.length,1);
 }finally{globalThis.fetch=original;}
});
test('unfinished or stale deletion fails visibly and an invalid retention receipt is rejected',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({error:'unfinished'},{status:409});
  await assert.rejects(runStore({operation:'delete',runId:'active',expectedVersion:2},'owner','https://cloud.test',{}),/unfinished/);
  globalThis.fetch=async()=>Response.json({removed:10});
  await assert.rejects(runStore({operation:'prune',olderThanDays:90},'owner','https://cloud.test',{}),/invalid/);
 }finally{globalThis.fetch=original;}
});
