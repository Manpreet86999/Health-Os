import { dateOf, type BioRecord } from '../../shared/biology';
import type { BioInput } from '../state/SupabaseBiologyContext';

export interface HealthValue { metric:string; value:number; unit:string; timestamp:string; origin:string; sourceId:string; metadata:Record<string,string|number|boolean|null> }
export interface HealthSnapshot { values:HealthValue[]; coverage:string[]; errors:string[]; from:string; to:string; syncedAt:string; zone:string; permissions:string[] }
const units:Record<string,string>={Steps:'steps',Sleep:'h',HRV:'ms','Resting HR':'bpm','Heart Rate':'bpm',Oxygen:'%',Weight:'kg','Active Calories':'kcal'};
const comparable=(metadata:BioRecord['metadata'])=>JSON.stringify(Object.entries(metadata).sort(([a],[b])=>a.localeCompare(b)));
export const healthConnectId=(metric:string,stamp:string)=>`health-connect:${metric.replace(/ /g,'-').toLowerCase()}:${dateOf(stamp)}`;
export function healthConnectChanges(snapshot:HealthSnapshot,existing:BioRecord[]) {
  const writes:BioInput[]=[],seen=new Set<string>(),byId=new Map(existing.map(row=>[row.id,row]));
  for(const point of snapshot.values){
    if(units[point.metric]!==point.unit||!Number.isFinite(point.value)||point.value<0||!Number.isFinite(Date.parse(point.timestamp)))throw new Error('Health Connect returned an invalid measurement.');
    if(point.metric==='Steps'&&!Number.isSafeInteger(point.value)||point.metric==='Sleep'&&point.value>24||point.metric==='Oxygen'&&point.value>100)throw new Error('Health Connect returned an out-of-range measurement.');
    const id=healthConnectId(point.metric,point.timestamp);seen.add(id);
    const old=byId.get(id),metadata={...point.metadata,metric:point.metric,healthConnect:true,origin:point.origin,zone:snapshot.zone};
    if(old?.deletedAt&&old.metadata.healthConnectRemoved!==true)continue; // Preserve explicit user deletions; allow a provider-deleted total to return.
    const daily=['Steps','Active Calories'].includes(point.metric);
    if(old&&old.value===point.value&&old.unit===point.unit&&old.sourceId===point.sourceId&&(daily||old.timestamp===point.timestamp)&&comparable(old.metadata)===comparable(metadata))continue;
    writes.push({id,type:point.metric==='Sleep'?'sleep':'vital',domain:point.metric==='Sleep'?'Recover':point.metric==='Weight'?'Body':'Health',name:point.metric==='Sleep'?'Main sleep · Health Connect':point.metric,timestamp:point.timestamp,value:point.value,unit:point.unit,source:'Health Connect',sourceId:point.sourceId,quality:'measured',metadata});
  }
  // Provider corrections/deletions remove only rows in successfully read categories and time ranges.
  const removals=existing.filter(row=>!row.deletedAt&&row.metadata.healthConnect===true&&!seen.has(row.id)&&snapshot.coverage.includes(String(row.metadata.metric))&&row.timestamp>=snapshot.from&&row.timestamp<=snapshot.to);
  return {writes,removals};
}
