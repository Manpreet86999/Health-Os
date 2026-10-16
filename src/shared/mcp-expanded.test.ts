import test from 'node:test';
import assert from 'node:assert/strict';
import {executeHealthAction,type HealthActionServices,type ActionRecord} from './health-action-registry.js';
import {bioSchema,dateOf,type BioRecord} from './biology.js';
import {defaultProfile} from './defaults.js';
import {starterWeek} from '../server/db/seed.js';
import {emptySkinState} from './skin.js';
import {fingerprint,type Dataset} from './automation-model.js';
import {recordHash,type RecordService} from './intelligence/contracts.js';
import {HealthActionRegistry} from './intelligence/actions.js';
import {HealthStateService} from './intelligence/state.js';
import {actionDefinitions} from './mcp-contracts.js';
import type {AppDb} from './types.js';
import type {TrackerState} from '../client/lib/types.js';

function fixture(){
 let rows:BioRecord[]=[],draft:TrackerState|null=null,commits=0,finishes=0;
 const date=dateOf(new Date().toISOString()),db={meta:{activeWeekId:'week-1'},profile:defaultProfile(),weeks:[starterWeek()],sessions:[],targets:[],habits:[],habitLogs:[],measurements:[],readiness:[],cardio:[],scheduledWorkouts:[],painLogs:[],goalCheckIns:[],trainingConfig:{volumeLandmarks:[],exerciseFamilies:{},reminders:{train:false,readiness:false,weeklyReview:false}},exercises:[]} as unknown as AppDb;
 const dataset:Dataset={userId:'owner',records:rows,skin:emptySkinState(),db};
 const seed=(r:Partial<BioRecord>&Pick<BioRecord,'id'|'type'|'domain'|'name'>)=>{const now=new Date().toISOString();const row=bioSchema.parse({userId:'owner',deviceId:'test',revision:1,unit:'',source:'test',timestamp:date+'T12:00:00Z',createdAt:now,updatedAt:now,quality:'manual',syncState:'saved',metadata:{},...r});rows.push(row);return row;};
 const commit:RecordService['commit']=async(writes,deletes,expected)=>{
  for(const e of [...expected,...deletes]){const row=rows.find(r=>r.id===e.id);if((row?.revision??null)!==e.revision||e.fingerprint&&row&&recordHash(row)!==e.fingerprint)throw new Error('transaction conflict');}
  const stamp=new Date().toISOString(),next=structuredClone(rows);
  for(const w of writes){const old=next.find(r=>r.id===w.id);const parsed=bioSchema.parse({userId:'owner',deviceId:'test',unit:'',source:'HEOS MCP',timestamp:stamp,createdAt:old?.createdAt||stamp,quality:'manual',syncState:'pending',...w,updatedAt:stamp,revision:(old?.revision||0)+1});if(old)Object.assign(old,parsed);else next.push(parsed);}
  for(const d of deletes)next.find(r=>r.id===d.id)!.deletedAt=stamp;
  rows.splice(0,rows.length,...next);commits++;
 };
 const services:HealthActionServices={dataset,readRecords:async()=>rows,commit,saveMany:async writes=>commit(writes,[],writes.map(w=>({id:w.id,revision:rows.find(r=>r.id===w.id)?.revision??null}))),readWorkout:()=>draft,saveWorkout:async(expected,next)=>{assert.equal(fingerprint(draft),expected);draft=next;},finishWorkout:async t=>{const previous=db.sessions.find(s=>s.id===t.id);if(!previous){db.sessions.push({...t,id:t.id!,status:'finished'} as any);finishes++;}return {id:t.id!};},weightUnit:'kg'};
 return {date,db,rows,seed,services,draft:()=>draft,setDraft:(t:TrackerState|null)=>draft=t,commits:()=>commits,finishes:()=>finishes,call:async(id:keyof typeof actionDefinitions,input:any,receipt=crypto.randomUUID())=>executeHealthAction(id,input,services,receipt) as Promise<any>};
}
const key=(suffix:string)=>({idempotencyKey:'expanded-'+suffix});

