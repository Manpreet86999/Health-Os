import { z } from 'zod';
import { evidenceRefSchema } from './medical-actions.js';

const timezone = z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Choose a valid timezone, such as Asia/Kolkata.');
export const appointmentSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), revision: z.number().int().positive(),
  title: z.string().trim().min(1, 'Enter an appointment title.').max(250),
  scheduledAt: z.string().datetime({ offset: true }), timezone,
  clinician: z.string().max(250).default(''), location: z.string().max(1000).default(''),
  remoteUrl: z.union([z.literal(''), z.string().url().refine(value => /^https?:\/\//i.test(value), 'Use an http or https visit link.')]).default(''),
  reason: z.string().max(4000).default(''), status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
  sourceRefs: z.array(evidenceRefSchema.extend({kind:z.enum(['report','record'])})).max(300).default([]), questionIds: z.array(z.string().min(1).max(150)).max(100).default([]),
  followupIds: z.array(z.string().min(1).max(150)).max(100).default([]),
  preparation: z.object({ records: z.boolean(), questions: z.boolean(), medications: z.boolean() }).default({ records: false, questions: false, medications: false }),
  visitNotes: z.string().max(20000).default(''), nextSteps: z.string().max(10000).default(''),
  summaryFrom: z.string().date(), summaryTo: z.string().date(),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
}).refine(value => value.summaryFrom <= value.summaryTo, { message: 'The summary end date must follow its start date.', path: ['summaryTo'] });
export type HealthAppointment = z.infer<typeof appointmentSchema>;
export const APPOINTMENT_PREFIX = 'health-os-appointment:';
export function appointmentContent(value: HealthAppointment) {
  const { revision, createdAt, updatedAt, ...content } = value; return JSON.stringify(content);
}
export function zonedDateTime(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function zonedLocalToIso(local: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Choose an appointment date and time.');
  const target = Date.parse(`${local}:00Z`); if (!Number.isFinite(target)) throw new Error('Choose a valid date and time.');
  let estimate = target;
  for (let i = 0; i < 4; i++) estimate += target - Date.parse(`${zonedDateTime(new Date(estimate).toISOString(), zone)}:00Z`);
  const candidates = [estimate - 3600000, estimate, estimate + 3600000].filter(value => zonedDateTime(new Date(value).toISOString(), zone) === local);
  if (!candidates.length) throw new Error('This time does not exist in the selected timezone. Choose another time.');
  return new Date(Math.min(...candidates)).toISOString();
}
/** Preserve an existing DST occurrence when editing other appointment fields. */
export function resolveAppointmentTime(local:string,zone:string,previous?:Pick<HealthAppointment,'scheduledAt'|'timezone'>){
  if(previous&&zone===previous.timezone&&local===zonedDateTime(previous.scheduledAt,zone))return previous.scheduledAt;
  return zonedLocalToIso(local,zone);
}
