import { useRef, useState } from 'react';
import { useBiologicalData } from './use-biological-data';
import { useToast } from '../components/Toast';
import { useQuickLog } from '../components/QuickLog';
import { atTime, scaleNutrition, type TimelineEvent } from '../../shared/biological-intelligence';
import { routineActions, type RoutineAction } from '../../shared/biological-automations';
import { dateOf, type BioRecord } from '../../shared/biology';
import type { BioInput } from '../state/SupabaseBiologyContext';

export function useTimelineActions(){
  const {app,bio,stored}=useBiologicalData(),toast=useToast(),quick=useQuickLog(),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const lock=useRef(false);
  const run=async(id:string,fn:()=>Promise<void>)=>{if(lock.current)return false;lock.current=true;setBusy(id);setError('');try{await fn();return true;}catch(e){setError((e as Error).message);toast.push((e as Error).message,'err');return false;}finally{lock.current=false;setBusy('');}};
  const care=async(ids:string[],date:string,status:'done'|'skipped')=>{
    const data=app.skin.care;const remaining=data.events.filter(e=>!(ids.includes(e.taskId)&&e.date===date));
    await app.api.saveCareData({...data,events:[...remaining,...ids.map(taskId=>({id:crypto.randomUUID(),taskId,date,status,note:'',createdAt:new Date().toISOString()}))]});await app.refreshSkin();
  };
  const perform=async(event:TimelineEvent,status:'done'|'skipped'='done')=>run(event.id,async()=>{
    const date=dateOf(event.timestamp),r=event.record,time=new Date(event.timestamp).toTimeString().slice(0,5),timestamp=date===dateOf(new Date().toISOString())?undefined:event.timestamp;
    if(event.type==='careTask'&&event.targetId){await care([event.targetId],date,status);toast.push(status==='done'?'Care action completed':'Care action skipped','ok');return;}
    if(r&&['supplement','medication'].includes(event.type)){await bio.save({id:`dose-${r.id}-${date}-${time}`,type:'dose',domain:'Health',name:r.name,source:'Health OS adherence',timestamp,metadata:{parentId:r.id,status:status==='done'?'Taken':'Skipped',scheduledTime:time,dose:r.metadata.dose||r.metadata.serving||'',unit:r.metadata.unit||r.unit}});toast.push(`${r.name} ${status==='done'?'taken':'skipped'}`,'ok');return;}
    if(event.type==='habit'&&r){await bio.save({id:`habit-${r.id}-${date}`,type:'habitDone',domain:r.domain,name:r.name,timestamp,metadata:{parentId:r.id,status}});toast.push('Habit completed','ok');return;}
    if(event.type==='mealPlan'&&r){const source=stored.find(s=>s.id===r.metadata.recipeId);if(!source)throw new Error('Choose a saved meal for this plan first.');await bio.save({id:`planned-meal-${r.id}-${date}`,type:'meal',domain:'Eat',name:source.name,timestamp,source:source.source,quality:source.quality,metadata:{...scaleNutrition(source.metadata,Number(r.metadata.portions)||1),meal:r.metadata.meal||'Lunch',planId:r.id,completeDay:false}});toast.push(`${source.name} logged`,'ok');return;}
    if(event.type==='automation'&&r){
      if(r.metadata.action==='routine'&&r.metadata.routineId){app.setPage('Nudges');return;}
      const kind=r.metadata.action==='checkIn'?'checkIn':r.metadata.action==='sleep'?'sleep':r.metadata.action==='meal'?'meal':r.metadata.action==='weight'?'vital':r.metadata.action==='water'?'water':'journal';quick.open(kind,undefined,date,kind==='vital'?{metric:'Weight'}:undefined);return;
    }
    app.setPage(event.page);
  });
  const dismiss=async(eventId:string,minutes?:number)=>run(eventId,()=>bio.save({type:'automationEvent',domain:'Today',name:minutes?'Reminder snoozed':'Reminder dismissed',metadata:{eventId,status:minutes?'snoozed':'dismissed',until:minutes?new Date(Date.now()+minutes*60000).toISOString():''}}));
  const completeRoutine=async(record:BioRecord,selected?:RoutineAction[])=>run(record.id,async()=>{
    const actions=selected||routineActions(record),date=dateOf(new Date().toISOString()),inputs:BioInput[]=[],careIds:string[]=[];
    const originalActions=routineActions(record);
    for(let i=0;i<actions.length;i++){
      const action=actions[i],originalIndex=originalActions.findIndex(a=>JSON.stringify(a)===JSON.stringify(action)),id=`routine-${record.id}-${date}-${originalIndex>=0?originalIndex:i}`;
      if(stored.some(r=>r.id===id))continue;
      if(action.type==='care'){careIds.push(action.recordId);continue;}
      if(action.type==='water'){inputs.push({id,type:'water',domain:'Eat',name:'Water',value:action.amount,unit:'mL',metadata:{routineId:record.id}});continue;}
      const source=stored.find(r=>r.id===action.recordId);if(!source)throw new Error('A linked routine item was removed. Edit the routine first.');
      if(action.type==='meal')inputs.push({id,type:'meal',domain:'Eat',name:source.name,source:source.source,quality:source.quality,metadata:{...scaleNutrition(source.metadata,action.servings),routineId:record.id,completeDay:false}});
      if(action.type==='habit')inputs.push({id,type:'habitDone',domain:source.domain,name:source.name,metadata:{parentId:source.id,routineId:record.id}});
      if(action.type==='dose')inputs.push({id:`dose-${source.id}-${date}-${String(source.metadata.time||'09:00')}`,type:'dose',domain:'Health',name:source.name,metadata:{parentId:source.id,status:'Taken',routineId:record.id,scheduledTime:String(source.metadata.time||'09:00')}});
    }
    // Validate every referenced action before making writes. Repeated runs use stable IDs.
    if(careIds.length)await care(careIds,date,'done');
    inputs.push({id:`routine-completed-${record.id}-${date}`,type:'automationEvent',domain:'Today',name:`${record.name} complete`,metadata:{parentId:record.id,status:'done',routine:true}});
    await bio.saveMany(inputs);toast.push(`${record.name} completed`,'ok');
  });
  return {busy,error,perform,dismiss,completeRoutine,care,run};
}
