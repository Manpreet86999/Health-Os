import {z} from 'zod';
import {executeHealthAction} from '../health-action-registry.js';
import {actionDefinitions,McpDomainError,type ActionId} from '../mcp-contracts.js';
import type {TrackerState} from '../../client/lib/types.js';
import {fingerprint} from '../automation-model.js';
import {live,dateOf,bioSchema,type BioRecord} from '../biology.js';
import {recordFood,recalculate,confidenceDecision,serializeItems,sumNutrition} from '../food-intelligence.js';
import {adaptTrainingSession} from '../training-adaptation.js';
import type {PlannedExercise} from '../types.js';
import {owned,json,recordHash,intelligencePreferences,type RecordService,type RecordInput,type RecordExpectation,type HealthData} from './contracts.js';
import type {CurrentHealthState} from './state.js';
import type {SkinState,CareData} from '../skin.js';
import {validateAgentCareProposal,careFingerprint,careContentFingerprint} from './care-safety.js';
import {careTaskSchema} from './agent-contracts.js';
export const actionResultSchema=z.object({success:z.literal(true),data:z.unknown().optional(),actionReceiptId:z.string().optional(),summary:z.string().max(1000),changedRecords:z.array(z.object({id:z.string()})),warnings:z.array(z.string()),requiresUserAttention:z.boolean(),undoable:z.boolean()});
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Choose a real date'),id=z.string().min(1).max(150),text=z.string().min(1).max(4000),meal=z.enum(['Breakfast','Lunch','Dinner','Snacks']);
const dated=z.object({date:day.optional()}).strict();
function definition<I extends z.ZodType>(schema:I,risk:'R0'|'R1'|'R2'|'R3',description:string){return {schema,outputSchema:actionResultSchema,risk,description,version:1,undoable:risk!=='R0'&&risk!=='R3',idempotent:true,requiresApproval:risk==='R2'||risk==='R3',authorization:'authenticated account owner',verification:risk==='R0'?'authorized state read':'read after write',preconditions:['owner matches current account','input passes runtime schema','expected revisions match']};}
export const healthActionCatalog={
 'care.apply_routine':definition(z.object({expectedCareFingerprint:z.string().min(1),proposal:z.object({reason:z.string().min(1).max(500),tasks:z.array(careTaskSchema.passthrough()).min(1).max(30),baseRevision:z.number().int().nonnegative(),baseUpdatedAt:z.string()}).strict()}).strict(),'R2','Apply a reviewed model routine through the existing Care revision service'),
 'health.get_current_state':definition(dated,'R0','Read the authorized current health state'),
 'nutrition.get_today':definition(dated,'R0','Read recorded nutrition and saved targets'),
 'nutrition.get_targets':definition(dated,'R0','Read saved nutrition targets'),
 'nutrition.plan_recipe_as_meal':definition(z.object({recipeId:id,date:day,meal,portions:z.number().positive().max(20).default(1)}).strict(),'R2','Plan a saved recipe without logging consumption'),
 'nutrition.confirm_planned_meal':definition(z.object({planId:id}).strict(),'R1','Explicitly confirm consumption through Food Intelligence'),
 'training.get_today':definition(dated,'R0','Read the prescribed session'),
 'training.get_recent_load':definition(dated,'R0','Read completed working load'),
 'training.propose_adaptation':definition(dated,'R0','Preview a conservative today-only adaptation'),
 'training.apply_today_adaptation':definition(z.object({date:day,expectedWorkoutFingerprint:z.string(),expectedStateFingerprint:z.string()}).strict(),'R2','Apply a reviewed today-only draft adaptation'),
 'training.replace_today_workout':definition(z.object({date:day,expectedWorkoutFingerprint:z.string(),expectedStateFingerprint:z.string(),exercises:z.array(z.object({name:z.string().min(1),target:z.string(),vol:z.string().min(1),exerciseId:z.string().optional(),rirTarget:z.number().min(0).max(5).optional(),restSec:z.number().min(0).max(600).optional()}).passthrough()).min(1).max(30)}).strict(),'R2','Replace today’s planned draft without creating performed sets'),
 'recovery.get_current':definition(dated,'R0','Read recorded recovery signals'),
 'recovery.log_soreness':definition(z.object({date:day,region:text,severity:z.number().min(0).max(10)}).strict(),'R1','Log an explicitly reported soreness observation'),
 'recovery.add_note':definition(z.object({date:day,note:text}).strict(),'R1','Save an explicitly requested recovery note'),
 'recovery.create_plan':definition(z.object({date:day,note:text}).strict(),'R2','Save a reviewed recovery plan'),
 'body.get_current':definition(dated,'R0','Read recorded body observations'),
 'body.get_weight_trend':definition(dated,'R0','Read recorded weight trend'),
 'body.log_weight':definition(z.object({date:day,weight:z.number().positive().max(700),unit:z.enum(['kg','lb'])}).strict(),'R1','Record an explicitly supplied weight'),
 'body.log_measurements':definition(z.object({date:day,waist:z.number().positive().max(400),unit:z.literal('cm')}).strict(),'R1','Record an explicitly supplied waist measurement'),
 'sleep.get_latest':definition(dated,'R0','Read recorded sleep'),
 'sleep.get_trends':definition(dated,'R0','Read the personal recorded sleep baseline'),
 'sleep.set_target':definition(z.object({hours:z.number().min(3).max(14)}).strict(),'R2','Change a reviewed personal sleep target'),
 'goals.get_active':definition(dated,'R0','Read active goals'),
 'goals.create':definition(z.object({name:z.string().min(1).max(250),objective:text}).strict(),'R2','Create a reviewed mission'),
 'goals.update':definition(z.object({goalId:id,name:z.string().min(1).max(250),status:z.enum(['active','completed','archived'])}).strict(),'R2','Update a reviewed saved goal'),
 'medical.get_context':definition(dated,'R0','Read recorded observations; no diagnosis or treatment'),
 'medical.add_note':definition(z.object({date:day,note:text}).strict(),'R1','Record an explicitly requested health note'),
 'medical.log_symptom':definition(z.object({date:day,name:z.string().min(1).max(250),severity:z.number().min(0).max(10),note:text.optional()}).strict(),'R1','Record an explicitly supplied symptom'),
 'intelligence.reset_memory':definition(z.object({}).strict(),'R3','Remove learned patterns and restart observation history'),
} as const;
export type HealthActionId=keyof typeof healthActionCatalog;
export interface ExecutionContext {runId?:string;userId:string;idempotencyKey:string;approved?:boolean;explicitlyRequested?:boolean;expectedSources?:RecordExpectation[];}
export interface ActionReceipt {id:string;userId:string;actionId:HealthActionId;version:1;risk:string;status:'pending'|'executed'|'undoing'|'undone'|'failed';inputHash:string;summary:string;changedIds:string[];before:BioRecord[];after:RecordExpectation[];writeRevisions?:Record<string,number>;intendedWrites?:RecordInput[];workoutBefore?:unknown;workoutAfter?:unknown;careBefore?:CareData;careAfter?:CareData;createdAt:string;verifiedAt?:string;undoable:boolean;error?:string;}
export interface ActionResult {success:true;data?:unknown;actionReceiptId?:string;summary:string;changedRecords:{id:string}[];warnings:string[];requiresUserAttention:boolean;undoable:boolean;}
export interface TrainingService {read:()=>unknown;compareAndSet:(expected:string,next:unknown)=>Promise<void>;finish?:(draft:TrackerState)=>Promise<{id:string}>;}
export interface RegistryServices {programs?:{save:(program:import('../types.js').Program)=>Promise<void>};actor:string;records:RecordService;data:()=>HealthData;state:(date?:string)=>CurrentHealthState;training:TrainingService;care?:{read:()=>Promise<SkinState>;compareAndSet:(expected:string,next:CareData)=>Promise<void>};}
const receiptRow=(r:ActionReceipt):RecordInput=>({id:r.id,type:'journal',domain:'Insights',name:r.summary.slice(0,250),source:'Health OS Action Registry',metadata:{intelligenceReceipt:true,action:r.actionId,status:r.status,receipt:json(r)}});
const receiptSchema=z.object({id:z.string(),userId:z.string(),actionId:z.enum(Object.keys(healthActionCatalog) as [HealthActionId,...HealthActionId[]]),version:z.literal(1),risk:z.enum(['R0','R1','R2','R3']),status:z.enum(['pending','executed','undoing','undone','failed']),inputHash:z.string(),summary:z.string(),changedIds:z.array(z.string()),before:z.array(bioSchema),after:z.array(z.object({id:z.string(),revision:z.number().int().nullable(),fingerprint:z.string().optional()})),writeRevisions:z.record(z.string(),z.number().int()).optional(),intendedWrites:z.array(z.unknown()).optional(),workoutBefore:z.unknown().optional(),workoutAfter:z.unknown().optional(),careBefore:z.unknown().optional(),careAfter:z.unknown().optional(),createdAt:z.string(),verifiedAt:z.string().optional(),undoable:z.boolean(),error:z.string().optional()});
export function readReceipt(row:BioRecord|undefined):ActionReceipt|null{try{const r=receiptSchema.parse(JSON.parse(String(row?.metadata.receipt))) as ActionReceipt;return r.id===row?.id&&r.userId===row?.userId&&r.before.every(b=>b.userId===r.userId&&r.changedIds.includes(b.id))&&r.after.every(a=>r.changedIds.includes(a.id))?r:null;}catch{return null;}}
const expectation=(r:BioRecord):RecordExpectation=>({id:r.id,revision:r.revision,fingerprint:recordHash(r)});
const inputOf=(r:BioRecord):RecordInput=>({id:r.id,type:r.type,domain:r.domain,name:r.name,value:r.value,unit:r.unit,timestamp:r.timestamp,source:r.source,quality:r.quality,metadata:r.metadata});
/** All entry points call the same validated services. Model output is never a write authority. */
export class HealthActionRegistry {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private services:RegistryServices){}
 /** MCP adapters use this same registry and its account-authorized domain services. */
 executeMcp(action:ActionId,input:unknown,receiptId:string,context:ExecutionContext):Promise<unknown>{
  const task=this.queue.catch(()=>{}).then(async()=>{
   const s=this.services,def=actionDefinitions[action];
   if(!def)throw new McpDomainError('NOT_FOUND','Unknown action.');
   if(context.userId!==s.actor||s.data().userId!==s.actor)throw new McpDomainError('PERMISSION_DENIED','Account changed.');
   if(def.risk==='R1'&&!context.explicitlyRequested)throw new McpDomainError('PERMISSION_DENIED','An explicit request is required.');
   if(['R2','R3'].includes(def.risk)&&!context.approved)throw new McpDomainError('CONFIRMATION_REQUIRED','Approve this change in Health OS.');
   if(def.risk!=='R0'&&!intelligencePreferences(owned(s.data().records,s.actor)).flags.intelligence_action_registry)throw new McpDomainError('PERMISSION_DENIED','Health actions are disabled in Intelligence settings.');
   const parsed=def.schema.parse(input),inputHash=fingerprint([action,parsed]);
   const before=owned(await s.records.read(),s.actor);for(const source of context.expectedSources||[]){const row=before.find(r=>r.id===source.id&&!r.deletedAt);if(!row||row.revision!==source.revision||source.fingerprint&&recordHash(row)!==source.fingerprint)throw new McpDomainError('CONFLICT','Approved evidence changed. Review a fresh proposal.');}
   const previous=before.find(r=>r.id==='mcp-receipt-'+receiptId);if(previous&&(previous.metadata.action!==action||previous.metadata.canonicalInputHash&&previous.metadata.canonicalInputHash!==inputHash))throw new McpDomainError('CONFLICT','This action identity already belongs to different approved inputs.');
   const checkedCommit:RecordService['commit']=(writes,deletes,checks)=>{const merged=new Map(checks.map(c=>[c.id,c]));for(const source of context.expectedSources||[]){const old=merged.get(source.id);if(old&&old.revision!==source.revision)throw new McpDomainError('CONFLICT','Approved source revisions disagree.');merged.set(source.id,source);}return s.records.commit(writes.map(row=>row.id==='mcp-receipt-'+receiptId&&row.metadata?.mcpReceipt===true?{...row,metadata:{...row.metadata,canonicalInputHash:inputHash,...(context.runId?{agentRunId:context.runId}:{})}}:row),deletes,[...merged.values()]);};
   return executeHealthAction(action,input,{runId:context.runId,saveProgram:s.programs?.save,dataset:s.data(),readRecords:s.records.read,commit:checkedCommit,saveMany:async(rows)=>{
    const records=owned(await s.records.read(),s.actor);await checkedCommit(rows,[],rows.map(row=>{const existing=records.find(r=>r.id===row.id);return existing?expectation(existing):{id:row.id,revision:null};}));
   },readWorkout:()=>s.training.read() as TrackerState|null,saveWorkout:(expected,next)=>s.training.compareAndSet(expected,next),finishWorkout:s.training.finish,weightUnit:s.data().db.profile.units,getState:date=>s.state(date)},receiptId);
  });this.queue=task;return task;
 }
 execute<A extends HealthActionId>(actionId:A,input:z.input<(typeof healthActionCatalog)[A]['schema']>,context:ExecutionContext):Promise<ActionResult>{const task=this.queue.catch(()=>{}).then(()=>this.perform(actionId,input,context));this.queue=task;return task;}
 private async perform(actionId:HealthActionId,raw:unknown,context:ExecutionContext):Promise<ActionResult>{
  const s=this.services,def=healthActionCatalog[actionId];if(!def)throw new Error('Unknown health action.');if(context.userId!==s.actor||['anonymous','guest','local-user',''].includes(s.actor)||s.data().userId!==s.actor)throw new Error('An authorized account is required.');
  const input=def.schema.parse(raw) as Record<string,any>,date=input.date||s.state().date,state=s.state(date);if(state.userId!==s.actor)throw new Error('State owner mismatch.');
  if(def.risk!=='R0'&&!intelligencePreferences(owned(s.data().records,s.actor)).flags.intelligence_action_registry)throw new Error('Health actions are disabled in Intelligence settings.');
  if(def.risk==='R0'){const domain=actionId.split('.')[0];const data=actionId==='training.propose_adaptation'?this.previewTraining(state):domain==='health'?state:domain==='nutrition'?state.nutrition:domain==='training'?state.training:domain==='body'?state.body:domain==='recovery'?state.recovery:domain==='sleep'?state.sleep:domain==='goals'?state.goals:state.medical;return actionResultSchema.parse({success:true,data,summary:'Read recorded context.',changedRecords:[],warnings:[],requiresUserAttention:false,undoable:false});}
  if(def.risk==='R1'&&!context.explicitlyRequested)throw new Error('This observation must be explicitly requested.');
  if((def.risk==='R2'||def.risk==='R3')&&!context.approved)throw new Error('Explicit approval is required.');
  if(actionId==='care.apply_routine')return this.performCare(input,context);
  id.parse(context.idempotencyKey);const receiptId=`health-action-${fingerprint([s.actor,context.idempotencyKey])}`,inputHash=fingerprint([actionId,input]);let records=owned(await s.records.read(),s.actor),oldRow=records.find(r=>r.id===receiptId),existing=readReceipt(oldRow);
  if(existing){if(existing.inputHash!==inputHash)throw new Error('An idempotency key cannot be reused for another action.');if(existing.status==='executed'||existing.status==='undone')return this.result(existing);if(existing.status==='failed')throw new Error(existing.error||'The previous attempt requires review.');}
  if(existing&&existing.workoutAfter===undefined){for(const intended of existing.intendedWrites||[]){const actual=records.find(r=>r.id===intended.id&&!r.deletedAt),before=existing.before.find(r=>r.id===intended.id);if(!actual||fingerprint(actual.metadata)!==fingerprint(intended.metadata||{})||actual.type!==intended.type||actual.name!==intended.name||actual.value!==intended.value||actual.unit!==(intended.unit||'')||actual.revision!==(existing.writeRevisions?.[intended.id!]??(before?.revision||0)+1))throw new Error('The interrupted action’s result changed. Review its records.');}existing.after=records.filter(r=>existing!.changedIds.includes(r.id)).map(expectation);existing.status='executed';existing.verifiedAt=new Date().toISOString();await s.records.commit([receiptRow(existing)],[],[expectation(oldRow!)]);return this.result(existing);}
  const writes:RecordInput[]=[],deletes:RecordExpectation[]=[],checks:RecordExpectation[]=[...(context.expectedSources||[])],stamp=date+'T12:00:00Z',resultId=`health-result-${fingerprint([s.actor,context.idempotencyKey])}`;
  const source=(sourceId:string,type?:string)=>{const row=records.find(r=>r.id===sourceId&&!r.deletedAt);if(!row||(type&&row.type!==type))throw new Error('The source record is unavailable.');checks.push(expectation(row));return row;};
  const write=(row:RecordInput)=>{const previous=records.find(r=>r.id===row.id);checks.push(previous?expectation(previous):{id:row.id!,revision:null});writes.push(row);};
  let workoutBefore:unknown,workoutAfter:unknown;
  if(actionId==='training.apply_today_adaptation'||actionId==='training.replace_today_workout'){
   if(date!==dateOf(new Date().toISOString()))throw new Error('Workout adaptation is limited to today.');
   if(state.fingerprint!==input.expectedStateFingerprint&&!existing)throw new Error('Your health context changed. Review a fresh adaptation.');
   workoutBefore=existing?existing.workoutBefore:s.training.read();const current=s.training.read();
   if(existing?.workoutAfter){workoutAfter=existing.workoutAfter;if(fingerprint(current)!==fingerprint(workoutBefore)&&fingerprint(current)!==fingerprint(workoutAfter))throw new Error('Your workout changed after the interrupted action.');}
   else{
    if(fingerprint(current)!==input.expectedWorkoutFingerprint)throw new Error('Your workout changed. Review a fresh adaptation.');
    const draft=current as {logs?:unknown[];date?:string;exercises?:PlannedExercise[];currentEntry?:{completedSets?:number[];completedRecords?:Record<string,unknown>}}|null;if(draft?.logs?.length||draft?.currentEntry?.completedSets?.length||Object.keys(draft?.currentEntry?.completedRecords||{}).length)throw new Error('A session with performed sets cannot be replaced.');if(draft&&draft.date!==date)throw new Error('Finish or discard the older workout first.');
    const preview=this.previewTraining(state),exercises=actionId==='training.replace_today_workout'?input.exercises:preview.proposed;
    if(!exercises.length)throw new Error('No suitable session could be prepared.');
    const plan=state.training.nextWorkout;workoutAfter={...(current as object||{}),id:(current as any)?.id||`workout-${fingerprint(receiptId)}`,date,weekId:plan.weekId,weekName:plan.weekName,weekNumber:plan.weekNumber,dayKey:plan.dayKey,dayTitle:plan.dayTitle,name:plan.dayTitle,index:0,logs:[],exercises,plannedExercises:plan.original,sleep:state.sleep.duration.value??'',soreness:state.recovery.soreness.value??'',preparationChoice:'adapted'};
    delete (workoutAfter as Record<string,unknown>).currentEntry;delete (workoutAfter as Record<string,unknown>).restTimer;
   }
  }else if(actionId==='nutrition.plan_recipe_as_meal'){const recipe=source(input.recipeId,'recipe');write({id:resultId,type:'mealPlan',domain:'Eat',name:recipe.name,timestamp:stamp,metadata:{date,meal:input.meal,recipeId:recipe.id,portions:input.portions,time:'20:00',intelligenceActionId:context.idempotencyKey}});}
  else if(actionId==='nutrition.confirm_planned_meal'){
   const plan=source(input.planId,'mealPlan');if(plan.metadata.confirmed===true)throw new Error('This plan is already confirmed.');const recipe=source(String(plan.metadata.recipeId),'recipe'),food=recordFood(recipe),item=recalculate({id:resultId,name:recipe.name,foodId:food.id,food,amount:Number(plan.metadata.portions)||1,unit:'serving',identityConfidence:1,portionConfidence:1,confirmed:true,alternatives:[],snapshot:{},profile:null});if(confidenceDecision(item).blockingFields.length)throw new Error('Review the food profile and portion in Eat first.');
   write({id:resultId,type:'meal',domain:'Eat',name:recipe.name,timestamp:String(plan.metadata.date)+'T12:00:00Z',source:'Health OS Food Intelligence',metadata:{...sumNutrition([item.snapshot]),meal:plan.metadata.meal,foodItems:serializeItems([item]),foodId:food.id,confirmedPlanId:plan.id,captureModality:'intelligence'}});write({...inputOf(plan),metadata:{...plan.metadata,confirmed:true,mealId:resultId}});
  }else if(actionId==='recovery.log_soreness')write({id:resultId,type:'recoveryNote',domain:'Recover',name:`Soreness: ${input.region}`.slice(0,250),timestamp:stamp,metadata:{region:input.region,severity:input.severity,date}});
  else if(actionId==='recovery.add_note'||actionId==='recovery.create_plan')write({id:resultId,type:'recoveryNote',domain:'Recover',name:actionId==='recovery.create_plan'?'Intelligence recovery plan':'Recovery note',timestamp:stamp,metadata:{date,notes:input.note,category:actionId==='recovery.create_plan'?'plan':'note',intelligencePlan:actionId==='recovery.create_plan'}});
  else if(actionId==='body.log_weight')write({id:resultId,type:'vital',domain:'Body',name:'Weight',timestamp:stamp,value:input.weight,unit:input.unit,metadata:{metric:'Weight'}});
  else if(actionId==='body.log_measurements')write({id:resultId,type:'bodyMeasurement',domain:'Body',name:'Waist measurement',timestamp:stamp,unit:input.unit,metadata:{waist:input.waist}});
  else if(actionId==='sleep.set_target'){const old=live(records).filter(r=>r.type==='sleepPreference').sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];write({id:old?.id||resultId,type:'sleepPreference',domain:'Recover',name:'Sleep target',metadata:{...old?.metadata,hours:input.hours,target:input.hours}});}
  else if(actionId==='goals.create')write({id:resultId,type:'goal',domain:'Today',name:input.name,metadata:{objective:input.objective,intelligenceMission:true,status:'active',startDate:date}});
  else if(actionId==='goals.update'){const goal=source(input.goalId,'goal');write({...inputOf(goal),name:input.name,metadata:{...goal.metadata,status:input.status}});}
  else if(actionId==='medical.add_note')write({id:resultId,type:'journal',domain:'Health',name:'Health note',timestamp:stamp,metadata:{notes:input.note,category:'clinical_observation'}});
  else if(actionId==='medical.log_symptom')write({id:resultId,type:'symptom',domain:'Health',name:input.name,timestamp:stamp,metadata:{severity:input.severity,notes:input.note||'',resolved:false}});
  else if(actionId==='intelligence.reset_memory'){deletes.push(...live(records).filter(r=>r.metadata.intelligenceMemory===true).map(expectation));const old=records.find(r=>r.id==='health-os-intelligence-settings');write({id:'health-os-intelligence-settings',type:'nudgePreference',domain:'Insights',name:'Intelligence preferences',metadata:{...old?.metadata,learnSince:new Date().toISOString()}});}
  else throw new Error('This action has no installed service.');
  const receipt:ActionReceipt=existing||{id:receiptId,userId:s.actor,actionId,version:1,risk:def.risk,status:'pending',inputHash,summary:workoutAfter!==undefined?'Updated today’s workout draft':`Saved ${writes[0]?.name||'learned memory reset'}.`,changedIds:[...writes.map(r=>r.id!),...deletes.map(r=>r.id)],before:def.undoable?records.filter(r=>writes.some(w=>w.id===r.id)||deletes.some(d=>d.id===r.id)):[],after:[],intendedWrites:writes,writeRevisions:Object.fromEntries(writes.map(w=>[w.id!,(records.find(r=>r.id===w.id)?.revision||0)+1])),createdAt:new Date().toISOString(),undoable:def.undoable,...(workoutAfter===undefined?{}:{workoutBefore,workoutAfter})};
  if(!existing){const receiptCheck={id:receiptId,revision:null};await s.records.commit([...writes,receiptRow(receipt)],deletes,[...checks,receiptCheck]);}
  if(workoutAfter!==undefined&&fingerprint(s.training.read())!==fingerprint(workoutAfter))await s.training.compareAndSet(fingerprint(workoutBefore),workoutAfter);
  records=owned(await s.records.read(),s.actor);for(const row of writes){const actual=records.find(r=>r.id===row.id&&!r.deletedAt),prior=checks.find(c=>c.id===row.id);if(!actual||actual.type!==row.type||actual.name!==row.name||actual.value!==row.value||actual.unit!==(row.unit||'')||actual.revision!==(prior?.revision||0)+1||fingerprint(actual.metadata)!==fingerprint(row.metadata||{}))throw new Error('The action result could not be verified.');}
  if(workoutAfter!==undefined&&fingerprint(s.training.read())!==fingerprint(workoutAfter))throw new Error('Workout verification failed.');
  const currentReceipt=records.find(r=>r.id===receiptId)!;receipt.after=records.filter(r=>receipt.changedIds.includes(r.id)).map(expectation);receipt.status='executed';receipt.verifiedAt=new Date().toISOString();await s.records.commit([receiptRow(receipt)],[],[expectation(currentReceipt),...receipt.after]);return this.result(receipt);
 }
 previewTraining(state=this.services.state()){const current=this.services.training.read() as {exercises?:PlannedExercise[]}|null;return adaptTrainingSession(current?.exercises||state.training.nextWorkout.original,this.services.data().db.exercises,{recoveryReduced:true});}
 private result(receipt:ActionReceipt):ActionResult{return actionResultSchema.parse({success:true,actionReceiptId:receipt.id,summary:receipt.summary,changedRecords:receipt.changedIds.map(id=>({id})),warnings:[],requiresUserAttention:false,undoable:receipt.undoable&&receipt.status==='executed'});}
 private async performCare(input:Record<string,any>,context:ExecutionContext):Promise<ActionResult>{
  const s=this.services,care=s.care;if(!care)throw new Error('Care service is unavailable.');id.parse(context.idempotencyKey);
  const receiptId=`health-action-${fingerprint([s.actor,context.idempotencyKey])}`,inputHash=fingerprint(['care.apply_routine',input]);
  let records=owned(await s.records.read(),s.actor),row=records.find(r=>r.id===receiptId),receipt=readReceipt(row);
  if(receipt&&receipt.inputHash!==inputHash)throw new Error('An idempotency key cannot be reused.');
  if(receipt&&['executed','undone'].includes(receipt.status))return this.result(receipt);
  const skin=await care.read();
  if(!receipt){
   if(careFingerprint(skin.care)!==input.expectedCareFingerprint||input.proposal.baseRevision!==skin.care.revision||input.proposal.baseUpdatedAt!==skin.care.updatedAt)throw new Error('Care changed. Review a fresh routine.');
   const proposal=validateAgentCareProposal(input.proposal,skin,dateOf(new Date().toISOString()));
   if(proposal.tasks.some(t=>{const p=skin.products.find(p=>p.id===t.productId);return p?.expiresAt&&p.expiresAt<dateOf(new Date().toISOString());}))throw new Error('Expired products cannot be scheduled.');
   const next={...skin.care,tasks:proposal.tasks,planHistory:[...skin.care.planHistory,{id:crypto.randomUUID(),createdAt:new Date().toISOString(),reason:proposal.reason,tasks:proposal.tasks}]};
   receipt={id:receiptId,userId:s.actor,actionId:'care.apply_routine',version:1,risk:'R2',status:'pending',inputHash,summary:'Updated the reviewed Care routine',changedIds:[],before:[],after:[],careBefore:skin.care,careAfter:next,createdAt:new Date().toISOString(),undoable:true};
   await s.records.commit([receiptRow(receipt)],[],[{id:receiptId,revision:null},...(context.expectedSources||[])]);
  }
  if(!receipt.careBefore||!receipt.careAfter)throw new Error('Care receipt is incomplete.');
  const content=careContentFingerprint;
  if(content(skin.care)!==content(receipt.careAfter)){
   if(careFingerprint(skin.care)!==careFingerprint(receipt.careBefore))throw new Error('Care changed during an interrupted save.');
   await care.compareAndSet(careFingerprint(skin.care),receipt.careAfter);
  }
  const actual=(await care.read()).care;if(actual.revision!==receipt.careBefore.revision+1||content(actual)!==content(receipt.careAfter))throw new Error('Care verification failed.');
  records=owned(await s.records.read(),s.actor);row=records.find(r=>r.id===receiptId);receipt={...receipt,careAfter:actual,status:'executed',verifiedAt:new Date().toISOString()};
  await s.records.commit([receiptRow(receipt)],[],[expectation(row!)]);return this.result(receipt);
 }
 undo(receiptId:string,context:Pick<ExecutionContext,'userId'|'approved'>):Promise<ActionResult>{const task=this.queue.catch(()=>{}).then(async()=>{
  const s=this.services;if(context.userId!==s.actor||!context.approved||s.data().userId!==s.actor)throw new Error('Approve Undo in the owning account.');let records=owned(await s.records.read(),s.actor),row=records.find(r=>r.id===receiptId),receipt=readReceipt(row);if(!receipt||!receipt.undoable||!['executed','undoing'].includes(receipt.status)||!receipt.verifiedAt)throw new Error('This action is not available to undo.');
  if(receipt.careAfter){
   if(!s.care||!receipt.careBefore)throw new Error('Care Undo is unavailable.');
   const careBefore=receipt.careBefore;
   const current=(await s.care.read()).care,content=(v:CareData)=>fingerprint({...v,revision:0,updatedAt:''});
   const alreadyRestored=receipt.status==='undoing'&&content(current)===content(receipt.careBefore);
   if(!alreadyRestored&&careFingerprint(current)!==careFingerprint(receipt.careAfter))throw new Error('Care changed after this action. Undo will not overwrite it.');
   if(receipt.status==='executed'){receipt={...receipt,status:'undoing'};await s.records.commit([receiptRow(receipt)],[],[expectation(row!)]);row=(await s.records.read()).find(r=>r.id===receiptId);}
   if(!alreadyRestored)await s.care.compareAndSet(careFingerprint(current),{...careBefore,revision:current.revision,updatedAt:current.updatedAt});
   if(content((await s.care.read()).care)!==content(careBefore))throw new Error('Care Undo verification failed.');
  }
  if(receipt.workoutAfter!==undefined){const alreadyRestored=receipt.status==='undoing'&&fingerprint(s.training.read())===fingerprint(receipt.workoutBefore??null);if(!alreadyRestored&&fingerprint(s.training.read())!==fingerprint(receipt.workoutAfter))throw new Error('Your workout changed after this action. Undo will not overwrite it.');if(receipt.status==='executed'){receipt={...receipt,status:'undoing'};await s.records.commit([receiptRow(receipt)],[],[expectation(row!),...receipt.after]);row=(await s.records.read()).find(r=>r.id===receiptId);}if(!alreadyRestored)await s.training.compareAndSet(fingerprint(receipt.workoutAfter),receipt.workoutBefore??null);}
  const writes=receipt.before.map(inputOf),deletes=receipt.after.filter(r=>!receipt!.before.some(b=>b.id===r.id));receipt={...receipt,status:'undone'};await s.records.commit([...writes,receiptRow(receipt)],deletes,[...receipt.after,expectation(row!)]);
  records=owned(await s.records.read(),s.actor);if(readReceipt(records.find(r=>r.id===receiptId))?.status!=='undone'||deletes.some(d=>!records.find(r=>r.id===d.id)?.deletedAt)||writes.some(w=>fingerprint(records.find(r=>r.id===w.id)?.metadata)!==fingerprint(w.metadata)))throw new Error('Undo verification failed.');return this.result(receipt);
 });this.queue=task;return task;}
}
