import type { SkinState } from './skin.js';
import { dateOf, live, type BioRecord } from './biology.js';

/** Only explicit confirmed source events contribute to care execution. */
export function effectiveCare(skin:SkinState,records:BioRecord[]):SkinState {
  const events=[...skin.care.events,...live(records).filter(r=>r.type==='automationEvent'&&r.metadata.subtype==='careAction'&&r.metadata.careTaskId).map(r=>({id:r.id,taskId:String(r.metadata.careTaskId),date:dateOf(r.timestamp),status:(r.metadata.status==='skipped'?'skipped':'done') as 'done'|'skipped',note:String(r.metadata.notes||''),createdAt:r.updatedAt}))];
  const byTask=new Map<string,typeof events[number]>();for(const e of events.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)))byTask.set(`${e.taskId}:${e.date}`,e);
  const observations=live(records).filter(r=>r.type==='journal'&&r.metadata.subtype==='careObservation').map(r=>({id:r.id,date:dateOf(r.timestamp),area:(['face','body','hair','scalp'].includes(String(r.metadata.area))?r.metadata.area:'face') as 'face'|'body'|'hair'|'scalp',concern:String(r.metadata.concern||r.name),severity:r.metadata.severity===undefined?null:Number(r.metadata.severity),note:String(r.metadata.notes||''),createdAt:r.createdAt}));
  return {...skin,care:{...skin.care,events:[...byTask.values()],checkIns:[...skin.care.checkIns.filter(c=>!observations.some(o=>o.id===c.id)),...observations]}};
}
