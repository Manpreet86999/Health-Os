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
import {canSendDailyReport,validReportDate,istDate,completeNutritionGoals} from '../../../src/shared/daily-report-policy.ts';
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
    if(payload.action==='week-goals'){
      if(typeof payload.weekId!=='string'||payload.weekId.length>200||!completeNutritionGoals(payload.goals))throw new EmailError('INVALID_EMAIL_REQUEST');
      const path=`body_os_records?user_id=eq.${encodeURIComponent(user.id)}&entity_type=eq.week&record_id=eq.${encodeURIComponent(payload.weekId)}&deleted_at=is.null`;
      const week=(await db(path+'&select=payload,revision,cloud_updated_at&limit=1'))[0];
      if(!week)throw new EmailError('REPORT_NOT_FOUND');
      const updated=await db(path+`&cloud_updated_at=eq.${encodeURIComponent(week.cloud_updated_at)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({payload:{...week.payload,nutritionGoals:payload.goals,nutritionGoalsSetAt:new Date().toISOString()},revision:Number(week.revision)+1,updated_at:new Date().toISOString(),device_id:'health-os-week-goals'})});
      if(!updated?.length)throw new EmailError('INVALID_EMAIL_REQUEST');
      if(week.payload.activateAfterGoals||week.payload.mode==='flexible'){
        const statePath=`body_os_records?user_id=eq.${encodeURIComponent(user.id)}&entity_type=eq.workspaceState&record_id=eq.workspace-state`;
        const state=(await db(statePath+'&select=*&limit=1'))[0];
        if(state)await db(statePath,{method:'PATCH',body:JSON.stringify({payload:{...state.payload,activeWeekId:payload.weekId},revision:Number(state.revision)+1,updated_at:new Date().toISOString(),device_id:'health-os-week-goals'})});
        else await db('body_os_records',{method:'POST',body:JSON.stringify({user_id:user.id,entity_type:'workspaceState',record_id:'workspace-state',payload:{id:'workspace-state',activeWeekId:payload.weekId},revision:1,updated_at:new Date().toISOString(),device_id:'health-os-week-goals',workspace:'training',payload_version:1})});
      }
      return Response.json({ok:true},{headers:cors});
    }
    if(payload.action==='daily-list'){
      const reports=await db(`body_os_daily_reports?user_id=eq.${encodeURIComponent(user.id)}&select=report_date,generated_at,sent_at,read_at&order=report_date.desc&limit=90`);
      const jobs=await db(`body_os_email_jobs?user_id=eq.${encodeURIComponent(user.id)}&report_type=eq.daily&select=report_id,status,last_error&order=created_at.desc&limit=90`);
      return Response.json({reports,jobs,today:istDate(),serverNow:new Date().toISOString()},{headers:cors});
    }
    if(payload.action==='daily-get'||payload.action==='daily-read'){
      if(!validReportDate(payload.date))throw new EmailError('INVALID_EMAIL_REQUEST');
      const path=`body_os_daily_reports?user_id=eq.${encodeURIComponent(user.id)}&report_date=eq.${payload.date}`;
      const report=(await db(path+'&select=*&limit=1'))[0];
      if(!report)throw new EmailError('REPORT_NOT_FOUND');
      if(payload.action==='daily-read'){
        if(!report.sent_at||payload.date>=istDate())throw new EmailError('INVALID_EMAIL_REQUEST');
        await db(path+'&read_at=is.null',{method:'PATCH',body:JSON.stringify({read_at:new Date().toISOString()})});
        return Response.json({ok:true},{headers:cors});
      }
      return Response.json({report},{headers:cors});
    }
    const parsed = parseEmailRequest(payload);
    if(parsed.reportType==='daily'||parsed.reportType==='workout'){
      let date=parsed.reportId;
      if(parsed.reportType==='workout'){
        const sessions=await dependencies.report(user.id,'workout',parsed.reportId);
        if(!sessions?.length)throw new EmailError('REPORT_NOT_FOUND');
        date=String(sessions[0].date);
      }
      if(!canSendDailyReport(date))throw new EmailError('REPORT_TOO_EARLY');
      const jobs=await db('rpc/body_os_request_daily_report',{method:'POST',body:JSON.stringify({owner_id:user.id,day:date})});
      const job=jobs[0];if(!job)throw new EmailError('REPORT_NOT_FOUND');
      if(job.status!=='done')EdgeRuntime.waitUntil(runReportJob(Number(job.id)).catch(()=>dependencies.log({code:'EMAIL_DELIVERY_FAILED',userId:user.id})));
      return Response.json({ok:true,status:job.status==='done'?'sent':'queued',sentTo:[],deliveryId:String(job.id)},{status:202,headers:cors});
    }
    return Response.json(await sendAccountEmail(user, payload, dependencies), {
      headers: cors,
    });
  } catch (error) {
    return failure(error);
  }
}
Deno.serve(handler);

