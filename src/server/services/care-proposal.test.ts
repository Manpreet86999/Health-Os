import test from 'node:test';
import assert from 'node:assert/strict';
import { careTasksForDate, emptySkinState, type CareTask } from '../../shared/skin.js';
import { validateCareProposal } from './care-proposal.js';

const task: CareTask = {id:'a',label:'Wash scalp',area:'scalp',productId:'',days:[3],time:'wash',minutes:5,notes:'',paused:false};
test('weekly care respects selected wash days and never schedules a paused action', () => {
  const care = emptySkinState().care;
  care.commitment.washDays=[3];
  care.tasks=[task,{...task,id:'paused',paused:true}];
  assert.deepEqual(careTasksForDate(care,'2026-09-23').map(t=>t.id),['a']);
  assert.deepEqual(careTasksForDate(care,'2026-09-24'),[]);
});
test('AI care proposals must use owned products and fit the commitment', () => {
  const skin=emptySkinState();
  skin.care.commitment.minutesPerDay=5;
  const raw={reason:'Keep it simple',tasks:[{label:'Moisturize',area:'face',productId:'',days:[],time:'evening',minutes:2,notes:''}]};
  assert.equal(validateCareProposal(raw,skin).tasks[0].label,'Moisturize');
  assert.throws(()=>validateCareProposal({...raw,tasks:[{...raw.tasks[0],productId:'unknown'}]},skin),/not on your active shelf/);
  assert.throws(()=>validateCareProposal({...raw,tasks:[{...raw.tasks[0],minutes:6}]},skin),/exceeds your time/);
  assert.throws(()=>validateCareProposal({...raw,tasks:[{...raw.tasks[0],notes:'Reapply outdoors, but that is not counted.'}]},skin),/hides an extra step/);
});
