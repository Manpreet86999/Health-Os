import test from 'node:test';
import assert from 'node:assert/strict';
import { bioSchema, type BioRecord } from './biology.js';
import { actionPolicy, orchestrateIntelligence, verifyAgentWrite, recordFingerprint, intelligenceSnapshot } from './agentic-intelligence.js';
import { emptySkinState } from './skin.js';
import { starterWeek } from '../server/db/seed.js';
import { defaultProfile } from './defaults.js';
import type { AppDb } from './types.js';
import type { Dataset } from './automation-model.js';
const date='2026-10-11';
function record(p:Partial<BioRecord>={}):BioRecord{return bioSchema.parse({id:'recipe-one',userId:'owner',domain:'Eat',type:'recipe',name:'Saved dal',timestamp:`${date}T12:00:00Z`,source:'Manual',deviceId:'test',quality:'manual',syncState:'saved',revision:1,createdAt:`${date}T12:00:00Z`,updatedAt:`${date}T12:00:00Z`,unit:'',metadata:{protein:20},...p});}
function data(records:BioRecord[]=[]):Dataset{return {userId:'owner',records,skin:emptySkinState(),db:{meta:{activeWeekId:'week-1'},profile:defaultProfile(),weeks:[starterWeek()],sessions:[],targets:[],habits:[],habitLogs:[],measurements:[],readiness:[],cardio:[],scheduledWorkouts:[],painLogs:[],goalCheckIns:[],trainingConfig:{volumeLandmarks:[],exerciseFamilies:{},reminders:{train:false,readiness:false,weeklyReview:false}},exercises:[]} as unknown as AppDb};}

test('Intelligence worker snapshots turn a workout draft into recommendation text without mutating it',()=>{
 const draft={id:'active-draft',dayTitle:'Pull day',date,logs:[{name:'Row',sets:[{w:'40',r:'8'}]}],exercises:[{name:'Row'}],index:1};
 const input={...data(),activeWorkout:draft},before=JSON.stringify(input);
 const snapshot=intelligenceSnapshot(input,date);
 assert.equal(snapshot.context.priority.id,'active-workout');
 assert.equal(snapshot.context.priority.recommendation,'Pull day');
 assert.equal(snapshot.context.priority.action.page,'Tracker');
 assert.ok(snapshot.priorities.every(item=>typeof item.recommendation==='string'));
 assert.equal(snapshot.evidence.recommendation.recommendation,'Pull day');
 assert.equal(JSON.stringify(input),before);
 assert.equal(intelligenceSnapshot({...data(),activeWorkout:{id:'older-draft',logs:[]}},date).context.priority.recommendation,'Workout in progress');
});
test('meal planning produces an approved-service proposal without logging intake or mutating sources',()=>{
  const d=data([record()]),before=JSON.stringify(d),reply=orchestrateIntelligence(d,date,'Plan dinner','general');
  assert.equal(reply.specialist,'nutri');assert.equal(reply.proposal?.payload.type,'mealPlan');assert.equal(reply.proposal?.payload.metadata.recipeId,'recipe-one');assert.equal(JSON.stringify(d),before);
  assert.throws(()=>actionPolicy(reply.proposal!,false,d.records),/Approve/);
  assert.equal(actionPolicy(reply.proposal!,true,d.records).tool,'plan_meal');
});
test('approval rejects stale source, resolved action and tool/domain mismatch',()=>{
  const d=data([record()]),p=orchestrateIntelligence(d,date,'Plan dinner','nutri').proposal!;
  assert.throws(()=>actionPolicy(p,true,[record({revision:2})]),/source records changed/);
  assert.throws(()=>actionPolicy({...p,status:'executed'},true,d.records),/already/);
  assert.throws(()=>actionPolicy({...p,payload:{...p.payload,type:'goal'}},true,d.records),/cannot write/);
  assert.notEqual(recordFingerprint(d.records,p.sourceIds),recordFingerprint([],p.sourceIds));
});
test('verification rejects missing, deleted and changed records',()=>{
  const actual=record(),expected={id:actual.id,type:actual.type,name:actual.name,metadata:actual.metadata};
  assert.equal(verifyAgentWrite(expected,actual),true);assert.equal(verifyAgentWrite(expected,undefined),false);
  assert.equal(verifyAgentWrite(expected,{...actual,deletedAt:new Date().toISOString()}),false);
  assert.equal(verifyAgentWrite(expected,{...actual,metadata:{protein:5}}),false);
  assert.equal(verifyAgentWrite(expected,{...actual,metadata:{...actual.metadata,notes:'user edited'}}),false);
});
test('no intake and no saved recipe remain unknown; medical writes are unavailable',()=>{
  assert.match(orchestrateIntelligence(data(),date,'What protein is left?','nutri').answer,/No protein intake/);
  assert.equal(orchestrateIntelligence(data(),date,'Plan dinner','general').proposal,undefined);
  const medical=orchestrateIntelligence(data(),date,'Change my dosage','medical');assert.equal(medical.proposal,undefined);assert.match(medical.answer,/clinical review/);
  assert.equal(intelligenceSnapshot(data(),date).metrics.find(m=>m.metric==='Sleep')?.value,null);
});
test('mission and recovery writes are reversible proposals; unfamiliar questions request consented AI',()=>{
  assert.equal(orchestrateIntelligence(data(),date,'Create a mission: Improve consistency','general').proposal?.payload.name,'Improve consistency');
  assert.equal(orchestrateIntelligence(data(),date,'Save a recovery plan','recover').proposal?.tool,'save_recovery_plan');
  assert.equal(orchestrateIntelligence(data(),date,'How should I manage my exam schedule?','general').needsModel,true);
});

