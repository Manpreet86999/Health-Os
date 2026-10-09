import test from 'node:test';
import assert from 'node:assert/strict';
import { bestExerciseReference } from './exercise-media-ranking.js';

test('selects a movement demonstration over unrelated and equipment variants', () => {
  const results = [{ title: 'Incline Bench Press' }, { title: 'Bench Press form tutorial' }, { title: 'Bench Press workout motivation full chest training' }];
  assert.equal(bestExerciseReference('Bench Press', results), results[1]);
  assert.equal(bestExerciseReference('Incline Bench Press', results), results[0]);
  assert.equal(bestExerciseReference('Dumbbell Bench Press', results), undefined);
});

test('keeps deterministic ties and handles punctuation and approved aliases', () => {
  const results = [{ title: 'Push-up technique' }, { title: 'Push up technique' }];
  assert.equal(bestExerciseReference('Push up', results), results[0]);
  assert.equal(bestExerciseReference('Press up', results, ['Push up']), results[0]);
  assert.equal(bestExerciseReference('', results), undefined);
});
