import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentRun,runSchema,type RunRepository} from './intelligence/run-contracts.js';
import {agentRequestSchema,type AgentRequest} from './intelligence/agent-contracts.js';
import {AgentReadTools} from './intelligence/agent-tools.js';
import {continueAgentRun} from '../integrations/orchestration/durable-agent.js';
import {continueBackgroundRun} from '../integrations/orchestration/background-agent.js';
import {defaultProfile} from './defaults.js';
import {emptySkinState} from './skin.js';
import {bioSchema,type BioRecord} from './biology.js';
import {deriveInterventionForecastMemories} from './intelligence/intervention-forecast.js';
import type {Dataset} from './automation-model.js';
import {strategyContext} from './intelligence/reasoning-memory.js';
import {approvalFingerprint} from './intelligence/canonical-action-policy.js';
import {HealthActionRegistry} from './intelligence/actions.js';
import {HealthStateService} from './intelligence/state.js';
import type {ActionId} from './mcp-contracts.js';

function fixture(domains:AgentRequest['policy']['domains']=['training','goals']){
 const request=agentRequestSchema.parse({requestId:'release-goal',phase:'route',question:'Review my active workout and create a consistency goal',power:'general',mode:'act',policy:{mode:'auto',domains,recordIds:[],date:'2026-10-14',research:'off'},conversation:[],toolResults:[],memories:[],attachments:[]});
 let saved=createAgentRun(request,'owner','workspace');
 const repository:RunRepository={load:async id=>{assert.equal(id,saved.id);return structuredClone(saved);},save:async(next,expected)=>{assert.equal(expected,saved.version);assert.equal(next.version,saved.version+1);saved=runSchema.parse(structuredClone(next));},list:async()=>[structuredClone(saved)]};
 const data:Dataset={userId:'owner',records:[],skin:emptySkinState(),db:{profile:defaultProfile(),meta:{},weeks:[],sessions:[],readiness:[],measurements:[],healthReadings:[],notes:[],targets:[],habits:[],habitLogs:[],goalCheckIns:[],painLogs:[],cardio:[],weeklyReviews:[],programs:[],scheduledWorkouts:[],librarySplits:[],exercises:[]}} as Dataset;
 return {request,repository,data,tools:new AgentReadTools(data,request.policy),saved:()=>saved,set:(value:typeof saved)=>{saved=structuredClone(value);}};
}
const result=(patch:Record<string,unknown>={})=>({result:{responseType:'analysis',summary:'Review current evidence before changing anything.',toolCalls:[],proposedActions:[],evidence:[],confidence:'high',needsEscalation:false,...patch},usage:[]});
const route=(domains:string[])=>({result:{intent:'review',domains,taskType:'plan',complexity:1,requiresReasoning:true,requiresTools:true,requiresResearch:false,risk:'low'},usage:[]});

test('new canonical action families execute through the actual approval registry with run-linked verified receipts and replay protection',async()=>{
 const f=fixture(['goals','sleep','training','nutrition','recovery','body','medical']),programs:any[]=[];f.data.db.weeks.push({id:'owned-week',name:'Owned week',weekNumber:1,startDate:'2026-10-14',notes:'',active:false,days:[]} as any);
 const registry=new HealthActionRegistry({actor:'owner',data:()=>f.data,state:()=>new HealthStateService().observe(f.data,'2026-10-14'),programs:{save:async p=>{const existing=programs.find(v=>v.id===p.id);if(existing){assert.deepEqual({...existing,createdAt:''},{...p,createdAt:''});return;}programs.push(p);}},training:{read:()=>null,compareAndSet:async()=>{throw Error('No workout modification requested');}},records:{read:async()=>structuredClone(f.data.records),commit:async(writes,deletes,checks)=>{assert.equal(deletes.length,0);for(const check of checks)assert.equal(f.data.records.find(r=>r.id===check.id)?.revision??null,check.revision);for(const write of writes){const old=f.data.records.find(r=>r.id===write.id);const saved=row(write.id!,'2026-10-14',{...write,revision:(old?.revision||0)+1});if(old)Object.assign(old,saved);else f.data.records.push(saved);}}}});
 const cases:[ActionId,Record<string,unknown>][]=[
  ['training.save_program',{name:'Owned program',weeks:[{weekId:'owned-week',weekNumber:1,phase:'accumulate'}]}],
  ['experiments.create',{name:'Wind-down observation',hypothesis:'A regular wind-down is associated with sleep',metric:'Sleep',start:'2026-10-14',baselineDays:3,days:3}],
  ['reports.save_period',{name:'Reviewed report',date:'2026-10-14',days:7}],
  ['reminders.create',{name:'Review consistency',date:'2026-10-20',time:'09:00',timeZone:'Asia/Kolkata'}],
  ['medical.add_note',{date:'2026-10-14',note:'My shoulder felt stiff',provenance:'model_observation'}],
  ['medical.log_symptom',{date:'2026-10-14',name:'Shoulder stiffness',severity:3,note:'After exercise',provenance:'user_reported'}],
 ];
 for(const [i,[action,fields]] of cases.entries()){
  const identity='approved-family-'+i,input={...fields,idempotencyKey:identity},receipt='receipt-'+i,context={userId:'owner',idempotencyKey:identity,approved:true,explicitlyRequested:true,runId:'release-goal'};
  const first=await registry.executeMcp(action,input,receipt,context);assert.equal(first.success,true,action);assert.equal(first.actionReceiptId,receipt);const count=f.data.records.length;
  const stored=f.data.records.find(r=>r.id==='mcp-receipt-'+receipt)!;assert.equal(stored.metadata.agentRunId,'release-goal');assert.equal(JSON.parse(String(stored.metadata.result)).verificationState,'verified');
  await registry.executeMcp(action,input,receipt,context);assert.equal(f.data.records.length,count,'Replay must not duplicate '+action);
 }
 const reminder=f.data.records.find(r=>r.metadata.intelligenceReminder===true)!;await registry.executeMcp('reminders.complete',{idempotencyKey:'complete-reminder',reminderId:reminder.id},'complete-receipt',{userId:'owner',idempotencyKey:'complete-reminder',explicitlyRequested:true,approved:true,runId:'release-goal'});assert.equal(f.data.records.find(r=>r.id===reminder.id)?.metadata.status,'completed');
 assert.equal(programs.length,1);assert.ok(f.data.records.filter(r=>r.type==='symptom'||r.name==='Personal health note').every(r=>r.metadata.reviewedClinicalFact===false));
});

