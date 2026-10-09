import path from 'node:path';
import { hostname } from 'node:os';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { supabaseSignIn, verifySupabaseSession } from '../../shared/supabase-auth.js';
import { DEFAULT_SUPABASE_CONFIG } from '../../shared/supabase-project.js';
import { WORKER_OPERATIONS } from '../../shared/worker-jobs.js';
import { workerHome, loadWorkerSession, saveWorkerSession } from './credentials.js';
import { WorkerCloud } from './cloud.js';
import { processNextJob } from './runtime.js';

async function question(prompt:string,secret=false):Promise<string>{
  if(!process.stdin.isTTY)throw new Error('Worker login requires an interactive terminal.');
  if(!secret){const rl=createInterface({input:process.stdin,output:process.stdout});return new Promise(resolve=>rl.question(prompt,value=>{rl.close();resolve(value);}));}
  process.stdout.write(prompt);emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{let value='';const cleanup=()=>{process.stdin.off('keypress',handler);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};const handler=(str:string,key:any)=>{if(key?.ctrl&&key.name==='c'){cleanup();reject(new Error('Login cancelled.'));}else if(key?.name==='return'){cleanup();resolve(value);}else if(key?.name==='backspace')value=value.slice(0,-1);else if(str&&!key?.ctrl&&!key?.meta)value+=str;};process.stdin.on('keypress',handler);});
}
async function main(){
  if(process.argv.includes('--login')){
    const email=await question('Your Health OS email: '),password=await question('Password (hidden): ',true);
    const session=await supabaseSignIn(DEFAULT_SUPABASE_CONFIG,email,password);saveWorkerSession(session);
    console.log(`Worker connected to ${session.email}. Run npm run worker:start.`);return;
  }
  if(process.argv.includes('--doctor')){
    process.env.BODY_OS_DATA_DIR=path.join(workerHome,'diagnostics');mkdirSync(process.env.BODY_OS_DATA_DIR,{recursive:true,mode:0o700});
    const {capabilities,disposeHandlers}=await import('./handlers.js');console.log(JSON.stringify(await capabilities(),null,2));disposeHandlers();return;
  }
  const cloud=new WorkerCloud(loadWorkerSession());
  await cloud.request('auth/v1/user');
  // Ensure authenticated identity matches stored identity, never trust the local JSON alone.
  const verified=await verifySupabaseSession(cloud.session.config,cloud.session.accessToken);
  if(verified.uid!==cloud.owner)throw new Error('Session owner mismatch. Sign in again.');
  const ownerRoot=path.join(workerHome,cloud.owner);mkdirSync(ownerRoot,{recursive:true,mode:0o700});
  process.env.BODY_OS_DATA_DIR=path.join(ownerRoot,'cache');process.env.BODY_OS_BACKUP_DIR=path.join(ownerRoot,'backups');
  process.env.HEALTH_OS_RESEARCH_RUN_DIR=path.join(ownerRoot,'experiments');
  mkdirSync(process.env.BODY_OS_DATA_DIR,{recursive:true,mode:0o700});
  const {capabilities,executeJob,disposeHandlers}=await import('./handlers.js');
  const workerFile=path.join(ownerRoot,'worker-id');const workerId=existsSync(workerFile)?readFileSync(workerFile,'utf8'):randomUUID();writeFileSync(workerFile,workerId,{mode:0o600});
  const caps=await capabilities();
  const operations=[...WORKER_OPERATIONS].filter(op=>op!=='voice.transcribe'||caps.voice.available);
  const heartbeat=()=>cloud.request('rest/v1/health_os_workers?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:workerId,user_id:cloud.owner,name:hostname().slice(0,100),capabilities:{...caps,operations},updated_at:new Date().toISOString()})});
  await heartbeat();
  let stopping=false;const stop=()=>{stopping=true;disposeHandlers();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
  const timer=setInterval(()=>void heartbeat().catch(()=>console.error('Heartbeat failed; checking connection again shortly.')),60000);timer.unref();
  console.log(`Health OS worker ready for ${cloud.session.email}. No inbound port is opened.`);
  while(!stopping){
    try{
      const job=await processNextJob(cloud,workerId,operations,executeJob);
      if(job){
        console.log(`${job.operation}: ${job.accepted?(job.failed?'failed':'completed'):'lease cancelled or expired'}`);
      }else await new Promise(resolve=>setTimeout(resolve,10000));
    }catch{console.error('Worker connection interrupted. Retrying in 30 seconds.');await new Promise(resolve=>setTimeout(resolve,30000));}
  }
  clearInterval(timer);disposeHandlers();
}
main().catch(error=>{console.error((error as Error).message);process.exitCode=1;});