test('today workout answer includes the saved prescription and scheduled day override',()=>{
 const d=data();const week=d.db.weeks[0];week.days[0].title='LEGS B — POSTERIOR CHAIN & GLUTES';week.days[0].exercises=[{name:'Romanian deadlift',target:'Hamstrings',vol:'3 x 8',rirTarget:2,restSec:120,notes:'Controlled lowering'},{name:'Hip thrust',target:'Glutes',vol:'4 x 10'}];
 d.db.scheduledWorkouts=[{id:'scheduled',date,weekId:week.id,dayKey:week.days[0].key,status:'planned'} as any];
 const before=JSON.stringify(d),reply=orchestrateIntelligence(d,date,'what is my today workout plan','general');
 assert.equal(reply.specialist,'train');assert.match(reply.answer,/Romanian deadlift — 3 x 8 · RIR 2 · Rest 120 sec/);assert.match(reply.answer,/2\. Hip thrust — 4 x 10/);assert.match(reply.answer,/Controlled lowering/);assert.equal(JSON.stringify(d),before);
});

test('skincare build maps active owned products to AM and PM instead of returning a task count',()=>{
 const d=data();d.skin.products=['cleanser','moisturizer','sunscreen','treatment'].map((category,index)=>({id:`p${index}`,name:['Gentle wash','Barrier cream','Daily SPF','Night treatment'][index],brand:'Owned',category,actives:[],usedIn:category==='sunscreen'?['am']:[],status:'active',openedAt:'',expiresAt:'',notes:'',pros:[],cons:[],useCase:'',bestFor:[],createdAt:date} as any));
 d.skin.products.push({...d.skin.products[0],id:'paused',name:'PAUSED PRIVATE',status:'paused'});d.skin.products.push({...d.skin.products[0],id:'expired',name:'EXPIRED PRIVATE',expiresAt:'2025-01-01'});
 const before=JSON.stringify(d),reply=orchestrateIntelligence(d,date,'can you build my am pm skincare routine using my products','general');
 assert.equal(reply.specialist,'care');assert.match(reply.answer,/AM · Morning/);assert.match(reply.answer,/PM · Evening/);assert.match(reply.answer,/Gentle wash/);assert.match(reply.answer,/Barrier cream/);assert.match(reply.answer,/Daily SPF/);assert.match(reply.answer,/Night treatment.*haven’t added/s);assert.doesNotMatch(reply.answer,/PAUSED PRIVATE|EXPIRED PRIVATE|plan has \d+ item/);assert.equal(JSON.stringify(d),before);assert.equal(reply.proposal,undefined);
});

test('saved product-linked skincare steps and instructions take priority over category guesses',()=>{
 const d=data();d.skin.products=[{id:'p',name:'My serum',brand:'',status:'active',category:'serum',usedIn:['pm'],expiresAt:''} as any];d.skin.routines[1].steps=[{id:'step',productId:'p',label:'Existing serum step',notes:'Saved instructions',waitMin:2}];
 const reply=orchestrateIntelligence(d,date,'build my skincare routine','care');assert.match(reply.answer,/My serum — Existing serum step\. Saved instructions · Saved wait: 2 min/);
});
