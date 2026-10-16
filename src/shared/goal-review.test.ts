import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeeklyGoalReview,goalReviewScheduleSchema,goalReviewPeriod} from './intelligence/goal-review.js';
import {enqueueDueGoalReview} from '../server/worker/goal-reviews.js';
const schedule={enabled:true,cadence:'weekly',domains:['goals','sleep'],timeZone:'Asia/Kolkata'};
test('weekly review respects local civil weeks, explicit domains, read-only mode and a paused owner schedule',()=>{
 const first=createWeeklyGoalReview('owner','workspace',schedule,new Date('2026-10-11T20:00:00Z'))!;
 assert.equal(first.request.policy.date,'2026-10-12');assert.equal(first.id,'goal-review:owner:2026-10-12');
 assert.equal(first.id,createWeeklyGoalReview('owner','workspace',schedule,new Date('2026-10-18T12:00:00Z'))!.id);
 assert.notEqual(first.id,createWeeklyGoalReview('owner','workspace',schedule,new Date('2026-10-18T20:00:00Z'))!.id);
 assert.deepEqual(first.request.policy.domains,['goals','sleep']);assert.equal(first.request.mode,'analyze');assert.equal(first.request.policy.research,'off');assert.equal(first.allowBackgroundReads,true);
 assert.equal(createWeeklyGoalReview('owner','workspace',{...schedule,enabled:false}),undefined);
 assert.equal(goalReviewScheduleSchema.safeParse({...schedule,domains:['medical','goals']}).success,true);
 assert.ok(first.request.question.includes('sleep deterioration'));
 assert.ok(!first.request.question.includes('reviewed medical changes'));
 const medical=createWeeklyGoalReview('owner','workspace',{...schedule,domains:['medical','goals']})!;
 assert.ok(medical.request.question.includes('reviewed medical changes'));
 assert.ok(!medical.request.question.includes('training overload'));
 assert.equal(goalReviewScheduleSchema.safeParse({...schedule,timeZone:'invalid-zone'}).success,false);
 assert.deepEqual(goalReviewPeriod(new Date('2027-01-01T00:00:00Z'),'Asia/Kolkata'),{date:'2027-01-01',week:'2026-12-28'});
});
test('due review reads only its owner opt-in settings, saves once and performs no health write or model call',async()=>{
 const calls:{path:string;body:any}[]=[],states=new Map<string,any>();
 const cloud:any={owner:'schedule-owner',session:{config:{url:'https://cloud.test'}},request:async(path:string,init:any)=>{const body=init?.body?JSON.parse(init.body):undefined;calls.push({path,body});if(path.startsWith('rest/'))return [{intelligenceGoalReview:schedule}];if(body.operation==='get')return states.get(body.runId)||null;assert.equal(body.operation,'save');assert.equal(body.expectedOwnerId,cloud.owner);assert.equal(body.expectedVersion,null);states.set(body.state.id,body.state);return body.state;}};
 const now=new Date('2026-10-14T12:00:00Z');assert.equal(await enqueueDueGoalReview(cloud,now),true);assert.equal(await enqueueDueGoalReview(cloud,new Date(now.getTime()+61000)),false);assert.equal(states.size,1);
 const query=new URL('https://cloud.test/'+calls[0].path);assert.equal(query.searchParams.get('user_id'),'eq.schedule-owner');assert.equal(query.searchParams.get('select'),'payload->intelligenceGoalReview');
 assert.equal(calls.filter(c=>c.body?.operation==='save').length,1);assert.ok(calls.every(c=>!c.path.includes('chat/completions')&&c.body?.operation!=='health.write'));
});
