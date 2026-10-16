import type {AgentToolResult} from './agent-contracts.js';
import type {GroundedClaim} from './grounding.js';
import {fingerprint} from '../automation-model.js';
export function canonicalFactLabel(path:(string|number)[],parent:any):string{
 return String(path.at(-1)==='value'?(parent?.metric||parent?.metadata?.metric||parent?.name||path.at(-2)):typeof path.at(-1)==='number'?path.at(-2):path.at(-1));
}
export function canonicalFactUnit(tool:string,path:(string|number)[],parent:any,value:unknown):string|undefined{
 if(typeof value!=='number')return undefined;const key=String(path.at(-1));
 if(Array.isArray(parent)&&key==='length')return 'count';
 if(tool==='profile.get'&&path.join('.')==='fields.height')return 'cm';
 if(tool==='profile.get_goals'&&['goalCount','targetCount'].includes(key))return 'count';
 if(tool.startsWith('sleep.')&&['hours','durationHours','targetHours','recordedShortfallHours'].includes(key))return 'hours';
 if(tool.startsWith('sleep.')&&key==='slopeHoursPerDay')return 'hours/day';
 if(tool.startsWith('nutrition.')){const metric=key==='value'?String(path.at(-2)):key;if(['calories','calorieTarget','caloriesConsumed'].includes(metric))return 'kcal';if(['protein','proteinTarget','proteinConsumed','carbs','fat','fibre','sugars','saturatedFat'].includes(metric))return 'g';if(metric==='sodium')return 'mg';}
 return key==='value'&&typeof parent?.unit==='string'&&parent.unit?parent.unit:undefined;
}
/** Exact copyable references into authorized evidence, never model-generated records. */
export function factReferences(results:AgentToolResult[],limit=160){
 const references:{sourceIds:string[];fact:NonNullable<GroundedClaim['fact']>}[]=[];
 const latest=new Map<string,AgentToolResult>();
 for(const result of results.filter(r=>!r.error))latest.set(result.name+':'+fingerprint(result.name==='action.verify'?{receiptId:(result.data as any)?.receiptId}:result.arguments||{}),result);
 for(const result of latest.values()){
  const authorized=new Set([...result.sourceIds,...(result.provenance||[]).map(p=>p.sourceId)]);
  if(!authorized.size)continue;
  function walk(value:any,path:(string|number)[],parent:any,sourceIds:string[]){
   if(references.length>=limit||path.length>20)return;
   if(value!==null&&typeof value==='object'){
    if(Array.isArray(value)&&references.length<limit)references.push({sourceIds,fact:{tool:result.name,path:[...path,'length'],value:value.length,label:'length',unit:'count'}});
    const ownId=typeof value.id==='string'&&authorized.has(value.id)?value.id:undefined;
    const explicit=Array.isArray(value.sourceIds)?value.sourceIds.filter((id:unknown)=>typeof id==='string'&&authorized.has(id)):[];
    const ids=ownId?[ownId]:explicit.length?explicit.slice(0,30):sourceIds;
    for(const [key,child] of Object.entries(value))if(!['__proto__','constructor','prototype'].includes(key))walk(child,[...path,Array.isArray(value)?Number(key):key],value,ids);
   }else if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||typeof value==='string'&&value.length<=500){
    if(!path.length)return;
    const label=canonicalFactLabel(path,parent),date=parent?.date||parent?.timestamp?.slice(0,10),unit=canonicalFactUnit(result.name,path,parent,value);
    references.push({sourceIds,fact:{tool:result.name,path,value,label,...(unit?{unit}:{}),...(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?{date}:{})}});
   }
  }
  // The canonical claim contract accepts at most 30 IDs. Keep a calculated
  // snapshot reference first when an aggregate has many underlying records.
  walk(result.data,[],undefined,[...new Set([...(result.provenance||[]).filter(p=>p.kind==='calculated').map(p=>p.sourceId),...authorized])].slice(0,30));
 }
 return references;
}
