import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.ts';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.ts';
import {agentRequestSchema} from '../src/shared/intelligence/agent-contracts.ts';
import {PRIMARY_MODEL} from '../src/shared/intelligence/production-models.ts';
import {verifyGroundedResponse} from '../src/shared/intelligence/grounding.ts';
let session=loadWorkerSession();if(session.expiresAt<Date.now()){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const headers={apikey:session.config.publishableKey,Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json'};
const checks:any[]=[];let before:any,after:any;
async function ai(body:unknown){const r=await fetch(session.config.url+'/functions/v1/body-os-ai',{method:'POST',headers,body:JSON.stringify({...body as any,expectedOwnerId:session.uid}),signal:AbortSignal.timeout(125000)});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;}
const base={requestId:'qwen-smoke:'+crypto.randomUUID(),phase:'reason',question:'',power:'general',mode:'ask',policy:{mode:'domains',domains:['sleep'],recordIds:[],date:'2026-10-15',research:'off'},conversation:[],toolResults:[],memories:[],attachments:[]};
async function check(name:string,task:()=>Promise<unknown>){const start=Date.now();const evidence=await task();const row={name,passed:true,latencyMs:Date.now()-start,evidence};checks.push(row);console.log(JSON.stringify(row));}
const step=async(request:any)=>{const value=await ai({action:'/ai/agent-step',...agentRequestSchema.parse({...base,...request,requestId:'qwen-smoke:'+crypto.randomUUID()}),consent:true});assert.ok(value.usage?.length);assert.ok(value.usage.every((u:any)=>u.model===PRIMARY_MODEL));return value;};
try{
 before=await ai({action:'/ai/agent-usage'});assert.ok(before.monthlyLimitUsd-before.monthlyPaidUsd>=.10,'Less than conservative $0.10 smoke allowance remains');
 await check('sole active model is explicitly PROVISIONAL, not benchmark-qualified',async()=>{const v=await ai({action:'/ai/models'});assert.deepEqual(v.models.map((m:any)=>m.id),[PRIMARY_MODEL]);assert.equal(v.models[0].status,'PROVISIONAL');return v;});
 await check('provider reached and canonical grounded chat succeeds',async()=>{
  const toolResults=[{name:'sleep.get_trend',domains:['sleep'],sourceIds:['synthetic-qwen-sleep'],data:{records:[{id:'synthetic-qwen-sleep',date:'2026-10-14',hours:7.25}]}}];
  const value=await step({question:'Synthetic fixture only: report the recorded sleep duration on 2026-10-14 from the supplied evidence, with a canonical record claim. Do not read or change account data.',toolResults});
  assert.equal(value.result.toolCalls.length,0);assert.equal(value.result.proposedActions.length,0);assert.ok(value.result.claims?.some((c:any)=>c.fact?.value===7.25&&c.sourceIds.includes('synthetic-qwen-sleep')));
  assert.equal(verifyGroundedResponse(value.result.summary,value.result.claims,toolResults as any).accepted,true);return value;
 });
 await check('structured read-tool selection works without executing or writing records',async()=>{
  const value=await step({question:'Which saved care products exist? Select the appropriate read tool first. Do not write anything.',power:'care',policy:{...base.policy,domains:['care']}});
  assert.equal(value.result.responseType,'tools');assert.ok(value.result.toolCalls.some((t:any)=>t.name==='care.get_products'));assert.equal(value.result.proposedActions.length,0);return value;
 });
 await check('unavailable HRV stays unavailable and an unsupported numerical claim is rejected',async()=>{
  const value=await step({question:'Synthetic missing-data check: no HRV is present in this request. State whether my HRV is available; never estimate it.',policy:{...base.policy,mode:'none',domains:[]}});
  assert.equal(verifyGroundedResponse(value.result.summary,value.result.claims,[]).accepted,true);assert.equal(value.result.proposedActions.length,0);
  assert.equal(verifyGroundedResponse('Your HRV was 85 ms.',[],[]).accepted,false);return {response:value,deterministicUnsupportedNumberRejected:true};
 });
}catch(e){checks.push({name:'smoke failure',passed:false,error:(e as Error).message});console.error(JSON.stringify(checks.at(-1)));process.exitCode=1;}
finally{after=await ai({action:'/ai/agent-usage'}).catch(()=>undefined);await mkdir('output/qwen-production',{recursive:true});const report={asOf:new Date().toISOString(),healthWrites:0,benchmarkCalls:0,before,after,checks};await writeFile('output/qwen-production/smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify({checksPassed:checks.every(c=>c.passed),monthlyRemainingUsd:after?after.monthlyLimitUsd-after.monthlyPaidUsd:null,smokeCostUsd:after&&before?after.monthlyPaidUsd-before.monthlyPaidUsd:null}));}
