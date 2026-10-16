import type {BackgroundCloud} from './intelligence.js';
import {bioSchema} from '../../shared/biology.js';
import {runSchema} from '../../shared/intelligence/run-contracts.js';
import {deliverDueIntelligenceReminders} from '../../shared/intelligence/reminders.js';
export async function processCloudReminders(cloud:BackgroundCloud,runId:string,now=new Date()){
 const parent=await cloud.request('functions/v1/body-os-ai',{method:'POST',body:JSON.stringify({action:'/ai/run-store',operation:'get',runId,expectedOwnerId:cloud.owner})});if(!parent)return false;
 const run=runSchema.parse(parent);if(run.ownerId!==cloud.owner||!run.allowBackgroundReads||['failed','cancelled'].includes(run.status))return false;
 const query=new URLSearchParams({user_id:'eq.'+cloud.owner,'payload->metadata->>agentRunId':'eq.'+runId,'mcp_record_type':'eq.journal',select:'user_id,record_id,payload,revision',order:'record_id',limit:'1001'}),rows=await cloud.request('rest/v1/health_os_biological_records?'+query);if(rows.length>1000)throw new Error('Reminder history exceeds the bounded worker window.');
 const revisions=new Map(rows.map((row:any)=>[row.record_id,Number(row.revision)]));const records=rows.map((row:any)=>{if(row.user_id!==cloud.owner)throw new Error('Reminder source owner mismatch.');return bioSchema.parse({...row.payload,revision:Number(row.revision)});});
 const delivered=await deliverDueIntelligenceReminders({read:async()=>records,commit:async(writes,deletes,expectations)=>{if(deletes.length)throw new Error('Reminders never delete health records.');const stamp=now.toISOString(),prepared=writes.map(write=>{const old=records.find((r:any)=>r.id===write.id);return {...old,...write,userId:cloud.owner,timestamp:write.timestamp||old?.timestamp||stamp,createdAt:old?.createdAt||stamp,updatedAt:stamp,revision:(old?.revision||0)+1,quality:old?.quality||'manual',deviceId:old?.deviceId||'health-os-cloud',unit:old?.unit||'',syncState:'saved'};});await cloud.request('rest/v1/rpc/health_cloud_deliver_reminder',{method:'POST',body:JSON.stringify({p_run_id:runId,p_writes:prepared,p_expectations:expectations.map(e=>({id:e.id,revision:revisions.get(e.id)??null}))})});}},cloud.owner,now,runId);
 return delivered.length>0;
}
