import assert from 'node:assert/strict';
import test from 'node:test';

import { swapWeekDayExercises } from './planner';
import type { Week } from './types';

const week: Week = {
  id: 'active', name: 'Active week', weekNumber: 1, startDate: '2026-09-28',
  notes: '', active: true,
  days: [
    { key: 'Wed', type: 'push', title: 'Push', subtitle: 'Chest', muscles: ['Chest'], exercises: [{ name: 'Press', target: 'Chest', vol: '3 x 8', cue: 'Slow' }] },
    { key: 'Thu', type: 'pull', title: 'Pull', subtitle: 'Back', muscles: ['Back'], exercises: [{ name: 'Row', target: 'Back', vol: '3 x 10', cue: 'Brace' }] },
    { key: 'Fri', type: 'rest', title: 'Rest', subtitle: '', muscles: [], exercises: [] },
  ],
};

test('swaps complete exercise lists while preserving each day and the source week', () => {
  const editedWednesday = [{ name: 'Edited press', target: 'Chest', vol: '4 x 8', cue: 'Pause', restSec: 90 }];
  const swapped = swapWeekDayExercises(week, 'Wed', 'Thu', editedWednesday);

  assert.deepEqual(swapped.days[0], { ...week.days[0], exercises: week.days[1].exercises });
  assert.deepEqual(swapped.days[1], { ...week.days[1], exercises: editedWednesday });
  assert.equal(swapped.days[2], week.days[2]);
  assert.deepEqual(week.days[0].exercises.map((exercise) => exercise.name), ['Press']);
  assert.notEqual(swapped.days[0].exercises[0], week.days[1].exercises[0]);
  assert.notEqual(swapped.days[1].exercises[0], editedWednesday[0]);
});

test('rejects a missing or identical swap day', () => {
  assert.throws(() => swapWeekDayExercises(week, 'Wed', 'Wed', []));
  assert.throws(() => swapWeekDayExercises(week, 'Wed', 'Mon', []));
});
