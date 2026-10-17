import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('scheduler isolates claimed jobs, rejects stale attempts and authenticates dispatch',async()=>{
 const globals=globalThis as any,originalDeno=globals.Deno,originalRuntime=globals.EdgeRuntime;
 let reads:string[]=[],processed=0,dispatches=0;
 const waits:Promise<unknown>[]=[];
 globals.Deno={serve:()=>{}};globals.EdgeRuntime={waitUntil:(promise:Promise<unknown>)=>waits.push(promise)};
 globals.__reportDispatchFixture={
  db:async(path:string)=>{reads.push(path);if(path==='rpc/body_os_dispatch_due_report_jobs'){dispatches++;return 4;}return path.includes('attempts=eq.2')?[{id:9,attempts:2}]:[];},
  process:async()=>{processed++;},
 };
 try{
  const bundled=await build({entryPoints:['supabase/functions/body-os-email-scheduler/index.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'dispatch-adapters',setup(builder){
   builder.onResolve({filter:/_shared\/(runtime|report-queue)\.ts$/},args=>({path:args.path,namespace:'adapters'}));
   builder.onLoad({filter:/.*/,namespace:'adapters'},args=>({contents:args.path.includes('report-queue')?'export const processReportJob=(...args)=>globalThis.__reportDispatchFixture.process(...args);':`export const db=(...args)=>globalThis.__reportDispatchFixture.db(...args);export const env=()=>'scheduler-secret';export const dependencies={log:()=>{}};export const queueDependencies={};export const runReportJob=async()=>({});export const failure=()=>Response.json({ok:false},{status:403});`,loader:'js'}));
  }}]});
  const {handler}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  const request=(body:unknown,secret='scheduler-secret')=>new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await handler(request({claimedJobId:9,attempt:2},'wrong'))).status,403);assert.equal(reads.length,0);
  assert.equal((await handler(request({claimedJobId:9,attempt:-1}))).status,403);assert.equal(reads.length,0);
  assert.equal((await (await handler(request({claimedJobId:9,attempt:1}))).json()).status,'stale');assert.equal(processed,0);
  assert.equal((await (await handler(request({claimedJobId:9,attempt:2}))).json()).status,'accepted');await Promise.all(waits);assert.equal(processed,1);
  const response=await handler(request({}));assert.equal((await response.json()).accepted,4);assert.equal(dispatches,1);
  assert.ok(reads.some(path=>path.includes('status=eq.processing&attempts=eq.2')));
 }finally{globals.Deno=originalDeno;globals.EdgeRuntime=originalRuntime;delete globals.__reportDispatchFixture;}
});
