import {fingerprint} from '../automation-model.js';
import {z} from 'zod';
import {agentRequestSchema} from './agent-contracts.js';
import {createAgentRun} from './run-contracts.js';
import {goalReviewScheduleSchema} from './goal-review-contracts.js';
export {goalReviewScheduleSchema,goalReviewDomains,type GoalReviewSchedule} from './goal-review-contracts.js';
export function goalReviewPeriod(now:Date,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(name:string)=>parts.find(p=>p.type===name)!.value,date=value('year')+'-'+value('month')+'-'+value('day');
 const monday=new Date(date+'T12:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
 return {date,week:monday.toISOString().slice(0,10)};
}
/** Owner opt-in creates at most one read-only review per local calendar week. */
export function createWeeklyGoalReview(owner:string,workspace:string,raw:unknown,now=new Date(),namespace?:string){
 const schedule=goalReviewScheduleSchema.parse(raw);if(!schedule.enabled)return undefined;
 const period=goalReviewPeriod(now,schedule.timeZone),id='goal-review:'+owner+':'+period.week+(namespace?':'+fingerprint([namespace,schedule.domains]):'');
 const topics:Record<string,string>={recovery:'recovery deterioration',sleep:'sleep deterioration',training:'training overload',body:'weight plateau',nutrition:'nutrition adherence changes',medical:'relevant reviewed medical changes',care:'Care routine adherence',goals:'plan drift'};
 const approvedTopics=schedule.domains.map(domain=>topics[domain]).filter(Boolean).join(', ');
 const request=agentRequestSchema.parse({requestId:id,phase:'route',question:'Review my active goals and recorded progress over the last four weeks. Retrieve only relevant evidence within my approved domains ('+schedule.domains.join(', ')+'). Explain progress, coverage, obstacles and possible next steps with source IDs. Check sufficient recorded evidence for '+approvedTopics+'; do not claim a trend from missing observations. Missing observations remain unavailable. Use any sufficient recorded intervention/outcome evidence conservatively. Do not create or change any health record, goal, routine, workout or medication.',power:'general',mode:'analyze',policy:{mode:'domains',domains:schedule.domains,recordIds:[],date:period.date,research:'off'},conversation:[],toolResults:[],memories:[],attachments:[]});
 return {...createAgentRun(request,owner,workspace),allowBackgroundReads:true,timeZone:schedule.timeZone};
}
