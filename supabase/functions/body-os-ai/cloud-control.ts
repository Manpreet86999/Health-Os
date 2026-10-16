import {cloudRunControlSchema,cloudGrantStatusSchema} from '../../../src/shared/intelligence/cloud-job.ts';
import {runSchema} from '../../../src/shared/intelligence/run-contracts.ts';
/** Create a separate server-held Auth session; never copy the browser refresh token. */
export async function cloudRunControl(raw:unknown,user:{id:string;email?:string;email_confirmed_at?:string},base:string,headers:Record<string,string>){
 const {action,expectedOwnerId,...fields}=raw as Record<string,unknown>;
 if(expectedOwnerId&&expectedOwnerId!==user.id)throw new Error('Cloud run owner mismatch.');
 const input=cloudRunControlSchema.parse(fields);
 const rpc=async(name:string,body:unknown,h=headers)=>{const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:h,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Cloud continuation configuration is unavailable.');return r.status===204?null:r.json();};
 if(input.operation!=='enable'){
  // Revoke the protected grant first, then also stop connected-worker opt-in.
  const status=cloudGrantStatusSchema.parse(await rpc('health_cloud_grant_status',{p_run_id:input.runId,p_disable:input.operation==='disable'}));
  if(input.operation==='disable'){
   const query=new URLSearchParams({user_id:'eq.'+user.id,run_id:'eq.'+input.runId,select:'state',limit:'1'});
   const response=await fetch(base+'/rest/v1/health_agent_run?'+query,{headers,signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('Cloud grant revoked. Refresh the goal to verify connected-worker permission.');
   const row=(await response.json())[0];if(row){const run=runSchema.parse(row.state);if(run.ownerId!==user.id)throw new Error('Run owner mismatch.');await rpc('health_agent_run_save',{p_state:{...run,allowBackgroundReads:false,...(run.backgroundPolicy?{backgroundPolicy:{...run.backgroundPolicy,enabled:false}}:{}),version:run.version+1,updatedAt:new Date().toISOString()},p_expected_version:run.version});}
  }
  return status;
 }
 if(Deno.env.get('HEALTH_OS_CLOUD_DELEGATION_ENABLED')!=='true')throw new Error('Managed cloud continuation is not enabled on this deployment.');
 if(!user.email||!user.email_confirmed_at)throw new Error('A verified account is required for cloud continuation.');
 const query=new URLSearchParams({user_id:'eq.'+user.id,run_id:'eq.'+input.runId,select:'state',limit:'1'});
 const r=await fetch(base+'/rest/v1/health_agent_run?'+query,{headers,signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Cannot verify the owned goal.');
 const run=runSchema.parse((await r.json())[0]?.state);if(run.ownerId!==user.id||['completed','failed','cancelled'].includes(run.status))throw new Error('Select an unfinished owned goal.');
 const policy=input.backgroundPolicy||{enabled:true,allowReads:true,allowWrites:false,medicalConsent:false,permittedDomains:run.request.policy.domains.filter(d=>d!=='medical'),maxSpendUsd:1,maxToolsLimit:20,maxActionsLimit:5};
 if(!policy.enabled||!policy.allowReads)throw new Error('Explicit background read permission is required.');
 if(run.request.policy.domains.includes('medical')&&!policy.medicalConsent)throw new Error('This goal requires separate Medical background consent.');
 if(policy.permittedDomains&&run.request.policy.domains.some(d=>!policy.permittedDomains!.includes(d)))throw new Error('Select permission for every domain used by this goal.');
 if(input.monitoring?.enabled&&(input.monitoring.domains.some(d=>!policy.permittedDomains?.includes(d))||input.monitoring.domains.includes('medical')&&!policy.medicalConsent))throw new Error('Weekly review must remain inside the separately approved background domains.');
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!service)throw new Error('Protected cloud scheduling is unavailable.');
 const privileged={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 // generate_link creates a token but sends no email. Neither token nor link leaves Edge memory.
 const link=await fetch(base+'/auth/v1/admin/generate_link',{method:'POST',headers:privileged,body:JSON.stringify({type:'magiclink',email:user.email}),signal:AbortSignal.timeout(10000)});
 if(!link.ok)throw new Error('A separate cloud session could not be created.');const generated=await link.json();
 if(generated.id!==user.id||typeof generated.hashed_token!=='string')throw new Error('Cloud session owner could not be verified.');
 const verified=await fetch(base+'/auth/v1/verify',{method:'POST',headers:{apikey:headers.apikey,'Content-Type':'application/json'},body:JSON.stringify({type:'email',token_hash:generated.hashed_token}),signal:AbortSignal.timeout(10000)});
 if(!verified.ok)throw new Error('The separate cloud session could not be verified.');const session=await verified.json();
 if(session.user?.id!==user.id||typeof session.access_token!=='string'||typeof session.refresh_token!=='string'||!Number.isFinite(session.expires_in))throw new Error('Cloud session owner mismatch.');
 await rpc('health_cloud_grant_save',{p_owner:user.id,p_run_id:run.id,p_days:input.days,p_session:{accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:Date.now()+Math.max(60,session.expires_in-60)*1000}},privileged);
 const next={...run,version:run.version+1,allowBackgroundReads:true,backgroundPolicy:policy,...(input.monitoring?{monitoring:input.monitoring}:{}),...(run.status==='blocked'?{status:'replanning' as const}:{}),updatedAt:new Date().toISOString()};
 try{await rpc('health_agent_run_save',{p_state:next,p_expected_version:run.version});}catch(e){await rpc('health_cloud_grant_status',{p_run_id:run.id,p_disable:true});throw e;}
 return cloudGrantStatusSchema.parse(await rpc('health_cloud_grant_status',{p_run_id:run.id}));
}
