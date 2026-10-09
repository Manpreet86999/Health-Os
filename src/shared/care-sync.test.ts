import assert from 'node:assert/strict';
import test from 'node:test';
import {careRecords,careFromRecords} from './care-sync.js';
import {emptyCareData,type CareTask} from './skin.js';

const task=(id:string):CareTask=>({id,label:id,area:'face',productId:'',days:[],time:'morning',minutes:2,notes:'',paused:false});
test('care task order survives record transport arriving in a different order',()=>{
  const care={...emptyCareData(),tasks:[task('third-id'),task('first-id'),task('second-id')]};
  const records=careRecords(care,'web');
  const downloaded=careFromRecords([...records].reverse());
  assert.deepEqual(downloaded.tasks.map(t=>t.id),care.tasks.map(t=>t.id));
  assert.equal(care.tasks[0].order,undefined);
});
test('legacy care tasks retain their incoming order and tombstones remain removed',()=>{
  const records=careRecords({...emptyCareData(),tasks:[task('a'),task('b')]},'web').map(r=>r.entityType==='careTask'?{...r,payload:task(r.id)}:r);
  assert.deepEqual(careFromRecords(records).tasks.map(t=>t.id),['a','b']);
  assert.deepEqual(careFromRecords(records.map(r=>r.id==='a'?{...r,deletedAt:'2026-10-03T12:00:00Z'}:r)).tasks.map(t=>t.id),['b']);
});
