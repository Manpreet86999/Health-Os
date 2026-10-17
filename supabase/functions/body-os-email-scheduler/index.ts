import { db, dependencies, env, failure, queueDependencies, runReportJob } from '../_shared/runtime.ts';
import { processReportJob } from '../_shared/report-queue.ts';
import { EmailError } from '../../../src/shared/email-contract.ts';
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  try {
    if (request.headers.get('Authorization') !== `Bearer ${env('HEALTHOS_SCHEDULER_SECRET')}`) throw new EmailError('AUTH_REQUIRED');
    const input = await request.json().catch(() => ({}));
    if(input.claimedJobId!==undefined){
      if(!Number.isSafeInteger(input.claimedJobId)||input.claimedJobId<1||!Number.isSafeInteger(input.attempt)||input.attempt<1)throw new EmailError('INVALID_EMAIL_REQUEST');
      const jobs=await db(`body_os_email_jobs?id=eq.${input.claimedJobId}&status=eq.processing&attempts=eq.${input.attempt}&report_type=neq.workout&select=*`);
      if(jobs[0])EdgeRuntime.waitUntil(processReportJob(jobs[0],queueDependencies).catch(()=>dependencies.log({code:'EMAIL_DELIVERY_FAILED',userId:'scheduler'})));
      return Response.json({ok:true,status:jobs.length?'accepted':'stale'}, {status:202});
    }
    if (input.jobId !== undefined) {
      if (!Number.isSafeInteger(input.jobId) || input.jobId < 1) throw new EmailError('INVALID_EMAIL_REQUEST');
      EdgeRuntime.waitUntil(runReportJob(input.jobId).catch(() => dependencies.log({code:'EMAIL_DELIVERY_FAILED',userId:'scheduler'})));
      return Response.json({ok:true,status:'accepted'}, {status:202});
    }
    const accepted = await db('rpc/body_os_dispatch_due_report_jobs', { method: 'POST', body: '{}' });
    return Response.json({ok:true,accepted}, {status:202});
  } catch (error) { return failure(error); }
}
Deno.serve(handler);
