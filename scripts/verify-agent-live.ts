import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';
import {readCloud} from '../src/shared/cloud.js';
import {snapshotFromRecords} from '../src/shared/record-snapshot.js';
import {emptySkinState} from '../src/shared/skin.js';
import {bioSchema} from '../src/shared/biology.js';
import {AgentReadTools} from '../src/shared/intelligence/agent-tools.js';
import {runReasoningAgent} from '../src/integrations/orchestration/reasoning-agent.js';
import {agentRequestSchema,type AgentRequest,type AgentModelResponse,type ContextPolicy} from '../src/shared/intelligence/agent-contracts.js';
import {ContextPolicyEngine} from '../src/shared/intelligence/context-policy.js';

const report:{check:string;status:string;details?:unknown}[]=[];
await mkdir('output/agentic-validation',{recursive:true});
const persist=()=>writeFile('output/agentic-validation/live-provider.json',JSON.stringify({checkedAt:new Date().toISOString(),tests:report,healthWrites:0},null,2));
let session=loadWorkerSession();assert.equal(session.config.url,'https://lphlihwyrcqgmdiwlvuq.supabase.co');
if(Date.now()>=session.expiresAt){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const headers={apikey:session.config.publishableKey,Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'};
const rows=await readCloud(session.config,session);
const preferences=rows.find(r=>r.entityType==='sharedPreferences'&&r.id==='shared-preferences')?.payload as any||{};
const configuredRoles=typeof preferences.aiAgentRoles==='string'?JSON.parse(preferences.aiAgentRoles):preferences.aiAgentRoles||{};
assert.equal(preferences.aiAllowPaid===true,false,'Controlled live checks require paid escalation to be off.');
assert.equal(Object.values(configuredRoles).some((r:any)=>r.paid),false,'Paid role found; refuse controlled free-provider tests.');
const db=snapshotFromRecords(rows),date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const response=await fetch(`${session.config.url}/rest/v1/health_os_biological_records?user_id=eq.${session.uid}&select=payload&limit=500`,{headers});
assert.ok(response.ok);const records=(await response.json()).flatMap((r:any)=>{const parsed=bioSchema.safeParse(r.payload);return parsed.success?[parsed.data]:[];});
const dataset={db,skin:db.skin||emptySkinState(),records,userId:session.uid};
async function call(request:AgentRequest):Promise<AgentModelResponse>{
 const bounded=ContextPolicyEngine.external(request);assert.ok(JSON.stringify(bounded).length<180000);
 const response=await fetch(`${session.config.url}/functions/v1/body-os-ai`,{method:'POST',headers,body:JSON.stringify({action:'/ai/agent-step',...bounded,expectedOwnerId:session.uid,consent:true}),signal:AbortSignal.timeout(170000)});
 const body=await response.json();if(!response.ok)throw new Error('Live AI endpoint failed ('+response.status+'): '+String(body.error).slice(0,600));
 assert.ok(body.usage.length>0);assert.ok(body.usage.every((u:any)=>u.paid===false),'A paid model was used during a free-provider check.');return body;
}
const request=(question:string,power:AgentRequest['power'],policy:ContextPolicy)=>agentRequestSchema.parse({requestId:crypto.randomUUID(),phase:'route',question,power,mode:'plan',policy,conversation:[],toolResults:[],memories:[],attachments:[]});
async function check(name:string,fn:()=>Promise<unknown>){try{const details=await fn();report.push({check:name,status:'PASS',details});console.log('PASS '+name);}catch(e){report.push({check:name,status:'FAIL',details:(e as Error).message.slice(0,600)});console.log('FAIL '+name+': '+(e as Error).message.slice(0,200));}await persist();}
await check('Real semantic General routing',async()=>{const r=await call(request('I feel more tired and weaker in the gym this week.','general',{mode:'none',domains:[],recordIds:[],date,research:'off'}));const route=r.result as any;assert.ok(route.domains.includes('training'));assert.ok(route.domains.includes('sleep')||route.domains.includes('recovery'));return {domains:route.domains,models:r.usage.map(u=>({provider:u.provider,model:u.model,tokens:u.tokens,paid:u.paid}))};});
const run=async(r:AgentRequest)=>{const tools=new AgentReadTools(dataset,r.policy);let saved:any,trace:any;const reply=await runReasoningAgent(r,tools,call,{load:async()=>saved,save:async value=>{saved=value;}},value=>{trace=value;});return {reply,tools,trace};};
await check('Care real model selects saved products and reevaluates tools',async()=>{const r=await run(request('Build an AM and PM skincare routine using my current products. Identify unknown ingredients, possible conflicts and irritation risk. Prepare a saveable proposal if safe.','care',{mode:'auto',domains:['care'],recordIds:[],date,research:'off'}));for(const name of ['care.get_products','care.get_existing_routine','care.get_recent_observations','care.get_user_concerns'])assert.ok(r.tools.results.some(t=>t.name===name),'Missing model-selected '+name);assert.ok(r.reply.answer.trim());return {savedProductCount:r.tools.data.skin.products.length,toolNames:r.tools.results.map(t=>t.name),proposalAvailable:!!r.reply.proposal,modelCalls:r.trace.usage.length,models:[...new Set(r.trace.usage.map((u:any)=>u.model))],scope:'Care only',note:!r.tools.data.skin.products.length?'The signed-in worker account has no saved products; product-filled live acceptance is not established.':undefined};});
await check('Training real multi-domain tool selection',async()=>{const r=await run(request('My legs are sore, I slept badly, and today is leg day. What should I do?','general',{mode:'auto',domains:['training','sleep','recovery','nutrition'],recordIds:[],date,research:'off'}));for(const name of ['training.get_today','sleep.get_latest','recovery.get_current'])assert.ok(r.tools.results.some(t=>t.name===name),'Missing model-selected '+name);assert.ok(r.reply.answer.trim());return {toolNames:r.tools.results.map(t=>t.name),modelCalls:r.trace.usage.length,domains:r.trace.domains,proposalAvailable:!!r.reply.proposal};});
await check('Context=None real reasoning with no account evidence',async()=>{const r=await run({...request('Explain general recovery principles without using my records.','general',{mode:'none',domains:[],recordIds:[],date,research:'off'}),mode:'ask'});assert.equal(r.tools.results.length,0);assert.equal(r.tools.data.records.length,0);return {modelCalls:r.trace.usage.length,personalToolCalls:0};});
await check('Real contextual follow-up removes the serum from a prior proposed routine',async()=>{const r=request('Remove the serum from that proposal.','care',{mode:'none',domains:[],recordIds:[],date,research:'off'});r.conversation=[{role:'user',content:'Propose a generic routine: cleanser, serum, moisturizer.',domains:[],sourceIds:[],personal:false},{role:'assistant',content:'Generic proposed PM routine: cleanser, serum, moisturizer. Nothing has been saved.',domains:[],sourceIds:[],personal:false}];r.phase='reason';const result=await call(r),step=result.result as any;assert.ok(/cleanser|moistur/i.test(step.summary));assert.ok(/remov|without|omit|exclud/i.test(step.summary));return {understandsPreviousProposal:true,paid:false};});
await persist();if(report.some(r=>r.status==='FAIL'))process.exitCode=1;
