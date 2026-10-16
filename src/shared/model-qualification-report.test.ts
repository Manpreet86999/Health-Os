import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('qualification never credits corrected or unrecorded primary routes as independent successes',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'health-os-qualification-fixture-'));
 const primary='deepseek/deepseek-v4-flash-0731',secondary='z-ai/glm-5.3-flash';
 const attempt=(id:string)=>({requestId:id,model:secondary,role:'verifier',outcome:'valid',latencyMs:1});
 const checks=[
  {model:primary,repeat:1,category:'Recovery inclusion in training decisions',status:'PASS',durationMs:1,attempts:[attempt('corrected')],evidence:{primaryRoute:{domains:['training']},verifierCorrectedPrimary:true}},
  {model:primary,repeat:2,category:'semantic routing',status:'PASS',durationMs:1,attempts:[attempt('unrecorded')],evidence:{route:{domains:['nutrition']}}},
  {model:primary,repeat:3,category:'Recovery inclusion in training decisions',status:'PASS',durationMs:1,attempts:[attempt('confirmed')],evidence:{primaryRoute:{domains:['training','sleep','recovery']},verifierCorrectedPrimary:false}},
 ];
 const input=path.join(folder,'live-results.json');await writeFile(input,JSON.stringify({sourceHash:'synthetic-report-regression-fixture',transport:'Synthetic test fixture; no live qualification',checks,monthlyCapUsd:5,healthWrites:0}));
 const result=spawnSync(process.execPath,[path.resolve('scripts/summarize-model-qualification.mjs'),input],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
 const report=JSON.parse(await readFile(path.join(folder,'qualification-summary.json'),'utf8'));
 assert.equal(report.primary.taskPasses,3);assert.equal(report.primary.independentPasses,1);assert.equal(report.primary.qualified,false);assert.equal(report.primary.failures.length,2);assert.match(report.primary.failures[0].reason,/routing correction/);assert.match(report.primary.failures[1].reason,/not retained/);assert.deepEqual(report.fallbackRescues,[]);
});
