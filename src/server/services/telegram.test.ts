import assert from 'node:assert/strict';
import test from 'node:test';
import { telegramMiniAppUrl, telegramWorkoutPlanHtml } from './telegram.js';

test('Telegram workout plan is phone-friendly and escapes planned exercise data', () => {
  const message = telegramWorkoutPlanHtml({
    date: '2026-09-22',
    weekName: 'Strength <block>',
    day: { key: 'Mon', type: 'workout', title: 'Upper', subtitle: '', muscles: [], exercises: [{ name: 'Bench <press>', target: 'Chest', vol: '4 × 6', cue: 'Control & brace', restSec: 120, rirTarget: 1 }] },
    readiness: { score: 82, band: 'Ready', recommendation: 'Train normally.' } as any,
  });
  assert.match(message, /HEALTH OS · TODAY'S MISSION/);
  assert.match(message, /Bench &lt;press&gt;/);
  assert.match(message, /Readiness 82/);
  assert.match(message, /Rest · 120 sec/);
  assert.doesNotMatch(message, /Strength <block>/);
});

test('Telegram Mini App URL uses the configured HTTPS host and carries the selected plan', () => {
  const url = telegramMiniAppUrl('https://gym.example.com/telegram.html', {
    key: 'Mon', type: 'workout', title: 'Upper', subtitle: '', muscles: [],
    exercises: [{ name: 'Bench press', target: 'Chest', vol: '4 x 6', cue: 'Brace', restSec: 120 }],
  }, '2026-09-23', 'Strength', 'week-1');
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://gym.example.com');
  assert.ok(parsed.searchParams.get('p'));
  assert.throws(() => telegramMiniAppUrl('http://gym.example.com/telegram.html', { key: 'Mon', type: '', title: '', subtitle: '', muscles: [], exercises: [] }, '2026-09-23', 'Week'), /HTTPS/);
});
