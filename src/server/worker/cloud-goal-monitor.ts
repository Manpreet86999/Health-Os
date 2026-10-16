import {createWeeklyGoalReview} from '../../shared/intelligence/goal-review.js';
import {runSchema} from '../../shared/intelligence/run-contracts.js';
import {processBackgroundIntelligence,type BackgroundCloud} from './intelligence.js';
import type {CloudActionGateway} from '../../hosted/mcp/cloud-gateway.js';
/** Schedules shared durable read-only reviews with exact owner/domain consent and civil-week IDs. */
export async function processCloudGoalMonitor(cloud:BackgroundCloud,parentId:string,executorId:string,gateway:CloudActionGateway,now=new Date()){
 const call=(body:unknown)=>cloud.request('functions/v1/body-os-ai',{method:'POST',body:JSON.stringify({action:'/ai/run-store',expectedOwnerId:cloud.owner,...body as any}),signal:AbortSignal.timeout(15000)});
 const raw=await call({operation:'get',runId:parentId});if(!raw)return false;
 const parent=runSchema.parse(raw);if(parent.ownerId!==cloud.owner||!parent.allowBackgroundReads||!parent.monitoring?.enabled||['cancelled','failed'].includes(parent.status))return false;
 const proposed=createWeeklyGoalReview(cloud.owner,parent.workspaceId,parent.monitoring,now,parent.id)!;
 const existing=await call({operation:'get',runId:proposed.id});let review=existing?runSchema.parse(existing):proposed;
 if(review.ownerId!==cloud.owner||review.workspaceId!==parent.workspaceId||review.request.mode!=='analyze'||review.request.policy.domains.some(d=>!parent.monitoring!.domains.includes(d)))throw new Error('Weekly review exceeds the approved monitor context.');
 if(!existing){try{review=runSchema.parse(await call({operation:'save',state:proposed,expectedVersion:null}));}catch{const current=await call({operation:'get',runId:proposed.id});if(!current)throw new Error('Weekly review could not be checkpointed.');review=runSchema.parse(current);if(review.ownerId!==cloud.owner||review.workspaceId!==parent.workspaceId||review.request.mode!=='analyze'||review.request.policy.domains.some(d=>!parent.monitoring!.domains.includes(d)))throw new Error('Concurrent weekly review context mismatch.');}}
 if(['completed','cancelled','failed','blocked','awaiting_approval'].includes(review.status))return false;
 return processBackgroundIntelligence(cloud,executorId,{runId:review.id,prepareChanges:false,maxRounds:1,gateway});
}
