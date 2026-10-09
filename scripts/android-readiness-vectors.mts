import { mkdirSync, writeFileSync } from 'node:fs';
import { scoreReadiness } from '../src/shared/readiness.ts';

let seed = 6119;
const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 2 ** 32; };
const vectors = Array.from({length: 1500}, (_, index) => {
  const input = {
    sleepHours: index % 11 === 0 ? 0 : Math.round(rand() * 240) / 10,
    sleepQuality: 1 + Math.floor(rand() * 10), soreness: Math.floor(rand() * 11), energy: 1 + Math.floor(rand() * 10),
    stress: Math.floor(rand() * 11), motivation: 1 + Math.floor(rand() * 10), mood: 1 + Math.floor(rand() * 10),
    steps: Math.floor(rand() * 200001), painFlag: rand() < .3,
  };
  return {input, score: scoreReadiness(input)};
});
const path = 'apps/android-native/app/src/test/resources';
mkdirSync(path, {recursive: true});
writeFileSync(`${path}/readiness-golden.json`, JSON.stringify(vectors));
console.log(`Generated ${vectors.length} deterministic readiness vectors from shared Core.`);
