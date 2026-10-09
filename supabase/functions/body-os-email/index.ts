import { sendAccountEmail } from "../_shared/email-service.ts";
import {
  authenticate,
  emailQueue,
  cors,
  dependencies,
  failure,
  db,
  runReportJob,
} from "../_shared/runtime.ts";
import { EmailError, parseEmailRequest } from "../../../src/shared/email-contract.ts";
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
export async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: cors });
  }
  try {
    const user = await authenticate(request);
    const body = await request.text();
    if (body.length > 20000) throw new EmailError("INVALID_EMAIL_REQUEST");
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new EmailError("INVALID_EMAIL_REQUEST");
    }
    if (payload.action === "queue" && Object.keys(payload).length === 1) return Response.json({jobs:await emailQueue(user.id)}, {headers:cors});
    const parsed = parseEmailRequest(payload);
    if (parsed.reportType === 'workout') {
      // Verify ownership before creating work with the privileged database adapter.
      if (!(await dependencies.report(user.id, 'workout', parsed.reportId))?.length) throw new EmailError('REPORT_NOT_FOUND');
      const jobs = await db('rpc/body_os_request_workout_report', { method: 'POST', body: JSON.stringify({ owner_id: user.id, session_id: parsed.reportId }) });
      const job = jobs[0];
      if (!job) throw new EmailError('REPORT_NOT_FOUND');
      EdgeRuntime.waitUntil(runReportJob(Number(job.id)).catch(() => dependencies.log({code:'EMAIL_DELIVERY_FAILED',userId:user.id})));
      return Response.json({ok:true,status:job.status === 'processing' ? 'processing' : 'queued',sentTo:[],deliveryId:String(job.id)}, {status:202,headers:cors});
    }
    return Response.json(await sendAccountEmail(user, payload, dependencies), {
      headers: cors,
    });
  } catch (error) {
    return failure(error);
  }
}
Deno.serve(handler);

