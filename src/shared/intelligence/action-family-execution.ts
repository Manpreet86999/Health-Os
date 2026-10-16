import {intelligenceActionDefinitions} from './action-families.js';
import {fingerprint} from '../automation-model.js';
import {nonMedicalPeriod} from '../mcp-expanded-actions.js';
import type {ActionId} from '../mcp-contracts.js';
import type {HealthActionServices,ActionRecord} from '../health-action-registry.js';
import type {BioRecord} from '../biology.js';
import {recordHash} from './contracts.js';
/** Reviewable domain writes use ordinary services and stable canonical receipt identities. */
export async function executeActionFamily(action:ActionId,input:any,services:HealthActionServices,records:BioRecord[],receiptId:string){
 if(!(action in intelligenceActionDefinitions))return undefined;
 input=intelligenceActionDefinitions[action as keyof typeof intelligenceActionDefinitions].schema.parse(input);
 const recordId='mcp-result-'+receiptId,receiptRecordId='mcp-receipt-'+receiptId,stamp=new Date().toISOString();

 // Idempotency check: if receipt already exists, return existing verified result directly without duplicating writes.
 const existingReceipt=records.find(r=>r.userId===services.dataset.userId&&r.id===receiptRecordId&&!r.deletedAt&&r.metadata?.mcpReceipt===true);
 if(existingReceipt){
  if(existingReceipt.metadata.action!==action||existingReceipt.metadata.canonicalInputHash&&existingReceipt.metadata.canonicalInputHash!==fingerprint([action,input]))throw new Error('This action identity belongs to different approved inputs.');
  try{
   const parsed=JSON.parse(String(existingReceipt.metadata.result));
   if(parsed.success===true)return parsed;
  }catch{}
 }

 let row:ActionRecord|undefined,changedId=recordId;
 if(action==='training.save_program'){
  if(!services.saveProgram)throw new Error('Open a compatible Health OS app to save this program.');
  if(new Set(input.weeks.map((w:any)=>w.weekId)).size!==input.weeks.length||new Set(input.weeks.map((w:any)=>w.weekNumber)).size!==input.weeks.length||input.weeks.some((w:any)=>!services.dataset.db.weeks.some(existing=>existing.id===w.weekId)))throw new Error('A program must reference distinct owned saved weeks and week numbers.');
  await services.saveProgram({id:recordId,name:input.name,notes:input.notes,weeks:input.weeks,active:false,createdAt:stamp});
 }else if(action==='experiments.create'){
  row={
   id:recordId,type:'experiment',domain:'Insights',name:input.name,timestamp:input.start+'T12:00:00Z',
   metadata:{
    hypothesis:input.hypothesis,intervention:input.intervention||'',metric:input.metric,start:input.start,
    baseline:input.baseline||'',baselineDays:input.baselineDays,days:input.days,
    successCriteria:input.successCriteria||'',confounders:input.confounders||'',notes:input.notes||'',
    observational:true,status:'active',causal:false
   }
  };
 }else if(action==='reminders.create'){
  row={
   id:recordId,type:'journal',domain:'Today',name:input.name,
   metadata:{
    intelligenceReminder:true,agentRunId:services.runId||input.relatedRunId||'',
    relatedGoalId:input.relatedGoalId||'',relatedActionId:input.relatedActionId||'',
    note:input.note,date:input.date,time:input.time,timeZone:input.timeZone,
    recurrence:input.recurrence||'none',domain:input.domain||'goals',status:'scheduled'
   }
  };
 }else if(action==='reminders.complete'){
  const target=records.find(r=>r.id===input.reminderId&&!r.deletedAt&&r.metadata?.intelligenceReminder===true);
  if(!target)throw new Error('Reminder not found or already deleted.');
  changedId=target.id;
  row={
   id:target.id,type:target.type,domain:target.domain,name:target.name,
   value:target.value,unit:target.unit,timestamp:target.timestamp,
   metadata:{...target.metadata,status:'completed',completedAt:stamp}
  };
 }else if(action==='reports.save_period'){
  const report=JSON.stringify(nonMedicalPeriod(services,records,input.date,input.days));
  if(report.length>18000)throw new Error('Report is too large. Choose a shorter period.');
  row={
   id:recordId,type:'journal',domain:'Insights',name:input.name,
   metadata:{
    intelligenceSavedReport:true,report,date:input.date,days:input.days,
    reportType:input.reportType||'cross_domain',agentRunId:services.runId||input.runId||''
   }
  };
 }else if(action==='medical.add_note'){
  row={
   id:recordId,type:'journal',domain:'Health',name:'Personal health note',timestamp:input.date+'T12:00:00Z',
   metadata:{notes:input.note,clinicalInterpretation:false,diagnosis:false,observational:true,reviewedClinicalFact:false,provenance:input.provenance||'user_reported'}
  };
 }else if(action==='medical.log_symptom'){
  row={
   id:recordId,type:'symptom',domain:'Health',name:input.name,timestamp:input.date+'T12:00:00Z',
   metadata:{severity:input.severity,notes:input.note,diagnosis:false,observational:true,reviewedClinicalFact:false,provenance:input.provenance||'user_reported'}
  };
 }

 if(!row&&action!=='training.save_program')throw new Error('Unsupported action family.');

 const result={
  success:true as const,
  actionReceiptId:receiptId,
  summary:'Saved and verified '+(row?.name||input.name)+'.',
  changedRecords:[{id:changedId,type:row?.type||'program'}],
  warnings:[],
  requiresUserAttention:false,
  undoable:false,
  runId:services.runId||input.runId||input.relatedRunId,
  actionType:action,
  executedAt:stamp,
  executor:(services as any).executorId||'canonical_executor',
  verificationState:'verified' as const,
  status:'executed' as const,
 };

 const receipt:ActionRecord={
  id:receiptRecordId,type:'journal',domain:'Insights',name:'MCP action receipt',
  metadata:{
   mcpReceipt:true,action,result:JSON.stringify(result),canonicalInputHash:fingerprint([action,input]),
   receiptId,runId:result.runId,...(services.runId?{agentRunId:services.runId}:{}),executedAt:stamp,verificationState:'verified',
   ...(row?{recordFingerprint:fingerprint({type:row.type,name:row.name,value:row.value,unit:row.unit||'',metadata:row.metadata})}:{})
  }
 };

 const writes=row?[row,receipt]:[receipt];
 if(!services.commit)throw new Error('Transactional record persistence is required.');
 await services.commit(writes,[],writes.map(w=>{const old=records.find(r=>r.id===w.id);return old?{id:old.id,revision:old.revision,fingerprint:recordHash(old)}:{id:w.id,revision:null};}));
 const saved=await services.readRecords();
 for(const write of writes){
  const actual=saved.find(r=>r.id===write.id&&!r.deletedAt);
  if(!actual||actual.type!==write.type||actual.name!==write.name||fingerprint(actual.metadata)!==fingerprint(write.metadata))throw new Error('Action verification failed. Retry the original identity.');
 }
 return result;
}
