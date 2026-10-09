import { EmailError, type ReportEmailType } from '../../../src/shared/email-contract.ts';
import { sendAccountEmail, type EmailDependencies, type EmailUser } from './email-service.ts';

export interface ReportJob {
  id: number; user_id: string; report_type: ReportEmailType | 'test'; report_id: string;
  automatic: boolean; request_version: number; attempts: number;
}
export interface QueueDependencies {
  email: EmailDependencies;
  user(id: string): Promise<EmailUser>;
  finish(job: ReportJob, status: 'done' | 'queued', attempts: number, error: string | null, nextAttemptAt: string | null): Promise<void>;
  sleep(ms: number): Promise<void>;
}

/** One initial attempt and two immediate retries, then durable delayed retry. */
export async function processReportJob(job: ReportJob, deps: QueueDependencies) {
  let code = 'EMAIL_DELIVERY_FAILED';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await sendAccountEmail(await deps.user(job.user_id), job.report_type === 'test'
        ? { reportType: 'test' } : { reportType: job.report_type, reportId: job.report_id }, deps.email, job.automatic,
        `${job.report_type}:${job.report_id}:ai:${job.request_version}`);
      await deps.finish(job, 'done', job.attempts + attempt, null, null);
      return { ...result, status: 'skipped' in result ? 'skipped' as const : 'sent' as const };
    } catch (error) {
      code = error instanceof EmailError ? error.code : 'EMAIL_DELIVERY_FAILED';
      deps.email.log({ code, userId: job.user_id });
      if (attempt < 2) await deps.sleep(500 * (attempt + 1));
    }
  }
  const attempts = job.attempts + 2;
  const delay = Math.min(3600, 60 * 2 ** Math.min(6, Math.floor(attempts / 3) - 1));
  await deps.finish(job, 'queued', attempts, code, new Date(Date.now() + delay * 1000).toISOString());
  return { ok: true, status: 'queued' as const, sentTo: [], error: code };
}
