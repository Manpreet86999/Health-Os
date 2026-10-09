import { CALCULATION_VERSION } from './evidence.js';
import type {
  AppDb,
  ExerciseLog,
  PlannedExercise,
  ProgressionTip,
  Session,
  SetLog,
  SetType,
  TrainingConfig,
  VolumeLandmarkConfig,
} from './types.js';

export function epley1rm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0 || reps > 12) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function isWorkSet(set: SetLog): boolean {
  const t = String(set.type || 'work').toLowerCase();
  return t === 'work' || t === 'amrap' || t === 'failure' || t === 'drop' || t === 'backoff' || !set.type;
}

/** Warm-ups never count toward PR / primary tonnage when work sets exist */
export function isWarmupSet(set: SetLog): boolean {
  return String(set.type || '').toLowerCase() === 'warmup';
}

export function workSets(sets: SetLog[] | undefined): SetLog[] {
  const all = sets || [];
  const work = all.filter((s) => isWorkSet(s) && !isWarmupSet(s));
  // Legacy: if every set is unlabeled, treat all as work
  if (!all.some((s) => s.type)) return all;
  return work.length ? work : all.filter((s) => !isWarmupSet(s));
}

export function setTonnage(set: SetLog): number {
  return (Number(set.w) || 0) * (Number(set.r) || 0);
}

export function logTonnage(log: ExerciseLog, workOnly = true): number {
  const sets = workOnly ? workSets(log.sets) : log.sets || [];
  return sets.reduce((sum, s) => sum + setTonnage(s), 0);
}

export function bestSetE1rm(log: ExerciseLog, workOnly = true): number {
  const sets = workOnly ? workSets(log.sets) : log.sets || [];
  return Math.max(0, ...sets.map((s) => epley1rm(Number(s.w) || 0, Number(s.r) || 0)));
}

