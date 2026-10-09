import test from 'node:test';
import assert from 'node:assert/strict';
import { processReportJob, type ReportJob, type QueueDependencies } from '../functions/_shared/report-queue.ts';
import { EmailError } from '../../src/shared/email-contract.ts';

const job:ReportJob={id:1,user_id:'owner',report_type:'workout',report_id:'saved-session',automatic:false,request_version:1,attempts:1};
function fixture(){
  const events:string[]=[],updates:any[]=[];
  const deps:QueueDependencies={
    user:async id=>({id,email:'owner@example.com',email_confirmed_at:'2026-10-07'}),sleep:async()=>{},
    finish:async(_,status,attempts,error,next)=>{updates.push({status,attempts,error,next});},
    email:{report:async()=>[{logs:[]}],preferences:async()=>({}),claim:async()=> 'claimed',finish:async(_,__,status)=>{events.push(status);},
      generateWorkoutReport:async()=>({aiOverallSummary:'AI analysis',logs:[]}),
      send:async message=>{assert.match(message.text,/AI analysis/);events.push('send');},log:()=>{}},
  };
  return {deps,events,updates};
}
test('email delivery succeeds on its second retry and is marked done only after sending',async()=>{
  const {deps,events,updates}=fixture();let attempts=0;
  deps.email.send=async()=>{attempts++;events.push('send');if(attempts<3)throw new Error('SMTP offline');};
  assert.equal((await processReportJob(job,deps)).status,'sent');
  assert.deepEqual(events,['send','failed','send','failed','send','sent']);
  assert.deepEqual(updates,[{status:'done',attempts:3,error:null,next:null}]);
});
test('three unsuccessful sends leave a durable queued job with a future retry',async()=>{
  const {deps,updates}=fixture();let calls=0;
  deps.email.send=async()=>{calls++;throw new Error('SMTP offline');};
  const result=await processReportJob(job,deps);
  assert.equal(calls,3);assert.equal(result.status,'queued');assert.equal(updates[0].status,'queued');
  assert.equal(updates[0].attempts,3);assert.ok(Date.parse(updates[0].next)>Date.now());
});
test('AI failures get two retries without sending a basic report and remain queued',async()=>{
  const {deps,updates,events}=fixture();let calls=0;
  deps.email.generateWorkoutReport=async()=>{calls++;throw new EmailError('REPORT_GENERATION_FAILED');};
  await processReportJob({...job,attempts:7},deps);
  assert.equal(calls,3);assert.ok(!events.includes('send'));
  assert.equal(updates[0].status,'queued');assert.equal(updates[0].attempts,9);assert.equal(updates[0].error,'REPORT_GENERATION_FAILED');
});
