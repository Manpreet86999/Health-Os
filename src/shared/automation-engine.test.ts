import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bioSchema, type BioRecord } from './biology.js';
import { atTime, shiftDay } from './biological-intelligence.js';
import { emptySkinState } from './skin.js';
import { starterWeek } from '../server/db/seed.js';
import { defaultProfile } from './defaults.js';
import type { AppDb, Session } from './types.js';
import { emptyAutomationState, fingerprint, type Dataset, type DomainEvent } from './automation-model.js';
import { AUTOMATION_SYSTEMS, automationRegistry, reconcileAutomations, drainAutomationJobs, pendingInbox, resolveInbox, processDomainEvent } from './automation-engine.js';
import { adaptiveInputs, dailyMetric, parseCapture, normalizeCaptureDraft, preparedWorkout, ruleProgress, setSuggestion, validateRule } from './automation-rules.js';
import { effectiveCare } from './automation-care.js';

const date='2026-09-30',now=new Date(atTime(date,'22:00'));
function record(p:Partial<BioRecord>):BioRecord{return bioSchema.parse({id:crypto.randomUUID(),userId:'local-user',domain:'Health',type:'vital',name:'Test',timestamp:atTime(date),source:'Test',deviceId:'test',quality:'manual',syncState:'saved',revision:1,createdAt:atTime(date),updatedAt:atTime(date),unit:'',metadata:{},...p});}
function dataset(records:BioRecord[]=[]):Dataset{return {userId:'local-user',records,skin:emptySkinState(),db:{meta:{activeWeekId:'week-1'},profile:defaultProfile(),weeks:[starterWeek()],sessions:[],targets:[],habits:[],habitLogs:[],measurements:[],readiness:[],cardio:[],scheduledWorkouts:[],painLogs:[],goalCheckIns:[],trainingConfig:{volumeLandmarks:[],exerciseFamilies:{},reminders:{train:false,readiness:false,weeklyReview:false}},exercises:[]} as unknown as AppDb};}
function compute(data:Dataset,state=emptyAutomationState()){reconcileAutomations(data,state,now);drainAutomationJobs(data,state,now);return state;}
function event(id='one'):DomainEvent{return {id,type:'water.logged',userId:'local-user',occurredAt:now.toISOString(),createdAt:now.toISOString(),schemaVersion:1,source:{kind:'user'},payload:{date}};}

