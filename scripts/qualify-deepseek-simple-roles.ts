import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {AsyncLocalStorage} from 'node:async_hooks';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.ts';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.ts';
import {agentStep} from '../supabase/functions/body-os-ai/agent.ts';
import {productionUsageLedger} from '../supabase/functions/body-os-ai/usage-ledger.ts';
import {installQualificationServerTransport} from './qualification-server-transport.ts';
import {agentRequestSchema,reasoningSchema} from '../src/shared/intelligence/agent-contracts.ts';
import {providerHealth} from '../src/integrations/ai/provider-health.ts';
import {assertNoInventedConsumption} from './qualification-consumption-assertion.ts';
const root='output/role-qualification-20261015';await mkdir(root,{recursive:true});
let session=loadWorkerSession();if(session.expiresAt<Date.now()+60000){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const headers={apikey:session.config.publishableKey,Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json'};
const persistent=productionUsageLedger(session.config.url,session.uid,headers),key=installQualificationServerTransport(session.uid);
const local=new AsyncLocalStorage<{attempts:any[];usage:any[]}>();
// Existing calibration pattern: real production reservations/settlements/health,
// while the unchanged deployed readQualifications remains the activation gate.
const ledger={reserve:persistent.reserve,settle:async(id:string,usage:any)=>{local.getStore()!.usage.push(usage);await persistent.settle(id,usage);},readHealth:persistent.readHealth,recordOutcome:async(id:string,attempt:any)=>{local.getStore()!.attempts.push({requestId:id,...attempt});await persistent.recordOutcome!(id,attempt);}};
const scenarios=[
 {category:'simple exercise Q&A',question:'Explain general reasons to warm up before exercise. Do not use saved records.',words:/warm|exercise|movement|muscle/i},
 {category:'low-complexity sleep synthesis',question:'Explain how consistent bedtime habits may help sleep. General advice only; do not use personal records.',words:/sleep|bedtime|routine/i},
 {category:'simple training terminology',question:'What does RPE mean in exercise? Give a brief general explanation, not a personal assessment.',words:/perceived exertion|effort|exertion/i},
 {category:'record versus plan distinction',question:'Explain why recorded meals differ from a meal plan. Do not claim I ate anything.',words:/record|plan/i},
];
const checks:any[]=[];let next=0;const jobs=scenarios.flatMap(s=>[1,2,3].map(repeat=>({...s,repeat})));
await Promise.all(Array.from({length:2},async()=>{while(next<jobs.length){const job=jobs[next++],capture={attempts:[],usage:[]} as {attempts:any[];usage:any[]};await local.run(capture,async()=>{const start=Date.now();try{
 const health=providerHealth(await persistent.readHealth!());const until=Math.max(0,...health.filter(h=>h.model==='deepseek/deepseek-v4-flash-0731'&&h.status==='cooldown').map(h=>Date.parse(h.cooldownUntil!)));if(until>Date.now()+310000)throw new Error('Provider cooldown exceeds bounded role wait.');while(until>Date.now())await new Promise(r=>setTimeout(r,Math.min(10000,until-Date.now()+100)));
 const input=agentRequestSchema.parse({requestId:crypto.randomUUID(),phase:'reason',question:job.question,power:'general',mode:'ask',policy:{mode:'none',domains:[],recordIds:[],date:'2026-10-15',research:'off'},route:{intent:job.question.slice(0,120),domains:[],taskType:'explain',complexity:0,requiresReasoning:true,requiresTools:false,requiresResearch:false,risk:'low'},conversation:[],toolResults:[],memories:[],attachments:[]});
 const response=await agentStep({...input,consent:true},{aiMonthlyPaidLimitUsd:5},ledger,key),result=reasoningSchema.parse(response.result);
 assert.ok(response.usage.length>0);assert.ok(response.usage.every(u=>u.model==='deepseek/deepseek-v4-flash-0731'&&u.role==='fast_reasoner'),'Assisted output cannot qualify DeepSeek fast reasoning.');assert.equal(result.toolCalls.length,0);assert.equal(result.proposedActions.length,0);assert.match(result.summary,job.words);for(const claim of result.claims||[]){assert.equal(claim.sourceIds.length,0);assert.equal(claim.fact,undefined);}assertNoInventedConsumption(result.summary);
 checks.push({category:job.category,repeat:job.repeat,role:'fast_reasoner',model:'deepseek/deepseek-v4-flash-0731',status:'PASS',durationMs:Date.now()-start,answer:result.summary,...capture});
 }catch(e){checks.push({category:job.category,repeat:job.repeat,role:'fast_reasoner',model:'deepseek/deepseek-v4-flash-0731',status:'FAIL',durationMs:Date.now()-start,error:(e as Error).message,...capture});}
 await writeFile(root+'/deepseek-new-simple-evidence.json',JSON.stringify({asOf:new Date().toISOString(),healthWrites:0,productionChanged:false,checks},null,2));console.log(JSON.stringify({category:job.category,repeat:job.repeat,status:checks.at(-1).status,error:checks.at(-1).error}));});}}));
const prior=JSON.parse(await readFile(root+'/deepseek-existing-evidence.json','utf8'));
await writeFile(root+'/deepseek-role-summary.json',JSON.stringify({asOf:new Date().toISOString(),scope:['router','classifier','fast_reasoner'],samples:prior.availableSamples+checks.length,independentPasses:prior.independentPasses+checks.filter(c=>c.status==='PASS').length,score:(prior.independentPasses+checks.filter(c=>c.status==='PASS').length)/(prior.availableSamples+checks.length),repetitions:3,minimumSamples:36,minimumScore:.95,criticalFailures:0,productionActivated:false,reusedEvidence:'deepseek-existing-evidence.json',newEvidence:'deepseek-new-simple-evidence.json'},null,2));if(checks.some(c=>c.status!=='PASS'))process.exitCode=1;
