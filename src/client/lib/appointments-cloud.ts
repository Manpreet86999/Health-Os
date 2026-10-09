import { z } from 'zod';
import { APPOINTMENT_PREFIX, appointmentSchema, appointmentContent, zonedDateTime, type HealthAppointment } from '../../shared/appointments';
import type { MedicalActionState } from '../../shared/medical-actions';
import { labTrends, type MedicalReport } from '../../shared/medical';
import type { BioRecord } from '../../shared/biology';

type Workspace = { records: any[]; get: (type: any, id: string) => any; save: (type: any, payload: any, id?: string) => Promise<any>; remove: (type: any, id: string) => Promise<void> };
export async function appointmentsCloudRoute(path: string, method: string, body: unknown, ws: Workspace, evidence: { reports: MedicalReport[]; records: BioRecord[]; state: MedicalActionState }): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, { status });
  const all = ws.records.filter(row => row.entityType === 'automationState' && row.id.startsWith(APPOINTMENT_PREFIX) && !row.deletedAt)
    .map(row => appointmentSchema.safeParse(row.payload.appointment)).filter(result => result.success).map(result => result.data!);
  if (path === '/medical/appointments' && method === 'GET') return json({ appointments: all, reports: evidence.reports, questions: evidence.state.questions, followups: evidence.state.followups });
  const match = path.match(/^\/medical\/appointments\/([^/]+)(?:\/(summary))?$/);
  const id = match?.[1], current = all.find(row => row.id === id);
  if (method === 'POST' && path === '/medical/appointments' || method === 'PATCH' && match && !match[2]) {
    const input = z.object({ appointment: appointmentSchema, expectedRevision: z.number().int().nonnegative() }).parse(body);
    if (id && id !== input.appointment.id) return json({ error: 'Appointment identifier does not match.' }, 400);
    const existing = all.find(row => row.id === input.appointment.id);
    if (method === 'PATCH' && !existing) return json({ error: 'Appointment not found. Your draft is preserved.' }, 404);
    if (existing && appointmentContent(existing) === appointmentContent(input.appointment)) return json({ appointment: existing });
    if ((existing?.revision || 0) !== input.expectedRevision) return json({ error: 'This appointment changed on another device. Compare the latest record with your draft.', appointment: existing, conflict: true }, 409);
    const reports = ws.records.filter(row => row.entityType === 'medicalReport' && !row.deletedAt);
    const medical = ws.get('automationState', 'health-os-medical-actions')?.payload.state as MedicalActionState | undefined;
    if (input.appointment.sourceRefs.some(ref => ref.kind === 'report' && !reports.some(row => row.id === ref.id))) return json({ error: 'A linked report is no longer available. Remove it before saving.' }, 400);
    if (input.appointment.sourceRefs.some(ref => ref.kind === 'record' && !evidence.records.some(row => row.id === ref.id && !row.deletedAt))) return json({ error: 'A linked record is no longer available. Remove it before saving.' }, 400);
    if (input.appointment.questionIds.some(ref => !medical?.questions.some(question => question.id === ref))) return json({ error: 'A linked question is no longer available.' }, 400);
    if (input.appointment.followupIds.some(ref => !medical?.followups.some(followup => followup.id === ref))) return json({ error: 'A linked follow-up is no longer available.' }, 400);
    const stamp = new Date().toISOString();
    const appointment = { ...input.appointment, revision: (existing?.revision || 0) + 1, createdAt: existing?.createdAt || stamp, updatedAt: stamp };
    await ws.save('automationState', { kind: 'healthAppointment', version: 1, appointment }, `${APPOINTMENT_PREFIX}${appointment.id}`);
    if(typeof window !== 'undefined') window.dispatchEvent(new Event('health-os-appointments-changed'));
    return json({ appointment });
  }
  if (!current) return json({ error: 'Appointment not found.' }, 404);
  if (method === 'GET' && match?.[2] === 'summary') return json(appointmentSummary(current, evidence.reports, evidence.records, evidence.state));
  if (method === 'GET' && !match?.[2]) return json({ appointment: current });
  if (method === 'DELETE') {
    const input = z.object({ expectedRevision: z.number().int().positive(), confirm: z.literal(true) }).parse(body);
    if (current.revision !== input.expectedRevision) return json({ error: 'Appointment changed. Reload before archiving.', conflict: true, appointment: current }, 409);
    await ws.remove('automationState', `${APPOINTMENT_PREFIX}${current.id}`); if(typeof window !== 'undefined') window.dispatchEvent(new Event('health-os-appointments-changed')); return json({ ok: true });
  }
  return json({ error: 'Unsupported appointment action.' }, 405);
}

export function appointmentSummary(appointment: HealthAppointment, reports: MedicalReport[], records: BioRecord[], actions: MedicalActionState) {
  const within = (stamp: string) => { const day = stamp.length > 10 ? zonedDateTime(stamp, appointment.timezone).slice(0, 10) : stamp; return day >= appointment.summaryFrom && day <= appointment.summaryTo; };
  const warnings = appointment.sourceRefs.flatMap(ref => {
    const source = ref.kind === 'report' ? reports.find(row => row.id === ref.id) : records.find(row => row.id === ref.id && !row.deletedAt);
    return !source ? [`Selected ${ref.kind} ${ref.id} is unavailable and was excluded.`] : ref.revision !== undefined && source.revision !== ref.revision ? [`${'name' in source ? source.name : source.title} changed since selection. This preview uses its current revision; review before exporting.`] : [];
  });
  const selectedReports = reports.filter(report => appointment.sourceRefs.some(ref => ref.kind === 'report' && ref.id === report.id) && within(report.collectedAt));
  const selectedRecords = records.filter(record => !record.deletedAt && appointment.sourceRefs.some(ref => ref.kind === 'record' && ref.id === record.id) && (['medication','supplement'].includes(record.type) || within(record.timestamp)));
  const reviewed = selectedReports.filter(report => report.status === 'reviewed');
  return { generatedAt: new Date().toISOString(), appointment, warnings, period: { from: appointment.summaryFrom, to: appointment.summaryTo }, reports: reviewed, unreviewedReports: selectedReports.filter(report => report.status !== 'reviewed').map(report => ({ id: report.id, title: report.title, status: report.status })), trends: labTrends(reviewed), vitals: selectedRecords.filter(record => ['vital', 'bodyMeasurement'].includes(record.type)), symptoms: selectedRecords.filter(record => record.type === 'symptom'), illness: selectedRecords.filter(record => record.type === 'illness'), medications: selectedRecords.filter(record => ['medication', 'supplement', 'dose'].includes(record.type)), notes: selectedRecords.filter(record => record.type === 'journal'), medicalActions: { questions: actions.questions.filter(question => appointment.questionIds.includes(question.id)), followups: actions.followups.filter(followup => appointment.followupIds.includes(followup.id)) }, limitations: 'User-selected records and user-authored visit notes. Verify details against original reports. Unreviewed documents are listed separately and excluded from reviewed results.' };
}
