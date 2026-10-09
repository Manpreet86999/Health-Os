import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFromRecords } from './record-snapshot.js';
import { syncRecordsFromDb } from './sync.js';
import { computeMetrics } from './metrics.js';

test('desktop data round trip produces identical mobile analytics and excludes deleted records',()=>{
  const db=snapshotFromRecords([]);
  db.sessions=[{id:'session-one',status:'finished',createdAt:'2026-09-09T10:00:00Z',weekId:'week',weekName:'Week',weekNumber:1,dayKey:'Mon',dayTitle:'Push',date:'2026-09-09',name:'Athlete',sleep:'',soreness:'',logs:[{name:'Bench Press',target:'Chest',status:'completed',sets:[{s:1,w:60,r:8,type:'work'},{s:2,w:60,r:8,type:'work'}]}]}];
  db.targets=[{id:'goal',name:'Bench goal',type:'strength',current:60,target:80,unit:'kg',createdAt:'2026-09-09'}];
  db.librarySplits=[{id:'split',name:'My split',weekNumber:1,startDate:'2026-09-09',notes:'custom',active:false,days:[]}];
  const records=syncRecordsFromDb(db,'desktop');
  assert.deepEqual(snapshotFromRecords(records).librarySplits,db.librarySplits);
  assert.deepEqual(computeMetrics(snapshotFromRecords(records)),computeMetrics(db));
  const session=records.find(r=>r.entityType==='session')!;session.deletedAt='2026-09-09T11:00:00Z';
  assert.equal(computeMetrics(snapshotFromRecords(records)).totals.sessions,0);
});
