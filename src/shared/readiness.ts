import { readinessInputSchema, validationMessage } from './schemas.js';
import { CALCULATION_VERSION, localDateKey } from './evidence.js';
import type { BioRecord } from './biology.js';
const clamp = (value: unknown, min: number, max: number) => Math.max(min, Math.min(max, Number(value) || 0));
import type { Readiness } from './types.js';

export function readinessBand(score: number) {
  if (score >= 80) return { label: 'Ready', intensity: 'Normal or progressive training', color: 'green' };
  if (score >= 60) return { label: 'Controlled', intensity: 'Train, but keep effort controlled', color: 'blue' };
  if (score >= 40) return { label: 'Reduced', intensity: 'Reduce volume or intensity today', color: 'orange' };
  return { label: 'Recovery', intensity: 'Recovery, mobility, or very light work recommended', color: 'rose' };
}

export type ReadinessInput = Record<string, unknown> | Readiness;

/** Project a complete daily check-in into the existing training contract. */
export function checkInReadiness(record: BioRecord, history: Readiness[] = []): Readiness | undefined {
  if (record.type !== 'checkIn' || record.quality === 'estimated' || record.metadata.requiresConfirmation === true && record.metadata.confirmed !== true) return;
  const result = normalizeReadiness({ ...record.metadata, date: localDateKey(new Date(record.timestamp)), createdAt: record.createdAt }, history);
  if (!result.item) return;
  return { ...result.item, id: result.item.date, weekId: 'daily', dayKey: result.item.date, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

/** Local, cloud and pending offline check-ins share the same date and score. */
export function mergeDailyReadiness(history: Readiness[], records: BioRecord[]): Readiness[] {
  const days = new Map(history.map(item => [item.date, item]));
  const dailyRecords = new Map<string, BioRecord>();
  for (const record of [...records].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    const item = checkInReadiness(record, [...days.values()]);
    if (!item) continue;
    const old = days.get(item.date);
    if (old?.updatedAt && old.updatedAt > record.updatedAt) continue;
    if (record.deletedAt) { days.delete(item.date); dailyRecords.delete(item.date); }
    else { days.set(item.date, item); dailyRecords.set(item.date, record); }
  }
  // Earlier dates may have been edited later; calculate guidance with all history.
  const completeHistory = [...days.values()];
  return completeHistory.map(item => dailyRecords.has(item.date) ? checkInReadiness(dailyRecords.get(item.date)!, completeHistory)! : item).sort((a, b) => b.date.localeCompare(a.date));
}

export function scoreReadiness(input: ReadinessInput): number {
  const sleepHours = clamp(input.sleepHours, 0, 24);
  const sleepQuality = clamp(input.sleepQuality, 1, 10);
  const soreness = clamp(input.soreness, 1, 10);
  const energy = clamp(input.energy, 1, 10);
  const stress = clamp(input.stress, 1, 10);
  const motivation = clamp(input.motivation, 1, 10);
  const mood = clamp(input.mood, 1, 10);
  const steps = clamp(input.steps, 0, 200000);
  const pain = input.painFlag === true || input.painFlag === 'true' || input.painFlag === 'yes';
  let score = 0;
  score += Math.min(1, sleepHours / 8) * 22;
  score += (sleepQuality / 10) * 10;
  score += ((11 - soreness) / 10) * 14;
  score += (energy / 10) * 14;
  score += ((11 - stress) / 10) * 10;
  score += (motivation / 10) * 8;
  score += (mood / 10) * 7;
  // Movement is useful context, but it must not punish a morning check-in
  // before the athlete has had a chance to walk. It adds up to five points
  // at the current daily target and is capped above that target.
  score += Math.min(1, steps / 8000) * 5;
  score = score / 85 * 100;
  if (pain) score -= 18;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function readinessReason(item: Readiness): string {
  const reasons: string[] = [];
  if (Number(item.sleepHours) < 6.5) reasons.push('sleep is below target');
  if (Number(item.soreness) >= 7) reasons.push('soreness is high');
  if (Number(item.energy) <= 4) reasons.push('energy is low');
  if (Number(item.stress) >= 7) reasons.push('stress is high');
  if (Number(item.steps) >= 8000) reasons.push('daily movement target is met');
  if (item.painFlag) reasons.push('pain or injury is flagged');
  return reasons.length ? `Because ${reasons.join(', ')}.` : 'Recovery inputs look balanced today.';
}

export function todayAssistant(item: Readiness) {
  const band = readinessBand(item.score);
  const pain = item.painFlag ? ' Avoid painful ranges and heavy loading.' : '';
  const warmup =
    item.score >= 80
      ? 'Ramp gradually through your first compound lift.'
      : item.score >= 60
        ? 'Add 5-8 minutes of easy cardio and two lighter ramp sets.'
        : 'Use mobility, easy blood-flow sets, and stop any sharp pain.';
  const recovery =
    item.score >= 80
      ? 'Keep sleep and recovery habits steady.'
      : item.score >= 60
        ? 'Cap failure work and protect sleep tonight.'
        : 'Prioritize sleep, hydration, and a lighter session.';
  return {
    score: item.score,
    band: band.label,
    intensity: band.intensity + pain,
    reason: readinessReason(item),
    warmup,
    recovery,
  };
}

/** Auto volume/intensity modifier from readiness (explainable programming). */
export function readinessModifier(score: number, painFlag: boolean): {
  volumeMultiplier: number;
  intensityNote: string;
  skipHeavy: boolean;
} {
  if (painFlag) return { volumeMultiplier: 0.5, intensityNote: 'Pain flagged: cut load and avoid aggravating ranges.', skipHeavy: true };
  if (score >= 80) return { volumeMultiplier: 1, intensityNote: 'Full progressive session is appropriate.', skipHeavy: false };
  if (score >= 60) return { volumeMultiplier: 0.85, intensityNote: 'Keep effort controlled; skip failure sets.', skipHeavy: false };
  if (score >= 40) return { volumeMultiplier: 0.65, intensityNote: 'Reduce volume ~35% and keep RPE ≤7.', skipHeavy: true };
  return { volumeMultiplier: 0.4, intensityNote: 'Recovery focus: mobility and light blood-flow only.', skipHeavy: true };
}

export function normalizeReadiness(body: Record<string, unknown>, history: Readiness[] = []): { item?: Readiness; error?: string } {
  const parsed = readinessInputSchema.safeParse(body);
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  body = parsed.data;
  const date = String(body.date);
  const item: Readiness = {
    id: body.id ? String(body.id) : undefined,
    weekId: body.weekId ? String(body.weekId) : undefined,
    dayKey: body.dayKey ? String(body.dayKey) : undefined,
    date,
    sleepHours: clamp(Number(body.sleepHours) || 0, 0, 24),
    sleepQuality: clamp(Number(body.sleepQuality) || 5, 1, 10),
    soreness: clamp(Number(body.soreness), 0, 10),
    energy: clamp(Number(body.energy) || 5, 1, 10),
    stress: clamp(Number(body.stress), 0, 10),
    motivation: clamp(Number(body.motivation) || 5, 1, 10),
    mood: clamp(Number(body.mood) || 5, 1, 10),
    hydration: Number(body.hydration) || 0,
    hydrationUnit: body.hydrationUnit as Readiness['hydrationUnit'],
    evidence: { version: CALCULATION_VERSION, kind: 'estimated', inputs: ['sleepHours', 'sleepQuality', 'soreness', 'energy', 'stress', 'motivation', 'mood', 'steps', 'painFlag'], missing: [] },
    mealProtein: Number(body.mealProtein) || 0,
    steps: Number(body.steps) || 0,
    painFlag: body.painFlag === true || body.painFlag === 'true' || body.painFlag === 'yes',
    restingHeartRate:
      body.restingHeartRate === '' || body.restingHeartRate == null
        ? ''
        : clamp(Number(body.restingHeartRate), 25, 250),
    notes: String(body.notes || '').trim(),
    createdAt: String(body.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    score: 0,
    band: '',
    recommendation: '',
  };
  item.score = scoreReadiness(item);
  item.band = readinessBand(item.score).label;
  item.recommendation = readinessBand(item.score).intensity;
  item.assistant = todayAssistant(item);
  const prior = [...new Map(history.filter(r => r.date < item.date).map(r => [r.date, r])).values()].sort((a,b) => a.date.localeCompare(b.date)).slice(-28);
  const heartRates = prior.map(r => Number(r.restingHeartRate)).filter(n => Number.isFinite(n) && n > 0).sort((a,b) => a-b);
  if (heartRates.length >= 7 && Number(item.restingHeartRate) > 0) {
    const middle = Math.floor(heartRates.length / 2);
    const baseline = heartRates.length % 2 ? heartRates[middle] : (heartRates[middle-1] + heartRates[middle]) / 2;
    item.assistant.reason += ` Resting heart rate: ${Math.round(Number(item.restingHeartRate)-baseline)} bpm versus your ${heartRates.length}-reading median (${Math.round(baseline)} bpm); shown for context, not scored.`;
    item.evidence!.inputs.push('personal resting-heart-rate baseline');
  } else {
    item.evidence!.missing.push('personal resting-heart-rate baseline (7 prior readings)');
  }
  return { item };
}
