import { setSchema } from './schemas.js';
import type { ExerciseLog, ExerciseTrackingMode, PlannedExercise, SetLog } from './types.js';

/** Keep prescription identity and metadata when a planned movement becomes a log. */
export function logFromPlan(name: string, plan?: PlannedExercise): ExerciseLog {
  return {
    name: name.trim(), target: plan?.target || 'Other', status: 'completed', sets: [],
    exerciseId: plan?.exerciseId, familyId: plan?.familyId,
    supersetGroup: plan?.supersetGroup, plannedTempo: plan?.tempo,
    plannedRestSec: plan?.restSec === '' || plan?.restSec == null ? undefined : Number(plan.restSec),
    trackingMode: plan?.trackingMode || 'weight_reps', journal: plan?.notes,
  };
}

export function parseWorkoutSet(input: Record<string, unknown>, mode: ExerciseTrackingMode): SetLog {
  const parsed = setSchema.parse({ ...input, trackingMode: mode,
    w: mode === 'weight_reps' ? input.w : '',
    r: mode === 'time' ? '' : input.r,
    durationSec: mode === 'time' ? input.durationSec : undefined,
  });
  if (mode === 'weight_reps' && parsed.w === '') throw new Error('Enter the load; use 0 for no added load.');
  if (mode === 'time' ? !(Number(parsed.durationSec) > 0) : !(Number(parsed.r) > 0)) {
    throw new Error(mode === 'time' ? 'Enter a duration greater than zero.' : 'Enter repetitions greater than zero.');
  }
  return parsed as SetLog;
}

export function formatWorkoutSet(set: SetLog, units = 'kg'): string {
  const result = set.trackingMode === 'time' ? `${set.durationSec} sec`
    : set.trackingMode === 'reps' ? `${set.r} reps` : `${set.w} ${units} × ${set.r}`;
  return `${result}${set.type && set.type !== 'work' ? ` · ${set.type}` : ''}${set.side && set.side !== 'both' ? ` · ${set.side}` : ''}`;
}
