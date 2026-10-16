import {runSchema,type AgentRun} from './run-contracts.js';
import {unmetGoalCriteria} from './goal-plan.js';
/** Read-only consistency replay. It neither calls a provider nor executes an action. */
export function inspectRunTrace(raw:AgentRun,owner:string){
 const run=runSchema.parse(raw);if(run.ownerId!==owner)throw new Error('Run owner mismatch.');
 const errors:string[]=[],actions=run.plan.steps.filter(s=>s.type==='action'&&s.status==='completed');
 const receipts=new Set(run.observations.filter(o=>o.name==='action.verify'&&!o.error&&(o.data as any)?.success===true).map(o=>(o.data as any).receiptId));
 for(const step of actions)if(!step.verificationIds.length||step.verificationIds.some(id=>!receipts.has(id)))errors.push('A completed action lacks its saved verification receipt.');
 if(actions.length!==run.counters.actions)errors.push('Verified action count differs from completed steps.');
 if(run.status==='completed'&&run.plan.blueprint){errors.push(...unmetGoalCriteria(run.plan.blueprint,run.observations,actions,!!run.answer));const done=new Set(run.plan.steps.filter(s=>s.status==='completed').map(s=>s.plannedStepId));if(run.plan.blueprint.steps.some(s=>!done.has(s.id)))errors.push('A completed run has unfinished planned steps.');}
 return {consistent:errors.length===0,errors,actions:actions.length,scope:'Saved trace consistency only; original source state and provider quality require separate acceptance.'};
}
export function exportRunTrace(run:AgentRun,owner:string){
 const check=inspectRunTrace(run,owner);
 return {id:run.id,status:run.status,version:run.version,createdAt:run.createdAt,updatedAt:run.updatedAt,plan:run.plan,counters:run.counters,budgets:run.budgets,usage:run.usage,verifications:run.verifications||[],observations:run.observations.map(o=>({name:o.name,sourceIds:o.sourceIds,freshness:o.freshness,asOf:o.asOf,failed:!!o.error})),check};
}
