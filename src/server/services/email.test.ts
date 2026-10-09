import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reportHtml } from './email.js';

describe('report email template', () => {
  it('uses the Health OS performance design', () => {
    const session = {
      id: 'session-1',
      status: 'completed',
      createdAt: '2026-08-20T00:00:00.000Z',
      weekId: 'week-1',
      weekName: 'Week 1',
      weekNumber: 1,
      dayKey: 'Mon',
      dayTitle: 'PUSH A',
      date: '2026-08-20',
      name: 'DR. HARPREET',
      sleep: 8,
      soreness: 2,
      logs: [
        {
          name: 'Incline Knee Push-Up',
          target: 'Chest + Triceps',
          status: 'completed',
          sets: [
            { s: 1, w: 0, r: 10 },
            { s: 2, w: 0, r: 10 },
            { s: 3, w: 0, r: 10 },
          ],
          aiCoachComment: 'Great job completing all 3 sets for 10 reps.',
        },
        {
          name: 'Dead Bug',
          target: 'Core',
          status: 'skipped',
          sets: [],
        },
      ],
      readiness: {
        score: 75,
        sleepHours: 8,
        soreness: 2,
        energy: 9,
        stress: 5,
        motivation: 9,
        mood: 9,
        hydration: 2,
        mealProtein: 14,
        painFlag: false,
      },
      aiOverallSummary: 'A solid start to your week with a 100% completion rate on your Push A session.',
    } as any;

    const html = reportHtml(session);

    assert.match(html, /Health OS Session Report/i);
    assert.match(html, /Readiness/i);
    assert.match(html, /AI Session Analysis/i);
    assert.match(html, /#f6f5f2/i);
    assert.match(html, /SLEEP/i);
    assert.match(html, /SORENESS/i);
    assert.doesNotMatch(html, /AI recommendations/i);
  });
});
