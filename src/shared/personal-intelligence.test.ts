import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineQuality, dailyObservations, personalTrend, todayPriority } from './personal-intelligence.js';
import { matchesSearch } from './terminology.js';
import { waterMillilitres, sleepDurationHours } from './biology.js';
const points=(count:number,value:(index:number)=>number|null)=>Array.from({length:count},(_,index)=>({date:`2026-09-${String(index+1).padStart(2,'0')}`,value:value(index)}));
test('personal ranges require fourteen distinct days and sufficient window coverage',()=>{
  assert.equal(baselineQuality(points(13,()=>60),'2026-09-01','2026-09-28').range,null);
  const result=baselineQuality(points(14,index=>54+index%3),'2026-09-01','2026-09-28');
  assert.deepEqual(result.range,{low:54,high:56});assert.equal(result.samples,14);assert.equal(result.confidence,'medium');
  assert.equal(baselineQuality(points(14,()=>60),'2026-09-01','2026-10-30').range,null);
});
test('ambiguous days, invalid dates and nonfinite values never inflate evidence',()=>{
  assert.deepEqual(dailyObservations([{date:'2026-09-31',value:50},{date:'2026-09-01',value:Infinity},{date:'2026-09-02',value:60},{date:'2026-09-02',value:61}]),[]);
});
test('trends require samples in both halves and suppress tiny changes',()=>{
  assert.equal(personalTrend(points(28,index=>index<14?null:8)).state,'insufficient data');
  assert.equal(personalTrend(points(28,index=>index<14?8:8.05)).state,'stable');
  assert.equal(personalTrend(points(28,index=>index<14?6:8)).state,'increasing');
  assert.equal(personalTrend(points(28,index=>index<14?8:6)).state,'decreasing');
  assert.equal(personalTrend(points(28,index=>index%2?2:10)).state,'unusually variable');
});
test('trend is independent of input order and reports observed window counts',()=>{
  const rows=points(28,index=>index<14?6:8);
  assert.deepEqual(personalTrend(rows),personalTrend(rows.reverse()));
  assert.equal(personalTrend(rows).beforeCount,14);assert.equal(personalTrend(rows).afterCount,14);
});
test('registry expands domain synonyms without exposing private records',()=>{
  assert.equal(matchesSearch('nutrition','Eat'),true);
  assert.equal(matchesSearch('medical','Health'),true);
  assert.equal(matchesSearch('body measurements','Body Measurements'),true);
  assert.equal(matchesSearch('weekly report','Export weekly report Reports'),true);
  assert.equal(matchesSearch('sleep','Train'),false);
});
test('shared priority has an explicit missing-data state and conservative recovery action',()=>{
  assert.equal(todayPriority({readiness:null,readinessCategory:'Unknown',confidence:'Low'}).destination,'checkIn');
  assert.equal(todayPriority({readiness:35,readinessCategory:'Recovery',confidence:'Low',plannedWorkout:'Squats'}).destination,'Recover');
});
test('shared capture units preserve meaning across views and reject unknown units',()=>{
  assert.equal(waterMillilitres({value:2,unit:'L'}),2000);
  assert.equal(waterMillilitres({value:500,unit:'mL'}),500);
  assert.equal(waterMillilitres({value:2,unit:'cups'}),null);
  assert.equal(sleepDurationHours({value:480,unit:'minutes'}),8);
  assert.equal(sleepDurationHours({value:28800,unit:'seconds'}),8);
});
test('a saved medication reminder is visible without assuming that a dose was missed',()=>{
  const input={readiness:88,readinessCategory:'Ready',confidence:'High',plannedWorkout:'Strength',medicationReminder:'Saved schedule'};
  const recommendation=todayPriority(input);
  assert.equal(recommendation.destination,'Timeline');assert.match(recommendation.description,/does not establish a missed dose/);
  assert.equal(todayPriority({...input,activeWorkout:'Active session'}).destination,'Tracker');
});
