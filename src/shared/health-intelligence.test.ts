import test from 'node:test';
import assert from 'node:assert/strict';
import { bioSchema, experimentResult, readiness, type BioRecord } from './biology.js';
import { buildHealthIntelligence, assistantEvidence } from './health-intelligence.js';
import { baselineComparison, baselineQuality } from './personal-intelligence.js';
import { emptySkinState } from './skin.js';
import { starterWeek } from '../server/db/seed.js';
import { defaultProfile } from './defaults.js';
import { atTime, shiftDay } from './biological-intelligence.js';
import type { AppDb } from './types.js';
import type { Dataset } from './automation-model.js';
const date='2026-09-30',now=new Date(atTime(date,'18:00'));
function record(p:Partial<BioRecord>):BioRecord{return bioSchema.parse({id:crypto.randomUUID(),userId:'owner',domain:'Health',type:'vital',name:'Reading',timestamp:atTime(date),source:'Watch',deviceId:'test',quality:'measured',syncState:'saved',revision:1,createdAt:atTime(date),updatedAt:atTime(date),unit:'',metadata:{},...p});}
function dataset(records:BioRecord[]=[]):Dataset{return {userId:'owner',records,skin:emptySkinState(),db:{meta:{activeWeekId:'week-1'},profile:defaultProfile(),weeks:[starterWeek()],sessions:[],targets:[],habits:[],habitLogs:[],measurements:[],readiness:[],cardio:[],scheduledWorkouts:[],painLogs:[],goalCheckIns:[],trainingConfig:{volumeLandmarks:[],exerciseFamilies:{},reminders:{train:false,readiness:false,weeklyReview:false}},exercises:[]} as unknown as AppDb};}
test('intelligence exposes missingness and never manufactures baseline ranges or intake',()=>{
  const context=buildHealthIntelligence(dataset(),date,now);
  assert.ok(context.baselines.every(row=>row.range===null&&row.current===null&&row.missingness===1));
  assert.equal(context.priority.id,'daily-plan');assert.equal(context.smartInsight,null);
  assert.equal(assistantEvidence(context).baselines[0].samples,0);
});
test('personal deviations rank recovery with original source IDs and no writes',()=>{
  const history=Array.from({length:28},(_,i)=>[record({type:'sleep',value:8,unit:'hours',timestamp:atTime(shiftDay(date,-i-1))}),record({value:55,unit:'bpm',metadata:{metric:'Resting HR'},timestamp:atTime(shiftDay(date,-i-1))})]).flat();
  const today=[record({id:'sleep-today',type:'sleep',value:360,unit:'minutes'}),record({id:'rhr-today',value:62,unit:'bpm',metadata:{metric:'Resting HR'}})];
  const data=dataset([...history,...today]),before=JSON.stringify(data),context=buildHealthIntelligence(data,date,now);
  assert.equal(context.priority.id,'personal-recovery');assert.equal(context.priority.confidence,'medium');
  assert.match(context.priority.why.join(' '),/120 min/);assert.ok(context.priority.supportingSignals.flatMap(row=>row.recordIds).includes('rhr-today'));
  assert.equal(context.baselines.find(row=>row.metric==='Sleep')!.samples,28);assert.equal(JSON.stringify(data),before);
});
test('other-account and estimated observations cannot establish personal ranges',()=>{
  const rows=Array.from({length:28},(_,i)=>record({userId:i%2?'stranger':'owner',type:'sleep',value:8,unit:'hours',quality:i%2?'measured':'estimated',timestamp:atTime(shiftDay(date,-i-1))}));
  assert.equal(buildHealthIntelligence(dataset(rows),date,now).baselines[0].samples,0);
});

