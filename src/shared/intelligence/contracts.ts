import {z} from 'zod';
import type {BioRecord,BioKind,BioDomain} from '../biology.js';
import type {Dataset} from '../automation-model.js';
import {fingerprint} from '../automation-model.js';
export const domains=['readiness','nutrition','training','recovery','sleep','body','medical','care','goals'] as const;
export type StateDomain=typeof domains[number];
export interface EvidenceReference {id:string;domain:StateDomain;label:string;value?:number|string;unit?:string;fingerprint:string;}
export interface StateValue<T=number> {value:T|null;status:'known'|'unknown'|'insufficient_data';confidence:number;sources:EvidenceReference[];}
export const unknownValue=<T=number>():StateValue<T>=>({value:null,status:'unknown',confidence:0,sources:[]});
export const valueOf=<T>(value:T|null,sources:EvidenceReference[],confidence=.75):StateValue<T>=>({value,status:value===null?'unknown':'known',confidence:value===null?0:Math.max(0,Math.min(1,confidence)),sources});
export type RecordInput={id?:string;type:BioKind;domain:BioDomain;name:string;value?:number;unit?:string;timestamp?:string;source?:string;quality?:BioRecord['quality'];metadata?:BioRecord['metadata']};
export interface RecordExpectation {id:string;revision:number|null;fingerprint?:string;}
export interface RecordService {read:()=>Promise<BioRecord[]>;commit:(writes:RecordInput[],deletes:RecordExpectation[],expectations:RecordExpectation[])=>Promise<void>;}
export interface HealthData extends Dataset {activeWorkout?:unknown;scope?:string;}
export const recordHash=(record:BioRecord)=>fingerprint({...record,revisionToken:record.revision});
export const owned=(records:BioRecord[],userId:string)=>records.filter(r=>r.userId===userId);
export const json=(value:unknown)=>{const serialized=JSON.stringify(value);if(serialized.length>20000)throw new Error('This intelligence record exceeds the supported size.');return serialized;};
export const flagsSchema=z.object({intelligence_action_registry:z.boolean().default(true),intelligence_current_state:z.boolean().default(true),intelligence_memory:z.boolean().default(true),intelligence_predictions:z.boolean().default(true),intelligence_decisions:z.boolean().default(true),intelligence_outcome_learning:z.boolean().default(true)});
export type IntelligenceFlags=z.infer<typeof flagsSchema>;
export function intelligencePreferences(records:BioRecord[]){const record=records.find(r=>r.id==='health-os-intelligence-settings'&&!r.deletedAt);return {flags:flagsSchema.parse(record?.metadata||{}),personalization:record?.metadata.personalization!==false,learnSince:String(record?.metadata.learnSince||'')};}
export class IntelligenceMetrics {
  private counters:Record<string,number>={};private timings:Record<string,{count:number;total:number;max:number}>={};
  count(key:string,amount=1){this.counters[key]=(this.counters[key]||0)+amount;}
  gauge(key:string,value:number){this.counters[key]=value;}
  time<T>(key:string,fn:()=>T):T{const start=performance.now();try{return fn();}finally{this.observe(key,performance.now()-start);}}
  observe(key:string,ms:number){const row=this.timings[key]||{count:0,total:0,max:0};row.count++;row.total+=ms;row.max=Math.max(row.max,ms);this.timings[key]=row;}
  snapshot(){const rate=(n:string,d:string)=>this.counters[d]? (this.counters[n]||0)/this.counters[d]:null;return {counts:{...this.counters},rates:{proposal_approval_rate:rate('proposal_approved','proposal_reviewed'),prediction_outcome_accuracy:rate('prediction_correct','prediction_evaluated'),action_failure_rate:rate('action_failed','action_execution_count'),undo_rate:rate('action_undone','action_execution_count')},timings:Object.fromEntries(Object.entries(this.timings).map(([key,row])=>[key,{count:row.count,averageMs:row.total/row.count,maxMs:row.max}]))};}
}