test('all twenty systems share an idempotent registry and source audit',()=>{
  assert.equal(AUTOMATION_SYSTEMS.length,20);const d=dataset([record({type:'water',value:500,unit:'mL'})]),s=emptyAutomationState();
  processDomainEvent(event(),d,s,now);drainAutomationJobs(d,s,now);const count=Object.keys(s.runs).length;
  processDomainEvent(event(),d,s,now);drainAutomationJobs(d,s,now);assert.equal(s.events.length,1);assert.equal(Object.keys(s.runs).length,count);assert.equal((s.derived[`daily:${date}`].value as any).water,500);assert.ok(s.derived[`daily:${date}`].eventId);
  assert.throws(()=>processDomainEvent({...event(),userId:'another-account'},d,s,now));
});
test('one meal action updates nutrition, reports, defaults and coach context before opening a page',()=>{
  const meal=record({type:'meal',domain:'Eat',name:'Lunch',metadata:{calories:500,protein:35}}),s=compute(dataset([meal]));
  assert.equal((s.derived[`daily:${date}`].value as any).nutrition.calories,500);assert.equal((s.derived.coachContext.value as any).nutrition.protein,35);
  assert.equal((s.derived[`report:Daily summary:${date}`].value as any).data_snapshot.averageCalories,500);assert.equal((s.derived.defaults.value as any).meal.sourceId,meal.id);
});
test('edits, deletions and returning to an earlier value reverse and reapply linked habits',()=>{
  const habit=record({id:'hydration',type:'habit',domain:'Today',metadata:{rule:JSON.stringify({metric:'Water',threshold:3000})}}),water=record({id:'water',type:'water',value:3000,unit:'mL'}),d=dataset([habit,water]),s=compute(d),key=`habit:hydration:${date}`;
  assert.equal((s.derived[key].value as any).met,true);water.value=500;compute(d,s);assert.equal((s.derived[key].value as any).met,false);
  water.value=3000;compute(d,s);assert.equal((s.derived[key].value as any).met,true);water.deletedAt=now.toISOString();compute(d,s);assert.equal((s.derived[key].value as any).met,false);
});
test('manual overrides survive inferred habit changes; manual mode removes stale projection',()=>{
  const habit=record({id:'habit',type:'habit',metadata:{rule:JSON.stringify({metric:'Water',threshold:3000})}}),override=record({type:'habitDone',metadata:{parentId:'habit',userOverride:true,completed:true}}),d=dataset([habit,override]),s=compute(d);
  assert.equal((s.derived[`habit:habit:${date}`].value as any).met,true);habit.metadata={completion_mode:'manual',metric:'Custom'};compute(d,s);assert.equal(s.derived[`habit:habit:${date}`],undefined);
});
test('measurable goals support averages, totals, lower targets, streaks and composite evidence',()=>{
  const rows=Array.from({length:7},(_,i)=>record({type:'water',value:3000,unit:'mL',timestamp:atTime(shiftDay(date,-i))})),d=dataset(rows);
  assert.equal(ruleProgress({metric:'Water',threshold:21000,aggregation:'total',windowDays:7},d,date).met,true);
  assert.equal(ruleProgress({metric:'Water',threshold:7,conditionThreshold:3000,aggregation:'streak',windowDays:7},d,date).value,7);
  assert.equal(ruleProgress({and:[{metric:'Water',threshold:3000},{or:[{metric:'Water',threshold:4000},{metric:'Water',threshold:3000}]}]},d,date).met,true);
  assert.equal(ruleProgress({metric:'Sleep',threshold:8},d,date).value,null);
  assert.throws(()=>validateRule({metric:'Water',threshold:NaN}));assert.throws(()=>validateRule({and:[]}));
});
test('adaptive check-in recognizes reliable objective inputs without inventing subjective answers',()=>{
  const d=dataset([record({type:'sleep',value:8,unit:'hours',quality:'imported'}),record({value:50,metadata:{metric:'HRV'},quality:'estimated'})]),a=adaptiveInputs(d,date);
  assert.equal(a.inputs.find(i=>i.metric==='Sleep')?.reliable,true);assert.equal(a.inputs.find(i=>i.metric==='HRV')?.reliable,false);assert.equal(a.inputs.find(i=>i.metric==='Mood')?.value,null);
});
test('prepared prescriptions preserve originals and make low-readiness adaptation optional',()=>{
  const p=preparedWorkout(dataset(),date,40);assert.ok(p.original.length);assert.equal(p.adaptationRecommended,true);assert.notDeepEqual(p.original,p.adapted);assert.equal(p.original[0].rirTarget,2);
  assert.equal(preparedWorkout(dataset(),date,null).adaptationRecommended,false);
});
test('set suggestions use prescription, increments and explicit tracking modes',()=>{
  const ex={name:'Bench',target:'Chest',vol:'3 x 8-12',rirTarget:2},previous={w:50,r:10,type:'work' as const};
  assert.equal(setSuggestion(ex,previous,2.5,53).weight,52.5);assert.equal(setSuggestion(ex,undefined).reps,12);
  assert.equal(setSuggestion({...ex,trackingMode:'reps'},previous).weight,undefined);assert.equal(setSuggestion({...ex,trackingMode:'time'}, {...previous,durationSec:45}).durationSec,45);
});
test('local repeated meal patterns produce confirmations and never actual meals',()=>{
  const meals=Array.from({length:3},(_,i)=>record({type:'meal',name:'Usual dinner',timestamp:atTime(shiftDay(date,-7*(i+1)),'21:30'),metadata:{meal:'Dinner',calories:600,protein:30}})),d=dataset(meals),s=compute(d);
  assert.equal((s.derived.foodPatterns.value as any[]).length,1);assert.ok(pendingInbox(s,now).some(i=>i.type==='meal'));assert.equal(d.records.length,3);assert.equal((s.derived[`daily:${date}`].value as any).nutrition.calories,0);
});
test('natural-language capture creates editable deterministic drafts for weight, water, sleep and pain',()=>{
  assert.equal(parseCapture('Weight today 80.7 kg').defaults.value,80.7);assert.equal(parseCapture('drank 500 ml water').kind,'water');assert.equal(parseCapture('slept 480 minutes').defaults.value,8);
  const pain=parseCapture('My left shoulder hurts three out of ten');assert.equal(pain.kind,'recoveryNote');assert.equal(pain.defaults.severity,3);assert.equal(pain.defaults.side,'left');assert.equal(parseCapture('I ate oats').confidence,'low');
});
test('recurring meal schedules pause, expire, deduplicate and require confirmation',()=>{
  const meal=record({id:'source-meal',type:'meal',timestamp:atTime(shiftDay(date,-1)),metadata:{calories:400}}),schedule=record({type:'automation',metadata:{subtype:'recurringMeal',recordId:meal.id,time:'08:00',enabled:true}}),d=dataset([meal,schedule]),s=compute(d);
  const item=pendingInbox(s,now).find(i=>i.type==='meal')!;assert.ok(item);d.records.push(record({type:'meal',metadata:{calories:400,recurringId:schedule.id}}));resolveInbox(s,item.id,'accepted',now);compute(d,s);assert.equal(pendingInbox(s,now).filter(i=>i.type==='meal').length,0);
  schedule.metadata.enabled=false;compute(d,s);assert.equal(pendingInbox(s,now).filter(i=>i.type==='meal').length,0);
});
test('multi-time doses count only matching explicit confirmations and skipped doses remain skipped',()=>{
  const parent=record({id:'med',type:'medication',metadata:{times:'09:00,21:00',dose:'Prescribed'}}),dose=record({type:'dose',metadata:{parentId:'med',doseType:'medication',scheduledTime:'09:00',status:'Taken'}}),d=dataset([parent,dose]),s=compute(d);
  assert.equal(pendingInbox(s,now).filter(i=>i.type==='dose').length,1);assert.equal(dailyMetric(d,'Medication adherence',date).value,50);
  dose.metadata.status='Skipped';compute(d,s);assert.equal(dailyMetric(d,'Medication adherence',date).value,0);
});
test('measurement cadence is satisfied by a matching imported source',()=>{
  const schedule=record({type:'automation',metadata:{subtype:'measurementSchedule',metric:'Waist',cadenceDays:7,time:'09:00'}}),d=dataset([schedule]),s=compute(d);
  assert.ok(pendingInbox(s,now).some(i=>i.type==='measurement'));d.records.push(record({type:'bodyMeasurement',name:'Waist',value:85,unit:'cm',quality:'imported',metadata:{metric:'Waist'}}));compute(d,s);assert.equal(pendingInbox(s,now).filter(i=>i.type==='measurement').length,0);
});
test('anomalies need sufficient personal history and multiple deviations, with cooldown',()=>{
  const rows=Array.from({length:20},(_,i)=>['HRV','Resting HR'].map(metric=>record({value:metric==='HRV'?50:60,timestamp:atTime(shiftDay(date,-i-1)),metadata:{metric}}))).flat();
  rows.push(record({value:20,metadata:{metric:'HRV'}}),record({value:90,metadata:{metric:'Resting HR'}}));const d=dataset(rows),s=compute(d),item=pendingInbox(s,now).find(i=>i.type==='anomaly')!;
  assert.ok(item);assert.equal(item.title,'Several signals differ from your recent baseline');resolveInbox(s,item.id,'accepted',now);compute(d,s);assert.equal(pendingInbox(s,now).filter(i=>i.type==='anomaly').length,0);
});
test('care plan uses explicit actions and observations, and undo removes inferred completion',()=>{
  const d=dataset();d.skin.care.tasks=[{id:'care',label:'Wash',area:'face',productId:'',days:[],time:'morning',minutes:1,notes:'',paused:false}];
  const action=record({type:'automationEvent',metadata:{subtype:'careAction',careTaskId:'care',status:'done'}}),observation=record({type:'journal',metadata:{subtype:'careObservation',area:'face',concern:'Dryness',severity:3}});
  d.records=[action,observation];d.skin=effectiveCare(d.skin,d.records);assert.equal(dailyMetric(d,'Care adherence',date).value,100);assert.equal(d.skin.care.checkIns[0].severity,3);
  const source=emptySkinState();source.care.tasks=d.skin.care.tasks;action.deletedAt=now.toISOString();d.skin=effectiveCare(source,d.records);assert.equal(dailyMetric(d,'Care adherence',date).value,0);
});
test('inbox snooze, batch decisions and undo persist without duplicating source records',()=>{
  const d=dataset([record({type:'supplement',metadata:{time:'09:00'}})]),s=compute(d),item=pendingInbox(s,now)[0];resolveInbox(s,item.id,'accepted',now,30);assert.equal(pendingInbox(s,now).length,0);
  assert.equal(pendingInbox(s,new Date(now.getTime()+31*60000)).length,1);resolveInbox(s,item.id,'accepted',now);resolveInbox(s,item.id,'undo',now);delete item.snoozedUntil;assert.equal(pendingInbox(s,now).length,1);assert.equal(d.records.length,1);
});
test('historical date edits invalidate old day and refresh automatic report snapshots',()=>{
  const meal=record({type:'meal',metadata:{calories:500},timestamp:atTime(shiftDay(date,-1))}),d=dataset([meal]),s=compute(d);assert.equal((s.derived[`report:Daily summary:${shiftDay(date,-1)}`].value as any).data_snapshot.averageCalories,500);
  meal.timestamp=atTime(date);compute(d,s);assert.equal((s.derived[`daily:${shiftDay(date,-1)}`].value as any).nutrition.calories,0);assert.equal((s.derived[`report:Daily summary:${date}`].value as any).data_snapshot.averageCalories,500);
});
test('automatic insights expose sample coverage, evidence and noncausal language',()=>{
  const rows=Array.from({length:12},(_,i)=>[record({type:'sleep',value:i%2?6:8,unit:'hours',timestamp:atTime(shiftDay(date,-i))}),record({type:'checkIn',timestamp:atTime(shiftDay(date,-i)),metadata:{energy:7,stress:3,soreness:3}})]).flat(),s=compute(dataset(rows));
  const insights=s.derived.insights.value as any[];assert.equal(insights.some(i=>i.id==='sleep-readiness'),false);assert.equal(insights.some(i=>i.id==='protein-energy'),false);
  const reliable=Array.from({length:28},(_,i)=>[record({type:'meal',timestamp:atTime(shiftDay(date,-i)),metadata:{protein:i%2?170:100}}),record({type:'checkIn',timestamp:atTime(shiftDay(date,-i)),metadata:{energy:i%2?8:4,stress:3,soreness:3}})]).flat();
  const supported=(compute(dataset(reliable)).derived.insights.value as any[]).find(i=>i.id==='protein-energy');assert.ok(supported);assert.ok(supported.text.includes('does not establish cause'));assert.equal(supported.sample_size,28);assert.ok(supported.evidence_refs.length);
});
test('baselines maintain all windows and exclude today and missing readings',()=>{
  const d=dataset([record({value:50,metadata:{metric:'HRV'},timestamp:atTime(shiftDay(date,-1))}),record({value:90,metadata:{metric:'HRV'}})]),s=compute(d);
  for(const window of [7,14,28,90]){const b=s.derived[`baseline:HRV:${window}`].value as any;assert.equal(b.mean,50);assert.equal(b.sample_count,1);assert.equal(b.quality,'low');}
});
test('smart defaults remain suggestions and transport acknowledgements do not create events',()=>{
  const water=record({type:'water',value:350,unit:'mL'}),d=dataset([water]),s=compute(d),count=s.events.length;water.syncState='synced';water.revision++;water.updatedAt=now.toISOString();compute(d,s);assert.equal(s.events.length,count);assert.equal((s.derived.defaults.value as any).water.value,350);assert.equal(d.records.length,1);
});
test('completed workout propagates PRs, working volume and goals; deleting it reverses them',()=>{
  const d=dataset();d.db.sessions=[{id:'session',status:'finished',date,logs:[{name:'Bench',target:'Chest',sets:[{w:20,r:10,type:'warmup'},{w:50,r:10,type:'work'}]}]} as Session];
  d.records=[record({id:'goal',type:'goal',metadata:{rule:JSON.stringify({metric:'Lift',exercise:'Bench',threshold:50})}})];const s=compute(d);assert.equal((s.derived.training.value as any).prs[0].bestWeight,50);assert.equal((s.derived.training.value as any).muscleVolume.Chest,500);assert.equal((s.derived[`goal:goal:${date}`].value as any).met,true);
  d.db.sessions=[];compute(d,s);assert.equal((s.derived.training.value as any).prs.length,0);assert.equal((s.derived[`goal:goal:${date}`].value as any).met,false);
});
test('automation failures queue retry while preserving sources, and flags suppress projections',()=>{
  const water=record({type:'water',value:500,unit:'mL'}),d=dataset([water]),s=emptyAutomationState(),before=fingerprint(d.records);
  const broken={key:'test-failure',version:1,listensTo:['*'],run:()=>{throw new Error('Temporary failure');}};automationRegistry.push(broken);
  try{compute(d,s);assert.ok(Object.values(s.jobs).some(j=>j.key==='test-failure'&&j.status==='failed'));assert.equal(fingerprint(d.records),before);}finally{automationRegistry.pop();}
  d.records.push(record({id:'health-os-automation-settings',type:'nudgePreference',metadata:{automaticReports:false,baselines:false,smartDefaults:false}}));compute(d,s);assert.equal(Object.values(s.derived).some(r=>r.kind==='report'||r.kind==='baseline'),false);
});
test('affected dates survive deferred execution and refresh historical reports',()=>{
  const yesterday=shiftDay(date,-1),meal=record({type:'meal',timestamp:atTime(yesterday),metadata:{calories:500}}),d=dataset([meal]),s=compute(d);
  meal.metadata.calories=650;reconcileAutomations(d,s,now);drainAutomationJobs(d,s,new Date(now.getTime()+5000));
  assert.equal((s.derived[`report:Daily summary:${yesterday}`].value as any).data_snapshot.averageCalories,650);
});
test('source priorities invalidate historical daily aggregates, baselines and body trends',()=>{
  const day=shiftDay(date,-1),a=record({type:'vital',source:'Device A',timestamp:atTime(day),value:80,unit:'kg',metadata:{metric:'Weight'}}),b=record({type:'vital',source:'Device B',timestamp:atTime(day),value:90,unit:'kg',metadata:{metric:'Weight'}}),priority=record({type:'sourcePriority',name:'Weight',metadata:{sources:'Device A, Device B'}}),d=dataset([a,b,priority]),s=compute(d);
  assert.equal((s.derived[`daily:${day}`].value as any).metrics.Weight,80);priority.metadata.sources='Device B, Device A';compute(d,s);assert.equal((s.derived[`daily:${day}`].value as any).metrics.Weight,90);assert.equal((s.derived['baseline:Weight:7'].value as any).mean,90);
});
test('unconfirmed imports remain inbox drafts and are excluded from derived actuals',()=>{
  const imported=record({type:'vital',name:'Imported weight',value:80,unit:'kg',quality:'imported',metadata:{metric:'Weight',requiresConfirmation:true}}),d=dataset([imported]),s=compute(d);
  assert.equal((s.derived[`daily:${date}`].value as any).metrics.Weight,null);assert.ok(pendingInbox(s,now).some(i=>i.type==='import'));imported.metadata.confirmed=true;compute(d,s);assert.equal((s.derived[`daily:${date}`].value as any).metrics.Weight,80);
});
test('progress photo cadence uses existing photo dates without creating measurements',()=>{
  const schedule=record({type:'automation',metadata:{subtype:'measurementSchedule',metric:'Progress photos',cadenceDays:28,time:'09:00'}}),d=dataset([schedule]),s=compute(d);assert.ok(pendingInbox(s,now).some(i=>i.type==='measurement'));
  d.photoDates=[{id:'photo',date}];compute(d,s);assert.equal(pendingInbox(s,now).some(i=>i.type==='measurement'),false);assert.equal(d.records.length,1);
});
test('background correlations preserve matched samples and explicit missingness',()=>{
  const rows=Array.from({length:10},(_,i)=>[record({type:'sleep',value:6+i/10,unit:'hours',timestamp:atTime(shiftDay(date,-i))}),record({type:'checkIn',timestamp:atTime(shiftDay(date,-i)),metadata:{energy:5+i%4,stress:3,soreness:3}})]).flat(),s=compute(dataset(rows));
  const pairs=s.derived['correlations:28'].value as any[];assert.equal(pairs.find(p=>p.x==='Sleep'&&p.y==='Readiness').samples,10);assert.equal(pairs.find(p=>p.x==='Calories'&&p.y==='Weight').r,null);
});
test('sleep timing uses circular clock statistics across midnight',()=>{
  const rows=['23:30','00:30'].map((bedtime,i)=>record({type:'sleep',value:8,unit:'hours',timestamp:atTime(shiftDay(date,-i-1)),metadata:{bedtime}})),s=compute(dataset(rows));
  const baseline=s.derived['baseline:Sleep timing:7'].value as any;assert.ok(baseline.mean<1||baseline.mean>1439);assert.equal(Math.round(baseline.dispersion),30);
  const history=Array.from({length:28},(_,i)=>record({type:'sleep',value:8,unit:'hours',timestamp:atTime(shiftDay(date,-i-1)),metadata:{bedtime:i<14?'00:30':'23:30'}})),full=compute(dataset(history));
  assert.equal((full.derived['baseline:Sleep timing:28'].value as any).range,null);
  assert.equal((full.derived['trend:Sleep timing:28'].value as any).state,'insufficient data');
});
test('AI extraction units are normalized deterministically and unknown units require correction',()=>{
  const draft={kind:'water' as const,defaults:{name:'Water',value:1.5,unit:'litres'},confidence:'low',explanation:'Review extracted facts.'};
  assert.equal(normalizeCaptureDraft(draft).defaults.value,1500);assert.equal(normalizeCaptureDraft({...draft,defaults:{...draft.defaults,unit:'cups'}}).defaults.value,'');
  assert.equal(normalizeCaptureDraft({...draft,kind:'sleep',defaults:{value:480,unit:'minutes'}}).defaults.value,8);
});


test('description-only meals remain missing nutrient observations in the shared baseline engine',()=>{
  const d=dataset([record({type:'meal',metadata:{notes:'Nutrition not recorded'}})]);
  assert.equal(dailyMetric(d,'Calories',date).value,null);assert.equal(dailyMetric(d,'Protein',date).value,null);
});
