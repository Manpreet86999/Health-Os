import {processCloudReminders} from '../../../src/server/worker/cloud-reminders.ts';
import {processCloudGoalMonitor} from '../../../src/server/worker/cloud-goal-monitor.ts';
import {cloudGrantSchema} from '../../../src/shared/intelligence/cloud-job.ts';
import {DEFAULT_SUPABASE_CONFIG} from '../../../src/shared/supabase-project.ts';
import {processBackgroundIntelligence,type BackgroundCloud} from '../../../src/server/worker/intelligence.ts';
import {CloudActionGateway} from '../../../src/hosted/mcp/cloud-gateway.ts';
declare const EdgeRuntime:{waitUntil(task:Promise<unknown>):void};
/** Service credentials operate the private queue only. All health access uses owner JWTs. */
export async function cloudWorkerTick(base:string,service:string,fetcher:typeof fetch=fetch){
 const adminHeaders={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 const rpc=async(name:string,body:unknown)=>{const r=await fetcher(base+'/rest/v1/rpc/'+name,{method:'POST',headers:adminHeaders,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Protected worker queue unavailable.');return r.status===204?null:r.json();};
 const raw=await rpc('health_cloud_grant_claim',{});if(!raw)return {processed:false};
 const grant=cloudGrantSchema.parse(raw);let session=grant.session;
 const checkpoint=(extra:Record<string,unknown>)=>rpc('health_cloud_grant_checkpoint',{p_owner:grant.ownerId,p_run_id:grant.runId,p_lease:grant.leaseId,...extra});
 let stage:'auth_expired'|'budget_or_provider'='auth_expired';
 try{
  if(Date.parse(grant.expiresAt)<=Date.now())throw new Error('Expired cloud consent.');
  if(session.expiresAt<=Date.now()+60000){
   const r=await fetcher(base+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:DEFAULT_SUPABASE_CONFIG.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refreshToken}),signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw new Error('Cloud authentication expired.');const value=await r.json();
   if(value.user?.id!==grant.ownerId||typeof value.access_token!=='string'||typeof value.refresh_token!=='string'||!Number.isFinite(value.expires_in))throw new Error('Cloud authentication owner mismatch.');
   session={accessToken:value.access_token,refreshToken:value.refresh_token,expiresAt:Date.now()+Math.max(60,value.expires_in-60)*1000};
   if(!await checkpoint({p_session:session,p_finish:false}))throw new Error('Cloud grant was revoked.');
  }
  const cloud:BackgroundCloud={owner:grant.ownerId,session:{uid:grant.ownerId,email:'',...session,config:DEFAULT_SUPABASE_CONFIG},request:async(path,init={})=>{
   // A revoked lease blocks each next read/model/checkpoint even while a worker is running.
   if(!await checkpoint({p_finish:false}))throw new Error('Cloud permission expired or was revoked.');
   const r=await fetcher(base+'/'+path,{...init,headers:{apikey:DEFAULT_SUPABASE_CONFIG.publishableKey,Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json',...init.headers},signal:init.signal||AbortSignal.timeout(15000)});
   if(!r.ok)throw new Error('Owner-scoped cloud request failed.');const data=await r.json();
   if(path==='auth/v1/user'&&(data.id!==grant.ownerId||data.is_anonymous))throw new Error('Cloud owner authentication failed.');return data;
  }};
  await cloud.request('auth/v1/user');stage='budget_or_provider';
  const gateway=new CloudActionGateway(fetcher),progressed=await processBackgroundIntelligence(cloud,'cloud:'+grant.leaseId,{runId:grant.runId,prepareChanges:true,maxRounds:1,gateway});
  if(!progressed)await processCloudReminders(cloud,grant.runId);
  if(!progressed)await processCloudGoalMonitor(cloud,grant.runId,'cloud:'+grant.leaseId,gateway);
  await checkpoint({p_finish:true,p_error:'none'});return {processed:true};
 }catch{
  await checkpoint({p_finish:true,p_error:stage});return {processed:false,error:stage};
 }
}
export async function handler(request:Request){
 if(request.method!=='POST')return Response.json({error:'Method not allowed.'},{status:405});
 const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!base||!service)return Response.json({error:'Worker unavailable.'},{status:503});
 // Resolve the existing encrypted scheduler token in service memory; never duplicate it in config.
 const r=await fetch(base+'/rest/v1/rpc/health_cloud_scheduler_auth',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
 if(!r.ok)return Response.json({error:'Worker unavailable.'},{status:503});const secret=await r.json();
 const actual=request.headers.get('Authorization')||'',expected=typeof secret==='string'?'Bearer '+secret:'';
 if(!expected||actual.length!==expected.length||!Array.from(expected).reduce((ok,c,i)=>ok&(c.charCodeAt(0)===actual.charCodeAt(i)?1:0),1))return Response.json({error:'Unauthorized.'},{status:401});
 // One claimed job per invocation; persisted leases recover abandoned ticks.
 EdgeRuntime.waitUntil(cloudWorkerTick(base,service));return Response.json({accepted:true},{status:202});
}
Deno.serve(handler);
