import type { Exercise, ExerciseLog, PersonalRecord, PlannedExercise, SetLog } from './types.js';

export const TRACKING_MODES = ['weighted', 'bodyweight', 'reps', 'timed'] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

export const TRACKING_MODE_LABELS: Record<TrackingMode, string> = {
  weighted: 'Weight + reps',
  bodyweight: 'Bodyweight reps',
  reps: 'Reps only',
  timed: 'Time-based',
};

export const TRACKING_MODE_HINTS: Record<TrackingMode, string> = {
  weighted: 'Log load and reps — barbell, dumbbell, machine, and cable work.',
  bodyweight: 'Log reps. Added or assisted load is optional — pull-ups, dips, push-ups.',
  reps: 'Count reps with no load field — crunches, kicks, raises.',
  timed: 'Log hold or work time — planks, wall sits, timed circuits, walks.',
};

const TIMED_NAME =
  /\b(planks?|dead hang|wall sits?|hollow holds?|farmers? carr(?:y|ies)|suitcase (?:hold|carry)|iso(?:metric)? holds?|active mobility|brisk walk|jogging|walk or jog)\b/i;
const BODYWEIGHT_NAME =
  /\b(pull-?ups?|chin-?ups?|dips?|push-?ups?|bodyweight|air squats?|pistol squats?|glute bridges?|burpees?)\b/i;
const REPS_ONLY_NAME =
  /\b(crunches?|sit-?ups?|leg raises?|donkey kicks?|jumping jacks?|mountain climbers?|bicycles?|flutter kicks?|russian twists?|plank twists?|dead bugs?|bird dogs?|v-?ups?|rope\/?towel crunches?)\b/i;
const LOADED_EQUIPMENT = /\b(barbell|dumbbell|db|cable|machine|trap bar|kettlebell|band|smith)\b/i;

export function isTrackingMode(value: unknown): value is TrackingMode {
  return TRACKING_MODES.includes(value as TrackingMode);
}

export function parseDurationToSeconds(input: unknown): number {
  if (input == null || input === '') return 0;
  if (typeof input === 'number' && Number.isFinite(input)) return Math.max(0, Math.round(input));
  const raw = String(input).trim().toLowerCase();
  if (!raw) return 0;
  const mmss = raw.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const minSec = raw.match(/^(\d+)\s*m(?:in(?:ute)?s?)?\s*(\d+)\s*s(?:ec(?:ond)?s?)?$/);
  if (minSec) return Number(minSec[1]) * 60 + Number(minSec[2]);
  const min = raw.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes)$/);
  if (min) return Math.round(Number(min[1]) * 60);
  const sec = raw.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds)$/);
  if (sec) return Math.round(Number(sec[1]));
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function parseTargetDurationSec(vol: string): number {
  const v = String(vol || '').toLowerCase();
  if (!v) return 0;
  const mmss = v.match(/(\d+)\s*:\s*(\d{2})/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const min = v.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?)\b/);
  if (min) return Math.round(Number(min[1]) * 60);
  const sec = v.match(/(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?)\b/);
  if (sec) return Math.round(Number(sec[1]));
  return 0;
}

export function volumeLooksTimed(vol: string): boolean {
  return parseTargetDurationSec(vol) > 0;
}

export function inferTrackingMode(input: {
  name?: string;
  equipment?: string;
  movementPattern?: string;
  vol?: string;
  trackingMode?: unknown;
}): TrackingMode {
  if (isTrackingMode(input.trackingMode)) return input.trackingMode;

  const name = String(input.name || '').trim();
  const equipment = String(input.equipment || '').trim();
  const pattern = String(input.movementPattern || '').toLowerCase();
  const vol = String(input.vol || '');

  if (volumeLooksTimed(vol) || pattern === 'isometric' || pattern === 'recovery') return 'timed';
  if (TIMED_NAME.test(name) && !REPS_ONLY_NAME.test(name)) return 'timed';
  if (REPS_ONLY_NAME.test(name) && !LOADED_EQUIPMENT.test(equipment)) return 'reps';
  if (BODYWEIGHT_NAME.test(name) || equipment.toLowerCase() === 'bodyweight') {
    if (LOADED_EQUIPMENT.test(equipment) && equipment.toLowerCase() !== 'bodyweight') return 'weighted';
    return 'bodyweight';
  }
  if (pattern === 'core' && !LOADED_EQUIPMENT.test(equipment) && !LOADED_EQUIPMENT.test(name)) return 'reps';
  if (/\b(rest|recover)\b/i.test(name) && !LOADED_EQUIPMENT.test(name)) return 'timed';
  return 'weighted';
}

