import { activeSession, storedSession } from './cloud-session';
import type { WorkerJob, WorkerOperation } from '../../shared/worker-jobs';

async function request(path:string,init:RequestInit={}) {
  const session=await activeSession();
  const response=await fetch(`${session.config.url}/rest/v1/${path}`,{...init,headers:{apikey:session.config.publishableKey,Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(30000)});
  const data=await response.json().catch(()=>null);
  if(storedSession()?.uid!==session.uid)throw new Error('Account changed.');
  if(!response.ok)throw new Error(data?.message||'Could not contact your local worker queue.');
  return data;
}
export async function workerStatus(){
  const workers=await request('health_os_workers?select=id,name,capabilities,updated_at&order=updated_at.desc');
  return {workers:workers.map((w:any)=>({...w,online:Date.now()-Date.parse(w.updated_at)<150000}))};
}
export async function workerJobs():Promise<WorkerJob[]>{return request('health_os_worker_jobs?select=id,user_id,operation,status,error,attempts,created_at&order=created_at.desc&limit=30');}
export async function workerJob(id:string):Promise<WorkerJob>{
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Invalid job identity.');
  const [job]=await request(`health_os_worker_jobs?id=eq.${id}&select=id,user_id,operation,status,result,error,attempts,created_at`);
  if(!job)throw new Error('This temporary result is no longer available. Run the analysis again.');return job;
}
export async function submitWorkerJob(operation:WorkerOperation,input:Record<string,any>={}):Promise<WorkerJob>{
  return request('rpc/health_os_enqueue_job',{method:'POST',body:JSON.stringify({p_id:crypto.randomUUID(),p_operation:operation,p_input:input})});
}
export async function cancelWorkerJob(id:string){return request('rpc/health_os_cancel_job',{method:'POST',body:JSON.stringify({p_id:id})});}
export async function runWorkerJob(operation:WorkerOperation,input:Record<string,any>={},waitMs=180000,signal?:AbortSignal|null):Promise<any>{
  if(signal?.aborted)throw new Error('Analysis cancelled.');
  const owner=storedSession()?.uid,job=await submitWorkerJob(operation,input);
  const deadline=Date.now()+waitMs;
  while(Date.now()<deadline){
    if(signal?.aborted){await cancelWorkerJob(job.id);throw new Error('Analysis cancelled.');}
    if(storedSession()?.uid!==owner)throw new Error('Account changed.');
    const [current]=await request(`health_os_worker_jobs?id=eq.${job.id}&select=status,error`);
    if(!current)throw new Error('This worker job is no longer available.');
    if(current.status==='completed')return (await workerJob(job.id)).result;
    if(current.status==='failed'||current.status==='cancelled')throw new Error(current.error||'Worker job cancelled.');
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error(`Your job is saved (${job.id}). Start your local worker if it is offline; view the result in Settings → Local worker.`);
}
