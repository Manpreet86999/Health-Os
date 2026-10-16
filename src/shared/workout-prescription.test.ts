import test from 'node:test';
import assert from 'node:assert/strict';
import {prescriptionSetCount,repairedSetCardCount} from './workout-prescription.js';
import {parseRepRange} from './training.js';
import {setSuggestion} from './automation-rules.js';

test('explicit prescriptions keep three sets across formats; reps and seconds never become set counts',()=>{
 for(const volume of ['3 x 15','3 × 15','3✕15','3 sets · 15 reps','15 reps × 3 sets','45 seconds × 3','3 rounds · 45 seconds','15 reps','15–20 reps','45 seconds','3 x 45 seconds','3 sets x 15 reps'])assert.equal(prescriptionSetCount(volume),3,volume);
 assert.equal(prescriptionSetCount('4 x 8-12'),4);assert.equal(prescriptionSetCount('2 sets · 30 seconds'),2);
 for(const volume of ['', '999999 x 8','0 sets','45'])assert.equal(prescriptionSetCount(volume),3);
 assert.deepEqual(parseRepRange('15 reps × 3 sets'),{sets:3,low:15,high:15});
 assert.deepEqual(parseRepRange('15 x 3 sets'),{sets:3,low:15,high:15});
 assert.equal(setSuggestion({name:'Plank',target:'Core',vol:'45 seconds',cue:'',trackingMode:'time'},undefined).durationSec,45);
});
test('repair of inflated drafts preserves confirmed entries, warm-ups and deliberate additions',()=>{
 assert.equal(repairedSetCardCount('45 seconds',45,[]),3);
 assert.equal(repairedSetCardCount('15 reps',15,[0,1]),3);
 assert.equal(repairedSetCardCount('45 seconds',45,[0,8]),9);
 assert.equal(repairedSetCardCount('15 reps',17,[],2),5);
 assert.equal(repairedSetCardCount('3 x 15',5,[]),5);
 assert.equal(repairedSetCardCount('15 reps',16,[]),16);
});