test('hydration normalizes units, validates converted bounds and replays without a duplicate',async()=>{
 const f=fixture(),receipt=crypto.randomUUID(),input={...key('water'),amount:.5,unit:'L',date:f.date};
 const first=await f.call('nutrition.log_water',input,receipt);assert.equal(first.undoable,true);assert.deepEqual(await f.call('nutrition.log_water',input,receipt),first);
 assert.equal(f.rows.filter(r=>r.type==='water').length,1);assert.equal((await f.call('nutrition.get_water',{})).data.totalMl,500);
 await assert.rejects(f.call('nutrition.log_water',{...key('bad-water'),amount:30,unit:'L'}),/20000/);assert.equal(f.rows.filter(r=>r.type==='water').length,1);
});
test('sleep, measurement and step logging use canonical values and daily step totals replace rather than add',async()=>{
 const f=fixture();await f.call('sleep.log_session',{...key('sleep'),hours:7.5,quality:8});await f.call('body.log_measurement',{...key('waist'),metric:'Waist',value:30,unit:'in'});
 await f.call('body.log_steps',{...key('steps1'),steps:4000});await f.call('body.log_steps',{...key('steps2'),steps:6000});
 assert.equal((await f.call('sleep.get_history',{})).data.items[0].hours,7.5);assert.equal((await f.call('body.get_measurements',{})).data.items[0].waist,76.2);
 const history=(await f.call('body.get_history',{metric:'Steps'})).data.items;assert.equal(history.length,1);assert.equal(history[0].value,6000);
});
test('partial readiness captures only explicitly supplied fields',async()=>{
 const f=fixture();await f.call('recovery.log_check_in',{...key('checkin'),energy:7,soreness:2,stress:3});const check=f.rows.find(r=>r.type==='checkIn')!;
 assert.equal(check.metadata.sleepHours,undefined);assert.equal(check.metadata.mood,undefined);const ready=(await f.call('recovery.get_readiness',{})).data;assert.ok(ready.missing.includes('Sleep'));
});
test('bounded histories paginate stably and exclude other owners and medical records',async()=>{
 const f=fixture();for(let n=0;n<3;n++)f.seed({id:'weight-'+n,type:'vital',domain:'Body',name:'Weight',value:70+n,unit:'kg',metadata:{metric:'Weight',notes:'private-note'}});
 f.seed({id:'foreign',userId:'other',type:'vital',domain:'Body',name:'Weight',value:99,unit:'kg',metadata:{metric:'Weight'}});f.seed({id:'medical',type:'vital',domain:'Health',name:'Private medical weight',value:66,unit:'kg',metadata:{metric:'Weight'}});
 const first=(await f.call('body.get_history',{limit:2})).data,second=(await f.call('body.get_history',{limit:2,offset:2})).data;
 assert.equal(first.total,3);assert.equal(first.nextOffset,2);assert.equal(second.items.length,1);assert.equal(second.nextOffset,null);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,3);assert.ok(!JSON.stringify(first).includes('private-note'));
 assert.equal(actionDefinitions['body.get_history'].schema.safeParse({days:367}).success,false);
});
test('weight correction requires a fresh revision and preserves the original date',async()=>{
 const f=fixture(),old=f.seed({id:'weight',type:'vital',domain:'Body',name:'Weight',value:80,unit:'kg',metadata:{metric:'Weight'}});
 await f.call('body.correct_weight',{...key('correction'),recordId:old.id,expectedRevision:1,weight:75,unit:'kg'});assert.equal(f.rows.find(r=>r.id==='weight')!.timestamp,old.timestamp);assert.equal(f.rows.find(r=>r.id==='weight')!.value,75);
 await assert.rejects(f.call('body.correct_weight',{...key('stale'),recordId:old.id,expectedRevision:1,weight:76,unit:'kg'}),/changed/);assert.equal(f.rows.find(r=>r.id==='weight')!.value,75);
});
test('nutrition targets preserve unspecified nutrients and day completion does not invent meals',async()=>{
 const f=fixture();f.seed({id:'targets',type:'nutritionTarget',domain:'Eat',name:'Targets',metadata:{protein:120,calories:2200,iron:12}});
 await f.call('nutrition.set_targets',{...key('targets'),protein:150});assert.deepEqual(f.rows.find(r=>r.id==='targets')!.metadata,{protein:150,calories:2200,iron:12});
 await f.call('nutrition.mark_day_complete',{...key('complete'),date:f.date});assert.equal(f.rows.filter(r=>r.type==='meal').length,0);assert.equal(f.rows.find(r=>r.type==='nutritionDay')!.metadata.complete,true);
});
test('saved meal planning and consumption freeze nutrition provenance and cannot confirm twice',async()=>{
 const f=fixture();f.seed({id:'recipe',type:'recipe',domain:'Eat',name:'Yogurt recipe',value:1,unit:'serving',source:'Saved recipe label',metadata:{calories:100,protein:10}});
 const plan=await f.call('nutrition.plan_recipe',{...key('recipe-plan'),recipeId:'recipe',date:f.date,meal:'Breakfast',portions:2});assert.equal(f.rows.filter(r=>r.type==='meal').length,0);
 const planId=plan.changedRecords[0].id;await f.call('nutrition.confirm_planned_meal',{...key('consume'),planId,expectedRevision:1});
 const meal=f.rows.find(r=>r.type==='meal')!;assert.equal(meal.metadata.calories,200);assert.equal(meal.metadata.protein,20);assert.match(String(meal.metadata.foodItems),/Saved recipe label/);assert.equal(f.rows.find(r=>r.id===planId)!.metadata.confirmed,true);
 await assert.rejects(f.call('nutrition.confirm_planned_meal',{...key('consume2'),planId,expectedRevision:2}),/already logged/);assert.equal(f.rows.filter(r=>r.type==='meal').length,1);
});
test('meal corrections replace nutrition provenance instead of retaining unknown values from the old meal',async()=>{
 const f=fixture();f.seed({id:'oats',type:'food',domain:'Eat',name:'Oats',value:100,unit:'g',metadata:{calories:380,protein:10}});f.seed({id:'meal',type:'meal',domain:'Eat',name:'Old meal',metadata:{calories:200,protein:20,fat:15,sodium:300,foodId:'old-food',notes:'Keep this note',meal:'Breakfast'}});
 await f.call('nutrition.correct_meal',{...key('correct-meal'),recordId:'meal',expectedRevision:1,text:'100 g Oats',meal:'Breakfast'});
 const meal=f.rows.find(r=>r.id==='meal')!;assert.equal(meal.metadata.calories,380);assert.equal(meal.metadata.protein,10);assert.equal(meal.metadata.fat,undefined);assert.equal(meal.metadata.sodium,undefined);assert.equal(meal.metadata.foodId,undefined);assert.equal(meal.metadata.notes,'Keep this note');assert.match(String(meal.metadata.foodItems),/oats/);
});
test('malformed saved meal plans cannot invent portions or commit consumption',async()=>{
 const f=fixture();f.seed({id:'recipe',type:'recipe',domain:'Eat',name:'Recipe',metadata:{calories:100,protein:10}});f.seed({id:'plan',type:'mealPlan',domain:'Eat',name:'Plan',metadata:{date:f.date,meal:'Breakfast',recipeId:'recipe',portions:0}});
 await assert.rejects(f.call('nutrition.confirm_planned_meal',{...key('bad-plan'),planId:'plan',expectedRevision:1}),/portion/);assert.equal(f.rows.filter(r=>r.type==='meal').length,0);assert.equal(f.rows.find(r=>r.id==='plan')!.revision,1);
});
test('goal and habit workflows persist visible application records and avoid duplicate habit completion',async()=>{
 const f=fixture(),goal=await f.call('goals.create',{...key('goal'),name:'Walking mission',metric:'Custom',target:10});const goalId=goal.changedRecords[0].id;
 await f.call('goals.log_progress',{...key('progress'),goalId,value:4});assert.equal((await f.call('goals.get_progress',{goalId})).data.percent,40);
 await f.call('goals.update',{...key('update'),goalId,expectedRevision:1,status:'completed'});assert.equal((await f.call('goals.get_active',{})).data.length,0);
 const habit=await f.call('habits.create',{...key('habit'),name:'Evening walk'}),habitId=habit.changedRecords[0].id;await f.call('habits.complete',{...key('done'),habitId});await f.call('habits.complete',{...key('done2'),habitId});assert.equal(f.rows.filter(r=>r.type==='habitDone').length,1);assert.equal((await f.call('habits.get_today',{})).data[0].completed,true);
});
test('new persistent changes retain explicit-request and owner-approval requirements in the application registry',async()=>{
 const f=fixture(),states=new HealthStateService(),registry=new HealthActionRegistry({actor:'owner',records:{read:f.services.readRecords,commit:f.services.commit!},data:()=>f.services.dataset,state:date=>states.observe(f.services.dataset,date||f.date),training:{read:()=>null,compareAndSet:async()=>{}}});
 await assert.rejects(registry.executeMcp('goals.create',{...key('approval'),name:'Goal',metric:'Custom',target:5},crypto.randomUUID(),{userId:'owner',idempotencyKey:'ignored'}),/Approve/);
 await assert.rejects(registry.executeMcp('nutrition.log_water',{...key('explicit'),amount:250},crypto.randomUUID(),{userId:'owner',idempotencyKey:'ignored'}),/explicit request/);
 await assert.rejects(registry.executeMcp('nutrition.log_water',{...key('owner'),amount:250},crypto.randomUUID(),{userId:'other',idempotencyKey:'ignored',explicitlyRequested:true}),/Account/);assert.equal(f.rows.length,0);
});
test('new reversible observations can be undone atomically and edited observations cannot',async()=>{
 const f=fixture(),receipt=crypto.randomUUID();await f.call('nutrition.log_water',{...key('undo-water'),amount:250},receipt);await f.call('health.undo_action',{...key('undo'),receiptId:receipt});assert.ok(f.rows.find(r=>r.type==='water')!.deletedAt);
});
function workout(){const f=fixture();f.setDraft({id:'workout',weekId:'week-1',weekName:'Week',weekNumber:1,dayKey:'Mon',dayTitle:'Workout',date:f.date,name:'Workout',sleep:'',soreness:'',index:0,logs:[],exercises:[{name:'Bench',target:'Chest',vol:'1 x 8'},{name:'Plank',target:'Core',vol:'1 x 60',trackingMode:'time'}]});return f;}
test('complete workout lifecycle supports timed sets and saves the normal finished session once',async()=>{
 const f=workout();await f.call('training.log_set',{...key('bench'),workoutId:'workout',exercise:'Bench',setNumber:1,weight:70,reps:8,unit:'kg'});await f.call('training.next_exercise',{...key('next'),workoutId:'workout',exercise:'Bench'});
 await f.call('training.log_timed_set',{...key('plank'),workoutId:'workout',exercise:'Plank',setNumber:1,seconds:60});await f.call('training.next_exercise',{...key('last'),workoutId:'workout',exercise:'Plank'});
 assert.equal((await f.call('training.get_active_workout',{})).data.readyToFinish,true);const receipt=crypto.randomUUID(),input={...key('finish'),workoutId:'workout'},result=await f.call('training.finish_workout',input,receipt);assert.deepEqual(await f.call('training.finish_workout',input,receipt),result);assert.equal(f.draft(),null);assert.equal(f.finishes(),1);assert.equal(f.db.sessions[0].logs[1].sets[0].durationSec,60);assert.equal((await f.call('training.get_history',{})).data.total,1);
});
test('workout advancement and finish reject unfinished, mismatched and silently skipped exercises',async()=>{
 const f=workout();await assert.rejects(f.call('training.next_exercise',{...key('empty'),workoutId:'workout',exercise:'Bench'}),/Log a set/);await assert.rejects(f.call('training.finish_workout',{...key('unfinished'),workoutId:'workout'}),/each exercise/);
 await f.call('training.log_set',{...key('set'),workoutId:'workout',exercise:'Bench',setNumber:1,weight:70,reps:8,unit:'kg'});await assert.rejects(f.call('training.next_exercise',{...key('skip'),workoutId:'workout',exercise:'Bench',skip:true}),/cannot be skipped/);
 await assert.rejects(f.call('training.log_timed_set',{...key('wrongmode'),workoutId:'workout',exercise:'Bench',setNumber:2,seconds:60}),/tracking mode/);assert.equal(f.db.sessions.length,0);
});
test('custom workout creation and replacement preserve weekly programming and reject stale plans',async()=>{
 const f=fixture(),before=JSON.stringify(f.db.weeks),exercises=[{name:'Push up',target:'Chest',sets:2,reps:12,trackingMode:'reps'}];
 await f.call('training.start_custom_workout',{...key('custom'),name:'Home workout',exercises});const draft=f.draft()!,workoutId=draft.id!;
 await f.call('training.replace_exercises',{...key('replace'),workoutId,stateToken:fingerprint(draft),exercises:[{name:'Push up',target:'Chest',sets:1,reps:10,trackingMode:'reps'}]});
 await assert.rejects(f.call('training.replace_exercises',{...key('stale-plan'),workoutId,stateToken:fingerprint(draft),exercises}),/changed/);
 await f.call('training.log_reps_set',{...key('reps'),workoutId,exercise:'Push up',setNumber:1,reps:10});assert.equal(f.draft()!.currentEntry!.completedRecords![0].w,'');assert.equal(f.draft()!.currentEntry!.completedRecords![0].r,10);
 await assert.rejects(f.call('training.replace_exercises',{...key('after-set'),workoutId,stateToken:fingerprint(f.draft()),exercises}),/first set/);assert.equal(JSON.stringify(f.db.weeks),before);
});
test('finish retries recover a saved session when receipt persistence fails',async()=>{
 const f=workout();f.draft()!.logs=[{name:'Bench',target:'Chest',status:'completed',sets:[{s:1,w:70,r:8}]}];f.draft()!.index=2;
 const save=f.services.saveMany;let fail=true;f.services.saveMany=async rows=>{if(fail){fail=false;throw new Error('outbox unavailable');}await save(rows);};const receipt=crypto.randomUUID(),input={...key('recover'),workoutId:'workout'};
 await assert.rejects(f.call('training.finish_workout',input,receipt),/outbox/);assert.equal(f.finishes(),1);assert.ok(f.draft());await f.call('training.finish_workout',input,receipt);assert.equal(f.finishes(),1);assert.equal(f.draft(),null);
});
test('finish retries clear an unchanged draft after a persisted receipt, without saving another session',async()=>{
 const f=workout();f.draft()!.logs=[{name:'Bench',target:'Chest',status:'completed',sets:[{s:1,w:70,r:8}]}];f.draft()!.index=2;
 const save=f.services.saveWorkout!;let fail=true;f.services.saveWorkout=async(...args)=>{if(fail){fail=false;throw new Error('draft save failed');}await save(...args);};const receipt=crypto.randomUUID(),input={...key('clear'),workoutId:'workout'};
 await assert.rejects(f.call('training.finish_workout',input,receipt),/draft save/);await f.call('training.finish_workout',input,receipt);assert.equal(f.finishes(),1);assert.equal(f.draft(),null);
});
test('long period reports disclose missing data and exclude symptoms, care notes and other accounts',async()=>{
 const f=fixture();f.seed({id:'private',type:'symptom',domain:'Health',name:'Private symptom',metadata:{notes:'medical-secret'}});f.seed({id:'foreign-sleep',type:'sleep',domain:'Recover',name:'Other sleep',userId:'other',value:12,unit:'hours'});
 const report=(await f.call('reports.get_period',{days:90})).data;assert.equal(report.days,90);assert.equal(report.averageSleep,null);assert.equal(report.coverage.sleepDays,0);assert.ok(!JSON.stringify(report).includes('medical-secret'));assert.equal(report.supplementAdherence,undefined);assert.equal(report.careAdherence,undefined);
});
test('question context respects its requested observation window and does not fabricate baselines',async()=>{
 const f=fixture(),old=new Date(`${f.date}T12:00:00`);old.setDate(old.getDate()-10);f.seed({id:'old-sleep',type:'sleep',domain:'Recover',name:'Older sleep',timestamp:old.toISOString(),value:6,unit:'hours'});f.seed({id:'sleep',type:'sleep',domain:'Recover',name:'Sleep',value:8,unit:'hours'});
 const short=(await f.call('health.get_context',{purpose:'Sleep history',timeRange:'7d'})).data,long=(await f.call('health.get_context',{purpose:'Sleep history',timeRange:'14d'})).data;
 assert.equal(short.evidence.find(r=>r.metric==='Sleep').samples,1);assert.equal(long.evidence.find(r=>r.metric==='Sleep').samples,2);assert.equal(long.baselineWindow,'14d');assert.equal(short.evidence.find(r=>r.metric==='Energy').average,null);
});
