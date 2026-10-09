import { z } from 'zod';
import type { AppDb } from './types.js';
import type { SkinState } from './skin.js';
import type { BioRecord } from './biology.js';

export const domainEventSchema=z.object({
  id:z.string().min(1).max(250),type:z.string().min(1).max(100),userId:z.string().min(1),
  occurredAt:z.string().datetime({offset:true}),createdAt:z.string().datetime({offset:true}),schemaVersion:z.literal(1),
  source:z.object({kind:z.enum(['user','system','import','sync','ai','future_health_connect']),recordId:z.string().optional(),provider:z.string().optional()}),
  payload:z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),previousDate:z.string().optional(),recordType:z.string().optional(),revision:z.string().optional()}),
});
export type DomainEvent=z.infer<typeof domainEventSchema>;
export type Dataset={db:AppDb;skin:SkinState;records:BioRecord[];photoDates?:{id:string;date:string}[];dailyAggregates?:Record<string,{metrics:Record<string,number|null>;metricRefs:Record<string,string[]>}>;userId:string};
export const automationDefaults={smartDefaults:true,habits:true,goals:true,mealPatterns:true,recurringMeals:true,adaptiveCheckin:true,workoutPreparation:true,automaticReports:true,insights:true,baselines:true,anomalyPrompts:true,carePlan:true,measurementScheduling:true,doseReminders:true,reportRegenerationDays:90,maxInbox:5};
export type AutomationPreferences=typeof automationDefaults;
export interface Evidence {ids:string[];explanation:string;quality:'high'|'medium'|'low';}
export interface DerivedResult {id:string;kind:string;date:string;value:unknown;eventId:string;automationKey:string;version:number;updatedAt:string;evidence:Evidence;}
export interface AutomationRun {id:string;eventId:string;automationKey:string;version:number;status:'completed'|'failed'|'disabled';startedAt:string;completedAt?:string;outputRefs:string[];error?:string;}
export interface AutomationJob {id:string;key:string;eventId:string;status:'pending'|'running'|'completed'|'failed'|'cancelled';attempts:number;nextAttemptAt:string;error?:string;affectedDates?:string[];rebuildAll?:boolean;command?:{path:string;body:Record<string,unknown>;sourceIds:string[];sourceRevision:string};result?:unknown;}
export interface InboxItem {id:string;type:'dose'|'meal'|'measurement'|'anomaly'|'import'|'workout';priority:number;title:string;body:string;suggestedAction:string;suggestedPayload:Record<string,unknown>;source:Evidence;expiresAt:string;status:'pending'|'accepted'|'modified'|'ignored'|'expired';createdAt:string;resolvedAt?:string;resolution?:string;snoozedUntil?:string;}
export interface SourceStamp {revision:string;date:string;type:string;}
export interface AutomationState {version:1;engineVersion?:number;sources:Record<string,SourceStamp>;events:DomainEvent[];runs:Record<string,AutomationRun>;derived:Record<string,DerivedResult>;jobs:Record<string,AutomationJob>;inbox:Record<string,InboxItem>;updatedAt:string;}
export const emptyAutomationState=():AutomationState=>({version:1,sources:{},events:[],runs:{},derived:{},jobs:{},inbox:{},updatedAt:''});

/** Stable content identity, excluding transport acknowledgements and clocks. */
export function fingerprint(value:unknown):string {
  const serialize=(v:unknown):string=>Array.isArray(v)?'['+v.map(serialize).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().filter(k=>!['syncState','updatedAt','createdAt','revision'].includes(k)).map(k=>JSON.stringify(k)+':'+serialize((v as Record<string,unknown>)[k])).join(',')+'}':JSON.stringify(v)??'null';
  const s=serialize(value);let a=2166136261,b=5381;
  for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}
  return (a>>>0).toString(36)+(b>>>0).toString(36);
}
export function automationPreferences(records:BioRecord[]):AutomationPreferences {
  const config=records.filter(r=>!r.deletedAt&&r.type==='nudgePreference'&&r.id==='health-os-automation-settings').at(-1);
  return {...automationDefaults,...Object.fromEntries(Object.entries(config?.metadata||{}).filter(([k,v])=>k in automationDefaults&&typeof v===typeof automationDefaults[k as keyof AutomationPreferences]))};
}

export function stableRecordId(prefix:string,...parts:string[]){const id=[prefix,...parts].join(':');return id.length<=150?id:`${prefix}:${fingerprint(id)}`;}