test('baseline trends apply metric floors while retaining the full reference window',()=>{
  const rows=Array.from({length:28},(_,i)=>record({type:'sleep',value:i<14?8.3:8,unit:'hours',timestamp:atTime(shiftDay(date,-i-1))}));
  const baseline=buildHealthIntelligence(dataset(rows),date,now).baselines.find(row=>row.metric==='Sleep')!;
  assert.equal(baseline.trend.state,'stable');
  assert.equal(baseline.trend.threshold,.5);
  assert.equal(baseline.trend.from,shiftDay(date,-28));
  assert.equal(baseline.trend.to,shiftDay(date,-1));
  assert.equal(assistantEvidence(buildHealthIntelligence(dataset(rows),date,now)).baselines[0].trend.state,'stable');
});
test('unconfirmed suggestions cannot establish a baseline or displace an active workout',()=>{
  const rows=Array.from({length:28},(_,i)=>record({type:'sleep',value:8,unit:'hours',metadata:{requiresConfirmation:true},timestamp:atTime(shiftDay(date,-i-1))}));
  const context=buildHealthIntelligence({...dataset(rows),activeWorkout:'Saved session'},date,now);
  assert.equal(context.baselines[0].samples,0);assert.equal(context.priority.id,'active-workout');assert.equal(context.priority.action.page,'Tracker');
});
test('recorded intake reminders use explicit targets and current local time only',()=>{
  const data=dataset([record({type:'nutritionTarget',metadata:{water:3000,protein:130}}),record({type:'water',value:1,unit:'L'}),record({type:'meal',metadata:{protein:90}})]);
  const context=buildHealthIntelligence(data,date,now);
  assert.equal(context.priority.id,'hydration');assert.match(context.priority.why[0],/2000 mL/);
  assert.ok(context.recommendations.some(row=>row.recommendation==='40 g protein remaining'));
  assert.ok(!buildHealthIntelligence(data,date,new Date(atTime(date,'09:00'))).recommendations.some(row=>row.id==='hydration'));
  assert.ok(!buildHealthIntelligence(data,date,new Date(atTime(shiftDay(date,1),'18:00'))).recommendations.some(row=>row.id==='hydration'));
});
test('baseline comparisons reject invalid windows, preserve calendar coverage, and exclude today',()=>{
  assert.throws(()=>baselineQuality([],'2026-09-31',date),RangeError);
  assert.throws(()=>baselineQuality([],date,'2026-09-01'),RangeError);
  const points=Array.from({length:14},(_,i)=>({date:shiftDay(date,-i-1),value:55}));
  const result=baselineComparison([...points,{date,value:80}],date,3);
  assert.equal(result.average,55);assert.equal(result.samples,14);assert.equal(result.missingness,.5);assert.equal(result.deviation,25);assert.equal(result.position,'above');
});
test('experiments normalize sleep, reject naps/estimates/other accounts, and use latest daily observation',()=>{
  const experiment=record({type:'experiment',metadata:{start:'2026-09-20',baselineDays:14,days:7,metric:'Sleep',adherenceMetric:'Water',target:3000}});
  const rows=[record({type:'sleep',value:420,unit:'minutes',timestamp:atTime('2026-09-19')}),record({type:'sleep',value:7,unit:'hours',timestamp:atTime('2026-09-20','07:00')}),record({type:'sleep',value:8,unit:'hours',timestamp:atTime('2026-09-20','08:00')}),record({type:'sleep',value:1,unit:'hours',metadata:{nap:true},timestamp:atTime('2026-09-20','16:00')}),record({type:'sleep',value:10,unit:'hours',quality:'estimated',timestamp:atTime('2026-09-20','18:00')}),record({type:'sleep',value:11,unit:'hours',userId:'stranger',timestamp:atTime('2026-09-20','19:00')}),record({type:'water',value:3,unit:'L',timestamp:atTime('2026-09-20')})];
  rows.push(record({type:'sleep',value:12,unit:'hours',metadata:{requiresConfirmation:true},timestamp:atTime('2026-09-20','20:00')}));
  const result=experimentResult(experiment,rows,'2026-09-21');
  assert.equal(result.before,7);assert.equal(result.during,8);assert.equal(result.unit,'h');assert.equal(result.adherence!.metDays,1);assert.equal(result.adherence!.elapsedDays,2);assert.equal(result.adherence!.percent,50);
  assert.deepEqual(result,experimentResult(experiment,rows.reverse(),'2026-09-21'));
});
test('readiness uses normalized sleep duration instead of interpreting minutes as hours',()=>{
  assert.equal(readiness([record({type:'sleep',value:360,unit:'minutes'})],date).score,readiness([record({type:'sleep',value:6,unit:'hours'})],date).score);
});

test('experiments compare canonical outcome units and exclude unsupported units',()=>{
  const experiment=record({type:'experiment',metadata:{start:'2026-09-20',baselineDays:14,days:7,metric:'Weight'}});
  const rows=[record({value:70,unit:'kg',metadata:{metric:'Weight'},timestamp:atTime('2026-09-19')}),record({value:154.323583526,unit:' LBS ',metadata:{metric:'Weight'},timestamp:atTime('2026-09-20')}),record({value:11,unit:'stone',metadata:{metric:'Weight'},timestamp:atTime('2026-09-21')})];
  const before=JSON.stringify(rows),result=experimentResult(experiment,rows,'2026-09-22');
  assert.equal(result.unit,'kg');assert.equal(result.before,70);assert.ok(Math.abs(result.during!-70)<1e-8);
  assert.equal(result.interventionSamples,1);assert.equal(result.excludedUnitSamples,1);assert.equal(JSON.stringify(rows),before);
  const hrv=experimentResult({...experiment,metadata:{...experiment.metadata,metric:'HRV'}},[record({value:50,unit:'ms',metadata:{metric:'HRV'},timestamp:atTime('2026-09-19')}),record({value:.06,unit:'seconds',metadata:{metric:'HRV'},timestamp:atTime('2026-09-20')})],'2026-09-22');
  assert.equal(hrv.unit,'ms');assert.equal(hrv.before,50);assert.equal(hrv.during,60);assert.equal(hrv.difference,10);
});
