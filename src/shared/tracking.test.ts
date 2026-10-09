import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  formatSetLog,
  inferTrackingMode,
  parseDurationToSeconds,
  parseTargetDurationSec,
  setHasWork,
} from './tracking.js';

describe('exercise tracking modes', () => {
  it('classifies weighted, bodyweight, reps-only, and timed work', () => {
    assert.equal(inferTrackingMode({ name: 'Bench Press', equipment: 'Barbell' }), 'weighted');
    assert.equal(inferTrackingMode({ name: 'Dumbbell Overhead Press' }), 'weighted');
    assert.equal(inferTrackingMode({ name: 'Pull-up', equipment: 'Bodyweight' }), 'bodyweight');
    assert.equal(inferTrackingMode({ name: 'Push-ups' }), 'bodyweight');
    assert.equal(inferTrackingMode({ name: 'Glute Bridges' }), 'bodyweight');
    assert.equal(inferTrackingMode({ name: 'Laying Leg Raises', vol: '3 x 15-20' }), 'reps');
    assert.equal(inferTrackingMode({ name: 'Donkey Kicks' }), 'reps');
    assert.equal(inferTrackingMode({ name: 'Side Plank Twists', vol: '3 x 15 each side' }), 'reps');
    assert.equal(inferTrackingMode({ name: 'Plank', vol: '3 x 60 sec' }), 'timed');
    assert.equal(inferTrackingMode({ name: 'Jumping Jacks', vol: '3 x 1 min' }), 'timed');
    assert.equal(inferTrackingMode({ name: 'Brisk Walk or Jogging', vol: '30 min' }), 'timed');
    assert.equal(inferTrackingMode({ name: 'Active Mobility', movementPattern: 'recovery' }), 'timed');
  });

  it('parses and formats hold time', () => {
    assert.equal(parseDurationToSeconds('90'), 90);
    assert.equal(parseDurationToSeconds('1:30'), 90);
    assert.equal(parseDurationToSeconds('1 min'), 60);
    assert.equal(parseTargetDurationSec('3 x 60 sec'), 60);
    assert.equal(parseTargetDurationSec('3 x 1 min'), 60);
    assert.equal(formatDuration(90), '1:30');
    assert.equal(formatDuration(45), '45s');
  });

  it('formats set logs per mode and ignores empty work', () => {
    assert.equal(formatSetLog({ s: 1, w: 80, r: 5 }, 'weighted'), '80 × 5');
    assert.equal(formatSetLog({ s: 1, w: 0, r: 12 }, 'bodyweight'), '12 reps');
    assert.equal(formatSetLog({ s: 1, w: 10, r: 8 }, 'bodyweight', 'kg'), 'BW+10 kg × 8');
    assert.equal(formatSetLog({ s: 1, w: 0, r: 20 }, 'reps'), '20 reps');
    assert.equal(formatSetLog({ s: 1, w: 0, r: 0, durationSec: 75 }, 'timed'), '1:15');
    assert.equal(setHasWork({ s: 1, w: 0, r: 0, durationSec: 40 }, 'timed'), true);
    assert.equal(setHasWork({ s: 1, w: '', r: '' }, 'weighted'), false);
    assert.equal(setHasWork({ s: 1, w: 0, r: 10 }, 'bodyweight'), true);
  });
});
