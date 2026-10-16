import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';
let session=loadWorkerSession();if(Date.now()>=session.expiresAt){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const response=await fetch(`${session.config.url}/rest/v1/rpc/health_ai_reserve`,{method:'POST',headers:{apikey:session.config.publishableKey,Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({p_request_id:'zero-cost-diagnostic-'+crypto.randomUUID(),p_maximum_usd:0,p_limit_usd:0,p_metadata:{model:'openrouter/free',provider:'openrouter',paid:false}})});
const result=await response.json().catch(()=>null);console.log(JSON.stringify({status:response.status,result}));
