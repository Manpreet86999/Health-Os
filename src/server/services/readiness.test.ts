import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readinessBand, readinessModifier, scoreReadiness } from './readiness.js';
import { epley1rm } from './progression.js';

describe('readiness scoring', () => {
  it('scores a strong day highly', () => {
    const score = scoreReadiness({
      sleepHours: 8,
      sleepQuality: 9,
      soreness: 2,
      energy: 9,
      stress: 2,
      motivation: 9,
      mood: 9,
      hydration: 9,
      mealProtein: 8,
      painFlag: false,
    });
    assert.ok(score >= 80);
    assert.equal(readinessBand(score).label, 'Ready');
  });

  it('penalizes pain flags', () => {
    const base = scoreReadiness({
      sleepHours: 7,
      sleepQuality: 7,
      soreness: 4,
      energy: 7,
      stress: 4,
      motivation: 7,
      mood: 7,
      hydration: 7,
      mealProtein: 7,
      painFlag: false,
    });
    const pain = scoreReadiness({
      sleepHours: 7,
      sleepQuality: 7,
      soreness: 4,
      energy: 7,
      stress: 4,
      motivation: 7,
      mood: 7,
      hydration: 7,
      mealProtein: 7,
      painFlag: true,
    });
    assert.ok(pain < base);
  });

  it('reduces volume when readiness is low', () => {
    const mod = readinessModifier(35, false);
    assert.ok(mod.volumeMultiplier < 0.7);
    assert.equal(mod.skipHeavy, true);
  });
});

describe('epley1rm', () => {
  it('estimates one-rep max', () => {
    assert.equal(epley1rm(100, 1), 100);
    assert.ok(Math.abs(epley1rm(100, 5) - 116.67) < 0.1);
  });
});
