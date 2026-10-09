import { db, dependencies, env, failure, queueDependencies, runReportJob } from '../_shared/runtime.ts';
import { processReportJob, type ReportJob } from '../_shared/report-queue.ts';
import { EmailError } from '../../../src/shared/email-contract.ts';
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  try {
    if (request.headers.get('Authorization') !== `Bearer ${env('HEALTHOS_SCHEDULER_SECRET')}`) throw new EmailError('AUTH_REQUIRED');
    const input = await request.json().catch(() => ({}));
    if (input.jobId !== undefined) {
      if (!Number.isSafeInteger(input.jobId) || input.jobId < 1) throw new EmailError('INVALID_EMAIL_REQUEST');
      EdgeRuntime.waitUntil(runReportJob(input.jobId).catch(() => dependencies.log({code:'EMAIL_DELIVERY_FAILED',userId:'scheduler'})));
      return Response.json({ok:true,status:'accepted'}, {status:202});
    }
    const jobs = await db('rpc/body_os_due_email_jobs', { method: 'POST', body: '{}' });
    // Immediate dispatch and cron share the same database lease.
    EdgeRuntime.waitUntil(Promise.all(jobs.map((job: ReportJob) => processReportJob(job, queueDependencies)))
      .catch(() => dependencies.log({code:'EMAIL_DELIVERY_FAILED',userId:'scheduler'})));
    return Response.json({ok:true,accepted:jobs.length}, {status:202});
  } catch (error) { return failure(error); }
}
Deno.serve(handler);