export function parseRepRange(vol: string): { sets: number; low: number; high: number } {
  const m = String(vol || '').match(/(\d+)\s*[x×]\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (m) return { sets: Number(m[1]), low: Number(m[2]), high: Number(m[3]) };
  const fixed = String(vol || '').match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (fixed) return { sets: Number(fixed[1]), low: Number(fixed[2]), high: Number(fixed[2]) };
  return { sets: 3, low: 8, high: 12 };
}

export function weightFromPercent1rm(e1rm: number, percent: number): number {
  if (!e1rm || !percent) return 0;
  const raw = (e1rm * percent) / 100;
  return Math.round(raw * 2) / 2;
}

/** Classic ramp warm-up to a top work weight */
export function generateWarmupSets(
  topWeight: number,
  topReps = 5,
  barWeight = 20,
): Array<{ w: number; r: number; type: SetType }> {
  if (!topWeight || topWeight <= barWeight) {
    return [{ w: barWeight, r: 10, type: 'warmup' }];
  }
  const pcts = [0.4, 0.6, 0.8];
  const reps = [8, 5, 3];
  const out: Array<{ w: number; r: number; type: SetType }> = [
    { w: barWeight, r: 10, type: 'warmup' },
  ];
  for (let i = 0; i < pcts.length; i++) {
    let w = Math.round((topWeight * pcts[i]) / 2.5) * 2.5;
    if (w <= barWeight) w = barWeight;
    if (w >= topWeight) continue;
    out.push({ w, r: Math.min(reps[i], topReps + 3), type: 'warmup' });
  }
  return out;
}

export interface PlateResult {
  perSide: number[];
  total: number;
  bar: number;
  remainder: number;
}

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

export function plateCalculator(
  target: number,
  units: 'kg' | 'lb' = 'kg',
  barWeight?: number,
): PlateResult {
  const bar = barWeight ?? (units === 'kg' ? 20 : 45);
  const plates = units === 'kg' ? KG_PLATES : LB_PLATES;
  let eachSide = (target - bar) / 2;
  if (eachSide < 0) {
    return { perSide: [], total: bar, bar, remainder: target - bar };
  }
  const perSide: number[] = [];
  let rem = Math.round(eachSide * 1000) / 1000;
  for (const p of plates) {
    while (rem + 1e-9 >= p) {
      perSide.push(p);
      rem = Math.round((rem - p) * 1000) / 1000;
    }
  }
  const loaded = bar + perSide.reduce((a, b) => a + b, 0) * 2;
  return { perSide, total: loaded, bar, remainder: Math.round((target - loaded) * 100) / 100 };
}

export function defaultVolumeLandmarks(): VolumeLandmarkConfig[] {
  const muscles = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Arms', 'Core', 'Other'];
  return muscles.map((muscle) => ({
    muscle,
    mev: 6,
    mav: 12,
    mrv: 20,
  }));
}

export function defaultTrainingConfig(): TrainingConfig {
  return {
    volumeLandmarks: defaultVolumeLandmarks(),
    exerciseFamilies: {
      'bench press': 'bench',
      'incline bench': 'bench',
      'incline bench press': 'bench',
      'close grip bench': 'bench',
      squat: 'squat',
      'back squat': 'squat',
      'front squat': 'squat',
      deadlift: 'deadlift',
      'romanian deadlift': 'deadlift',
      'conventional deadlift': 'deadlift',
      'overhead press': 'ohp',
      ohp: 'ohp',
    },
    reminders: {
      train: true,
      readiness: true,
      weeklyReview: true,
      trainTime: '17:00',
    },
    gymModeDefault: false,
    barWeightKg: 20,
    barWeightLb: 45,
    preplannedWeekMode: true,
  };
}

export function normalizeExerciseName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function familyFor(name: string, config: TrainingConfig): string | undefined {
  return config.exerciseFamilies[normalizeExerciseName(name)];
}

export function isFinishedSession(session?: { status?: string } | null): boolean {
  return Boolean(session && (session.status === 'finished' || session.status === 'completed'));
}

export function buildProgressionRules(data: AppDb): ProgressionTip[] {
  const finished = data.sessions.filter(isFinishedSession).sort((a,b) => a.date.localeCompare(b.date));
  const active = data.weeks.find(w => w.id === data.meta.activeWeekId) || data.weeks[0];
  const names = [...new Set(finished.flatMap(s => s.logs.map(l => l.name)))];
  return names.flatMap(exercise => {
    const history = finished.flatMap(session => {
      const log = session.logs.find(l => l.name === exercise && l.status !== 'skipped');
      if (!log || log.trackingMode === 'time' || log.trackingMode === 'reps') return [];
      const sets = workSets(log.sets).filter(s => Number(s.w) > 0 && Number(s.r) > 0 && !s.durationSec);
      return sets.length ? [{session, sets}] : [];
    }).slice(-3);
    if (!history.length) return [];
    const last = history[history.length - 1];
    const prescription = active?.days.flatMap(d => d.exercises).find(e => e.name === exercise);
    const range = parseRepRange(prescription?.vol || '3 x 8-12');
    const weight = Math.max(...last.sets.map(s => Number(s.w)));
    const reps = Math.min(...last.sets.map(s => Number(s.r)));
    const effort = last.sets.find(s => (s.rir != null && s.rir !== '' && Number(s.rir) <= 0) || (s.rpe != null && s.rpe !== '' && Number(s.rpe) >= 9.5));
    const comparable = last.sets.every(s => Number(s.w) === weight);
    const full = last.sets.length >= range.sets;
    const hitTop = full && comparable && last.sets.every(s => Number(s.r) >= range.high);
    const effortKnown = last.sets.every(s => (s.rir != null && s.rir !== '') || (s.rpe != null && s.rpe !== ''));
    const increment = data.trainingConfig?.loadIncrements?.[exercise] || (data.profile.units === 'lb' ? 5 : 2.5);
    const step = Number.isFinite(increment) && increment > 0 ? increment : 2.5;
    const missedTwice = history.length >= 2 && history.slice(-2).every(h => h.sets.length >= range.sets && h.sets.every(s => Number(s.w) === weight) && Math.min(...h.sets.map(s => Number(s.r))) < range.low);
    const reduce = Boolean(effort) || missedTwice;
    const increase = hitTop && effortKnown && !reduce;
    const suggestedWeight = reduce ? Math.max(0, Math.floor(weight * 0.95 / step) * step) : increase ? weight + step : weight;
    const effortLabel = effort?.rir != null && effort.rir !== '' ? `RIR ${effort.rir}` : `RPE ${effort?.rpe}`;
    const reason = reduce ? `${effort ? effortLabel + ' reported' : 'Target missed in two comparable sessions'}; consider a lighter load and rebuild.`
      : increase ? `All ${last.sets.length} working sets reached ${range.high} reps with recorded effort. Add ${step} ${data.profile.units}.`
      : !full ? `Only ${last.sets.length}/${range.sets} prescribed sets recorded. Hold load until the full session is logged.`
      : !effortKnown ? 'Effort data is incomplete. Hold load and record RIR or RPE before increasing.'
      : !comparable ? 'Working-set loads differ. Review the set scheme before increasing.' : `Hold load and build all working sets toward ${range.high} reps.`;
    return [{ exercise, lastWeight: weight, lastReps: reps, suggestedWeight: Math.round(suggestedWeight * 100) / 100,
      suggestedReps: `${range.low}-${range.high}`, reason, hitTopOfRange: hitTop, applyNext: increase || reduce,
      evidence: { version: CALCULATION_VERSION, kind: 'estimated' as const, inputs: ['working sets', 'rep range', 'effort', 'load increment'],
        missing: [...(!full ? ['complete working sets'] : []), ...(!effortKnown ? ['RIR/RPE'] : [])], sources: history.map(h => h.session.id) } }];
  });
}

export function applyProgressionToPlan(
  exercises: PlannedExercise[],
  tips: ProgressionTip[],
): PlannedExercise[] {
  const map = new Map(tips.map((t) => [t.exercise, t]));
  return exercises.map((ex) => {
    const tip = map.get(ex.name);
    if (!tip) return ex;
    const range = parseRepRange(ex.vol);
    return {
      ...ex,
      vol: `${range.sets} x ${tip.suggestedReps}`,
      cue: tip.reason,
      percent1rm: ex.percent1rm,
    };
  });
}

export function buildDeloadWeekDays(
  source: { days: Array<{ key: string; type: string; title: string; subtitle: string; muscles: string[]; exercises: PlannedExercise[] }> },
  volumeMultiplier = 0.6,
): typeof source.days {
  return source.days.map((d) => ({
    ...d,
    title: d.type === 'rest' ? d.title : `${d.title} (Deload)`,
    subtitle: d.type === 'rest' ? d.subtitle : `Volume ×${volumeMultiplier}`,
    exercises: d.exercises.map((ex) => {
      const range = parseRepRange(ex.vol);
      const sets = Math.max(1, Math.round(range.sets * volumeMultiplier));
      return {
        ...ex,
        vol: `${sets} x ${range.low}-${range.high}`,
        cue: (ex.cue ? ex.cue + ' · ' : '') + 'Deload — stop ~RIR 3–4',
        rirTarget: 3,
        percent1rm: ex.percent1rm ? Math.round(Number(ex.percent1rm) * 0.9) : ex.percent1rm,
      };
    }),
  }));
}

export function sessionDurationMinutes(s: Session): number {
  if (s.durationMinutes != null && Number(s.durationMinutes) > 0) return Number(s.durationMinutes);
  if (s.startedAt && s.endedAt) {
    const a = new Date(s.startedAt).getTime();
    const b = new Date(s.endedAt).getTime();
    if (b > a) return Math.round((b - a) / 60000);
  }
  return 0;
}

export function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function sessionsToCsv(sessions: Session[]): string {
  const rows = [
    ['sessionId', 'date', 'dayKey', 'dayTitle', 'exercise', 'status', 'set', 'type', 'side', 'weight', 'reps', 'rpe', 'rir', 'trackingMode', 'durationSec', 'restSec', 'tempo'].join(','),
  ];
  for (const s of sessions.filter(isFinishedSession)) {
    for (const log of s.logs || []) {
      for (const set of log.sets || []) {
        rows.push(
          [
            s.id,
            s.date,
            s.dayKey,
            s.dayTitle,
            log.name,
            log.status,
            set.s,
            set.type || 'work',
            set.side || 'both',
            set.w,
            set.r,
            set.rpe ?? '',
            set.rir ?? '',
            set.trackingMode || log.trackingMode || 'weight_reps',
            set.durationSec ?? '',
            set.restSec ?? '',
            set.tempo ?? '',
          ]
            .map(csvEscape)
            .join(','),
        );
      }
    }
  }
  return rows.join('\n');
}
