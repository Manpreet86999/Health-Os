import test from 'node:test';
import assert from 'node:assert/strict';
import { podToday, podWeek, podShift, podGoalAt, podCount } from './friend-pods';
test('Pod civil dates and Monday weeks handle midnight, Sunday, year and DST boundaries', () => {
  const midnight = new Date('2026-10-11T20:00:00Z');
  assert.equal(podToday(midnight, 'Asia/Kolkata'), '2026-10-12');
  assert.equal(podToday(midnight, 'America/Los_Angeles'), '2026-10-11');
  assert.equal(podWeek('2026-10-11'), '2026-10-05');
  assert.equal(podWeek('2026-10-12'), '2026-10-12');
  assert.equal(podShift('2026-12-31', 1), '2027-01-01');
  assert.equal(podShift('2026-03-08', 1), '2026-03-09');
});
test('Next-week target edits preserve earlier weeks and duplicate days do not inflate counts', () => {
  const goal: any = { id: 'gym', name: 'Gym', target_per_week: 4 };
  const versions: any = [{ goal_id: 'gym', effective_week: '2026-10-05', name: 'Gym', target_per_week: 4 }, { goal_id: 'gym', effective_week: '2026-10-12', name: 'Gym together', target_per_week: 5 }];
  assert.equal(podGoalAt(goal, versions, '2026-10-05').target_per_week, 4);
  assert.equal(podGoalAt(goal, versions, '2026-10-12').target_per_week, 5);
  assert.equal(podCount([{ goal_id: 'gym', user_id: 'a', day: '2026-10-11', completed: true }, { goal_id: 'gym', user_id: 'a', day: '2026-10-11', completed: true }, { goal_id: 'gym', user_id: 'b', day: '2026-10-11', completed: true }] as any, 'gym', 'a'), 1);
});
