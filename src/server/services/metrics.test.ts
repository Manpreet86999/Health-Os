import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from './metrics.js';
import type { AppDb } from '../types.js';

function baseDb(over: Partial<AppDb> = {}): AppDb {
  return {
    meta: {
      version: 5,
      createdAt: new Date().toISOString(),
      activeWeekId: 'w1',
      storage: 'test',
    },
    librarySplits: [],
    weeks: [],
    sessions: [],
    readiness: [],
    targets: [],
    measurements: [],
    habits: [],
    habitLogs: [],
    cardio: [],
    goalCheckIns: [],
    weeklyReviews: [],
    notes: [],
    profile: { displayName: 'Test', units: 'kg', createdAt: new Date().toISOString() },
    exercises: [],
    programs: [],
    painLogs: [],
    scheduledWorkouts: [],
    trainingConfig: {
      volumeLandmarks: [],
      exerciseFamilies: {},
      reminders: { train: false, readiness: false, weeklyReview: false },
    },
    ...over,
  };
}

describe('computeMetrics progress fields', () => {
  it('detects personal records and e1rm series', () => {
    const db = baseDb({
      sessions: [
        {
          id: 's1',
          status: 'finished',
          createdAt: '2026-01-01',
          weekId: 'w1',
          weekName: 'W1',
          weekNumber: 1,
          dayKey: 'Mon',
          dayTitle: 'Push',
          date: '2026-01-06',
          name: 'Athlete',
          sleep: 7,
          soreness: 3,
          logs: [
            {
              name: 'Bench Press',
              target: 'Chest',
              status: 'completed',
              sets: [
                { s: 1, w: 60, r: 8 },
                { s: 2, w: 70, r: 5 },
              ],
            },
          ],
        },
        {
          id: 's2',
          status: 'finished',
          createdAt: '2026-01-08',
          weekId: 'w1',
          weekName: 'W1',
          weekNumber: 1,
          dayKey: 'Wed',
          dayTitle: 'Push',
          date: '2026-01-08',
          name: 'Athlete',
          sleep: 7,
          soreness: 3,
          logs: [
            {
              name: 'Bench Press',
              target: 'Chest',
              status: 'completed',
              sets: [{ s: 1, w: 80, r: 3 }],
            },
          ],
        },
      ],
    });

    const m = computeMetrics(db);
    assert.ok(m.personalRecords.length >= 1);
    assert.equal(m.personalRecords[0].exercise, 'Bench Press');
    assert.ok(m.personalRecords[0].bestE1rm > 80);
    assert.ok(m.e1rmSeries['Bench Press']?.length === 2);
    assert.equal(m.trainingCalendar['2026-01-06'], 1);
    assert.ok(m.weeklyVolume.length >= 1);
    assert.ok(m.totals.tonnage > 0);
  });

  it('computes goal progress and body deltas', () => {
    const db = baseDb({
      targets: [
        {
          id: 't1',
          name: 'Squat',
          type: 'strength',
          current: 100,
          target: 140,
          unit: 'kg',
          status: 'active',
          createdAt: '2026-01-01',
        },
      ],
      goalCheckIns: [
        {
          id: 'c1',
          goalId: 't1',
          date: '2026-01-10',
          value: 100,
          note: 'hit',
          createdAt: '2026-01-10',
        },
      ],
      measurements: [
        {
          id: 'm1',
          date: '2026-01-01',
          weight: 80,
          bodyFat: 18,
          waist: 85,
          createdAt: '2026-01-01',
        },
        {
          id: 'm2',
          date: '2026-02-01',
          weight: 78,
          bodyFat: 16,
          waist: 82,
          createdAt: '2026-02-01',
        },
      ],
    });
    const m = computeMetrics(db);
    assert.equal(m.goalProgress.length, 1);
    assert.equal(m.goalProgress[0].percent, Math.round((100 / 140) * 100));
    assert.equal(m.goalProgress[0].checkInCount, 1);
    assert.ok(m.bodyDeltas.weight?.latest === 78);
    assert.ok(m.bodyDeltas.weight?.previous === 80);
  });
});
