import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.ts';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.ts';
let session=loadWorkerSession();if(session.expiresAt<Date.now()){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const headers={apikey:session.config.publishableKey,Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json'};
const modelsResponse=await fetch(session.config.url+'/functions/v1/body-os-ai',{method:'POST',headers,body:JSON.stringify({action:'/ai/models',expectedOwnerId:session.uid})});assert.equal(modelsResponse.status,200);const models=await modelsResponse.json();assert.deepEqual(models.models.map((m:any)=>m.id),['qwen/qwen3-235b-a22b-2507']);
const browser=await chromium.launch({channel:'msedge',headless:true});const checks:any[]=[],errors:string[]=[],blockedWrites:string[]=[];const usage:any[]=[];
try{
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();const runs=new Map<string,any>();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>{localStorage.setItem('body-os-supabase-session-v1',JSON.stringify(s));localStorage.setItem('health-os-welcome-version','0.1.4');},session);
 // Release smoke must never commit health data. Preserve the real read/auth path.
 await page.route(session.config.url+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();
  if(['GET','HEAD','OPTIONS'].includes(method)||url.pathname.includes('/auth/')||/\/rpc\/(?:body_os_pull_delta|health_os_pull_biological_delta|health_ai_usage_summary_production)/.test(url.pathname))return route.continue();
  if(url.pathname.endsWith('/body-os-ai')){
   const body=req.postDataJSON();if(body.action==='/ai/agent-step'||body.action==='/ai/models'||body.action==='/ai/agent-usage')return route.continue();
   if(body.action==='/ai/run-store'){if(body.operation==='save'){runs.set(body.state.id,structuredClone(body.state));return route.fulfill({json:body.state});}return route.fulfill({json:body.operation==='list'?[...runs.values()]:runs.get(body.runId)||null});}
   if(body.action==='/ai/cloud-run-control'&&body.operation==='status')return route.fulfill({json:{enabled:false,expiresAt:null,lastRunAt:null,lastError:null}});
  }
  blockedWrites.push(url.pathname);return route.abort('blockedbyclient');
 });
 page.on('response',async response=>{if(response.url().endsWith('/body-os-ai')){try{const body=await response.json();if(body.usage)usage.push(...body.usage);}catch{}}});
 await page.goto('http://localhost:10000/#Today');await page.locator('.os-frame').waitFor({timeout:90000});checks.push({name:'real owner session restored',passed:true});
 await page.reload();await page.locator('.os-frame').waitFor({timeout:90000});checks.push({name:'session survives reload',passed:true});
 for(const destination of ['Today','Train','Eat','Recover','Recover/Sleep','Health','Settings','Profile','Today/Pods','Intelligence']){
  await page.goto('http://localhost:10000/#'+destination);await page.locator('main').waitFor();await page.waitForTimeout(600);assert.equal(await page.getByText('Something went wrong',{exact:true}).count(),0);checks.push({name:destination,passed:true});
 }
 const contextButton=page.getByRole('button',{name:/^Context:/});await contextButton.click();await page.getByLabel('Context scope',{exact:true}).selectOption('none');await page.keyboard.press('Escape');
 await page.getByLabel('Ask Health OS Intelligence',{exact:true}).fill('Give one short qualitative benefit of consistent sleep routines. General guidance only; do not read records or propose actions.');await page.getByRole('button',{name:'Send command',exact:true}).click();
 await page.getByLabel('Allow the AI to read this selected context and conversation').check();await page.getByRole('button',{name:'Reason with approved context',exact:true}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.intel-answer')).some(el=>/sleep/i.test(el.textContent||'')),{},{timeout:90000});
 assert.ok(usage.length);assert.ok(usage.every(u=>u.model==='qwen/qwen3-235b-a22b-2507'));checks.push({name:'real Qwen text response rendered in deployed Web client',passed:true,models:[...new Set(usage.map(u=>u.model))],calls:usage.length,costUsd:usage.reduce((n,u)=>n+(u.estimatedCostUsd||0),0)});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,blockedHealthWrites:blockedWrites.length}));
}catch(e){checks.push({name:'failure',passed:false,error:(e as Error).message});console.error(JSON.stringify(checks.at(-1)));process.exitCode=1;}
finally{await writeFile('outputs/releases/health-os-v0.1.4/evidence/live-web-smoke.json',JSON.stringify({checks,errors,blockedWrites,usage,models,healthWritesCommitted:0},null,2));await browser.close();}
