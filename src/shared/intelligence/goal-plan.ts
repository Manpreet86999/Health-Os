import {observedCriterionFields,observedCriterionSatisfied} from './observed-goal-criteria.js';
import {z} from 'zod';
import {agentCanonicalActions} from './canonical-action-policy.js';
const stepFields={id:z.string().min(1).max(100),description:z.string().min(1).max(500),dependsOn:z.array(z.string().max(100)).max(20)};
const executionStepSchema=z.discriminatedUnion('type',[z.object({...stepFields,type:z.literal('read'),tool:z.string().min(1).max(100)}).strict(),z.object({...stepFields,type:z.literal('action'),tool:z.string().min(1).max(100),canonicalAction:z.enum(agentCanonicalActions).optional()}).strict(),z.object({...stepFields,type:z.literal('analyze'),tool:z.string().max(100).optional()}).strict()]);

export const goalPlanSchema=z.object({
 successCriteria:z.array(z.object({id:z.string().min(1).max(100),description:z.string().min(1).max(500),kind:z.enum(['grounded_answer','read','verified_action','observed_metric']),...observedCriterionFields,tool:z.string().max(100).optional(),canonicalAction:z.enum(agentCanonicalActions).optional(),minimumCount:z.number().int().min(1).max(12)}).strict()).min(1).max(20),
 assumptions:z.array(z.string().max(500)).max(20),
 steps:z.array(executionStepSchema).min(1).max(30),
}).strict().superRefine((plan,ctx)=>{
 const ids=new Set<string>();for(const [i,step] of plan.steps.entries()){
  if(ids.has(step.id))ctx.addIssue({code:'custom',path:['steps',i,'id'],message:'Duplicate plan step'});
  if(step.dependsOn.some(id=>!ids.has(id)))ctx.addIssue({code:'custom',path:['steps',i,'dependsOn'],message:'Dependencies must reference earlier steps; cycles and missing steps are prohibited'});
  if(step.type!=='analyze'&&!step.tool)ctx.addIssue({code:'custom',path:['steps',i,'tool'],message:'Executable steps need a registered tool'});
  if(step.type==='action'&&step.tool==='canonical_action'&&!step.canonicalAction)ctx.addIssue({code:'custom',path:['steps',i,'canonicalAction'],message:'Canonical action steps identify their exact registered action'});
  ids.add(step.id);
 }
 const criteria=new Set<string>();for(const [i,c] of plan.successCriteria.entries()){
  if(criteria.has(c.id))ctx.addIssue({code:'custom',path:['successCriteria',i,'id'],message:'Duplicate criterion'});criteria.add(c.id);
  if(c.kind!=='grounded_answer'&&!c.tool)ctx.addIssue({code:'custom',path:['successCriteria',i,'tool'],message:'Evidence criteria require a tool'});
  if(c.kind==='observed_metric'&&(!c.metric||!c.comparison||c.targetValue===undefined||c.minimumCount<3||!c.from||!c.to||c.from>c.to))ctx.addIssue({code:'custom',path:['successCriteria',i],message:'Physical-health criteria need a metric, target, comparison, canonical tool and at least three recorded days.'});
  if(c.kind==='verified_action'&&c.tool==='canonical_action'&&!c.canonicalAction)ctx.addIssue({code:'custom',path:['successCriteria',i,'canonicalAction'],message:'Canonical action criteria identify their exact registered action'});
 }
});
export type GoalPlan=z.infer<typeof goalPlanSchema>;
export function preservesCompletedGoalSteps(previous:GoalPlan,next:GoalPlan,executed:{plannedStepId?:string;status:string}[]):boolean{
 const completed=new Set(executed.filter(s=>s.status==='completed').map(s=>s.plannedStepId));
 return previous.steps.filter(s=>completed.has(s.id)).every(before=>{
  const after=next.steps.find(s=>s.id===before.id);
  return !!after&&after.type===before.type&&after.tool===before.tool&&after.description===before.description&&(before.type!=='action'||after.type==='action'&&after.canonicalAction===before.canonicalAction)&&after.dependsOn.length===before.dependsOn.length&&before.dependsOn.every(id=>after.dependsOn.includes(id));
 });
}
export function addRequiredRead(plan:GoalPlan,id:string,tool:string,completed:Set<string>):GoalPlan{
 const steps=[...plan.steps.map(s=>({...s,dependsOn:[...s.dependsOn]})),{id,type:'read' as const,tool,description:'Model selected additional evidence: '+tool,dependsOn:plan.steps.filter(s=>completed.has(s.id)).map(s=>s.id)}];
 for(const step of steps)if(step.type==='action'&&!completed.has(step.id))step.dependsOn=[...new Set([...step.dependsOn,id])];
 const ordered:GoalPlan['steps']=[],seen=new Set<string>();while(ordered.length<steps.length){const ready=steps.find(s=>!seen.has(s.id)&&s.dependsOn.every(d=>seen.has(d)));if(!ready)throw new Error('Replanned evidence creates an invalid dependency cycle.');ordered.push(ready);seen.add(ready.id);}
 return goalPlanSchema.parse({...plan,steps:ordered});
}
export function readyGoalStep(plan:GoalPlan,type:'read'|'action',tool:string,executed:{plannedStepId?:string;status:string}[],canonicalAction?:string){
 const completed=new Set(executed.filter(s=>s.status==='completed').map(s=>s.plannedStepId));
 return plan.steps.find(s=>s.type===type&&s.tool===tool&&(!canonicalAction||s.type==='action'&&s.canonicalAction===canonicalAction)&&!completed.has(s.id)&&s.dependsOn.every(id=>completed.has(id)));
}
export function unmetGoalCriteria(plan:GoalPlan,observations:{name:string;error?:string;data:unknown}[],actions:{tool?:string;canonicalAction?:string;status:string}[],grounded:boolean,asOfDate?:string):string[]{
 return plan.successCriteria.filter(c=>c.kind==='grounded_answer'?!grounded:c.kind==='observed_metric'?!observedCriterionSatisfied(c,observations,asOfDate):c.kind==='read'?observations.filter(o=>o.name===c.tool&&!o.error).length<c.minimumCount:actions.filter(a=>a.tool===c.tool&&(!c.canonicalAction||a.canonicalAction===c.canonicalAction)&&a.status==='completed').length<c.minimumCount).map(c=>c.description);
}