test('same cloud goal resumes the exact device read on Android, approves once, and reload retains receipts',async()=>{
 const f=fixture();let calls=0,writes=0;const seen:string[]=[];
 const hooks={...f,ownerId:'owner',workspaceId:'workspace',call:async(r:AgentRequest)=>{calls++;if(r.phase==='route')return route(r.policy.domains);if(!r.toolResults.some(o=>o.name==='training.get_active_workout'))return result({responseType:'tools',toolCalls:[{name:'training.get_active_workout',arguments:{}}]});if(!r.toolResults.some(o=>o.name==='action.verify'))return result({proposedActions:[{kind:'mission',name:'Consistency',objective:'Review my consistency'}]});return result();},execute:async(p:any)=>{writes++;seen.push(p.id);return {success:true as const,actionReceiptId:'verified:'+p.id,summary:'Verified goal.',changedRecords:[{id:'goal'}]};}};
 f.set({...f.saved(),allowBackgroundReads:true,backgroundPolicy:{enabled:true,allowReads:true,allowWrites:false,medicalConsent:false,permittedDomains:['training','goals']}});
 let run=await continueBackgroundRun(f.request.requestId,'cloud-1',hooks,{prepareChanges:true});
 assert.equal(run?.status,'waiting');assert.ok(run?.pendingDeviceResponse);assert.equal(writes,0);
 const pausedId=run!.plan.steps.find(s=>s.status==='waiting_for_device')!.id,callCount=calls;
 await continueBackgroundRun(f.request.requestId,'cloud-2',hooks,{prepareChanges:true});assert.equal(calls,callCount,'Cloud does not repeatedly reason while waiting for device');
 run=await continueAgentRun(f.request.requestId,{...hooks,executorId:'android-1',executorType:'android'});
 assert.equal(run.id,f.request.requestId);assert.equal(run.status,'awaiting_approval');assert.equal(run.plan.steps.find(s=>s.id===pausedId)?.status,'completed');assert.ok(run.observations.some(o=>o.name==='training.get_active_workout'&&!o.error));assert.equal(writes,0);
 run=await continueAgentRun(run.id,{...hooks,executorId:'android-1',executorType:'android'},{proposalId:run.pendingProposal!.id,approved:true});
 assert.equal(run.status,'completed');assert.equal(writes,1);assert.equal(run.pendingDeviceResponse,undefined);assert.ok(run.plan.steps.some(s=>s.verificationIds.includes('verified:'+seen[0])));
 await continueAgentRun(run.id,{...hooks,executorId:'browser-1',executorType:'browser'});assert.equal(writes,1);assert.equal(f.saved().executorLease,undefined);
});

test('background policy overrides legacy opt-in, requires independent Medical consent and respects empty domain permissions',async()=>{
 for(const variant of ['disabled','medical','empty-domains']){const f=fixture(variant==='medical'?['medical']:['goals']);f.set({...f.saved(),allowBackgroundReads:true,...(variant==='disabled'?{backgroundPolicy:{enabled:false,allowReads:true,allowWrites:false,medicalConsent:false}}:variant==='empty-domains'?{backgroundPolicy:{enabled:true,allowReads:true,allowWrites:false,medicalConsent:false,permittedDomains:[]}}:{})});
 let calls=0;const run=await continueBackgroundRun(f.request.requestId,'cloud',{...f,ownerId:'owner',workspaceId:'workspace',call:async()=>{calls++;return result();}},{prepareChanges:true});assert.equal(run,undefined,variant);assert.equal(calls,0,variant);}
});

