import {dailyNutrition} from './biology.js';
import {executeActionFamily} from './intelligence/action-family-execution.js';
import type {Program} from './types.js';
import { actionDefinitions, McpDomainError,responseSchema, type ActionId } from './mcp-contracts.js';
import type {z} from 'zod';
import type { Dataset } from './automation-model.js';
import { intelligenceSnapshot } from './agentic-intelligence.js';
import { live, dateOf, num, type BioRecord } from './biology.js';
import { dailyMetric, preparedWorkout } from './automation-rules.js';
import { weightTrend } from './biological-intelligence.js';
import { personalFoods, resolveCandidates, parseLocalText, storedItems, recalculate, confidenceDecision, sumNutrition, serializeItems } from './food-intelligence.js';
import type { TrackerState } from '../client/lib/types.js';
import { fingerprint } from './automation-model.js';
import { parseWorkoutSet } from './workout-entry.js';
import { adaptWorkoutExercises } from './workout-adaptation.js';
import type { CurrentHealthState } from './intelligence/state.js';
import { recordHash,type RecordService } from './intelligence/contracts.js';
import {readExpandedAction,writeExpandedAction,nonMedicalPeriod} from './mcp-expanded-actions.js';
import {logFromPlan} from './workout-entry.js';
import {readAliases} from './mcp-read-aliases.js';
import {predictHealth} from './intelligence/prediction.js';
import {HealthStateService} from './intelligence/state.js';
import {intelligenceReadDefinitions,type IntelligenceReadId} from './intelligence/read-contracts.js';
import {executeIntelligenceRead} from './intelligence/read-execution.js';

