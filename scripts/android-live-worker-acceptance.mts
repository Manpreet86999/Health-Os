import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {supabaseSignIn} from '../src/shared/supabase-auth.ts';
import {DEFAULT_SUPABASE_CONFIG} from '../src/shared/supabase-project.ts';
import {WorkerCloud} from '../src/server/worker/cloud.ts';
import {processNextJob} from '../src/server/worker/runtime.ts';

// No personal worker session is read or written. Only tagged disposable fixtures are permitted.
const secretRoot='C:/Users/Manpr/.codex/local-secrets';
const [fixture]=JSON.parse(await readFile(`${secretRoot}/healthos-native-acceptance.json`,'utf8'));
assert(fixture.email.startsWith('native-acceptance-') && fixture.email.endsWith('@example.invalid'));
const session=await supabaseSignIn(DEFAULT_SUPABASE_CONFIG,fixture.email,fixture.password);
assert.equal(session.uid,fixture.id);
const cloud=new WorkerCloud(session,()=>{});
const user=await cloud.request('auth/v1/user');
assert.equal(user.user_metadata.nativeAcceptanceFixture,true);
const worker=randomUUID();
process.env.BODY_OS_DATA_DIR='scratch/android-program/worker-acceptance';
process.env.HEALTH_OS_RESEARCH_RUN_DIR='scratch/android-program/worker-acceptance/experiments';
await mkdir(process.env.BODY_OS_DATA_DIR,{recursive:true});
const {executeJob,disposeHandlers}=await import('../src/server/worker/handlers.ts');
try {
  await cloud.request('rest/v1/health_os_workers',{method:'POST',body:JSON.stringify({id:worker,user_id:cloud.owner,name:'Disposable native acceptance worker',capabilities:{operations:['research.statistics']},updated_at:new Date().toISOString()})});
  const job=await cloud.rpc('health_os_enqueue_job',{p_id:randomUUID(),p_operation:'research.statistics',p_input:{values:[1,2,3,4,5]}});
  assert.equal(job.status,'queued');
  const completed=await processNextJob(cloud,worker,['research.statistics'],executeJob);
  assert.equal(completed?.accepted,true);
  assert.equal(completed?.failed,false);
  const [result]=await cloud.request(`rest/v1/health_os_worker_jobs?id=eq.${job.id}&select=status,result`);
  assert.equal(result.status,'completed');
  assert.equal(result.result.result.mean,3);
  await writeFile(`${secretRoot}/healthos-native-worker-result.json`,JSON.stringify({id:job.id}),{mode:0o600});
  console.log('PASS: private queue → actual personal-worker lease → NumPy/SciPy computation → completed result (synthetic mean=3).');
} finally {
  disposeHandlers();
  await cloud.request(`rest/v1/health_os_workers?id=eq.${worker}`,{method:'DELETE'});
}
