import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Read only sanitized acceptance artifacts, never provider configuration or credentials.
const input=path.resolve(process.argv[2]||'output/two-model-qualification/live-results.json');
const data=JSON.parse(await readFile(input,'utf8'));
const primary='deepseek/deepseek-v4-flash-0731',secondary='z-ai/glm-5.3-flash';
const required=['semantic routing','Recovery inclusion in training decisions','missing-data honesty and grounding','canonical tool selection','longitudinal sleep evidence','recorded fact provenance','medical boundaries','structured no-context synthesis','multi-tool dependency','cross-domain grounded reasoning','durable multi-action execution','tool failure recovery'];
assert.ok(Array.isArray(data.checks)&&typeof data.sourceHash==='string','Use an acceptance artifact with a frozen source hash.');
const statistics=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:sorted.length,averageMs:sorted.length?Math.round(sorted.reduce((a,b)=>a+b,0)/sorted.length):null,medianMs:sorted.length?Math.round((sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2):null};};
function usageOf(check){
 const rows=new Map();
 const visit=value=>{if(!value||typeof value!=='object')return;if(typeof value.requestId==='string'&&typeof value.model==='string'&&typeof value.role==='string'&&'estimatedCostUsd' in value)rows.set(value.requestId,value);for(const child of Object.values(value))if(child&&typeof child==='object')visit(child);};
 visit(check.evidence);visit(check.recentSteps);visit(check.usage);return [...rows.values()];
}
const fallbackRescue=check=>check.model===primary&&(check.attempts||[]).some(a=>a.model===secondary&&a.role==='fallback');
const routeReviewUnproven=check=>check.model===primary&&['semantic routing','Recovery inclusion in training decisions'].includes(check.category)&&(check.attempts||[]).some(a=>a.role==='verifier')&&!check.evidence?.primaryRoute;
const isRescued=check=>fallbackRescue(check)||check.model===primary&&check.evidence?.verifierCorrectedPrimary===true||routeReviewUnproven(check);
function roleGate(model,categories){
 const checks=data.checks.filter(c=>c.model===model&&categories.includes(c.category));
 const missing=categories.filter(category=>new Set(checks.filter(c=>c.category===category).map(c=>c.repeat)).size<3);
 const taskPasses=checks.filter(c=>c.status==='PASS').length;
 const independentPasses=checks.filter(c=>c.status==='PASS'&&!isRescued(c)).length;
 // A fallback rescue is a system success, not independent primary qualification.
 const failures=checks.filter(c=>c.status!=='PASS'||isRescued(c)).map(c=>({repeat:c.repeat,category:c.category,reason:fallbackRescue(c)?'Required GLM fallback':c.evidence?.verifierCorrectedPrimary?'Required GLM routing correction':routeReviewUnproven(c)?'Initial DeepSeek route was not retained before GLM verification':c.error||'Acceptance failed'}));
 return {qualified:missing.length===0&&failures.length===0,samples:checks.length,taskPasses,independentPasses,score:checks.length?Number((independentPasses/checks.length*10).toFixed(3)):null,missingRepeatedCategories:missing,failures,latency:statistics(checks.map(c=>c.durationMs))};
}
const events=data.checks.flatMap(c=>c.attempts||[]),attempts=[...new Map(events.map(a=>[a.requestId,a])).values()],usage=[...new Map(data.checks.flatMap(usageOf).map(u=>[u.requestId,u])).values()];
const outcomes={};for(const a of attempts){const id=[a.model,a.role,a.providerRoute||'unknown'].join(' / ');outcomes[id]??={samples:0,outcomes:{},latencies:[]};outcomes[id].samples++;outcomes[id].outcomes[a.outcome]=(outcomes[id].outcomes[a.outcome]||0)+1;outcomes[id].latencies.push(a.latencyMs);}
for(const entry of Object.values(outcomes)){entry.latency=statistics(entry.latencies);delete entry.latencies;}
const verifier=data.checks.filter(c=>c.category==='independent verifier calibration'),vision=data.checks.filter(c=>c.category==='vision consent and injection boundary'),fallback=data.checks.filter(c=>c.category==='provider fallback');
const dedicated=checks=>({qualified:new Set(checks.map(c=>c.repeat)).size>=3&&checks.length>=3&&checks.every(c=>c.status==='PASS'),samples:checks.length,passed:checks.filter(c=>c.status==='PASS').length,latency:statistics(checks.map(c=>c.durationMs)),failures:checks.filter(c=>c.status!=='PASS').map(c=>({repeat:c.repeat,error:c.error}))});
const report={asOf:data.asOf,sourceHash:data.sourceHash,transport:data.transport,productionDeployed:false,healthWrites:data.healthWrites,primaryModel:primary,fallbackVerifierModel:secondary,freeModelsEligible:false,primary:roleGate(primary,required),fallback:roleGate(secondary,required),verifier:dedicated(verifier),vision:dedicated(vision),injectedQuotaFallback:dedicated(fallback),fallbackRescues:data.checks.filter(fallbackRescue).map(c=>({repeat:c.repeat,category:c.category,status:c.status})),attempts:attempts.length,healthEvents:events.length,providerOutcomes:outcomes,cost:{knownRecordedUsd:Number(usage.reduce((n,u)=>n+Number(u.estimatedCostUsd||0),0).toFixed(6)),usageSamples:usage.length,complete:attempts.every(a=>usage.some(u=>u.requestId===a.requestId)),monthlyCapUsd:data.monthlyCapUsd,note:'If complete is false, this is a lower bound: failed runs may omit earlier usage from their bounded diagnostic trace. The owner usage ledger remains authoritative.'},remainingCategories:data.requiredCategoriesNotYetCovered};
const destination=path.join(path.dirname(input),'qualification-summary.json');await writeFile(destination,JSON.stringify(report,null,2));
console.log(JSON.stringify({report:destination,primary:report.primary,fallback:report.fallback,verifier:report.verifier,vision:report.vision,cost:report.cost},null,2));