test('rejection is delivered to reasoning in the same durable run without a write',async()=>{
 const f=fixture(['goals']);let rejected=false;
 const hooks={...f,ownerId:'owner',workspaceId:'workspace',call:async(r:AgentRequest)=>{if(r.phase==='route')return route(['goals']);rejected=r.toolResults.some(o=>o.name==='action.rejected');return rejected?result():result({proposedActions:[{kind:'mission',name:'Consistency',objective:'Track consistency'}]});},execute:async()=>{throw Error('Rejected changes must never execute');}};
 const pending=await continueAgentRun(f.request.requestId,hooks),done=await continueAgentRun(pending.id,hooks,{proposalId:pending.pendingProposal!.id,approved:false});assert.equal(done.id,pending.id);assert.ok(rejected);assert.equal(done.counters.actions,0);assert.equal(done.plan.steps[0].status,'skipped');
});

test('even an exact persisted approval cannot recover a cloud write without explicit background write permission',async()=>{
 const f=fixture(['goals']);const hooks={...f,ownerId:'owner',workspaceId:'workspace',call:async(r:AgentRequest)=>r.phase==='route'?route(['goals']):result({proposedActions:[{kind:'mission',name:'Consistency',objective:'Track consistency'}]}),execute:async()=>{throw Error('Must not write');}};
 let run=await continueAgentRun(f.request.requestId,hooks);const p=run.pendingProposal!;
 f.set({...run,status:'executing',allowBackgroundReads:true,backgroundPolicy:{enabled:true,allowReads:true,allowWrites:false,medicalConsent:false},approval:{ownerId:'owner',proposalId:p.id,proposalFingerprint:await approvalFingerprint(p),approvedAt:new Date().toISOString()}});
 assert.equal(await continueBackgroundRun(run.id,'cloud',hooks,{prepareChanges:true,executeApproved:hooks.execute}),undefined);
});

function row(id:string,day:string,patch:Partial<BioRecord>={}):BioRecord{return bioSchema.parse({id,userId:'owner',type:'journal',domain:'Today',name:id,source:'Synthetic acceptance',timestamp:day+'T12:00:00Z',createdAt:day+'T12:00:00Z',updatedAt:day+'T12:00:00Z',deviceId:'test',quality:'manual',syncState:'saved',revision:1,metadata:{},...patch});}
test('verified poor outcome reaches final durable model context, revises matching context and preserves a materially different context',async()=>{
 const source=row('forecast-source','2026-10-01'),receipt=row('forecast-receipt','2026-10-01',{metadata:{mcpReceipt:true,action:'sleep.set_target',result:JSON.stringify({success:true})}}),proposal=row('forecast-proposal','2026-10-01',{metadata:{intelligenceAction:true,proposal:JSON.stringify({status:'executed',receiptId:receipt.id,payload:{metadata:{strategyContext:JSON.stringify({fatigue:'high',soreness:7}),predictedOutcome:JSON.stringify({metric:'sleep_hours',expectedValue:8,horizonDays:3,minimumSamples:3,confidence:.7,rationale:'Compare actual observations',sourceIds:[source.id]})}}})}});
 const history=[source,receipt,proposal,...['2026-10-02','2026-10-03','2026-10-04'].map((d,i)=>row('follow-'+i,d,{type:'sleep',domain:'Recover',value:6,unit:'hours'}))];
 assert.equal(deriveInterventionForecastMemories({userId:'owner',records:history} as Dataset,'2026-10-14')[0].value.matched,false);
 for(const different of [false,true]){const f=fixture(['sleep','recovery']);f.data.records=[...history,row('current','2026-10-14',{type:'checkIn',domain:'Recover',metadata:{energy:different?8:1,soreness:different?2:7}})];const tools=new AgentReadTools(f.data,f.request.policy);assert.equal(strategyContext(tools.state).fatigue,different?'low':'high');let supplied:AgentRequest['memories']=[];
 await continueAgentRun(f.request.requestId,{...f,tools,ownerId:'owner',workspaceId:'workspace',call:async(r:AgentRequest)=>{if(r.phase==='route')return route(['sleep','recovery']);supplied=r.memories;return result();},execute:async()=>{throw Error('No action requested');}});
 const learned=supplied.find(m=>m.sourceId.startsWith('intervention-forecast-'));assert.ok(learned,'Recomputed verified outcome must reach model input');assert.match(learned.summary,different?/different context/:/caution_revise|deprioritized/);assert.match(learned.summary,/does not establish causation|not proof of causation|subject to standard verification/);
 }
});
