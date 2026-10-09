import type { AutomationState } from './automation-model.js';

/** UI-only inbox state transitions; independent of the background rule engine. */
export function resolveInbox(state:AutomationState,id:string,resolution:string,now=new Date(),snoozeMinutes?:number){
  const item=state.inbox[id];if(!item)return;if(resolution==='undo'){item.status='pending';delete item.resolvedAt;delete item.resolution;return;}if(item.status!=='pending')return;
  if(snoozeMinutes){item.snoozedUntil=new Date(now.getTime()+snoozeMinutes*60000).toISOString();return;}
  item.status=resolution==='ignored'||resolution==='skip'?'ignored':resolution==='modified'?'modified':'accepted';item.resolution=resolution;item.resolvedAt=now.toISOString();
}
export const pendingInbox=(state:AutomationState,now=new Date())=>Object.values(state.inbox).filter(i=>i.status==='pending'&&Date.parse(i.expiresAt)>now.getTime()&&(!i.snoozedUntil||Date.parse(i.snoozedUntil)<=now.getTime())).sort((a,b)=>b.priority-a.priority);
