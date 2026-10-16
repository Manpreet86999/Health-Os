import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {CloudActionGateway} from '../src/hosted/mcp/cloud-gateway.js';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';
import {disposeTelemetry} from '../src/integrations/telemetry/instrumentation.js';
let session=loadWorkerSession();if(Date.now()>=session.expiresAt){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const gateway=new CloudActionGateway(),context={userId:session.uid,clientId:'upgrade-read-acceptance',scopes:['intelligence.read','care.read','medical.read'],timeZone:'Asia/Kolkata',authorize:()=>{assert.ok(Date.now()<session.expiresAt);}},checks:any[]=[];
for(const days of [7,28,90]){const start=Date.now();try{const response=await gateway.execute({id:crypto.randomUUID(),action:'intelligence.analyze_period',input:{days},receiptId:crypto.randomUUID()},session,context);assert.equal(response.success,true);const data=response.data as any;assert.equal(data.days,days);assert.equal(data.series.length,days);checks.push({days,status:'PASS',durationMs:Date.now()-start,seriesRows:data.series.length,coverage:data.coverage,warnings:response.warnings});}catch(e){checks.push({days,status:'FAIL',durationMs:Date.now()-start,error:(e as Error).message});}console.log(JSON.stringify(checks.at(-1)));}
await mkdir('output/intelligence-upgrade-live',{recursive:true});await writeFile('output/intelligence-upgrade-live/cloud-periods.json',JSON.stringify({asOf:new Date().toISOString(),transport:'Current canonical cloud gateway over production Supabase, authenticated existing account',healthWrites:0,checks},null,2));await disposeTelemetry();if(checks.some(c=>c.status==='FAIL'))process.exitCode=1;
