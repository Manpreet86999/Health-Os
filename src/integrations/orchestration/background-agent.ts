import {continueAgentRun,type DurableAgentHooks} from './durable-agent.js';
import {runSchema,buildExecutorLease,renewExecutorLease,isLeaseActive,type AgentRun,type ExecutorType} from '../../shared/intelligence/run-contracts.js';
import {DEFAULT_EXECUTOR_CAPABILITIES} from '../../shared/intelligence/parity-contracts.js';

export interface BackgroundRunOptions {
 prepareChanges?:boolean;
 maxRounds?:number;
 executorType?:ExecutorType;
 leaseDurationMs?:number;
 executeApproved?:DurableAgentHooks['execute'];
}

export async function continueBackgroundRun(
 runId:string,
 executorId:string,
 hooks:Omit<DurableAgentHooks,'execute'|'executorId'>,
 options:BackgroundRunOptions={}
):Promise<AgentRun|undefined>{
 const loaded=await hooks.repository.load(runId);
 if(!loaded)return;
 let run=runSchema.parse(loaded);
 if(run.ownerId!==hooks.ownerId||run.workspaceId!==hooks.workspaceId)throw new Error('Background run belongs to another owner or workspace.');

 // 1.2 Owner opt-in verification:
 // Per-run enable: allowBackgroundReads or backgroundPolicy.enabled
 const bgPolicy=run.backgroundPolicy;
 const isOptedIn=bgPolicy?bgPolicy.enabled===true:run.allowBackgroundReads===true;
 if(!isOptedIn)return;

 // Medical domain requires explicit separate medical consent
 if(run.request.policy.domains.includes('medical')&&bgPolicy?.medicalConsent!==true)return;

 // Permitted domain restrictions
 if(bgPolicy?.permittedDomains){
  const hasForbiddenDomain=run.request.policy.domains.some(d=>!bgPolicy.permittedDomains!.includes(d));
  if(hasForbiddenDomain)return;
 }

 // Background reads permission
 if(bgPolicy&&bgPolicy.allowReads===false)return;

 // Background writes permission
 const allowApprovedWrites=bgPolicy?.allowWrites===true?options.executeApproved:undefined;

 // Budget limits check
 if(bgPolicy?.maxSpendUsd!==undefined){
  const paid=run.usage.reduce((n,u)=>n+(u.estimatedCostUsd||0),0);
  if(paid>=bgPolicy.maxSpendUsd)return;
 }
 if(bgPolicy?.maxToolsLimit!==undefined&&run.counters.tools>=bgPolicy.maxToolsLimit)return;
 if(bgPolicy?.maxActionsLimit!==undefined&&run.counters.actions>=bgPolicy.maxActionsLimit)return;
 if(bgPolicy?.maxExecutionTimeMs!==undefined&&run.counters.elapsedMs>=bgPolicy.maxExecutionTimeMs)return;
 // Apply owner limits inside every continuation, not only at tick entry.
 run.budgets={...run.budgets,
  maxPaidUsd:Math.min(run.budgets.maxPaidUsd,bgPolicy?.maxSpendUsd??run.budgets.maxPaidUsd),
  maxTools:Math.min(run.budgets.maxTools,bgPolicy?.maxToolsLimit??run.budgets.maxTools),
  maxActions:Math.min(run.budgets.maxActions,bgPolicy?.maxActionsLimit??run.budgets.maxActions),
  maxMillis:Math.min(run.budgets.maxMillis,bgPolicy?.maxExecutionTimeMs??run.budgets.maxMillis)};

 const recovery=!!(allowApprovedWrites&&run.pendingProposal&&run.approval?.ownerId===hooks.ownerId&&run.approval.proposalId===run.pendingProposal.id);
 if(run.pendingProposal&&!recovery||['completed','cancelled','failed'].includes(run.status)||['awaiting_approval','blocked'].includes(run.status)&&!recovery)return;
 if(run.waitUntil&&Date.parse(run.waitUntil)>Date.now())return;

 // Check active lease on another executor
 if(isLeaseActive(run.executorLease)&&run.executorLease?.id!==executorId)return;

 // 1.4 Acquire exclusive executor lease with optimistic version CAS
 const previous=run.version;
 const executorType=options.executorType||'cloud_worker';
 const leaseDuration=options.leaseDurationMs||600000;
 const lease=buildExecutorLease({id:executorId,executorType,ownerId:hooks.ownerId,durationMs:leaseDuration,version:previous+1});

 run={...run,version:previous+1,executorLease:lease,updatedAt:new Date().toISOString()};
 await hooks.repository.save(run,previous);

 const caps=DEFAULT_EXECUTOR_CAPABILITIES[executorType];

 try{
  await continueAgentRun(run.id,{
   ...hooks,
   executorId,
   executorType,
   capabilities:[...caps],
   backgroundReadOnly:!options.prepareChanges,
   maxRoundsPerContinuation:options.maxRounds,
   resumeApprovedActions:!!allowApprovedWrites,
   execute:allowApprovedWrites||(async()=>{throw new Error('Background execution cannot approve or perform health writes.');})
  });
 }finally{
  // Safely release lease only if this executor still owns it
  const latest=await hooks.repository.load(run.id);
  if(latest?.executorLease?.id===executorId){
   const next={
    ...latest,
    version:latest.version+1,
    executorLease:undefined,
    ...(latest.status==='blocked'?{allowBackgroundReads:false}:{}),
    updatedAt:new Date().toISOString()
   };
   await hooks.repository.save(next,latest.version);
  }
 }
 return hooks.repository.load(run.id);
}
