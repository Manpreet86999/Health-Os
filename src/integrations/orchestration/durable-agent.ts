import {dayInZone} from '../../shared/mcp-execution.js';
import {agentNarrative} from '../../shared/intelligence/agent-narrative.js';
import {approvalFingerprint} from '../../shared/intelligence/canonical-action-policy.js';
import type {AgentRequest,AgentModelResponse,AgentToolResult,AgentStep} from '../../shared/intelligence/agent-contracts.js';
import {routeSchema,reasoningSchema} from '../../shared/intelligence/agent-contracts.js';
import {runSchema,buildExecutorLease,renewExecutorLease,type AgentRun,type RunRepository,type PlanStep,type ExecutorType} from '../../shared/intelligence/run-contracts.js';
import {ContextPolicyEngine} from '../../shared/intelligence/context-policy.js';
import {AgentReadTools} from '../../shared/intelligence/agent-tools.js';
import {verifyGroundedResponse,assessUrgentSafety,renderGroundedAnswer} from '../../shared/intelligence/grounding.js';
import type {AgentProposal} from '../../shared/agentic-intelligence.js';
import {fingerprint} from '../../shared/automation-model.js';
import {planContext,compressContext} from '../../shared/intelligence/context-planner.js';
import {modelFeedback} from '../../shared/intelligence/model-feedback.js';
import {unmetGoalCriteria,readyGoalStep,addRequiredRead,preservesCompletedGoalSteps} from '../../shared/intelligence/goal-plan.js';
import {permittedTools} from '../../shared/intelligence/agent-tools.js';
import {negotiateCapability,DEFAULT_EXECUTOR_CAPABILITIES,type ExecutorCapability} from '../../shared/intelligence/parity-contracts.js';
import {reasoningMemories,strategyContext} from '../../shared/intelligence/reasoning-memory.js';
export interface DurableAgentHooks {
 onCheckpoint?:(run:AgentRun)=>void;
 repository:RunRepository;ownerId:string;workspaceId:string;executorId?:string;executorType?:ExecutorType;capabilities?:ExecutorCapability[];backgroundReadOnly?:boolean;maxRoundsPerContinuation?:number;resumeApprovedActions?:boolean;
 tools:AgentReadTools;call:(request:AgentRequest)=>Promise<AgentModelResponse>;
 execute:(proposal:AgentProposal)=>Promise<{success:true;actionReceiptId:string;summary:string;changedRecords:{id:string}[]}>;
 prepare?:(proposal:AgentProposal)=>Promise<AgentProposal>;
 prepareAction?:(action:AgentStep['proposedActions'][number],id:string)=>Promise<AgentProposal>;
 observeAfterAction?:()=>Promise<AgentReadTools>;
}
/** Persist before every side effect; resume an ambiguous write with the same action ID. */
export async function continueAgentRun(runId:string,hooks:DurableAgentHooks,decision?:{proposalId:string;approved:boolean}):Promise<AgentRun>{
 // Claim the same CAS-protected run for interactive executors before any side effect.
 let claimed=false;
 if(hooks.executorId){
  const current=runSchema.parse(await hooks.repository.load(runId));
  if(current.ownerId!==hooks.ownerId||current.workspaceId!==hooks.workspaceId)throw new Error('This run belongs to another account or workspace.');
  if(current.executorLease&&Date.parse(current.executorLease.expiresAt)>Date.now()&&current.executorLease.id!==hooks.executorId)throw new Error('This run is already continuing on another executor.');
  if(!current.executorLease||Date.parse(current.executorLease.expiresAt)<=Date.now()){
   await hooks.repository.save({...current,version:current.version+1,executorLease:buildExecutorLease({id:hooks.executorId,executorType:hooks.executorType||'browser',ownerId:hooks.ownerId}),updatedAt:new Date().toISOString()},current.version);claimed=true;
  }
 }
 try{return await continueOwnedRun(runId,hooks,decision);}finally{
  if(claimed){const latest=await hooks.repository.load(runId);if(latest&&latest.executorLease?.id===hooks.executorId)await hooks.repository.save({...latest,version:latest.version+1,executorLease:undefined,updatedAt:new Date().toISOString()},latest.version);}
 }
}
async function continueOwnedRun(runId:string,hooks:DurableAgentHooks,decision?:{proposalId:string;approved:boolean}):Promise<AgentRun>{
 let run=runSchema.parse(await hooks.repository.load(runId));
 if(run.ownerId!==hooks.ownerId||run.workspaceId!==hooks.workspaceId)throw new Error('This run belongs to another account or workspace.');
 if(run.executorLease&&Date.parse(run.executorLease.expiresAt)>Date.now()&&run.executorLease.id!==hooks.executorId)throw new Error('This run is already continuing on another executor.');
 if(['completed','cancelled','failed'].includes(run.status))return run;
 if(run.waitUntil&&Date.parse(run.waitUntil)>Date.now())return run;if(run.waitUntil){const observationDate=dayInZone(new Date().toISOString(),run.timeZone||'Asia/Kolkata');run.originalPolicyDate??=run.request.policy.date;if(observationDate>run.request.policy.date){run.stageStart={...run.counters,usageIndex:run.usage.length};run.request.policy.date=observationDate;hooks.tools.advanceDate(observationDate);}}run.waitUntil=undefined;
 let tools=hooks.tools;const began=Date.now(),initialRounds=run.counters.rounds;
 const save=async(status:AgentRun['status'])=>{const old=run.version;const lease=run.executorLease?renewExecutorLease(run.executorLease):undefined;run={...run,status,version:old+1,executorLease:lease,updatedAt:new Date().toISOString()};await hooks.repository.save(run,old);hooks.onCheckpoint?.(structuredClone(run));};
 const finish=async(status:AgentRun['status'],reason:string)=>{run.completionReason=reason;run.counters.elapsedMs+=Date.now()-began;await save(status);return run;};
 const urgent=assessUrgentSafety(run.goal);if(urgent.blocked){run.answer=urgent.message!;return finish('blocked','Urgent safety escalation');}
 const availableCapabilities=hooks.capabilities||DEFAULT_EXECUTOR_CAPABILITIES[hooks.executorType||'cloud_worker'];
 const waitingSteps=run.plan.steps.filter(s=>s.status==='waiting_for_device');
 if(waitingSteps.some(s=>!negotiateCapability(s.tool||'',availableCapabilities,hooks.executorType).satisfied))return run;
 // Old checkpoints without a saved operation must replan honestly, never imply a device read succeeded.
 if(waitingSteps.length&&!run.pendingDeviceResponse){for(const s of waitingSteps){s.status='skipped';s.failureReason='Device connected; replan the unfinished operation.';}await save('replanning');}
 if(run.pendingProposal){
  if(!decision&&hooks.resumeApprovedActions&&run.approval?.ownerId===hooks.ownerId&&run.approval.proposalId===run.pendingProposal.id&&run.approval.proposalFingerprint===await approvalFingerprint(run.pendingProposal))decision={proposalId:run.pendingProposal.id,approved:true};
  if(!decision||decision.proposalId!==run.pendingProposal.id)return run;
  const step=run.plan.steps.find(s=>s.id===run.pendingStepId);if(!step)throw new Error('The pending action has no plan step.');
  if(!decision.approved){step.status='skipped';step.failureReason='Owner rejected this action.';run.observations.push({name:'action.rejected',domains:[],sourceIds:[],data:null,error:'Owner denied this action. Do not retry it or bypass approval.'});run.pendingProposal=undefined;run.pendingStepId=undefined;run.approval=undefined;await save('replanning');}
  else {
   if(run.request.mode==='ask'||run.request.mode==='analyze')throw new Error('Read-only mode cannot execute a change.');
   const bg=run.backgroundPolicy;
   if(hooks.executorType==='cloud_worker'&&(!bg?.enabled||!bg.allowWrites||bg.maxActionsLimit!==undefined&&run.counters.actions>=bg.maxActionsLimit||bg.maxSpendUsd!==undefined&&run.usage.reduce((n,u)=>n+(u.estimatedCostUsd||0),0)>=bg.maxSpendUsd))return finish('blocked','Cloud write permission or owner budget prevents this approved action. Open Health OS to review.');
   const operation=run.pendingProposal.tool==='canonical_action'?String(run.pendingProposal.payload.metadata.canonicalAction):run.pendingProposal.tool==='adapt_training'?'training_adaptation':run.pendingProposal.tool==='replace_workout'?'workout_draft':run.pendingProposal.tool;
   if(!negotiateCapability(operation,availableCapabilities,hooks.executorType).satisfied)return finish('waiting','This approved change requires its compatible device.');
   if(step.attempts>=3)return finish('blocked','This action reached its retry limit. Review the failure before starting a fresh proposal.');
   run.approval={ownerId:hooks.ownerId,proposalId:run.pendingProposal.id,proposalFingerprint:await approvalFingerprint(run.pendingProposal),approvedAt:run.approval?.approvedAt||new Date().toISOString()};step.status='running';step.attempts++;await save('executing');
   try{
    const result=await hooks.execute(run.pendingProposal);
    if(result.success!==true||!result.actionReceiptId)throw new Error('Action has no verified success receipt.');
    const observation:AgentToolResult={name:'action.verify',domains:[],sourceIds:[result.actionReceiptId],data:{success:true,proposalId:run.pendingProposal.id,receiptId:result.actionReceiptId,summary:result.summary,changedRecords:result.changedRecords}};
    run.observations.push(observation);step.status='completed';step.observationIds.push(result.actionReceiptId);step.verificationIds.push(result.actionReceiptId);run.counters.actions++;
    run.plan.steps.push({id:step.id+':verify',type:'verify',description:'Read verification confirmed by the domain receipt.',dependsOn:[step.id],tool:'action.verify',risk:'R0',approval:'none',status:'completed',attempts:1,observationIds:[result.actionReceiptId],verificationIds:[result.actionReceiptId]});
    run.pendingProposal=undefined;run.pendingStepId=undefined;run.approval=undefined;await save('verifying');
    if(hooks.observeAfterAction)tools=await hooks.observeAfterAction();
   }catch(e){step.status='failed';step.failureReason=(e as Error).message.slice(0,500);run.observations.push({name:'action.verify',domains:[],sourceIds:[],data:null,error:'Action failed or could not be verified. Do not claim completion. '+step.failureReason.slice(0,200)});return finish('blocked','An action failed; inspect and retry the same action identity before continuing.');}
  }
 }
 if(!run.request.route){await save('interpreting');let response:AgentModelResponse;try{response=await hooks.call({...run.request,phase:'route',toolResults:[],memories:[],attachments:[]});}catch(e){run.answer='Health OS Intelligence is temporarily unavailable.';return finish('blocked','Routing provider failed; no action was executed.');}run.request.route=routeSchema.parse(response.result);run.usage.push(...response.usage);run.request.policy.domains=run.request.policy.domains.filter(d=>run.request.route!.domains.includes(d));tools.narrow(run.request.policy.domains);await save('gathering_context');}
 while(run.counters.rounds-(run.stageStart?.rounds||0)<run.budgets.maxRounds){
  if(hooks.maxRoundsPerContinuation!==undefined&&run.counters.rounds-initialRounds>=hooks.maxRoundsPerContinuation)return finish('replanning','Checkpoint saved; the next executor tick will continue the same goal.');
  const elapsed=run.counters.elapsedMs-(run.stageStart?.elapsedMs||0)+Date.now()-began,tokens=run.usage.slice(run.stageStart?.usageIndex||0).reduce((n,u)=>n+(u.tokens||0),0),paid=run.usage.reduce((n,u)=>n+(u.estimatedCostUsd||0),0);
  if(elapsed>=run.budgets.maxMillis||tokens>=run.budgets.maxTokens||paid>=run.budgets.maxPaidUsd||run.counters.tools-(run.stageStart?.tools||0)>=run.budgets.maxTools||run.counters.actions-(run.stageStart?.actions||0)>=run.budgets.maxActions)return finish('blocked','Run budget reached; completed changes remain verified and unfinished steps remain visible.');
  const contextPlan=planContext(run.request,run.request.route!),compressed=compressContext(run.observations.slice(-32));
  const learned=reasoningMemories(run.request,tools.data,strategyContext(tools.state),tools.reasoningMemories());
  run.request.memories=[...new Map([...learned,...run.request.memories.filter(m=>run.request.policy.domains.includes(m.domain))].map(m=>[m.sourceId,m])).values()].slice(0,5);
  run.request={...run.request,goalPlan:run.plan.blueprint,completedGoalStepIds:[...new Set(run.plan.steps.filter(s=>s.status==='completed'&&s.plannedStepId).map(s=>s.plannedStepId!))],phase:'reason',toolResults:compressed.results,currentTask:{role:'assistant',personal:true,domains:run.request.policy.domains,sourceIds:[],content:JSON.stringify({goal:run.goal,originalRequestDate:run.originalPolicyDate||run.request.policy.date,observationAsOf:run.request.policy.date,contextPlan,omittedToolResults:compressed.omitted,planVersion:run.plan.version,steps:run.plan.steps.map(s=>({id:s.id,type:s.type,status:s.status,description:s.description})).slice(-20),actionsVerified:run.counters.actions}).slice(0,4000)}};await save('planning');
  let response:AgentModelResponse;try{if(run.pendingDeviceResponse){response={result:run.pendingDeviceResponse,usage:[]};run.pendingDeviceResponse=undefined;}else response=await hooks.call(ContextPolicyEngine.external(run.request));}catch(e){run.answer='AI reasoning is currently unavailable. '+(e as Error).message;return finish('blocked','Provider failure; safe to resume without repeating completed actions.');}
  const step=reasoningSchema.parse(response.result);run.counters.rounds++;run.usage.push(...response.usage);
  if(step.executionPlan){
   const permitted=permittedTools(run.request.policy,run.request.attachments.length>0),writes=['save_care_routine','adapt_training','plan_meal','save_recovery_plan','create_mission','replace_workout','set_sleep_target','update_goal','canonical_action'];
   const invalid=step.executionPlan.steps.some(s=>s.type==='read'&&!Object.hasOwn(permitted,s.tool!)||s.type==='action'&&(!writes.includes(s.tool!)||['ask','analyze'].includes(run.request.mode)))||step.executionPlan.successCriteria.some(c=>['read','observed_metric'].includes(c.kind)&&!Object.hasOwn(permitted,c.tool!)||c.kind==='verified_action'&&!writes.includes(c.tool!));
   if(invalid){run.observations.push({name:'action.validate',domains:[],sourceIds:[],data:null,error:'The execution plan references unapproved capabilities. Replan inside the approved context and mode.'});await save('replanning');continue;}
   // After execution begins, a model cannot erase unmet criteria to claim success.
   if(run.plan.blueprint&&(!preservesCompletedGoalSteps(run.plan.blueprint,step.executionPlan,run.plan.steps)||run.counters.actions>0&&fingerprint(step.executionPlan.successCriteria)!==fingerprint(run.plan.blueprint.successCriteria))){run.observations.push({name:'action.validate',domains:[],sourceIds:[],data:null,error:'Executed plans retain their original success criteria and completed step identities. Replan unfinished steps without erasing verified work.'});await save('replanning');continue;}
   if(fingerprint(step.executionPlan)!==fingerprint(run.plan.blueprint||null)){run.plan.blueprint=step.executionPlan;run.plan.successCriteria=step.executionPlan.successCriteria.map(c=>c.description);run.plan.assumptions=step.executionPlan.assumptions;run.plan.version++;await save('planning');}
  }
  run.request.feedback=undefined;
  if(response.verification)run.verifications=[...(run.verifications||[]),response.verification].slice(-30);
  const grounding=verifyGroundedResponse(agentNarrative(step),step.claims,run.observations);
  if(!grounding.accepted){run.request.feedback=modelFeedback(run.usage.at(-1),'grounding_failure');run.observations.push({name:'answer.verify',domains:[],sourceIds:[],data:null,error:grounding.errors.join(' ').slice(0,300)});await save('replanning');continue;}
  run.answer=renderGroundedAnswer(step.summary,grounding.claims);
  for(const planned of run.plan.blueprint?.steps.filter(s=>s.type==='analyze')||[]){const done=new Set(run.plan.steps.filter(s=>s.status==='completed').map(s=>s.plannedStepId));if(!done.has(planned.id)&&planned.dependsOn.every(id=>done.has(id)))run.plan.steps.push({id:run.id+':analysis:'+planned.id,plannedStepId:planned.id,type:'analyze',description:planned.description,dependsOn:planned.dependsOn,risk:'R0',approval:'none',status:'completed',attempts:1,observationIds:[],verificationIds:[]});}
  if(step.waitUntil){const waiting=Date.parse(step.waitUntil);if(waiting<=Date.now()||waiting>Date.now()+30*86400000){run.observations.push({name:'action.validate',domains:[],sourceIds:[],data:null,error:'Waiting requires a future time within 30 days. Do not claim future observations are already available.'});await save('replanning');continue;}run.waitUntil=step.waitUntil;return finish('waiting','Waiting for the scheduled observation window; completed changes remain verified.');}
  if(step.toolCalls.length){
   const availableCaps=hooks.capabilities||DEFAULT_EXECUTOR_CAPABILITIES[hooks.executorType||'cloud_worker'];
   for(const [index,call] of step.toolCalls.entries()){
    if(run.counters.tools>=run.budgets.maxTools)return finish('blocked','Tool budget reached.');
    const capCheck=negotiateCapability(call.name,availableCaps,hooks.executorType||'cloud_worker');
    if(!capCheck.satisfied){
     const entry:PlanStep={id:`${run.id}:device-wait:${run.counters.rounds}:${index}`,type:'read',description:'Waiting for device: '+call.name,dependsOn:run.plan.steps.filter(s=>s.status==='completed').slice(-1).map(s=>s.id),tool:call.name,risk:'R0',approval:'none',status:'waiting_for_device',attempts:0,observationIds:[],verificationIds:[],requiredCapability:capCheck.requiredCapability,deviceReason:capCheck.reason,compatibleExecutorTypes:capCheck.compatibleExecutorTypes,continuationInstructions:capCheck.continuationInstructions};
     run.plan.steps.push(entry);
     run.pendingDeviceResponse={...step,toolCalls:step.toolCalls.slice(index)};
     return finish('waiting',`Paused for device capability: ${capCheck.requiredCapability}. Compatible executors: ${capCheck.compatibleExecutorTypes?.join(', ')}.`);
    }
    let planned=run.plan.blueprint&&readyGoalStep(run.plan.blueprint,'read',call.name,run.plan.steps);
    if(run.plan.blueprint&&!planned&&Object.hasOwn(permittedTools(run.request.policy,run.request.attachments.length>0),call.name)){
     const completed=new Set(run.plan.steps.filter(s=>s.status==='completed'&&s.plannedStepId).map(s=>s.plannedStepId!));
     run.plan.blueprint=addRequiredRead(run.plan.blueprint,`additional-read-${run.counters.rounds}-${index}`,call.name,completed);run.plan.version++;await save('replanning');planned=readyGoalStep(run.plan.blueprint,'read',call.name,run.plan.steps);
    }
    if(run.plan.blueprint&&!planned){run.observations.push({name:'action.validate',domains:[],sourceIds:[],data:null,error:'This read is not a ready plan step. Resolve its dependencies or replan before selecting it.'});await save('replanning');break;}
    let entry=run.plan.steps.find(s=>s.status==='waiting_for_device'&&s.type==='read'&&s.tool===call.name);
    if(entry){entry.status='running';entry.attempts++;}else{entry={id:`${run.id}:read:${run.counters.rounds}:${index}`,type:call.name==='research.search'?'research':'read',description:'Read '+call.name,dependsOn:run.plan.steps.filter(s=>s.status==='completed').slice(-1).map(s=>s.id),tool:call.name,risk:'R0',approval:'none',status:'running',attempts:1,observationIds:[],verificationIds:[]};run.plan.steps.push(entry);}await save('gathering_context');
    entry.plannedStepId=planned?.id;
    try{const observation=await tools.execute(call.name,call.arguments);run.observations.push(observation);entry.status='completed';entry.observationIds=[fingerprint(observation)];}
    catch(e){entry.status='failed';entry.failureReason=(e as Error).message.slice(0,500);run.observations.push({name:call.name,domains:[],sourceIds:[],data:null,error:entry.failureReason.slice(0,300)});run.request.feedback=modelFeedback(run.usage.at(-1),'tool_failure');}
    run.counters.tools++;run.observations=run.observations.slice(-64);await save(entry.status==='failed'?'replanning':'gathering_context');
   }continue;
  }
  if(step.proposedActions.length){
   if(hooks.backgroundReadOnly)return finish('blocked','Background evidence and reasoning are saved. Open Health OS to prepare and review the proposed change.');
   if(run.request.mode==='ask'||run.request.mode==='analyze'){run.observations.push({name:'action.validate',domains:[],sourceIds:[],data:null,error:'This run is read-only. Explain the proposal; do not request a write.'});await save('replanning');continue;}
   const availableCaps=hooks.capabilities||DEFAULT_EXECUTOR_CAPABILITIES[hooks.executorType||'cloud_worker'];
   const targetOp=step.proposedActions[0].kind==='canonical_action'?(step.proposedActions[0] as any).action:(step.proposedActions[0] as any).tool||step.proposedActions[0].kind;
   const actionCapCheck=negotiateCapability(targetOp,availableCaps,hooks.executorType||'cloud_worker');
   if(!actionCapCheck.satisfied){
    const actionId=`${run.id}:action:${run.counters.actions}:${fingerprint(step.proposedActions[0])}`;
    const id=actionId+':step';
    run.plan.steps.push({id,type:'action',description:'Waiting for device: '+targetOp,dependsOn:run.plan.steps.filter(s=>s.status==='completed').map(s=>s.id).slice(-40),tool:targetOp,risk:'R2',approval:'review',status:'waiting_for_device',attempts:0,observationIds:[],verificationIds:[],requiredCapability:actionCapCheck.requiredCapability,deviceReason:actionCapCheck.reason,compatibleExecutorTypes:actionCapCheck.compatibleExecutorTypes,continuationInstructions:actionCapCheck.continuationInstructions});
    run.pendingDeviceResponse=step;
    return finish('waiting',`Paused for device capability: ${actionCapCheck.requiredCapability}. Compatible executors: ${actionCapCheck.compatibleExecutorTypes?.join(', ')}.`);
   }
   try{const actionId=`${run.id}:action:${run.counters.actions}:${fingerprint(step.proposedActions[0])}`;if(run.plan.steps.some(s=>s.id===actionId+':step'&&s.status==='skipped'))throw new Error('The owner rejected this exact change. Replan a different action or explain the remaining options.');let proposal=hooks.prepareAction?await hooks.prepareAction(step.proposedActions[0],actionId):tools.prepare(step.proposedActions[0],actionId);if(step.predictedOutcome)proposal={...proposal,payload:{...proposal.payload,metadata:{...proposal.payload.metadata,predictedOutcome:JSON.stringify(step.predictedOutcome),strategyContext:JSON.stringify(strategyContext(tools.state))}}};if(hooks.prepare)proposal=await hooks.prepare(proposal);proposal={...proposal,payload:{...proposal.payload,metadata:{...proposal.payload.metadata,agentRunId:run.id}}};if(JSON.stringify(proposal).length>19500)throw new Error('The forecast review is too large. Narrow the selected evidence.');run.pendingProposal=proposal;run.approval=undefined;
    const planned=run.plan.blueprint&&readyGoalStep(run.plan.blueprint,'action',proposal.tool,run.plan.steps,proposal.tool==='canonical_action'?String(proposal.payload.metadata.canonicalAction):undefined);if(planned?.type==='action'&&planned.canonicalAction&&planned.canonicalAction!==proposal.payload.metadata.canonicalAction){run.pendingProposal=undefined;throw new Error('The selected canonical action differs from the ready dependency plan step.');}
    if(run.plan.blueprint&&!planned){run.pendingProposal=undefined;throw new Error('This action is not a ready plan step. Complete its dependencies or replan before requesting approval.');}
    const id=actionId+':step';run.pendingStepId=id;run.plan.steps=run.plan.steps.filter(s=>s.id!==id);run.plan.steps.push({id,plannedStepId:planned?.id,type:'action',description:proposal.title,dependsOn:run.plan.steps.filter(s=>s.status==='completed').map(s=>s.id).slice(-40),tool:proposal.tool,...(proposal.tool==='canonical_action'?{canonicalAction:String(proposal.payload.metadata.canonicalAction)}:{}),risk:'R2',approval:'review',status:'awaiting_approval',attempts:0,observationIds:[],verificationIds:[]});return finish('awaiting_approval','Review the proposed change. After verification the model will continue the same goal.');
   }catch(e){run.observations.push({name:'action.validate',domains:[],sourceIds:[],data:null,error:(e as Error).message.slice(0,300)});await save('replanning');continue;}
  }
  if(run.plan.steps.some(s=>s.type==='action'&&['pending','running','awaiting_approval'].includes(s.status)))return finish('blocked','A required action remains unfinished.');
  if(run.plan.blueprint){const done=new Set(run.plan.steps.filter(s=>s.status==='completed').map(s=>s.plannedStepId)),unmet=[...unmetGoalCriteria(run.plan.blueprint,run.observations,run.plan.steps.filter(s=>s.type==='action'),true,run.request.policy.date),...run.plan.blueprint.steps.filter(s=>!done.has(s.id)).map(s=>s.description)];if(unmet.length){run.observations.push({name:'answer.verify',domains:[],sourceIds:[],data:null,error:'Goal success criteria or planned steps remain unmet: '+unmet.join('; ').slice(0,230)});await save('replanning');continue;}}
  return finish(step.responseType==='clarification'?'blocked':'completed',step.responseType==='clarification'?'Additional user information is required.':'Final grounded response; approved changes verified.');
 }
 return finish('blocked','Reasoning budget reached; no completion was assumed.');
}
