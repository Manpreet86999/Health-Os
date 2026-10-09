import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWorkout, hasCurrentWorkoutAnalysis } from '../functions/_shared/workout-analysis.ts';

const workout = { id:'workout', date:'2026-10-07',status:'finished',logs:[{name:'Squat',status:'completed',sets:[{s:1,w:50,r:8}]}] };
const prefs = {aiProvider:'openrouter',openRouterApiKey:'private-key',youtubeApiKey:'other-private-key',aiModel:'test-model'};
const answer = {overallSummary:'Specific saved-workout assessment.',exerciseComments:{Squat:'Repeat these logged sets with controlled technique.'}};

test('workout analysis excludes credentials, validates full exercise feedback and reuses persisted analysis',async()=>{
  let calls=0;
  const request:typeof fetch=async(url,init)=>{
    calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
    assert.equal((init!.headers as any).Authorization,'Bearer private-key');
    assert.ok(!String(init!.body).includes('private-key'));
    assert.equal(JSON.parse(JSON.parse(String(init!.body)).messages[1].content).workout.logs[0].sets[0].w,50);
    return Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});
  };
  const analyzed=await analyzeWorkout(workout,prefs,[],request);
  assert.equal(analyzed.aiOverallSummary,answer.overallSummary);
  assert.equal(analyzed.logs[0].aiCoachComment,answer.exerciseComments.Squat);
  assert.equal(await hasCurrentWorkoutAnalysis(analyzed),true);
  await analyzeWorkout(analyzed,prefs,[],request);assert.equal(calls,1);
  const edited={...analyzed,logs:[{...analyzed.logs[0],sets:[{s:1,w:50,r:9}]}]};
  assert.equal(await hasCurrentWorkoutAnalysis(edited),false);
});

test('missing keys, unavailable providers and incomplete responses cannot produce a report',async()=>{
  await assert.rejects(analyzeWorkout(workout,{},[],async()=>{throw new Error('Should not call');}),/AI report generation failed/);
  await assert.rejects(analyzeWorkout(workout,prefs,[],async()=>new Response('',{status:429})),/AI report generation failed/);
  await assert.rejects(analyzeWorkout(workout,prefs,[],async()=>Response.json({choices:[{message:{content:JSON.stringify({...answer,exerciseComments:{}})}}]})),/AI report generation failed/);
});
