import { z } from 'zod';
import { dateKeySchema } from './schemas.js';
import { localDateKey } from './evidence.js';

export const healthReadingSchema = z.object({
  id: z.string().min(1), kind: z.enum(['Steps', 'SleepSession', 'RestingHeartRate','Weight','ExerciseSession','ActiveCalories','TotalCalories','HeartRateVariability']),
  value: z.number().finite().nonnegative(), unit: z.enum(['steps', 'hours', 'bpm','kg','minutes','kcal','ms']),
  date: dateKeySchema, startTime: z.string().datetime({ offset: true }), endTime: z.string().datetime({ offset: true }),
  source: z.string().min(1), sourceRecordId: z.string().min(1), importedAt: z.string(),
  sourceDisplayName:z.string().optional(),sourceDevice:z.string().optional(),timeZoneOffsetMinutes:z.number().int().min(-840).max(840).optional(),
  exerciseType:z.string().optional(),metadata:z.record(z.string(),z.unknown()).optional(),
}).refine(r => Date.parse(r.endTime) >= Date.parse(r.startTime), 'Health interval is reversed');
export type HealthReading = z.infer<typeof healthReadingSchema>;

/** Never add overlapping sources together. The user can inspect each source separately. */
export function summarizeHealth(readings: HealthReading[], date: string) {
  const unique = [...new Map(readings.map(r => [r.id, r])).values()].filter(r => r.date === date);
  const groups = new Map<string, HealthReading[]>();
  for (const reading of unique) {
    const key = `${reading.kind}:${reading.source}`;
    groups.set(key, [...(groups.get(key) || []), reading]);
  }
  return [...groups.values()].map(group => {
    const sorted = [...group].sort((a,b) => a.startTime.localeCompare(b.startTime));
    const overlap = sorted.some((r,i) => i > 0 && Date.parse(r.startTime) < Date.parse(sorted[i-1].endTime));
    const crossesDay = group.some(r => r.kind === 'Steps' && localDateKey(new Date(r.startTime)) !== localDateKey(new Date(Math.max(Date.parse(r.startTime), Date.parse(r.endTime)-1))));
    return { kind: group[0].kind, source: group[0].source, unit: group[0].unit, count: group.length, overlap,
      value: overlap || crossesDay ? null : group[0].kind === 'Weight' ? sorted.at(-1)!.value : ['RestingHeartRate','HeartRateVariability'].includes(group[0].kind) ? group.reduce((n,r) => n+r.value,0) / group.length : group.reduce((n,r) => n+r.value,0),
      importedAt: group.map(r => r.importedAt).sort().at(-1)! };
  });
}
