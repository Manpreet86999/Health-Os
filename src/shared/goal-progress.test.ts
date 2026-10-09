import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFromRecords } from './record-snapshot.js';
import { computeMetrics } from './metrics.js';
test('goals use latest dated check-in even before cloud sync updates the target record',()=>{
  const db=snapshotFromRecords([]);
  db.targets=[{id:'goal',name:'Strength',type:'strength',current:20,target:80,createdAt:'2026-09-01'}];
  db.goalCheckIns=[{id:'new',goalId:'goal',date:'2026-09-09',value:60,createdAt:'2026-09-09'},{id:'old',goalId:'goal',date:'2026-09-01',value:30,createdAt:'2026-09-10'}];
  const goal=computeMetrics(db).goalProgress[0];assert.equal(goal.current,60);assert.equal(goal.percent,75);
});
test('lower-is-better goals are not completed while the current value remains above target',()=>{
  const db=snapshotFromRecords([]);db.targets=[{id:'goal',name:'Body fat',type:'body-fat',current:25,target:20,createdAt:'2026-09-01'}];
  assert.equal(computeMetrics(db).goalProgress[0].status,'active');
  assert.equal(computeMetrics(db).goalProgress[0].percent,80);
});
