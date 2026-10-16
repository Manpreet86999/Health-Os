import {executeHealthAction} from '../../shared/health-action-registry';
import {actionDefinitions,safeError,type ActionId} from '../../shared/mcp-contracts';
import {HealthStateService} from '../../shared/intelligence/state';
import type {HealthData} from '../../shared/intelligence/contracts';
const service=new HealthStateService();
self.onmessage=async event=>{
 const {id,action,input,data}=event.data as {id:string;action:ActionId;input:unknown;data:HealthData};
 try{
  if(!actionDefinitions[action]||actionDefinitions[action].risk!=='R0')throw new Error('This worker only reads your saved context.');
  const denied=async()=>{throw new Error('Read-only executor');};
  const result=await executeHealthAction(action,input,{dataset:data,readRecords:async()=>data.records.filter(r=>r.userId===data.userId),commit:denied,saveMany:denied,readWorkout:()=>data.activeWorkout as any,saveWorkout:denied,finishWorkout:denied,weightUnit:data.db.profile.units,getState:date=>service.observe(data,date)},id);
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,result:safeError(error)});}
};
