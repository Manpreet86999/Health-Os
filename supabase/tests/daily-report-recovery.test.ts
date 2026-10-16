import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDailyReport} from '../functions/_shared/workout-analysis.ts';
import {PRIMARY_MODEL} from '../../src/shared/intelligence/production-models.ts';
import {processReportJob} from '../functions/_shared/report-queue.ts';
import {EmailError} from '../../src/shared/email-contract.ts';

test('daily AI schema requires each exercise key and retries incomplete feedback before accepting it',async()=>{
 let calls=0;
 const data:any={date:'2026-01-01',workouts:[{logs:[{name:'Squat'},{name:'Row'}]}]};
 const config:any={provider:'openrouter',model:PRIMARY_MODEL,paid:true,inputUsdPerMillion:.22,outputUsdPerMillion:.88};
 const result=await analyzeDailyReport(data,{key:'test-key',roles:{general_reasoner:config},ledger:{reserve:async()=>{},settle:async()=>{}}},async(_url,init)=>{
  calls++;
  const sent=JSON.parse(String(init?.body));
  const shape=sent.response_format.json_schema.schema.properties.exerciseComments;
  assert.deepEqual(shape.required,['0:0','0:1']);assert.equal(shape.additionalProperties,false);
  const exerciseComments=calls===1?{'0:0':'Controlled sets.'}:{'0:0':'Controlled sets.','0:1':'Keep the recorded rest periods.'};
  return Response.json({model:PRIMARY_MODEL,choices:[{message:{content:JSON.stringify({analysis:'Session reviewed.',recommendations:[{title:'Recover',body:'Follow the saved plan.',basis:'Logged session.'}],exerciseComments})}}]});
 });
 assert.equal(calls,2);assert.equal(result.workouts[0].logs[1].aiCoachComment,'Keep the recorded rest periods.');
});

test('daily generation failures release delivery and schedule a bounded durable retry',async()=>{
 let generations=0;const finished:string[]=[],updates:any[]=[];
 const result=await processReportJob({id:1,user_id:'owner',report_type:'daily',report_id:'2026-01-01',automatic:true,request_version:1,attempts:40},{
  user:async()=>({id:'owner',email:'owner@example.com',email_confirmed_at:'2026-01-01'}),sleep:async()=>{assert.fail('No repeated long request in the same worker');},
  finish:async(...args)=>{updates.push(args);},
  email:{preferences:async()=>({}),report:async()=>[{}],claim:async()=> 'claimed',finish:async(_owner,_key,status)=>{finished.push(status);},generateDailyReport:async()=>{generations++;throw new EmailError('REPORT_GENERATION_FAILED');},send:async()=>{assert.fail('No ungenerated report email');},log:()=>{}}
 });
 assert.equal(generations,1);assert.deepEqual(finished,['failed']);assert.equal(result.status,'queued');
 assert.equal(updates[0][2],40);assert.ok(Date.parse(updates[0][4])-Date.now()<=120000);
});
