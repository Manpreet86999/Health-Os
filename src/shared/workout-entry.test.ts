import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logFromPlan, parseWorkoutSet, formatWorkoutSet } from './workout-entry.js';

test('starting a planned movement retains its identity and prescription metadata', () => {
  const log = logFromPlan('Plank', {name:'Plank',target:'Core',vol:'3 x 30 sec',cue:'Brace',exerciseId:'plank',familyId:'core',supersetGroup:'A',tempo:'steady',restSec:45,trackingMode:'time',notes:'Side variation'});
  assert.equal(log.exerciseId,'plank'); assert.equal(log.familyId,'core');
  assert.equal(log.supersetGroup,'A'); assert.equal(log.plannedRestSec,45);
  assert.equal(log.trackingMode,'time'); assert.equal(log.journal,'Side variation');
});
test('timed and repetition-only sets cannot retain a stale load from a prior exercise', () => {
  const timed = parseWorkoutSet({s:1,w:100,r:8,durationSec:30,type:'work'},'time');
  assert.equal(timed.w,''); assert.equal(timed.r,''); assert.equal(timed.durationSec,30);
  assert.equal(formatWorkoutSet(timed),'30 sec');
  const reps = parseWorkoutSet({s:1,w:100,r:12,durationSec:30},'reps');
  assert.equal(reps.w,''); assert.equal(reps.durationSec,undefined);
});
test('set entry validates mode-specific values and optional effort', () => {
  assert.throws(()=>parseWorkoutSet({s:1,w:'',r:8},'weight_reps'));
  assert.throws(()=>parseWorkoutSet({s:1,w:0,r:0},'reps'));
  assert.throws(()=>parseWorkoutSet({s:1,w:0,r:1,durationSec:0},'time'));
  assert.throws(()=>parseWorkoutSet({s:1,w:20,r:8,rpe:11},'weight_reps'));
  assert.equal(parseWorkoutSet({s:1,w:0,r:8,rir:0,rpe:10,type:'drop',side:'L'},'weight_reps').rir,0);
});
