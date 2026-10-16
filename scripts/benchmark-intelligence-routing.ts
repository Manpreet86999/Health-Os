import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';
import {readCloud} from '../src/shared/cloud.js';
import {AgentModelRouter} from '../src/integrations/ai/model-router.js';
import {routeSchema} from '../src/shared/intelligence/agent-contracts.js';
import {z} from 'zod';
import {semanticRoutingPrompt} from '../src/shared/intelligence/routing-prompt.js';
let session=loadWorkerSession();if(Date.now()>=session.expiresAt){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const rows=await readCloud(session.config,session),prefs=rows.find(r=>r.entityType==='sharedPreferences')?.payload as any||{},key=prefs.openRouterApiKey||(prefs.aiProvider!=='nvidia'?prefs.aiApiKey:undefined);assert.ok(key,'OpenRouter key is unavailable.');
const catalog=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
const fixtures=[
 {question:'I slept badly for four nights. Should today’s workout change?',required:['training','sleep','recovery']},
 {question:'Build a gentler morning and evening routine using my saved products.',required:['care']},
 {question:'Compare my hemoglobin across the two reviewed laboratory reports.',required:['medical']},
 {question:'How has my body weight changed over the last four weeks?',required:['body']},
 {question:'Plan dinner from my recipes and remaining protein target.',required:['nutrition']},
 {question:'Explain recovery principles without using saved records.',required:[]},
];
const results:any[]=[];await mkdir('output/intelligence-upgrade-live',{recursive:true});
for(const model of process.argv.length>2?process.argv.slice(2):['dots-studio/dots-3-note-preview:free','nvidia/nemotron-3-super-120b-a12b:free']){
 const info=catalog.data?.find((m:any)=>m.id===model);if(!info||Number(info.pricing?.prompt)!==0||Number(info.pricing?.completion)!==0){results.push({model,status:'INELIGIBLE',reason:'Not available as a verified zero-priced model'});continue;}
 const router=new AgentModelRouter({preferFree:true,allowPaid:false,dailyPaidLimitUsd:0,roles:{router:{provider:'openrouter',model,paid:false}}},{openrouter:key},{reserve:async(_id,maximum)=>{assert.equal(maximum,0);},settle:async(_id,usage)=>{assert.equal(usage.paid,false);}});
 const checks:any[]=[];
 for(const fixture of fixtures){const start=Date.now();try{const reply=await router.run(crypto.randomUUID(),'router',routeSchema,[{role:'system',content:semanticRoutingPrompt+' Schema: '+JSON.stringify(z.toJSONSchema(routeSchema))},{role:'user',content:JSON.stringify({question:fixture.question,power:'general',conversation:[]})}]);const actual=reply.result.domains;const passed=fixture.required.every(d=>actual.includes(d as any))&&(fixture.required.length!==0||actual.length===0);checks.push({question:fixture.question,status:passed?'PASS':'FAIL',route:reply.result,usage:reply.usage,durationMs:Date.now()-start});}catch(e){checks.push({question:fixture.question,status:'FAIL',error:(e as Error).message,durationMs:Date.now()-start});}console.log(JSON.stringify({model,...checks.at(-1)}));}
 results.push({model,status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',checks,qualificationScope:'Synthetic semantic routing only; no answer-quality, medical-safety or action-quality qualification.'});await writeFile('output/intelligence-upgrade-live/router-benchmark.json',JSON.stringify({version:'routing-1',asOf:new Date().toISOString(),healthRecordsShared:0,healthWrites:0,paidCalls:0,results},null,2));
}
if(!results.some(r=>r.status==='PASS'))process.exitCode=1;
