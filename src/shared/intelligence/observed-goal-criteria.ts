import {z} from 'zod';
export const goalMetrics=['sleep_hours','weight_kg','protein_g','soreness_0_10'] as const;
export const observedCriterionFields={metric:z.enum(goalMetrics).optional(),comparison:z.enum(['at_least','at_most','within']).optional(),targetValue:z.number().finite().optional(),tolerance:z.number().finite().min(0).max(20).optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()};
type Criterion={metric?:typeof goalMetrics[number];comparison?:'at_least'|'at_most'|'within';targetValue?:number;tolerance?:number;from?:string;to?:string;tool?:string;minimumCount:number};
/** Only canonical dated observations can complete a physical-health success criterion. */
export function observedCriterionSatisfied(c:Criterion,observations:{name:string;error?:string;data:unknown}[],asOfDate=new Date().toISOString().slice(0,10)){
 if(!c.metric||!c.comparison||c.targetValue===undefined||c.minimumCount<3||!c.from||!c.to||c.from>c.to||c.to>asOfDate)return false;
 const expectedTool={sleep_hours:'sleep.get_trend',weight_kg:'body.get_weight_history',protein_g:'nutrition.get_history',soreness_0_10:'recovery.get_history'}[c.metric];if(c.tool!==expectedTool)return false;
 const latest=[...observations].reverse().find(r=>r.name===expectedTool&&!r.error);if(!latest)return false;const data=latest.data as any;
 const rows:any[]=c.metric==='sleep_hours'?data?.points||[]:c.metric==='protein_g'?data?.series||[]:Array.isArray(data)?data:data?.items||[];
 const days=new Map<string,number>();for(const row of rows){const date=typeof row.date==='string'?row.date:typeof row.timestamp==='string'?row.timestamp.slice(0,10):null;if(!date||c.from&&date<c.from||c.to&&date>c.to)continue;let value:number|null=null;
  if(c.metric==='sleep_hours'&&typeof row.hours==='number')value=row.hours;
  if(c.metric==='weight_kg'&&row.unit==='kg'&&typeof row.value==='number')value=row.value;
  if(c.metric==='protein_g'&&row.complete===true&&typeof row.protein==='number')value=row.protein;
  if(c.metric==='soreness_0_10'){const reported=row.soreness??row.severity??row.metadata?.soreness??row.metadata?.severity;if(typeof reported==='number')value=reported;}
  if(value!==null&&Number.isFinite(value))days.set(date,value);
 }
 if(days.size<c.minimumCount)return false;const actual=[...days.values()].reduce((n,v)=>n+v,0)/days.size;
 return c.comparison==='at_least'?actual>=c.targetValue:c.comparison==='at_most'?actual<=c.targetValue:Math.abs(actual-c.targetValue)<=(c.tolerance??0);
}
