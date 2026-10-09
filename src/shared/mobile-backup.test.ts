import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMobileBackup } from './mobile-backup.js';
const record={id:'one',entityType:'habit',payload:{name:'Walk'},updatedAt:'2026-09-09',revision:1,deviceId:'phone'};
const backup=(records:unknown[])=>JSON.stringify({format:'body-os-mobile',version:1,createdAt:'2026-09-09',records});
test('mobile restore rejects duplicate, malformed and unsupported backups before writing',()=>{
  assert.throws(()=>parseMobileBackup(backup([record,record])),/Duplicate record/);
  assert.throws(()=>parseMobileBackup(backup([{...record,entityType:'credentials'}])));
  assert.throws(()=>parseMobileBackup(JSON.stringify({format:'other',version:1,records:[]})));
  assert.equal(parseMobileBackup(backup([record])).records.length,1);
});

test('mobile restore converts a desktop export into credential-free records',()=>{
  const desktop={format:'workout-os-backup',version:5,exportedAt:'2026-09-09T10:00:00Z',data:{
    meta:{version:5,createdAt:'2026-09-09T10:00:00Z',activeWeekId:'',storage:'sqlite'},weeks:[],sessions:[],readiness:[],targets:[],measurements:[],habits:[],habitLogs:[],cardio:[],goalCheckIns:[],weeklyReviews:[],notes:[],profile:{displayName:'Athlete',units:'kg'},exercises:[],librarySplits:[],programs:[],painLogs:[],scheduledWorkouts:[],trainingConfig:{},
  }};
  const restored=parseMobileBackup(JSON.stringify(desktop));
  assert.equal(restored.format,'workout-os-backup');
  assert.ok(restored.records.every(record=>record.entityType!=='settings'));
});

test('mobile restore accepts the private Drive portable contract',()=>{
  const restored=parseMobileBackup(JSON.stringify({format:'body-os-portable-backup',version:1,createdAt:'2026-09-09T10:00:00Z',records:[record]}));
  assert.equal(restored.records[0].id,'one');
});
