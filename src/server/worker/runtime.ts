import type { WorkerCloud } from './cloud.js';
import type { WorkerJob, WorkerOperation } from '../../shared/worker-jobs.js';

export async function processNextJob(cloud:WorkerCloud,workerId:string,operations:WorkerOperation[],execute:(job:WorkerJob,cloud:WorkerCloud)=>Promise<any>){
  const [job]=await cloud.rpc('health_os_claim_job',{p_worker:workerId,p_operations:operations});
  if(!job)return null;
  let result=null,error:string|null=null;
  try{if(job.user_id!==cloud.owner)throw new Error('Job belongs to another account.');result=await execute(job,cloud);}catch(e){error=e instanceof Error?e.message.slice(0,2000):'Local computation failed.';}
  const accepted=await cloud.rpc('health_os_finish_job',{p_id:job.id,p_worker:workerId,p_lease:job.lease_token,p_result:result,p_error:error});
  return {operation:job.operation,accepted:Boolean(accepted),failed:Boolean(error)};
}
