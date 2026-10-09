import assert from 'node:assert/strict';
import test from 'node:test';
import { bioSchema, readiness, type BioRecord } from './biology.js';
import { checkInReadiness, mergeDailyReadiness, normalizeReadiness, readinessModifier } from './readiness.js';
import { effectiveBiology } from './legacy-biology.js';
import type { AppDb } from './types.js';

const answers = { sleepHours: 7.2, sleepQuality: 8, soreness: 0, energy: 7, stress: 0, motivation: 8, mood: 6, steps: 3500, painFlag: true, restingHeartRate: 62, notes: 'Protect my knee' };
const date = '2026-10-03';
function check(patch: Partial<BioRecord> = {}): BioRecord {
  return bioSchema.parse({ id: `check-in-${date}`, userId: 'local-user', type: 'checkIn', domain: 'Recover', name: 'Daily readiness', timestamp: `${date}T10:00:00Z`, createdAt: `${date}T10:00:00Z`, updatedAt: `${date}T10:00:00Z`, deviceId: 'local', source: 'Manual', quality: 'manual', syncState: 'pending', revision: 1, metadata: answers, ...patch });
}
function database(rows: AppDb['readiness']): AppDb {
  return { readiness: rows, measurements: [], healthReadings: [], profile: { units: 'kg' } } as AppDb;
}

test('one full offline check-in supplies the same score, band and pain guidance to Today and Train', () => {
  const record = check(), rows = mergeDailyReadiness([], [record]), item = rows[0];
  const today = readiness(effectiveBiology(database(rows), [record]), date);
  assert.equal(today.score, item.score); assert.equal(today.category, item.band);
  assert.equal(item.soreness, 0); assert.equal(item.stress, 0);
  assert.equal(item.sleepQuality, 8); assert.equal(item.motivation, 8); assert.equal(item.mood, 6);
  assert.equal(item.restingHeartRate, 62); assert.equal(item.notes, 'Protect my knee');
  assert.equal(readinessModifier(item.score, item.painFlag).skipHeavy, true);
  assert.match(item.assistant!.intensity, /Avoid painful ranges/);
  assert.deepEqual(mergeDailyReadiness([], [record]), rows); // Projection timestamps must stay stable.
});

test('a partial short check-in cannot replace a saved full training check-in', () => {
  const item = normalizeReadiness({ ...answers, date }).item!;
  const partial = check({ metadata: { energy: 1, stress: 10, soreness: 10 } });
  const rows = mergeDailyReadiness([item], [partial]);
  assert.equal(rows[0].score, item.score);
  const observed = effectiveBiology(database(rows), [partial]);
  assert.equal(observed.filter(row => row.type === 'checkIn').length, 1);
  assert.equal(readiness(observed, date).score, item.score);
  assert.equal(checkInReadiness(partial), undefined);
});

test('a stale score copied into a biological record cannot disagree with its full answers', () => {
  const record=check({metadata:{...answers,readinessScore:99}}),rows=mergeDailyReadiness([],[record]);
  assert.equal(readiness(effectiveBiology(database(rows),[record]),date).score,rows[0].score);
});

test('edits update one day without losing earlier daily check-ins', () => {
  const yesterday = normalizeReadiness({ ...answers, date: '2026-10-02' }).item!;
  const old = check({ updatedAt: `${date}T10:00:00Z` });
  const edit = check({ updatedAt: `${date}T11:00:00Z`, revision: 2, metadata: { ...answers, energy: 3 } });
  const rows = mergeDailyReadiness([yesterday], [old, edit]);
  assert.equal(rows.length, 2); assert.equal(rows.find(item => item.date === date)!.energy, 3);
  assert.equal(rows.find(item => item.date === yesterday.date)!.score, yesterday.score);
});

test('deleting a full daily check-in suppresses an older legacy copy instead of resurrecting it', () => {
  const old = normalizeReadiness({ ...answers, date }).item!;
  old.updatedAt = `${date}T09:00:00Z`;
  const deleted = check({ updatedAt: `${date}T11:00:00Z`, deletedAt: `${date}T11:00:00Z` });
  assert.equal(mergeDailyReadiness([old], [deleted]).length, 0);
});

test('unconfirmed estimates do not unlock a workout; missing data stays unknown', () => {
  assert.equal(mergeDailyReadiness([], [check({ quality: 'estimated' }), check({ metadata: { ...answers, requiresConfirmation: true } })]).length, 0);
  assert.equal(readiness([], date).score, null);
});

test('heart-rate baseline context and all coaching fields survive the shared check-in', () => {
  const history = Array.from({ length: 8 }, (_, i) => normalizeReadiness({ ...answers, painFlag: false, date: `2026-09-${String(22 + i).padStart(2, '0')}`, restingHeartRate: 55 }).item!);
  const ready = mergeDailyReadiness(history, [check()])[0];
  assert.match(ready.assistant!.reason, /7 bpm versus/);
  assert.ok(ready.assistant!.warmup && ready.assistant!.recovery && ready.assistant!.intensity);
});

test('editing older check-ins keeps their heart-rate context available to today’s guidance',()=>{
  const prior=Array.from({length:8},(_,i)=>check({id:`prior-${i}`,timestamp:`2026-09-${String(22+i).padStart(2,'0')}T10:00:00Z`,updatedAt:`${date}T11:00:00Z`,metadata:{...answers,restingHeartRate:55}}));
  const rows=mergeDailyReadiness([],[check(),...prior]);
  assert.match(rows.find(item=>item.date===date)!.assistant!.reason,/7 bpm versus/);
});
