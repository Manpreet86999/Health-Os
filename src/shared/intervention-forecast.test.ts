import test from 'node:test';
import assert from 'node:assert/strict';
import {bioSchema,type BioRecord} from './biology.js';
import {deriveInterventionForecastMemories} from './intelligence/intervention-forecast.js';
import type {HealthData} from './intelligence/contracts.js';
function row(id:string,day:string,patch:Partial<BioRecord>={}):BioRecord{return bioSchema.parse({id,userId:'owner',type:'journal',domain:'Today',name:'Test observation',source:'test',timestamp:day+'T12:00:00Z',createdAt:day+'T12:00:00Z',updatedAt:day+'T12:00:00Z',deviceId:'test',quality:'manual',syncState:'saved',revision:1,metadata:{},...patch});}
function episode(prefix:string,start:string,days:string[],metric='sleep_hours',expectedValue=8){const source=row(prefix+'-source',start),receipt=row(prefix+'-receipt',start,{metadata:{mcpReceipt:true,action:'sleep.set_target',result:JSON.stringify({success:true})}}),proposal=row(prefix+'-proposal',start,{metadata:{intelligenceAction:true,proposal:JSON.stringify({status:'executed',receiptId:receipt.id,payload:{metadata:{predictedOutcome:JSON.stringify({metric,expectedValue,horizonDays:3,minimumSamples:3,confidence:.7,rationale:'Use actual follow-up.',sourceIds:[source.id]})}}})}});return [source,receipt,proposal,...days.map((day,i)=>row(prefix+'-observed-'+i,day,{type:'sleep',domain:'Recover',value:6,unit:'hours'}))];}
function memories(records:BioRecord[],date='2026-10-14'){return deriveInterventionForecastMemories({userId:'owner',records} as HealthData,date);}
test('intervention forecasts require verified execution, owned source evidence and a finished measured window',()=>{
 const records=episode('one','2026-10-01',['2026-10-02','2026-10-03','2026-10-04']);const actual=memories(records);
 assert.equal(actual.length,1);assert.equal(actual[0].value.observedValue,6);assert.equal(actual[0].value.matched,false);assert.equal(actual[0].value.causal,false);assert.ok(actual[0].sourceIds.includes('one-source'));
 assert.equal(memories(records,'2026-10-03').length,0);
 assert.equal(memories(records.filter(r=>r.id!=='one-source')).length,0);
 assert.equal(memories(records.map(r=>r.id==='one-source'?{...r,userId:'foreign'}:r)).length,0);
 assert.equal(memories(records.map(r=>r.type==='sleep'?{...r,quality:'estimated' as const}:r)).length,0);
 assert.equal(memories(records.map(r=>r.id==='one-receipt'?{...r,metadata:{...r.metadata,undone:true}}:r)).length,0);
});
test('three non-overlapping recorded forecast failures generate a strategy revision, without a causal claim',()=>{
 const records=[...episode('one','2026-10-01',['2026-10-02','2026-10-03','2026-10-04']),...episode('two','2026-10-05',['2026-10-06','2026-10-07','2026-10-08']),...episode('three','2026-10-09',['2026-10-10','2026-10-11','2026-10-12'])];
 const strategies=memories(records).filter(m=>m.type==='agent_predicted_outcome_strategy');assert.equal(strategies.length,1);assert.equal(strategies[0].value.strategy,'revise_assumptions');assert.equal(strategies[0].evidenceCount,3);assert.equal(strategies[0].value.causal,false);
 assert.equal(memories(records.filter(r=>!r.id.startsWith('three-'))).filter(m=>m.layer==='stable').length,0);
});
test('planned meals cannot supply protein follow-up, even when the diary is marked complete',()=>{
 const base=episode('food','2026-10-01',[],'protein_g',100);const days=['2026-10-02','2026-10-03','2026-10-04'];
 const food=days.flatMap((day,i)=>[row('day-'+i,day,{type:'nutritionDay',domain:'Eat',metadata:{complete:true}}),row('meal-'+i,day,{type:'mealPlan',domain:'Eat',metadata:{protein:100}})]);
 assert.equal(memories([...base,...food]).length,0);
 const eaten=food.map(r=>r.type==='mealPlan'?{...r,type:'meal' as const}:r);assert.equal(memories([...base,...eaten])[0].value.observedValue,100);
});
