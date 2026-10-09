import test from 'node:test';
import assert from 'node:assert/strict';
import { researchWorkbenchSchema } from './research-workbench.js';
test('research workbench requires consent and bounded finite inputs',()=>{
  const input={operation:'change-points',consent:true,purpose:'Research test',values:Array(28).fill(60)};
  assert.equal(researchWorkbenchSchema.parse(input).track,false);
  for(const bad of [{...input,consent:false},{...input,purpose:''},{...input,values:[NaN]},{...input,values:Array(2001).fill(60)},{...input,operation:'shell'}])assert.throws(()=>researchWorkbenchSchema.parse(bad));
});
test('research workbench does not accept inferred sequence labels or unbounded training',()=>{
  const row={participantId:'p1',date:'2026-01-08',windowEnd:'2026-01-07',values:Array(7).fill([1]),label:0};
  const input={operation:'sequence',consent:true,purpose:'Research test',model:'gru',features:['signal'],outcomeDefinition:'Confirmed outcome',rows:Array(100).fill(row)};
  assert.equal(researchWorkbenchSchema.parse(input).operation,'sequence');
  assert.throws(()=>researchWorkbenchSchema.parse({...input,epochs:1000}));
  assert.throws(()=>researchWorkbenchSchema.parse({...input,rows:Array(100).fill({...row,label:null})}));
});