export type ActionRecord={id:string;type:BioRecord['type'];domain:BioRecord['domain'];name:string;timestamp?:string;value?:number;unit?:string;source?:string;metadata:BioRecord['metadata']};
export interface HealthActionServices {runId?:string;saveProgram?:(program:Program)=>Promise<void>;dataset:Dataset;readRecords():Promise<BioRecord[]>;saveMany(rows:ActionRecord[]):Promise<void>;commit?:RecordService['commit'];readWorkout?:()=>TrackerState|null;saveWorkout?:(expected:string,draft:TrackerState|null)=>Promise<void>;finishWorkout?:(draft:TrackerState)=>Promise<{id:string}>;weightUnit?:string;getState?:(date:string)=>CurrentHealthState;today?:string;hour?:number;}
/** Shared action entry: storage and event dispatch belong to the existing application service. */
export async function executeHealthAction(id:ActionId,raw:unknown,services:HealthActionServices,receiptId:string):Promise<z.infer<typeof responseSchema>>{
  const input=actionDefinitions[id].schema.parse(raw) as any;
  const data=services.dataset,records=live(await services.readRecords()).filter(r=>r.userId===data.userId);
  const date=input.date||services.today||dateOf(new Date().toISOString());
  if(id in intelligenceReadDefinitions&&id!=='nutrition.get_history'){const result=executeIntelligenceRead(id as IntelligenceReadId,input,{...data,records},date);return {success:true,data:result.data,warnings:result.coverage.truncated?['Requested observations were truncated; narrow the window or increase the bounded limit.']:[]};}
  if(id in readAliases)return executeHealthAction(readAliases[id as keyof typeof readAliases],input,services,receiptId);
  if(['body.get_current','training.get_recent_load','recovery.get_soreness','sleep.get_baseline','intelligence.get_predictions'].includes(id)){
    const state=services.getState?.(date)||new HealthStateService().observe({...data,records},date);
    const value=id==='body.get_current'?state.body:id==='training.get_recent_load'?{recentLoad:state.training.recentLoad,loadChange:state.training.loadChange,muscleRecovery:state.training.muscleRecovery}:id==='recovery.get_soreness'?{soreness:state.recovery.soreness,regionalSoreness:state.recovery.regionalSoreness}:id==='sleep.get_baseline'?{baseline:state.sleep.baseline,duration:state.sleep.duration,debt:state.sleep.debt}:predictHealth(state,[],services.hour).filter(p=>p.domain!=='medical'&&p.domain!=='care').map(p=>({type:p.type,domain:p.domain,horizon:p.horizon,expectedOutcome:p.expectedOutcome,confidence:p.confidence,evidence:p.evidence,expiresAt:p.expiresAt}));
    return {success:true,data:value};
  }
  if(id==='nutrition.get_remaining_targets'){const result=await executeHealthAction('nutrition.get_today',{date},services,receiptId);const value=(result as any).data;return {success:true,data:{...value,remaining:Object.fromEntries(['calories','protein','carbs','fat'].map(k=>[k,typeof value.target?.[k]==='number'&&typeof value.totals?.[k]==='number'?Math.max(0,value.target[k]-value.totals[k]):null])),coverage:'Recorded intake only; unlogged meals remain unknown.'}};}
  const expandedRead=readExpandedAction(id,input,services,records,date);if(expandedRead!==undefined)return responseSchema.parse(expandedRead);
  const snapshot=()=>intelligenceSnapshot({...data,records},date);
  // Never send timeline, notes, medication reminders or raw evidence through broad health scopes.
  const compact=()=>{const s=snapshot(),canonical=services.getState?.(date);return {date,metrics:canonical?s.metrics.map((m,i)=>({...m,value:[canonical.readiness.score,canonical.sleep.duration,canonical.nutrition.proteinConsumed,canonical.readiness.energy][i].value})):s.metrics,baselines:s.context.baselines,training:s.context.training,...(canonical?{soreness:canonical.recovery.soreness.value}:{} )};};
  if(id==='health.get_current_state'||id==='intelligence.get_current_state')return {success:true,data:compact()};
  if(id==='health.get_today')return {success:true,data:compact()};
  if(id==='health.get_priorities'){const s=snapshot();return {success:true,data:{date,metrics:s.metrics,priorities:s.priorities.filter(p=>p.id!=='medication').map(p=>({recommendation:p.recommendation,why:p.why,confidence:p.confidence}))}};}
  if(id==='health.get_context'){const allowed=/protein|nutrition|food/i.test(input.purpose)?['Protein','Calories']: /weight|body/i.test(input.purpose)?['Weight']:['Sleep','Resting HR','Energy','Stress'];const report=nonMedicalPeriod(services,records,date,Number(input.timeRange.replace('d','')));const evidence=allowed.map(metric=>{const points=report.series.flatMap(row=>{const value=(row as Record<string,unknown>)[metric];return typeof value==='number'?[{date:row.date,value}]:[];});return {metric,samples:points.length,average:points.length?points.reduce((n,p)=>n+p.value,0)/points.length:null,points};});return {success:true,data:{purpose:input.purpose,timeRange:input.timeRange,from:report.from,to:report.to,evidence,confidence:'limited',interpretation:'Recorded associations do not establish causes.',baselineWindow:input.timeRange}};}
  if(id==='intelligence.analyze_period'){
    return {success:true,data:nonMedicalPeriod(services,records,date,input.days)};
  }
  if(id==='medical.get_recent_symptoms')return {success:true,data:records.filter(r=>r.type==='symptom').sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,input.limit).map(r=>({id:r.id,name:r.name,timestamp:r.timestamp,severity:r.metadata.severity})),warnings:['Recorded observations are not diagnoses. Discuss concerning symptoms with a clinician.']};
  if(id==='nutrition.get_today')return {success:true,data:{date,totals:dailyNutrition(records,date),target:records.filter(r=>r.type==='nutritionTarget').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.metadata??null,coverage:'Daily totals override historical meal sums. Missing values remain unknown.'}};
  if(id==='nutrition.get_usual_meals')return {success:true,data:records.filter(r=>r.type==='routine'&&r.metadata.subtype==='foodTemplate').map(r=>({id:r.id,name:r.name,meal:r.metadata.meal}))};
  if(id==='training.get_today')return {success:true,data:preparedWorkout({...data,records},date,dailyMetric({...data,records},'Readiness',date).value)};
  if(id==='training.get_active_workout'||id==='training.create_adaptation_plan'){
    const t=services.readWorkout?.();if(!t)return {success:true,data:null};
    const stateToken=fingerprint(t),preview={workoutId:t.id,date:t.date,currentExercise:t.exercises[t.index]?.name,stateToken,expiresAt:Date.now()+600000};
    if(id==='training.create_adaptation_plan'){
      if(t.index!==0||t.logs.length||t.currentEntry?.completedSets?.length)throw new McpDomainError('DOMAIN_REJECTED','Adapt before your first set.');
      return {success:true,data:{...preview,proposedChanges:adaptWorkoutExercises(t.exercises).map((e,i)=>({exercise:e.name,before:t.exercises[i].vol,after:e.vol,rir:e.rirTarget})),impact:'Current workout only; one fewer set and one additional RIR.',riskLevel:'R2'}};
    }
    return {success:true,data:{...preview,exerciseIndex:t.index,readyToFinish:t.index>=t.exercises.length,exercises:t.exercises.map(e=>({name:e.name,prescription:e.vol,trackingMode:e.trackingMode||'weight_reps'})),completedSetNumbers:t.currentEntry?.completedSets?.map(n=>n+1)||[],completedSets:Object.values(t.currentEntry?.completedRecords||{}),loggedExercises:t.logs.map(l=>({name:l.name,status:l.status,sets:l.sets}))}};
  }
  if(id==='recovery.get_current')return {success:true,data:{date,metrics:['Sleep','Energy','Soreness'].map(metric=>({metric,...dailyMetric({...data,records},metric,date)})),reportedSoreness:records.filter(r=>r.type==='recoveryNote'&&dateOf(r.timestamp)===date&&typeof r.metadata.severity==='number').map(r=>({region:r.metadata.region,severity:r.metadata.severity}))}};
  if(id==='sleep.get_latest'){const r=records.filter(r=>r.type==='sleep').sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];return {success:true,data:r?{id:r.id,revision:r.revision,timestamp:r.timestamp,value:r.value,unit:r.unit}:null};}
  if(id==='body.get_weight_trend')return {success:true,data:weightTrend(records,date)};
  if(id==='goals.get_active')return {success:true,data:records.filter(r=>r.type==='goal'&&!['archived','completed','cancelled'].includes(String(r.metadata.status))).map(r=>({id:r.id,revision:r.revision,name:r.name,target:r.metadata.target,metric:r.metadata.metric,direction:r.metadata.direction,windowDays:r.metadata.windowDays,status:r.metadata.status}))};
  const recordId=`mcp-result-${receiptId}`,auditId=`mcp-receipt-${receiptId}`;
  const existing=records.find(r=>r.id===auditId);
  if(existing){
    if(id==='training.finish_workout'&&services.saveWorkout){const current=services.readWorkout?.();if(current?.id===input.workoutId&&fingerprint(current)===existing.metadata.workoutFingerprint)await services.saveWorkout(fingerprint(current),null);}
    return JSON.parse(String(existing.metadata.result));
  }
  const familyWrite=await executeActionFamily(id,input,services,records,receiptId);if(familyWrite!==undefined)return responseSchema.parse(familyWrite);
  const expandedWrite=await writeExpandedAction(id,input,services,records,date,receiptId);if(expandedWrite!==undefined)return responseSchema.parse(expandedWrite);
  if(id==='health.undo_action'){
    const receipt=records.find(r=>r.id===`mcp-receipt-${input.receiptId}`&&r.metadata.mcpReceipt===true);
    if(!receipt||receipt.metadata.undone===true||!services.commit)throw new McpDomainError('DOMAIN_REJECTED','This action is unavailable to undo.');
    const original=JSON.parse(String(receipt.metadata.result)),changed=records.find(r=>r.id===original.changedRecords?.[0]?.id);
    if(!original.undoable||!changed||changed.revision!==1||fingerprint({type:changed.type,name:changed.name,value:changed.value,unit:changed.unit,metadata:changed.metadata})!==receipt.metadata.recordFingerprint)throw new McpDomainError('CONFLICT','This record changed after the action. Undo will not overwrite it.');
    const result={success:true,actionReceiptId:receiptId,summary:`Undid ${changed.name}.`,changedRecords:[{id:changed.id,type:changed.type}],warnings:[],requiresUserAttention:false,undoable:false};
    await services.commit([{...receipt,metadata:{...receipt.metadata,undone:true}},{id:auditId,type:'journal',domain:'Today',name:'MCP undo receipt',metadata:{mcpReceipt:true,action:id,result:JSON.stringify(result)}}],[{id:changed.id,revision:changed.revision,fingerprint:recordHash(changed)}],[{id:receipt.id,revision:receipt.revision,fingerprint:recordHash(receipt)},{id:auditId,revision:null}]);
    return result;
  }
  if(id.startsWith('training.')){
    const current=services.readWorkout?.();
    if(!services.saveWorkout)throw new McpDomainError('UPSTREAM_UNAVAILABLE','Open Train in Health OS.',true);
    if(id==='training.finish_workout'){
      if(!current||current.id!==input.workoutId)throw new McpDomainError('CONFLICT','This workout is no longer active.');
      if(current.index<current.exercises.length||current.currentEntry?.completedSets?.length)throw new McpDomainError('DOMAIN_REJECTED','Complete or explicitly skip each exercise before finishing.');
      if(!current.logs.some(l=>l.status==='completed'&&l.sets.length))throw new McpDomainError('DOMAIN_REJECTED','Log at least one performed set before saving a workout.');
      if(!services.finishWorkout)throw new McpDomainError('UPSTREAM_UNAVAILABLE','The session service is unavailable.',true);
      const saved=await services.finishWorkout(current);
      const result={success:true,actionReceiptId:receiptId,summary:'Workout saved in Health OS.',changedRecords:[{id:saved.id,type:'session'}],warnings:[],requiresUserAttention:false,undoable:false};
      await services.saveMany([{id:auditId,type:'journal',domain:'Today',name:'MCP action receipt',metadata:{mcpReceipt:true,action:id,result:JSON.stringify(result),workoutFingerprint:fingerprint(current)}}]);
      try{if(services.readWorkout?.())await services.saveWorkout(fingerprint(current),null);}catch(e){if(services.readWorkout?.())throw e;}return result;
    }
    const prior=current?.mcpResults?.[receiptId];
    if(prior){await services.saveMany([{id:auditId,type:'journal',domain:'Today',name:'MCP action receipt',metadata:{mcpReceipt:true,action:id,result:JSON.stringify(prior)}}]);return prior;}
    let next:TrackerState;
    if(id==='training.start_workout'||id==='training.start_custom_workout'){
      if(current)throw new McpDomainError('CONFLICT','A workout is already active.');
      const plan=preparedWorkout({...data,records},date,dailyMetric({...data,records},'Readiness',date).value);
      if(id==='training.start_workout'&&(!plan.weekId||!plan.dayKey||!plan.original.length))throw new McpDomainError('DOMAIN_REJECTED','No planned workout exists for today.');
      const custom=id==='training.start_custom_workout',exercises=custom?input.exercises.map((e:any)=>({name:e.name,target:e.target,vol:`${e.sets} x ${e.trackingMode==='time'?e.seconds:e.reps}`,trackingMode:e.trackingMode,rirTarget:e.rirTarget,restSec:e.restSec})):plan.original;
      next={id:recordId,weekId:plan.weekId||data.db.meta.activeWeekId||'custom',weekName:plan.weekName||'',weekNumber:plan.weekNumber||1,dayKey:plan.dayKey||['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()],dayTitle:custom?input.name:plan.dayTitle||'Workout',date,name:custom?input.name:plan.dayTitle||'Workout',sleep:'',soreness:'',index:0,logs:[],exercises,plannedExercises:plan.original,preparationChoice:custom?'customized':'original',startedAt:new Date().toISOString()};
    }else{
      if(!current||current.id!==input.workoutId)throw new McpDomainError('CONFLICT','This workout is no longer active.');
      next=structuredClone(current);
      if(id==='training.replace_exercises'){
        if(fingerprint(current)!==input.stateToken)throw new McpDomainError('STALE_PLAN','The workout changed. Read a fresh state token.');
        if(current.index!==0||current.logs.length||current.currentEntry?.completedSets?.length)throw new McpDomainError('DOMAIN_REJECTED','Replace exercises before the first set.');
        next.exercises=input.exercises.map((e:any)=>({name:e.name,target:e.target,vol:`${e.sets} x ${e.trackingMode==='time'?e.seconds:e.reps}`,trackingMode:e.trackingMode,rirTarget:e.rirTarget,restSec:e.restSec}));next.preparationChoice='customized';next.currentEntry=undefined;
      }else if(id==='training.apply_adaptation_plan'){
        if(input.expiresAt<Date.now()||input.expiresAt>Date.now()+600000)throw new McpDomainError('PENDING_ACTION_EXPIRED','Create a fresh adaptation plan.');
        if(fingerprint(current)!==input.stateToken)throw new McpDomainError('STALE_PLAN','The workout changed. Create a fresh plan.');
        if(current.index!==0||current.logs.length||current.currentEntry?.completedSets?.length)throw new McpDomainError('DOMAIN_REJECTED','Adapt before the first set.');
        next.exercises=adaptWorkoutExercises(current.exercises);next.preparationChoice='adapted';next.currentEntry=undefined;
      }else if(id==='training.next_exercise'){
        const ex=current.exercises[current.index];if(!ex||ex.name.toLowerCase()!==input.exercise.toLowerCase())throw new McpDomainError('CONFLICT','This is not the current exercise.');
        const completed=Object.values(current.currentEntry?.completedRecords||{}).sort((a,b)=>a.s-b.s);
        if(input.skip&&completed.length)throw new McpDomainError('DOMAIN_REJECTED','An exercise with completed sets cannot be skipped.');
        if(!input.skip&&!completed.length)throw new McpDomainError('DOMAIN_REJECTED','Log a set or explicitly request to skip this exercise.');
        const log=logFromPlan(ex.name,ex);delete log.journal;log.status=input.skip?'skipped':'completed';log.sets=completed;
        next.logs.push(log);next.index++;next.currentEntry=undefined;next.restTimer=undefined;
      }else if(id==='training.log_set'||id==='training.log_timed_set'||id==='training.log_reps_set'){
        const ex=current.exercises[current.index];if(!ex||ex.name.toLowerCase()!==input.exercise.toLowerCase())throw new McpDomainError('CONFLICT','Select this exercise in the active workout first.');
        const mode:'time'|'weight_reps'|'reps'=id==='training.log_timed_set'?'time':id==='training.log_reps_set'?'reps':'weight_reps';
        if(id==='training.log_set'&&input.unit!==(services.weightUnit||'kg'))throw new McpDomainError('INVALID_INPUT','Use your configured workout weight unit.');
        if((ex.trackingMode||'weight_reps')!==mode)throw new McpDomainError('DOMAIN_REJECTED','Use the matching tool for this exercise’s tracking mode.');
        const n=input.setNumber-1,key=`${current.id}:${current.index}:${ex.name}`,count=Math.max(input.setNumber,Number(/^\d+/.exec(ex.vol)?.[0])||3);
        const entry=current.currentEntry?.key===key?structuredClone(current.currentEntry):{key,weights:Array(count).fill(''),reps:Array(count).fill(''),durations:Array(count).fill(''),rpes:Array(count).fill(''),rirs:Array(count).fill(''),setTypes:Array(count).fill('work'),sides:Array(count).fill('both'),journal:'',trackingMode:mode,completedSets:[] as number[],completedRecords:{}};
        if(entry.completedSets?.includes(n))throw new McpDomainError('CONFLICT','This set is already completed. Edit it in Train.');
        const set=parseWorkoutSet({s:input.setNumber,w:input.weight,r:input.reps,durationSec:input.seconds,rir:input.rir,rpe:input.rpe,type:'work',side:'both'},mode);
        for(const field of ['weights','reps','durations','rpes','rirs','setTypes','sides'] as const)while(entry[field].length<count)entry[field].push(field==='setTypes'?'work':field==='sides'?'both':'');
        entry.weights[n]=String(input.weight??'');entry.reps[n]=String(input.reps??'');entry.durations[n]=String(input.seconds??'');entry.rirs[n]=String(input.rir??'');entry.rpes[n]=String(input.rpe??'');entry.completedSets=[...(entry.completedSets||[]),n];entry.completedRecords={...entry.completedRecords,[n]:set};next.currentEntry=entry;
      }else throw new McpDomainError('NOT_FOUND','Unknown training action.');
    }
    const summary=id==='training.log_set'?`Logged ${input.exercise}: ${input.weight} ${input.unit} × ${input.reps}.`:id==='training.log_timed_set'?`Logged ${input.exercise}: ${input.seconds} seconds.`:id==='training.log_reps_set'?`Logged ${input.exercise}: ${input.reps} repetitions.`:id==='training.next_exercise'?'Saved the exercise and advanced.':id==='training.start_workout'?'Started today’s workout.':id==='training.start_custom_workout'?'Started your approved custom workout.':id==='training.replace_exercises'?'Applied your approved exercise plan.':'Applied the reviewed lighter workout.';
    const result={success:true,actionReceiptId:receiptId,summary,changedRecords:[{id:next.id!,type:'workout_draft'}],warnings:['Saved in the active workout draft. Finish the session to save workout history.'],requiresUserAttention:false,undoable:false};
    next.mcpRevision=receiptId;next.mcpResults={...next.mcpResults,[receiptId]:result};
    await services.saveWorkout(fingerprint(current||null),next);
    await services.saveMany([{id:auditId,type:'journal',domain:'Today',name:'MCP action receipt',metadata:{mcpReceipt:true,action:id,result:JSON.stringify(result)}}]);
    return result;
  }
  const timestamp=`${date}T12:00:00${-new Date().getTimezoneOffset()>=0?'+':'-'}${String(Math.floor(Math.abs(new Date().getTimezoneOffset())/60)).padStart(2,'0')}:${String(Math.abs(new Date().getTimezoneOffset())%60).padStart(2,'0')}`;
  let row:ActionRecord;
  if(id==='body.log_weight')row={id:recordId,type:'vital',domain:'Body',name:'Weight',value:input.weight,unit:input.unit,timestamp,metadata:{metric:'Weight'}};
  else if(id==='recovery.log_soreness')row={id:recordId,type:'recoveryNote',domain:'Recover',name:`Soreness: ${input.area}`,timestamp,metadata:{region:input.area,severity:input.severity,date}};
  else if(id==='sleep.set_target')row={id:recordId,type:'sleepPreference',domain:'Recover',name:'Sleep target',metadata:{hours:input.hours,target:input.hours}};
  else if(id==='nutrition.log_usual_meal'||id==='nutrition.log_natural_language'){
    const template=records.find(r=>r.id===input.templateId&&r.type==='routine'&&r.metadata.subtype==='foodTemplate');
    let items=id==='nutrition.log_usual_meal'?(template?storedItems(template):[]):resolveCandidates(parseLocalText(input.text),personalFoods(records),records,input.meal);
    items=items.map(recalculate);
    if(!items.length||items.some(i=>i.error||confidenceDecision(i).blockingFields.length))throw new McpDomainError('DOMAIN_REJECTED','Review the food identity and portion in Eat before logging.');
    row={id:recordId,type:'meal',domain:'Eat',name:items.map(i=>i.name).join(' · ').slice(0,250),timestamp,source:'Health OS Food Intelligence',metadata:{...sumNutrition(items.map(i=>i.snapshot)),meal:input.meal,foodItems:serializeItems(items),captureModality:'mcp',completeDay:false}};
  }else throw new McpDomainError('NOT_FOUND','Unknown action.');
  const result={success:true,actionReceiptId:receiptId,summary:`Saved ${row.name}.`,changedRecords:[{id:row.id,type:row.type}],warnings:[],requiresUserAttention:false,undoable:id!=='sleep.set_target'};
  // The existing saveMany transaction atomically persists the domain record and receipt to the local outbox.
  await services.saveMany([{...row,source:row.source||'Health OS MCP'}, {id:auditId,type:'journal',domain:'Today',name:'MCP action receipt',metadata:{mcpReceipt:true,action:id,result:JSON.stringify(result),recordFingerprint:fingerprint({type:row.type,name:row.name,value:row.value,unit:row.unit||'',metadata:row.metadata})}}]);
  return result;
}
