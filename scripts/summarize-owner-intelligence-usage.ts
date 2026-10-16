import {readOwnerUsagePages} from '../src/shared/owner-usage-pages.js';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';

// Read only owner usage fields. No provider preferences or credentials are fetched.
let session=loadWorkerSession();
if(session.expiresAt<Date.now()+60000){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}).slice(0,7);
const rows=await readOwnerUsagePages(async offset=>{
 const query=new URLSearchParams({user_id:'eq.'+session.uid,usage_day:'gte.'+month+'-01',select:'charged_usd,reserved_usd,metadata->>model,metadata->>role',order:'created_at.asc,request_id.asc',limit:'1000',offset:String(offset)});
 const response=await fetch(session.config.url+'/rest/v1/health_ai_usage?'+query,{headers:{apikey:session.config.publishableKey,Authorization:'Bearer '+session.accessToken},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Owner usage summary unavailable ('+response.status+').');return response.json();
});
const charged=rows.reduce((n,r)=>n+Number(r.charged_usd||0),0),reserved=rows.filter(r=>r.charged_usd===null).reduce((n,r)=>n+Number(r.reserved_usd||0),0);
const byModel:Record<string,{attempts:number;chargedUsd:number;unsettledReservedUsd:number}>={};
for(const row of rows){const model=typeof row.model==='string'?row.model:'unattributed';byModel[model]??={attempts:0,chargedUsd:0,unsettledReservedUsd:0};byModel[model].attempts++;byModel[model].chargedUsd+=Number(row.charged_usd||0);if(row.charged_usd===null)byModel[model].unsettledReservedUsd+=Number(row.reserved_usd||0);}
console.log(JSON.stringify({month,timeZone:'Asia/Kolkata',ownerScoped:true,chargedUsd:charged,unsettledReservedUsd:reserved,conservativeCommittedUsd:charged+reserved,benchmarkCapUsd:5,byModel,note:'This includes earlier acceptance tests and existing account usage; unsettled reservations are conservatively counted. It is not a prediction of normal monthly use.'},null,2));
