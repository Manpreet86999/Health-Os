import {live,type BioRecord} from '../biology.js';
import {fingerprint} from '../automation-model.js';
import {dayInZone,calendarStamp} from '../mcp-execution.js';
import {intelligenceActionDefinitions} from './action-families.js';
import {recordHash,type RecordService} from './contracts.js';
/** Approved reminders create one in-app notification; no emails, model calls or health facts. */
export async function deliverDueIntelligenceReminders(service:RecordService,owner:string,now=new Date(),runId?:string){
 const rows=live(await service.read()).filter(r=>r.userId===owner),delivered:string[]=[];
 for(const reminder of rows.filter(r=>r.metadata.intelligenceReminder===true&&r.metadata.status==='scheduled'&&(!runId||r.metadata.agentRunId===runId))){if(delivered.length>=100)break;
  const parsed=intelligenceActionDefinitions['reminders.create'].schema.safeParse({idempotencyKey:'scheduled-reminder',name:reminder.name,note:reminder.metadata.note,date:reminder.metadata.date,time:reminder.metadata.time,timeZone:reminder.metadata.timeZone});if(!parsed.success)continue;
  const value=parsed.data,date=dayInZone(now.toISOString(),value.timeZone),time=calendarStamp(now.toISOString(),value.timeZone).slice(11,16);if(date<value.date||date===value.date&&time<value.time)continue;
  const id='reminder-alert-'+fingerprint([owner,reminder.id]);if(rows.some(r=>r.id===id))continue;
  const receipt=rows.find(r=>r.metadata.mcpReceipt===true&&r.metadata.action==='reminders.create'&&r.metadata.undone!==true&&(()=>{try{const result=JSON.parse(String(r.metadata.result));return result.success===true&&result.changedRecords?.some((r:{id:string})=>r.id===reminder.id);}catch{return false;}})());if(!receipt)continue;
  await service.commit([{id:reminder.id,type:reminder.type,domain:reminder.domain,name:reminder.name,source:reminder.source,timestamp:reminder.timestamp,metadata:{...reminder.metadata,status:'delivered',deliveredAt:now.toISOString()}},{id,type:'journal',domain:'Today',name:reminder.name,source:'Health OS scheduled reminder',metadata:{intelligenceReminderAlert:true,reminderId:reminder.id,message:value.note,date:value.date,time:value.time,timeZone:value.timeZone,sourceFingerprint:recordHash(reminder)}}],[],[{id:reminder.id,revision:reminder.revision,fingerprint:recordHash(reminder)},{id,revision:null}]);
  delivered.push(id);
 }
 return delivered;
}
export function intelligenceReminderAlerts(records:BioRecord[],owner:string){return live(records).filter(r=>r.userId===owner&&r.metadata.intelligenceReminderAlert===true).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,20);}
