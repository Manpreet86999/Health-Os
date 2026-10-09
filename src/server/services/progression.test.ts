import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProgression } from './progression.js';
import type { AppDb } from '../../shared/types.js';

function dataWithLastSet(rir?: number, rpe?: number): AppDb {
  return {
    meta: { version: 1, createdAt: '2026-08-01', activeWeekId: 'w1', storage: 'test' },
    librarySplits: [],
    weeks: [{ id: 'w1', name: 'W1', weekNumber: 1, startDate: '', notes: '', active: true, days: [{ key: 'Mon', type: 'push', title: 'Push', subtitle: '', muscles: ['Chest'], exercises: [{ name: 'Bench Press', target: 'Chest', vol: '3 x 6-8', cue: '' }] }] }],
    sessions: [{ id: 's1', status: 'finished', createdAt: '2026-08-01', weekId: 'w1', weekName: 'W1', weekNumber: 1, dayKey: 'Mon', dayTitle: 'Push', date: '2026-08-01', name: 'Athlete', sleep: 8, soreness: 2, logs: [{ name: 'Bench Press', target: 'Chest', status: 'completed', sets: [{ s: 1, w: 100, r: 6, rir, rpe }] }] }],
    readiness: [], targets: [], measurements: [], habits: [], habitLogs: [], cardio: [], goalCheckIns: [], weeklyReviews: [], notes: [], profile: { displayName: 'Test', units: 'kg', createdAt: '2026-08-01' }, exercises: [], programs: [], painLogs: [], scheduledWorkouts: [], trainingConfig: { volumeLandmarks: [], exerciseFamilies: {}, reminders: { train: false, readiness: false, weeklyReview: false } },
  };
}

test('progression protects training quality after an RIR 0 set', () => {
  const tip = buildProgression(dataWithLastSet(0), ['Bench Press'])[0];
  assert.equal(tip.suggestedWeight, 95);
  assert.match(tip.reason, /RIR 0/);
});

test('progression adds load after a comfortable top-of-range set', () => {
  const db = dataWithLastSet(3);
  db.sessions[0].logs[0].sets = [1,2,3].map(s => ({s,w:100,r:8,rir:3}));
  const tip = buildProgression(db, ['Bench Press'])[0];
  assert.equal(tip.suggestedWeight, 102.5);
});


test('progression holds load when only one of three prescribed sets is recorded', () => {
  const db=dataWithLastSet(3);db.sessions[0].logs[0].sets[0].r=8;
  const tip=buildProgression(db,['Bench Press'])[0];
  assert.equal(tip.suggestedWeight,100);assert.equal(tip.applyNext,false);
  assert.deepEqual(tip.evidence?.sources,['s1']);
});
test('progression uses equipment increments only after all working sets qualify', () => {
  const db=dataWithLastSet(3);db.trainingConfig.loadIncrements={'Bench Press':1.25};
  db.sessions[0].logs[0].sets=[1,2,3].map(s=>({s,w:100,r:8,rir:3}));
  assert.equal(buildProgression(db,['Bench Press'])[0].suggestedWeight,101.25);
  db.sessions[0].logs[0].sets[1].r=5;
  assert.equal(buildProgression(db,['Bench Press'])[0].suggestedWeight,100);
});
