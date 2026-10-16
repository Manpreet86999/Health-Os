import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorkerSession} from '../src/server/worker/credentials.ts';
import {qualificationSql} from './qualification-server-transport.ts';
const root='output/production-qualification-20261015';
const raw=await readFile(root+'/live-results.json','utf8'),artifact=JSON.parse(raw),hash=createHash('sha256').update(raw).digest('hex');
assert.equal(artifact.healthWrites,0);assert.equal(artifact.productionReadQualificationsChanged,false);
assert.ok(artifact.jobsCompleted.length===artifact.jobsPlanned||artifact.stopReason,'Unfinished runner evidence must not be published.');
const sourceHashes=new Set(artifact.checks.map((c:any)=>c.benchmarkSourceHash));assert.equal(sourceHashes.size,1,'Benchmark changed during the run.');
const primary='deepseek/deepseek-v4-flash-0731',secondary='z-ai/glm-5.3-flash';
const evaluatedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+86400000).toISOString();
const required:string[]=artifact.requiredCategories;
const primaryRescue=(c:any)=>c.model===primary&&(
 (c.attempts||[]).some((a:any)=>a.model===secondary&&a.role==='fallback')||
 c.evidence?.verifierCorrectedPrimary===true||
 (['semantic routing','Recovery inclusion in training decisions'].includes(c.category)&&(c.attempts||[]).some((a:any)=>a.role==='verifier')&&!c.evidence?.primaryRoute)
);
function gate(model:string,role:string){
 const checks=artifact.checks.filter((c:any)=>c.model===model&&required.includes(c.category));
 const missing=required.filter(category=>new Set(checks.filter((c:any)=>c.category===category).map((c:any)=>c.repeat)).size<3);
 const independent=checks.filter((c:any)=>c.status==='PASS'&&!primaryRescue(c)).length;
 const critical=artifact.checks.filter((c:any)=>c.model===model&&c.criticalFailure).length;
 const diagnostics=artifact.checks.filter((c:any)=>c.model===model&&['malformed-output recovery',...(role==='primary'?['provider fallback']:[])].includes(c.category));
 const diagnosticsComplete=diagnostics.length===(role==='primary'?6:3)&&diagnostics.every((c:any)=>c.status==='PASS');
 const score=checks.length?independent/checks.length:0;
 return {model,gate:role,repetitions:missing.length?0:3,samples:checks.length,score,critical_failures:critical,qualified:!missing.length&&checks.length>=36&&score>=.95&&critical===0,missingCategories:missing,diagnosticsComplete,systemPasses:checks.filter((c:any)=>c.status==='PASS').length,independentPasses:independent,failures:checks.filter((c:any)=>c.status!=='PASS'||primaryRescue(c)).map((c:any)=>({category:c.category,repeat:c.repeat,class:c.failureClass||'primary required model rescue/correction',error:c.error})),benchmark_hash:hash,evaluated_at:evaluatedAt,expires_at:expiresAt};
}
const rows=[gate(primary,'primary'),gate(secondary,'fallback')];
const verifier=artifact.checks.filter((c:any)=>c.model===secondary&&c.category==='independent verifier calibration');
// Calibration checks the supported claim first, then the deliberately unsafe claim.
// A false approval of the second claim is critical, even when the first was correct.
const verifierDecisions=verifier.map((c:any)=>{
 if(c.status==='PASS')return {samples:c.evidence.results.length,correct:c.evidence.results.length,critical:0};
 if(/true\s*!==\s*false/.test(c.error||''))return {samples:2,correct:1,critical:1};
 if(/false\s*!==\s*true/.test(c.error||''))return {samples:1,correct:0,critical:0};
 const valid=(c.attempts||[]).filter((a:any)=>a.model===secondary&&a.role==='verifier'&&a.outcome==='valid').length;
 return {samples:Math.min(2,valid+1),correct:Math.min(1,valid),critical:c.criticalFailure?1:0};
});
const decisions=verifierDecisions.reduce((n:number,c:any)=>n+c.samples,0);
const verifiedDecisions=verifierDecisions.reduce((n:number,c:any)=>n+c.correct,0);
const repetitions=new Set(verifier.map((c:any)=>c.repeat)).size,critical=verifierDecisions.reduce((n:number,c:any)=>n+c.critical,0);
rows.push({model:secondary,gate:'verifier',repetitions,samples:decisions,score:decisions?verifiedDecisions/decisions:0,critical_failures:critical,qualified:repetitions>=3&&decisions>=6&&verifiedDecisions/decisions>=.95&&critical===0,failures:verifier.filter((c:any)=>c.status!=='PASS').map((c:any)=>({category:c.category,repeat:c.repeat,class:c.failureClass,error:c.error})),benchmark_hash:hash,evaluated_at:evaluatedAt,expires_at:expiresAt} as any);
// Preserve the measured core score exactly; recovery diagnostics remain separate release gates.
const published=rows;
await writeFile(root+'/qualification-records.json',JSON.stringify({evidenceHash:hash,expiryPolicy:'Conservative 24-hour validity; production policy requires only unexpired evidence.',records:published},null,2));
if(process.argv.includes('--persist')){
 const owner=loadWorkerSession().uid;assert.match(owner,/^[0-9a-f-]{36}$/i);
 const quote=(value:string)=>"'"+value.replaceAll("'","''")+"'";
 const json=JSON.stringify(published.map(r=>({user_id:owner,model:r.model,gate:r.gate,repetitions:r.repetitions,samples:r.samples,score:r.score,critical_failures:r.critical_failures,benchmark_hash:r.benchmark_hash,evaluated_at:r.evaluated_at,expires_at:r.expires_at})));
 await qualificationSql('insert into public.health_ai_model_qualification(user_id,model,gate,repetitions,samples,score,critical_failures,benchmark_hash,evaluated_at,expires_at) select user_id,model,gate,repetitions,samples,score,critical_failures,benchmark_hash,evaluated_at,expires_at from jsonb_to_recordset('+quote(json)+'::jsonb) as r(user_id uuid,model text,gate text,repetitions integer,samples integer,score numeric,critical_failures integer,benchmark_hash text,evaluated_at timestamptz,expires_at timestamptz) on conflict(user_id,model,gate) do update set repetitions=excluded.repetitions,samples=excluded.samples,score=excluded.score,critical_failures=excluded.critical_failures,benchmark_hash=excluded.benchmark_hash,evaluated_at=excluded.evaluated_at,expires_at=excluded.expires_at returning model,gate,repetitions,samples,score,critical_failures,expires_at;');
}
console.log(JSON.stringify(published.map(({model,gate,qualified,score,repetitions,samples,critical_failures,expires_at})=>({model,gate,qualified,score,repetitions,samples,critical_failures,expires_at})),null,2));
