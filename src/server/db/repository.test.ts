import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeWeekUpdate, normalizeWeek } from './repository.js';
import type { Week } from '../../shared/types.js';

const advancedWeek: Week = {
  id: 'week-advanced',
  name: 'Strength block',
  weekNumber: 3,
  startDate: '2026-08-31',
  notes: 'Keep bar speed crisp.',
  active: false,
  programId: 'program-strength',
  phase: 'intensify',
  days: [{
    key: 'Mon', type: 'upper', title: 'Upper strength', subtitle: 'Heavy compounds',
    muscles: ['Chest', 'Back'], scheduledDate: '2026-08-31',
    exercises: [{
      name: 'Bench Press', target: 'Chest', vol: '4 x 5', cue: 'Brace and drive.',
      exerciseId: 'ex-bench', familyId: 'bench', supersetGroup: 'A', percent1rm: 82.5,
      rirTarget: 2, rpeTarget: 8, tempo: '3-1-1-0', restSec: 180,
      notes: 'Pause the first rep.', trackingMode: 'weight_reps',
    }],
  }],
};

test('normalizeWeek preserves advanced programming fields', () => {
  const normalized = normalizeWeek(advancedWeek);
  assert.ok(normalized);
  assert.equal(normalized.programId, advancedWeek.programId);
  assert.equal(normalized.phase, advancedWeek.phase);
  assert.deepEqual(normalized.days[0], advancedWeek.days[0]);
});

test('mergeWeekUpdate keeps days during a metadata-only update', () => {
  const merged = mergeWeekUpdate(advancedWeek, { phase: 'deload', notes: 'Reduce fatigue.' });
  assert.equal(merged.id, advancedWeek.id);
  assert.equal(merged.phase, 'deload');
  assert.equal(merged.notes, 'Reduce fatigue.');
  assert.deepEqual(merged.days, advancedWeek.days);
});
