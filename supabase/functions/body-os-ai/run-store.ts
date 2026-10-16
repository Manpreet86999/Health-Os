import {z} from 'zod';
import {runSchema} from '../../../src/shared/intelligence/run-contracts.ts';
const command=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('save'),state:runSchema,expectedVersion:z.number().int().positive().nullable()}),
 z.object({operation:z.literal('get'),runId:z.string().min(1).max(150)}),
 z.object({operation:z.literal('list')}),
 z.object({operation:z.literal('list_background')}),
 z.object({operation:z.literal('delete'),runId:z.string().min(1).max(150),expectedVersion:z.number().int().positive()}).strict(),
 z.object({operation:z.literal('prune'),olderThanDays:z.number().int().min(30).max(3650)}).strict(),
]);
export async function runStore(input:unknown,owner:string,base:string,headers:Record<string,string>){
 // The HTTP envelope carries action/owner guards; only command fields enter the schema.
 const envelope=z.object({action:z.string().optional(),expectedOwnerId:z.string().optional()}).passthrough().parse(input);
 if(envelope.expectedOwnerId&&envelope.expectedOwnerId!==owner)throw new Error('Run owner mismatch.');
 const {action,expectedOwnerId,...fields}=envelope;
 const parsed=command.parse(fields);
 if(parsed.operation==='delete'||parsed.operation==='prune'){
  const removing=parsed.operation==='delete';
  const response=await fetch(base+'/rest/v1/rpc/'+(removing?'health_agent_run_delete':'health_agent_run_prune'),{method:'POST',headers,body:JSON.stringify(removing?{p_run_id:parsed.runId,p_expected_version:parsed.expectedVersion}:{p_older_than_days:parsed.olderThanDays}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Saved run changed or is unfinished. Reload and cancel remaining work before deleting its trace.');
  const result=await response.json();
  if(removing?typeof result!=='boolean':!Number.isInteger(result)||result<0)throw new Error('Run retention result is invalid.');
  return result;
 }
 if(parsed.operation==='save'){
  if(parsed.state.ownerId!==owner)throw new Error('Run owner mismatch.');
  const response=await fetch(base+'/rest/v1/rpc/health_agent_run_save',{method:'POST',headers,body:JSON.stringify({p_state:parsed.state,p_expected_version:parsed.expectedVersion}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(response.status===409?'Run changed on another executor. Reload before continuing.':'Could not checkpoint this run. No further action will execute.');
  return runSchema.parse(await response.json());
 }
 const query=new URLSearchParams({user_id:'eq.'+owner,select:'state',...(parsed.operation==='get'?{run_id:'eq.'+parsed.runId,limit:'1'}:{order:'updated_at.desc',limit:'30'})});
 if(parsed.operation==='list_background')query.set('state->>allowBackgroundReads','eq.true');
 const response=await fetch(base+'/rest/v1/health_agent_run?'+query,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Could not read owned Intelligence runs.');const rows=await response.json();
 return parsed.operation==='get'?(rows[0]?runSchema.parse(rows[0].state):null):rows.map((r:any)=>runSchema.parse(r.state));
}
