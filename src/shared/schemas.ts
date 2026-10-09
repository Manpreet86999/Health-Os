import { z } from 'zod';

export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Use a real calendar date');
export const numeric = (min: number, max: number) => z.union([z.number(), z.string().trim().min(1)])
  .transform(Number).pipe(z.number().finite().min(min).max(max));
const optionalNumber = (min: number, max: number) => z.union([z.literal(''), z.null(), numeric(min, max)]).optional();
export const setSchema = z.object({
  s: numeric(1, 1000), w: z.union([z.literal(''), numeric(0, 5000)]),
  r: z.union([z.literal(''), numeric(0, 10000)]),
  rir: optionalNumber(0, 10), rpe: optionalNumber(1, 10),
  durationSec: optionalNumber(0, 86400), restSec: optionalNumber(0, 86400),
}).passthrough();
export const sessionInputSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  date: dateKeySchema.optional(),
  logs: z.array(z.object({ name: z.string().trim().min(1), sets: z.array(setSchema).max(1000) }).passthrough()).max(500),
}).passthrough();

export const aiWorkoutSchema = z.object({
  name: z.string().min(1).max(200).optional().default('Workout'),
  exercises: z.array(z.object({
    name: z.string().min(1).max(200),
    target: z.string().max(200).optional().default('Mixed'),
    vol: z.string().min(1).max(100).optional().default('3 x 8-12'),
    cue: z.string().max(2000).optional().default(''),
    sets: z.union([z.number(), z.string()]).optional(),
    reps: z.union([z.number(), z.string()]).optional(),
  }).passthrough()).min(1).max(50),
}).passthrough();
export const aiReportSchema = z.object({overallSummary:z.string().min(1).max(10000),exerciseComments:z.record(z.string(),z.string().max(4000))});
const skinStepSchema=z.object({product:z.string().min(1),waitMin:z.number().min(0).max(120).optional()});
export const aiSkinSchema=z.object({comment:z.string().max(10000).optional(),notes:z.string().max(10000).optional(),pauseActives:z.boolean().optional(),resumeActives:z.boolean().optional(),am:z.array(skinStepSchema).max(20).nullable().optional(),pm:z.array(skinStepSchema).max(20).nullable().optional(),adjustments:z.array(z.string().max(2000)).max(30).optional()}).refine(v=>!(v.pauseActives&&v.resumeActives),'Cannot pause and resume actives together');
export const measurementInputSchema = z.object({
  bmr: optionalNumber(0, 10000), muscleMass: optionalNumber(0, 1500),
  date: dateKeySchema.optional(), weight: optionalNumber(0.1, 1500),
  neck: optionalNumber(0.1, 500), waist: optionalNumber(0.1, 500),
  chest: optionalNumber(0.1, 500), arms: optionalNumber(0.1, 500), hips: optionalNumber(0.1, 500),
  bodyFat: optionalNumber(0.1, 100), waterPercentage: optionalNumber(0.1, 100),
}).passthrough();
export const readinessInputSchema = z.object({
  date: dateKeySchema, sleepHours: numeric(0, 24), sleepQuality: numeric(1, 10),
  soreness: numeric(0, 10), energy: numeric(1, 10), stress: numeric(0, 10),
  motivation: numeric(1, 10), mood: numeric(1, 10),
  painFlag: z.union([z.boolean(), z.enum(['true', 'false', 'yes', 'no'])]),
  restingHeartRate: optionalNumber(25, 250), steps: optionalNumber(0, 200000),
  hydration: optionalNumber(0, 10000), hydrationUnit: z.enum(['L', 'mL', 'fl oz']).optional(),
}).passthrough();

export function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'Input'}: ${issue.message}`).join('; ');
}
