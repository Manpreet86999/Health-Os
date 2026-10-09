import assert from 'node:assert/strict';
import test from 'node:test';
import { todayPriority } from '../src/shared/personal-intelligence';

const ready = {readiness:88,readinessCategory:'Ready',confidence:'Moderate',plannedWorkout:'Strength day'};
test('an active session remains the primary action even with missing or low readiness',()=>{
  for(const readiness of [null,20]) assert.equal(todayPriority({...ready,readiness,readinessCategory:'Recovery',activeWorkout:'Saved session'}).destination,'Tracker');
});
test('missing data asks for a check-in instead of claiming training readiness',()=>{
  assert.equal(todayPriority({...ready,readiness:null}).destination,'checkIn');
});
test('recovery guidance consumes the shared category rather than inventing score cutoffs',()=>{
  for(const readinessCategory of ['Recovery','Reduced','Take it easy']) assert.equal(todayPriority({...ready,readinessCategory}).destination,'Recover');
  assert.equal(todayPriority({...ready,readiness:55,readinessCategory:'Steady'}).destination,'Dashboard');
});
test('limited evidence is visible and an absent plan never becomes a fictional workout',()=>{
  assert.equal(todayPriority({...ready,confidence:'Low'}).status,'Limited signals');
  assert.equal(todayPriority({...ready,plannedWorkout:undefined}).title,'Move at your pace');
});
