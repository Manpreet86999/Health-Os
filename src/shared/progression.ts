import type { AppDb, ProgressionTip, Session } from './types.js';
import { epley1rm as epleyShared, workSets, buildProgressionRules, isFinishedSession } from './training.js';

/** Epley estimated 1RM */
export function epley1rm(weight: number, reps: number): number {
  return epleyShared(weight, reps);
}

export function buildProgression(data: AppDb, exerciseNames: string[]): ProgressionTip[] {
  return buildProgressionRules(data).filter(tip => exerciseNames.includes(tip.exercise));
}

export function detectPlateaus(data: AppDb): Array<{ exercise: string; sessions: number; note: string }> {
  const map = new Map<string, number[]>();
  const finished = data.sessions
    .filter(isFinishedSession)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const s of finished) {
    for (const log of s.logs || []) {
      if (log.status === 'skipped') continue;
      const best = Math.max(
        0,
        ...workSets(log.sets || []).map((set) => epley1rm(Number(set.w) || 0, Number(set.r) || 0)),
      );
      if (!best) continue;
      const arr = map.get(log.name) || [];
      arr.push(best);
      map.set(log.name, arr);
    }
  }
  const out: Array<{ exercise: string; sessions: number; note: string }> = [];
  for (const [exercise, series] of map) {
    if (series.length < 3) continue;
    const last3 = series.slice(-3);
    const flat = Math.max(...last3) - Math.min(...last3) < Math.max(...last3) * 0.02;
    if (flat) {
      out.push({
        exercise,
        sessions: last3.length,
        note: `${exercise} estimated strength has been flat for 3 sessions — possible plateau; review effort, attendance, and technique before changing the plan.`,
      });
    }
  }
  return out.slice(0, 8);
}

export function weeklySetsByMuscle(data: AppDb): Array<{ muscle: string; weeklySets: number; status: string }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const key = cutoff.toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  for (const s of data.sessions.filter((x) => isFinishedSession(x) && (x.date || '') >= key)) {
    for (const log of s.logs || []) {
      if (log.status === 'skipped') continue;
      const muscle = log.target || 'Other';
      const sets =
        workSets(log.sets || []).filter((set) => Number(set.w) || Number(set.r)).length;
      counts[muscle] = (counts[muscle] || 0) + sets;
    }
  }
  return Object.entries(counts)
    .map(([muscle, weeklySets]) => {
      let status = 'OK';
      if (weeklySets < 6) status = 'Low (below ~MEV)';
      else if (weeklySets > 20) status = 'High (near/over MRV for many)';
      else status = 'Productive range';
      return { muscle, weeklySets, status };
    })
    .sort((a, b) => b.weeklySets - a.weeklySets);
}
