import type { AppDb, AppSettings, CoachResult } from './types.js';
import { computeMetrics } from './metrics.js';
import { buildProgression } from './progression.js';
import { readinessModifier } from './readiness.js';

/** Deterministic local coach — always available offline. */
export function localCoach(data: AppDb, appSettings: AppSettings = {} as AppSettings): CoachResult {
  const m = computeMetrics(data, appSettings);
  const advice: string[] = [];
  const latestReady = [...(data.readiness || [])].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);

  if (m.totals.sessions === 0) {
    advice.push('Start by completing one tracked session so the coach can learn your baseline.');
  }
  if (m.totals.completion < 75 && m.totals.sessions > 0) {
    advice.push('Completion is low. Reduce optional volume or keep skips intentional this week.');
  }
  if (m.totals.streak >= 3) {
    advice.push(`Good consistency: ${m.totals.streak}-day streak. Keep the next session moderate, not reckless.`);
  }
  if (latestReady) {
    advice.push(
      `Readiness on ${latestReady.date} was ${latestReady.score}/100 (${latestReady.band}). ${latestReady.recommendation}`,
    );
    const mod = readinessModifier(latestReady.score, Boolean(latestReady.painFlag));
    advice.push(
      `Programming adjust: volume ×${mod.volumeMultiplier.toFixed(2)}. ${mod.intensityNote}`,
    );
  }
  if (latestReady?.painFlag) {
    advice.push('Pain was flagged in your latest check-in. Use pain-free ranges only; do not chase heavy loading.');
  }
  const weak = Object.entries(m.muscleVolume).sort((a, b) => a[1] - b[1])[0];
  if (weak) advice.push(`Lowest recorded volume is ${weak[0]}. Add attention there if it matches your goal.`);
  for (const p of m.plateaus.slice(0, 2)) advice.push(p.note);
  for (const v of m.volumeLandmarks.filter((x) => x.status.startsWith('Low')).slice(0, 2)) {
    advice.push(`${v.muscle} only has ${v.weeklySets} hard sets in 7 days (${v.status}).`);
  }
  const best = m.exerciseLeaders[0];
  if (best) advice.push(`Top volume movement is ${best.name}. Review its history before increasing load.`);

  const active = data.weeks.find((w) => w.id === data.meta.activeWeekId) || data.weeks[0];
  const names = (active?.days || []).flatMap((d) => d.exercises.map((e) => e.name)).slice(0, 12);
  const progression = buildProgression(data, names);

  return {
    score: Math.min(100, 45 + m.totals.streak * 5 + m.totals.completion / 2),
    advice,
    source: 'local',
    aiAvailable: false,
    progression,
  };
}
