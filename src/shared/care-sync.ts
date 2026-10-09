import { emptyCareData,type CareData } from './skin.js';
import type { SyncEntityType,SyncRecord } from './sync.js';

const collections={careGoal:'goals',careTask:'tasks',careEvent:'events',careCheckIn:'checkIns',careReview:'reviews',carePlanVersion:'planHistory'} as const;
export const CARE_SYNC_TYPES=['careSettings',...Object.keys(collections)] as const;
export function careRecords(care:CareData,deviceId:string):SyncRecord[]{
  const fallback=care.updatedAt||new Date(0).toISOString(),make=(entityType:SyncEntityType,id:string,payload:object,updatedAt=fallback):SyncRecord=>({id,entityType,payload,updatedAt,createdAt:updatedAt,revision:Math.max(1,care.revision||1),deviceId,workspace:'care',payloadVersion:1});
  const records:SyncRecord[]=[make('careSettings','care-settings',{id:'care-settings',version:care.version,revision:care.revision,onboardingComplete:care.onboardingComplete,commitment:care.commitment,updatedAt:care.updatedAt})];
  for(const [entityType,key] of Object.entries(collections) as [keyof typeof collections,keyof CareData][]){for(const [index,item] of (care[key] as Array<{id:string;createdAt?:string}>).entries())records.push(make(entityType,item.id,entityType==='careTask'?{...item,order:index}:item,item.createdAt||fallback));}
  return records;
}
export function careFromRecords(records:SyncRecord[],legacy?:CareData):CareData{
  const care=structuredClone(legacy||emptyCareData()),live=records.filter(record=>!record.deletedAt);
  const settings=live.find(record=>record.entityType==='careSettings')?.payload as Partial<CareData>|undefined;
  if(settings){care.version=1;care.revision=Number(settings.revision)||0;care.onboardingComplete=Boolean(settings.onboardingComplete);care.commitment={...care.commitment,...settings.commitment};care.updatedAt=String(settings.updatedAt||care.updatedAt);}
  for(const [entityType,key] of Object.entries(collections) as [keyof typeof collections,keyof CareData][])(care[key] as unknown[])=live.filter(record=>record.entityType===entityType).map(record=>record.payload);
  care.tasks=care.tasks.map((task,index)=>({task,index})).sort((a,b)=>(a.task.order??a.index)-(b.task.order??b.index)).map(({task})=>task);
  return care;
}
