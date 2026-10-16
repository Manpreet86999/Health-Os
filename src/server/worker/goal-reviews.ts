import type {WorkerCloud} from './cloud.js';
import {runSchema} from '../../shared/intelligence/run-contracts.js';
import {createWeeklyGoalReview,goalReviewScheduleSchema} from '../../shared/intelligence/goal-review.js';
const lastChecks=new Map<string,number>();
/** Scheduling stores run metadata only. The common background executor permits no writes. */
export async function enqueueDueGoalReview(cloud:WorkerCloud,now=new Date()){
 const identity=cloud.session.config.url+'|'+cloud.owner,stamp=now.getTime();
 if(stamp-(lastChecks.get(identity)??-Infinity)<60000)return false;
 const query=new URLSearchParams({user_id:'eq.'+cloud.owner,entity_type:'eq.sharedPreferences',record_id:'eq.shared-preferences',deleted_at:'is.null',select:'payload->intelligenceGoalReview',limit:'1'});
 const rows=await cloud.request('rest/v1/body_os_records?'+query);
 const parsed=goalReviewScheduleSchema.safeParse(rows[0]?.intelligenceGoalReview);lastChecks.set(identity,stamp);
 if(!parsed.success||!parsed.data.enabled)return false;
 const state=createWeeklyGoalReview(cloud.owner,identity,parsed.data,now)!;
 const invoke=(body:unknown)=>cloud.request('functions/v1/body-os-ai',{method:'POST',body:JSON.stringify({action:'/ai/run-store',expectedOwnerId:cloud.owner,...body as any})});
 const found=await invoke({operation:'get',runId:state.id});
 if(found){if(runSchema.parse(found).ownerId!==cloud.owner)throw new Error('Goal review owner mismatch.');return false;}
 const saved=runSchema.parse(await invoke({operation:'save',state,expectedVersion:null}));
 if(saved.ownerId!==cloud.owner||saved.id!==state.id)throw new Error('Goal review checkpoint mismatch.');
 return true;
}