export function resolveTrackingMode(
  planned?: Pick<PlannedExercise, 'name' | 'vol' | 'trackingMode' | 'exerciseId'> | null,
  library?: Array<Pick<Exercise, 'id' | 'name' | 'trackingMode' | 'equipment' | 'movementPattern'>> | null,
): TrackingMode {
  if (isTrackingMode(planned?.trackingMode)) return planned.trackingMode;
  const needle = (planned?.name || '').toLowerCase();
  const lib = (library || []).find(
    (e) =>
      (planned?.exerciseId && e.id === planned.exerciseId) ||
      (needle && e.name.toLowerCase() === needle),
  );
  if (isTrackingMode(lib?.trackingMode)) return lib.trackingMode;
  return inferTrackingMode({
    name: planned?.name || lib?.name,
    equipment: lib?.equipment,
    movementPattern: lib?.movementPattern,
    vol: planned?.vol,
  });
}

export function hydratePlannedExercise(
  ex: PlannedExercise,
  library?: Exercise[] | null,
): PlannedExercise {
  return { ...ex, trackingMode: resolveTrackingMode(ex, library) };
}

export function hydratePlannedExercises(
  exercises: PlannedExercise[],
  library?: Exercise[] | null,
): PlannedExercise[] {
  return exercises.map((ex) => hydratePlannedExercise(ex, library));
}

export function hydrateExercise(ex: Exercise): Exercise {
  if (isTrackingMode(ex.trackingMode)) return ex;
  return { ...ex, trackingMode: inferTrackingMode(ex) };
}

export function setHasWork(set: SetLog, mode?: TrackingMode): boolean {
  const duration = parseDurationToSeconds(set.durationSec);
  const w = Number(set.w) || 0;
  const r = Number(set.r) || 0;
  if (mode === 'timed') return duration > 0;
  if (mode === 'reps') return r > 0;
  if (mode === 'bodyweight') return r > 0 || w > 0;
  return w > 0 || r > 0 || duration > 0;
}

export function trackingModeOfLog(log: Pick<ExerciseLog, 'trackingMode' | 'name' | 'sets'>): TrackingMode {
  if (isTrackingMode(log.trackingMode)) return log.trackingMode;
  const sets = log.sets || [];
  const anyDuration = sets.some((s) => parseDurationToSeconds(s.durationSec) > 0);
  const anyLoad = sets.some((s) => Number(s.w) > 0);
  const anyReps = sets.some((s) => Number(s.r) > 0);
  if (anyDuration && !anyLoad && !anyReps) return 'timed';
  if (anyLoad) return 'weighted';
  if (anyReps) return inferTrackingMode({ name: log.name });
  return inferTrackingMode({ name: log.name });
}

export function formatSetLog(set: SetLog, mode?: TrackingMode, units = 'kg'): string {
  const resolved = mode || trackingModeOfLog({ name: '', sets: [set], trackingMode: undefined });
  const type = set.type && set.type !== 'work' ? ` (${set.type})` : '';
  const side = set.side && set.side !== 'both' ? ` ${set.side}` : '';
  const rpe = set.rpe != null && set.rpe !== '' ? ` @ RPE ${set.rpe}` : '';
  const extra = `${type}${side}${rpe}`;
  if (resolved === 'timed') {
    return `${formatDuration(parseDurationToSeconds(set.durationSec))}${extra}`;
  }
  const r = set.r === '' || set.r == null ? 0 : set.r;
  if (resolved === 'reps') {
    return `${r} reps${extra}`;
  }
  if (resolved === 'bodyweight') {
    const w = Number(set.w) || 0;
    if (w > 0) return `BW+${w} ${units} × ${r}${extra}`;
    return `${r} reps${extra}`;
  }
  return `${set.w ?? 0} × ${r}${extra}`;
}

export function formatSetLogs(sets: SetLog[] | undefined, mode?: TrackingMode, units = 'kg'): string {
  return (sets || []).map((s) => formatSetLog(s, mode, units)).join('  ·  ');
}

export function defaultVolumeForMode(mode: TrackingMode): string {
  if (mode === 'timed') return '3 x 60 sec';
  if (mode === 'reps' || mode === 'bodyweight') return '3 x 10-15';
  return '3 x 8-12';
}

export function formatPersonalRecord(pr: PersonalRecord, units = 'kg'): string {
  const mode = isTrackingMode(pr.trackingMode) ? pr.trackingMode : undefined;
  if (mode === 'timed' || (pr.bestDurationSec && !pr.bestE1rm && !pr.bestWeight)) {
    return formatDuration(pr.bestDurationSec || 0);
  }
  if (mode === 'reps' || (mode === 'bodyweight' && !pr.bestWeight)) {
    return `${pr.bestReps} reps`;
  }
  if (mode === 'bodyweight' && pr.bestWeight) {
    return `BW+${pr.bestWeight} ${units} × ${pr.bestReps}`;
  }
  if (pr.bestE1rm) {
    return `${pr.bestWeight} ${units} × ${pr.bestReps} · e1RM ${Math.round(pr.bestE1rm)}`;
  }
  if (pr.bestReps) return `${pr.bestReps} reps`;
  return `${pr.bestWeight} ${units}`;
}
