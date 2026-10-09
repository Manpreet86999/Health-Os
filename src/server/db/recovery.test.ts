import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, closeDb } from './connection.js';
import { migrate } from './migrate.js';
import * as repo from './repository.js';

test('backup restore round-trips records and rolls back the entire restore on failure',()=>{
  assert.ok(process.env.BODY_OS_DATA_DIR?.includes('scratch'), 'Run database recovery checks through npm test with isolated storage.');
  migrate(getDb());
  repo.saveMeasurement({id:'restore-weight',date:'2026-09-07',weight:80,createdAt:'2026-09-07'});
  const backup=repo.loadAppDb();
  repo.saveMeasurement({id:'restore-weight',date:'2026-09-07',weight:85,createdAt:'2026-09-07'});
  repo.restoreBackup(backup);
  assert.equal(repo.listMeasurements().find(m=>m.id==='restore-weight')?.weight,80);
  const broken={...backup,sessions:[{id:'broken'}] as typeof backup.sessions};
  assert.throws(()=>repo.restoreBackup(broken));
  assert.equal(repo.listMeasurements().find(m=>m.id==='restore-weight')?.weight,80);
  assert.equal(getDb().prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
  closeDb();
  assert.equal(repo.listMeasurements().find(m=>m.id==='restore-weight')?.weight,80);
  closeDb();
});
