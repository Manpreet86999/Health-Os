import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';
import {readCloud} from '../src/shared/cloud.js';
import {agentRequestSchema,type AgentModelResponse} from '../src/shared/intelligence/agent-contracts.js';
import {AgentReadTools} from '../src/shared/intelligence/agent-tools.js';
import {runReasoningAgent} from '../src/integrations/orchestration/reasoning-agent.js';
import {emptySkinState} from '../src/shared/skin.js';
import {defaultProfile} from '../src/shared/defaults.js';
import {disposeTelemetry} from '../src/integrations/telemetry/instrumentation.js';
const output='output/intelligence-upgrade-live';await mkdir(output,{recursive:true});
let session=loadWorkerSession();if(Date.now()>=session.expiresAt){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const rows=await readCloud(session.config,session),prefs=rows.find(r=>r.entityType==='sharedPreferences')?.payload as any||{};
assert.notEqual(prefs.aiAllowPaid,true,'Live acceptance refuses paid-enabled configuration.');
const roles=typeof prefs.aiAgentRoles==='string'?JSON.parse(prefs.aiAgentRoles):prefs.aiAgentRoles||{};
assert.equal(Object.values(roles).some((r:any)=>r.paid),false,'Live acceptance refuses paid roles.');
const headers={apikey:session.config.publishableKey,Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json'};
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
const checks:any[]=[];
let lastSyntheticResponse:unknown;
async function call(request:any):Promise<AgentModelResponse>{const response=await fetch(session.config.url+'/functions/v1/body-os-ai',{method:'POST',headers,body:JSON.stringify({action:'/ai/agent-step',...request,expectedOwnerId:session.uid,consent:true}),signal:AbortSignal.timeout(90000)});const result=await response.json();lastSyntheticResponse=result;if(!response.ok)throw new Error(`Provider endpoint HTTP ${response.status}: ${String(result.error).slice(0,300)}`);assert.ok(result.usage.every((u:any)=>!u.paid));return result;}
async function check(name:string,fn:()=>Promise<any>){const start=Date.now();lastSyntheticResponse=undefined;try{const evidence=await fn();checks.push({name,status:'PASS',durationMs:Date.now()-start,evidence});}catch(e){checks.push({name,status:'FAIL',durationMs:Date.now()-start,error:(e as Error).message,lastSyntheticResponse});}console.log(JSON.stringify(checks.at(-1)));await writeFile(output+'/acceptance.json',JSON.stringify({date,healthWrites:0,paidCalls:0,usesSyntheticHealthFixtures:true,checks},null,2));}
const request=(question:string,domains:any,mode='ask')=>agentRequestSchema.parse({requestId:crypto.randomUUID(),phase:'route',question,power:'general',mode,policy:{mode:domains.length?'auto':'none',domains,recordIds:[],date,research:'off'},conversation:[],toolResults:[],memories:[],attachments:[]});
await check('real semantic routing for sleep and training',async()=>{const r=await call(request('I slept badly for four nights. Should today’s workout change?',['training','sleep','recovery']));assert.ok((r.result as any).domains.includes('sleep'));assert.ok((r.result as any).domains.includes('training'));return {route:r.result,models:r.usage.map(u=>u.model)};});
await check('real missing HRV answer cannot emit invented measurement',async()=>{
 const data:any={userId:session.uid,records:[],skin:emptySkinState(),db:{profile:defaultProfile(),meta:{},weeks:[],sessions:[],readiness:[],measurements:[],healthReadings:[],notes:[],targets:[],habits:[],habitLogs:[],goalCheckIns:[],painLogs:[],cardio:[],weeklyReviews:[],programs:[],scheduledWorkouts:[],librarySplits:[],exercises:[]}};
 const r=request('What was my HRV yesterday?',['medical']);const tools=new AgentReadTools(data,r.policy);let saved:any,trace:any;const reply=await runReasoningAgent(r,tools,call,{load:async()=>saved,save:async v=>{saved=structuredClone(v);}},t=>{trace=t;});assert.ok(/unavailable|missing|not (?:have|available|recorded)|no (?:HRV|reading|data)|haven.t/i.test(reply.answer));assert.equal(/\b\d+(?:\.\d+)?\s*ms\b/.test(reply.answer),false);return {answer:reply.answer,tools:trace?.tools,models:trace?.usage.map((u:any)=>u.model)};
});
await check('real no-personal-context synthesis',async()=>{const r=request('Explain general recovery principles without using any saved records.',[]);r.phase='reason';const result=await call(r);assert.ok((result.result as any).summary.trim());assert.equal((result.result as any).toolCalls.length,0);return {answer:(result.result as any).summary,models:result.usage.map(u=>u.model)};});
await disposeTelemetry();if(checks.some(c=>c.status==='FAIL'))process.exitCode=1;
