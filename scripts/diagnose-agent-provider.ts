import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';
import {readCloud} from '../src/shared/cloud.js';
let session=loadWorkerSession();if(Date.now()>=session.expiresAt){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const rows=await readCloud(session.config,session),prefs=rows.find(r=>r.entityType==='sharedPreferences'&&r.id==='shared-preferences')?.payload as any;
const key=prefs.openRouterApiKey||prefs.aiApiKey;
const catalog=await fetch('https://openrouter.ai/api/v1/models').then(r=>r.json());
const choices=catalog.data.filter((m:any)=>m.id.endsWith(':free')&&Number(m.pricing.prompt)===0&&Number(m.pricing.completion)===0&&m.supported_parameters?.includes('response_format')&&m.context_length>=32000).sort((a:any,b:any)=>a.context_length-b.context_length).slice(0,3);
for(const model of ['openrouter/free',...choices.map((m:any)=>m.id)]){const jsonMode=true;
const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,max_tokens:100,temperature:0,...(jsonMode?{response_format:{type:'json_object'}}:{}),messages:[{role:'user',content:'Reply only with JSON {"ready":true}.'}]}),signal:AbortSignal.timeout(45000)});
const result=await response.json();console.log(JSON.stringify({requested:model,jsonMode,status:response.status,model:result.model,error:result.error?.message?.slice(0,500),ready:response.ok}));}
