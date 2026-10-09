import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptTrainingSession } from './training-adaptation.js';
import type { Exercise, PlannedExercise } from './types.js';
const original:PlannedExercise[]=[{name:'Bench',target:'Chest',vol:'3 x 10',cue:'',restSec:90},{name:'Squat',target:'Quads',vol:'4 x 8',cue:'',restSec:120}];
const library:Exercise[]=[{id:'bench',name:'Bench',aliases:[],muscles:['Chest'],equipment:'barbell',movementPattern:'push',substitutions:['pushup']},{id:'pushup',name:'Push-up',aliases:[],muscles:['Chest'],equipment:'bodyweight',movementPattern:'push',substitutions:[],trackingMode:'reps'},{id:'squat',name:'Squat',aliases:[],muscles:['Quads'],equipment:'barbell',movementPattern:'squat',substitutions:[]}];
test('session proposal uses verified equipment substitutes and does not mutate the prescription',()=>{
  const before=JSON.stringify(original),proposal=adaptTrainingSession(original,library,{equipment:['dumbbell']});
  assert.equal(proposal.proposed[0].name,'Push-up');assert.equal(proposal.proposed[0].trackingMode,'reps');assert.equal(proposal.proposed.length,1);assert.equal(JSON.stringify(original),before);
  assert.deepEqual(adaptTrainingSession(original,library,{equipment:[' All ']}).proposed,original);
  assert.deepEqual(adaptTrainingSession(original,library,{equipment:[' ']}).proposed,original);
});
test('soreness and recovery proposals remain explicit and respect a time budget',()=>{
  const proposal=adaptTrainingSession(original,library,{soreRegions:['quads'],recoveryReduced:true,minutes:10});
  assert.equal(proposal.proposed.length,1);assert.equal(proposal.proposed[0].vol,'2 x 10');assert.equal(proposal.proposed[0].rirTarget,3);assert.ok(proposal.estimatedMinutes<=10);
  assert.throws(()=>adaptTrainingSession(original,library,{minutes:NaN}),RangeError);
  assert.equal(adaptTrainingSession(original,library,{minutes:5}).proposed.length,0);
});
