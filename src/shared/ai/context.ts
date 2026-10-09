import { formatWorkoutSet } from '../workout-entry.js';
import { CALCULATION_VERSION } from '../evidence.js';
import type { AppDb, CoachResult, AppSettings } from '../types.js';
import { computeMetrics } from '../metrics.js';
import { buildProgression } from '../progression.js';
import { readinessModifier } from '../readiness.js';

export interface ContextOptions {
  includeMetrics?: boolean;
  includeSessions?: boolean;
  includeTargets?: boolean;
  includeMeasurements?: boolean;
  includeProgression?: boolean;
  includePlateaus?: boolean;
  specificExercise?: string;
  recentSessionsCount?: number;
}

/** Compact athlete snapshot for LLM prompts (token-efficient, structured). */
export function buildAthleteContext(data: AppDb, appSettings: AppSettings = {} as AppSettings, opts: ContextOptions = {}) {
  const latestReady = [...(data.readiness || [])].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;
  const programming = latestReady
    ? readinessModifier(latestReady.score, Boolean(latestReady.painFlag))
    : null;
  const active = data.weeks.find((w) => w.id === data.meta.activeWeekId) || data.weeks[0];

  const profile = {
    profile: data.profile?.displayName || 'Athlete',
    units: data.profile?.units || 'kg',
    activeWeek: active
      ? {
          id: active.id,
          name: active.name,
          weekNumber: active.weekNumber,
          dayTitles: active.days.map((d) => `${d.key}:${d.title}`),
        }
      : null,
    readinessLatest: latestReady
      ? {
          date: latestReady.date,
          score: latestReady.score,
          band: latestReady.band,
          sleepHours: latestReady.sleepHours,
          soreness: latestReady.soreness,
          energy: latestReady.energy,
          stress: latestReady.stress,
          painFlag: latestReady.painFlag,
          recommendation: latestReady.recommendation,
        }
      : null,
    programming,
  };

  const result: any = { ...profile, calculationVersion: CALCULATION_VERSION, evidencePolicy: 'Calculated metrics are estimates. Cite provided session IDs and dates. Do not invent missing values or recalculate supplied metrics.' };

  if (opts.includeMetrics || opts.includePlateaus) {
    const metrics = computeMetrics(data, appSettings);
    if (opts.includeMetrics) {
      result.totals = metrics.totals;
      result.muscleVolume = metrics.muscleVolume;
      result.volumeLandmarks = metrics.volumeLandmarks.slice(0, 5);
      result.exerciseLeaders = metrics.exerciseLeaders.slice(0, 5);
    }
    if (opts.includePlateaus) {
      if (opts.specificExercise) {
        result.plateaus = metrics.plateaus.filter(p => p.exercise.toLowerCase().includes(opts.specificExercise!.toLowerCase()));
      } else {
        result.plateaus = metrics.plateaus.slice(0, 5);
      }
    }
  }

  if (opts.includeSessions) {
    result.recentSessions = data.sessions
      .filter((s) => s.status === 'finished' || s.status === 'completed')
      .sort((a,b)=>a.date.localeCompare(b.date))
      .slice(-(opts.recentSessionsCount || 4))
      .map((s) => ({
        id: s.id,
        date: s.date,
        day: s.dayTitle || s.dayKey,
        readiness: s.readiness?.score ?? null,
        topLifts: (s.logs || [])
          .filter((l) => l.status !== 'skipped')
          .slice(0, 4)
          .map((l) => ({
            name: l.name,
            sets: (l.sets || []).map((set) => formatWorkoutSet(set,data.profile.units)).join(','),
          })),
      }));
  }

  if (opts.includeProgression) {
    const names = opts.specificExercise ? [opts.specificExercise] : (active?.days || []).flatMap((d) => d.exercises.map((e) => e.name)).slice(0, 8);
    result.progression = buildProgression(data, names).slice(0, 5);
  }

  if (opts.includeMeasurements) {
    result.measurements = (data.measurements || []).slice(-3);
  }

  if (opts.includeTargets) {
    result.targets = (data.targets || []).slice(0, 4);
  }

  return result;
}

export function parseAdviceLines(content: string, max = 6): string[] {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((line) => line.length > 8 && !/^here (are|is)/i.test(line))
    .slice(0, max);
}

export type { CoachResult };
