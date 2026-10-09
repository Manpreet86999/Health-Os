import { z } from 'zod';
import { dateOf, live, num, nutrition, type BioDomain, type BioRecord } from './biology.js';
import { anomalySignals, atTime, buildTimeline, shiftDay, type TimelineEvent } from './biological-intelligence.js';
import type { AppDb, Page } from './types.js';
import type { SkinState } from './skin.js';

export const routineActionSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('water'),amount:z.number().min(1).max(20000)}),
  z.object({type:z.literal('meal'),recordId:z.string().min(1),servings:z.number().positive().max(20)}),
  z.object({type:z.literal('habit'),recordId:z.string().min(1)}),
  z.object({type:z.literal('care'),recordId:z.string().min(1)}),
  z.object({type:z.literal('dose'),recordId:z.string().min(1)}),
]);
export type RoutineAction=z.infer<typeof routineActionSchema>;
export function routineActions(record:BioRecord){return z.array(routineActionSchema).max(30).parse(JSON.parse(String(record.metadata.actions||'[]')));}
export function quietHours(now:Date,start='22:00',end='07:00'){
  if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||start===end)return false;
  const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  return start<end?time>=start&&time<end:time>=start||time<end;
}
export interface Nudge {id:string;title:string;reason:string;domain:BioDomain;page:Page;priority:number;kind:'scheduled'|'contextual'|'system'|'insight';event?:TimelineEvent;}
export function reminderPreference(records:BioRecord[]){
  const rows=live(records).filter(r=>r.type==='nudgePreference').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return rows.find(r=>r.id!=='health-os-automation-settings')??rows.find(r=>r.id==='health-os-automation-settings'&&['quietStart','quietEnd','dailyLimit','browserNotifications'].some(key=>Object.hasOwn(r.metadata,key)));
}
export function evaluateNudges(records:BioRecord[],db:AppDb,skin:SkinState,now=new Date()):Nudge[]{
  const date=dateOf(now.toISOString()),rows=live(records),today=rows.filter(r=>dateOf(r.timestamp)===date),pref=reminderPreference(rows);
  if(pref?.metadata.enabled===false||quietHours(now,String(pref?.metadata.quietStart||'22:00'),String(pref?.metadata.quietEnd||'07:00')))return [];
  const candidates:Nudge[]=[];const agenda=buildTimeline(rows,db,skin,date);
  for(const event of agenda.filter(e=>e.status==='planned')){
    const minutes=(now.getTime()-Date.parse(event.timestamp))/60000;
    if(minutes>=-45&&minutes<=720)candidates.push({id:event.id,title:event.title,reason:minutes<0?`Coming up in ${Math.ceil(-minutes)} min`:minutes<5?'Due now':`Scheduled for ${new Date(event.timestamp).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`,domain:event.domain,page:event.page,priority:event.type==='medication'?100:event.type==='supplement'?85:event.type==='plannedWorkout'?80:60,kind:'scheduled',event});
  }
  const target=rows.filter(r=>r.type==='nutritionTarget').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0],food=nutrition(rows,date),water=today.filter(r=>r.type==='water').reduce((s,r)=>s+(r.value||0),0);
  if(now.getHours()>=12&&target){
    if(num(target,'water')&&water<num(target,'water')!*(now.getHours()/24))candidates.push({id:`water-${date}`,title:'A little water break',reason:`${(water/1000).toFixed(1)} of ${(num(target,'water')!/1000).toFixed(1)} L logged`,domain:'Eat',page:'Eat',priority:65,kind:'contextual'});
    if(now.getHours()>=15&&num(target,'protein')&&food.protein<num(target,'protein')!*.6)candidates.push({id:`protein-${date}`,title:'Make room for protein',reason:`${food.protein} of ${num(target,'protein')} g logged`,domain:'Eat',page:'Eat',priority:62,kind:'contextual'});
  }
  if(now.getHours()>=7&&!today.some(r=>r.type==='checkIn'))candidates.push({id:`checkin-${date}`,title:'How are you feeling?',reason:'A 20-second check-in makes recovery advice more personal.',domain:'Recover',page:'Recover',priority:55,kind:'contextual'});
  if(now.getDay()===0&&now.getHours()>=16&&!rows.some(r=>r.type==='journal'&&r.metadata.review&&dateOf(r.timestamp)>=shiftDay(date,-6)))candidates.push({id:`review-${date}`,title:'Your week, at a glance',reason:'Review your wins and pick one adjustment.',domain:'Insights',page:'Habits',priority:50,kind:'insight'});
  const anomalies=anomalySignals(rows,date);if(anomalies.length>=2)candidates.push({id:`signals-${date}`,title:'A few signals changed together',reason:`${anomalies.map(a=>a.metric).join(', ')} are outside their recent personal ranges.`,domain:'Health',page:'Insights',priority:75,kind:'insight'});
  for(const rule of rows.filter(r=>r.type==='automation'&&r.metadata.enabled!==false&&r.metadata.trigger!=='time')){
    let triggered=false;
    if(rule.metadata.trigger==='afterWorkout')triggered=db.sessions.some(s=>s.date===date&&['done','finished','completed'].includes(s.status));
    if(rule.metadata.trigger==='waterBelow')triggered=now.getHours()>=Number(String(rule.metadata.time||'14:00').split(':')[0])&&water<Number(rule.metadata.threshold||1500);
    if(rule.metadata.trigger==='proteinBelow')triggered=now.getHours()>=Number(String(rule.metadata.time||'18:00').split(':')[0])&&food.protein<Number(rule.metadata.threshold||100);
    if(rule.metadata.trigger==='bedtime')triggered=now.getHours()>=Number(String(rule.metadata.time||'22:00').split(':')[0]);
    if(triggered)candidates.push({id:`rule-${rule.id}-${date}`,title:rule.name,reason:String(rule.metadata.message||'Your routine is ready'),domain:rule.domain,page:rule.domain==='Eat'?'Eat':rule.domain==='Recover'?'Recover':'Today',priority:70,kind:'contextual',event:{id:`rule-${rule.id}-${date}`,domain:rule.domain,type:'automation',title:rule.name,timestamp:now.toISOString(),summary:String(rule.metadata.message||''),status:'planned',page:'Today',record:rule,targetId:rule.id}});
  }
  const dismissed=today.filter(r=>r.type==='automationEvent');
  const filtered=candidates.filter(n=>{
    if(pref?.metadata[n.kind]===false)return false;
    const state=dismissed.filter(r=>r.metadata.eventId===n.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    return !state||(state.metadata.status==='snoozed'&&Date.parse(String(state.metadata.until))<=now.getTime())||state.metadata.status==='notified';
  });
  return filtered.sort((a,b)=>b.priority-a.priority).slice(0,Math.max(0,Math.min(20,Number(pref?.metadata.dailyLimit??3))));
}
