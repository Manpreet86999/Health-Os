import {goalReviewScheduleSchema} from './goal-review-contracts.js';
import {goalPlanSchema} from './goal-plan.js';
import {z} from 'zod';
import {agentRequestSchema,toolResultSchema,reasoningSchema} from './agent-contracts.js';
import {agentProposalSchema} from '../agentic-intelligence.js';
import {modelVerificationSchema} from './model-verification.js';
import {MONTHLY_MODEL_LIMIT_USD} from './production-models.js';
export const runStatuses=['created','interpreting','gathering_context','planning','executing','awaiting_approval','waiting','verifying','replanning','completed','blocked','failed','cancelled'] as const;
export const executorTypes=['cloud_worker','browser','android','device'] as const;
export type ExecutorType=typeof executorTypes[number];

export const executorLeaseSchema=z.object({
 id:z.string().max(150),
 executorType:z.enum(executorTypes).default('cloud_worker'),
 ownerId:z.string().max(150).optional(),
 acquiredAt:z.string().datetime().optional(),
 renewedAt:z.string().datetime().optional(),
 expiresAt:z.string().datetime(),
 version:z.number().int().positive().optional(),
}).strict();
export type ExecutorLease=z.infer<typeof executorLeaseSchema>;

export const backgroundPolicySchema=z.object({
 enabled:z.boolean().default(false),
 allowReads:z.boolean().default(true),
 allowWrites:z.boolean().default(false),
 medicalConsent:z.boolean().default(false),
 permittedDomains:z.array(z.string().max(50)).max(20).optional(),
 maxSpendUsd:z.number().min(0).max(100).optional(),
 maxExecutionTimeMs:z.number().int().min(1000).max(600000).optional(),
 maxToolsLimit:z.number().int().min(1).max(100).optional(),
 maxActionsLimit:z.number().int().min(0).max(12).optional(),
}).strict();
export type BackgroundPolicy=z.infer<typeof backgroundPolicySchema>;

export const planStepSchema=z.object({
 plannedStepId:z.string().max(100).optional(),
 id:z.string().max(180),
 type:z.enum(['read','analyze','action','verify','research','memory','clarify']),
 description:z.string().max(500),
 dependsOn:z.array(z.string().max(180)).max(40),
 tool:z.string().max(100).optional(),
 canonicalAction:z.string().max(100).optional(),
 risk:z.enum(['R0','R1','R2','R3']),
 approval:z.enum(['none','explicit','review']),
 status:z.enum(['pending','ready','running','awaiting_approval','completed','failed','skipped','blocked','waiting_for_device']),
 attempts:z.number().int().min(0).max(3),
 observationIds:z.array(z.string()).max(50),
 verificationIds:z.array(z.string()).max(20),
 failureReason:z.string().max(500).optional(),
 requiredCapability:z.string().max(100).optional(),
 requiredExecutorType:z.enum(executorTypes).optional(),
 deviceReason:z.string().max(500).optional(),
 compatibleExecutorTypes:z.array(z.enum(executorTypes)).max(10).optional(),
 continuationInstructions:z.string().max(1000).optional()
}).strict();
export const runSchema=z.object({
 pendingDeviceResponse:reasoningSchema.optional(),
 id:z.string().max(150),ownerId:z.string().max(150),workspaceId:z.string().max(300),version:z.number().int().positive(),status:z.enum(runStatuses),timeZone:z.string().max(100).optional(),originalPolicyDate:z.string().optional(),stageStart:z.object({rounds:z.number().int().nonnegative(),tools:z.number().int().nonnegative(),actions:z.number().int().nonnegative(),elapsedMs:z.number().nonnegative(),usageIndex:z.number().int().nonnegative()}).strict().optional(),allowBackgroundReads:z.boolean().optional(),backgroundPolicy:backgroundPolicySchema.optional(),monitoring:goalReviewScheduleSchema.optional(),executorLease:executorLeaseSchema.optional(),goal:z.string().max(4000),request:agentRequestSchema,
 plan:z.object({id:z.string().max(180),version:z.number().int().positive(),goal:z.string().max(4000),blueprint:goalPlanSchema.optional(),successCriteria:z.array(z.string().max(500)).min(1).max(20),assumptions:z.array(z.string().max(500)).max(20),steps:z.array(planStepSchema).max(100)}).strict(),
 observations:z.array(toolResultSchema).max(64),verifications:z.array(modelVerificationSchema).max(30).optional(),pendingProposal:agentProposalSchema.optional(),pendingStepId:z.string().optional(),approval:z.object({ownerId:z.string(),proposalId:z.string(),proposalFingerprint:z.string(),approvedAt:z.string().datetime()}).strict().optional(),waitUntil:z.string().datetime().optional(),answer:z.string().max(20000),completionReason:z.string().max(500).optional(),
 usage:z.array(z.object({requestId:z.string(),role:z.string(),model:z.string(),provider:z.string(),providerRoute:z.string().max(120).optional(),latencyMs:z.number(),tokens:z.number().optional(),estimatedCostUsd:z.number().optional(),paid:z.boolean(),reason:z.string(),escalationReason:z.string().optional()}).strict()).max(200),
 budgets:z.object({maxRounds:z.number().int().min(1).max(30),maxTools:z.number().int().min(1).max(100),maxActions:z.number().int().min(0).max(12),maxMillis:z.number().int().min(1000).max(600000),maxTokens:z.number().int().min(1000).max(250000),maxPaidUsd:z.number().min(0).max(100)}).strict(),
 counters:z.object({rounds:z.number().int().nonnegative(),tools:z.number().int().nonnegative(),actions:z.number().int().nonnegative(),elapsedMs:z.number().nonnegative()}).strict(),createdAt:z.string(),updatedAt:z.string(),
}).strict();
export type AgentRun=z.infer<typeof runSchema>;
export type PlanStep=z.infer<typeof planStepSchema>;
export interface RunRepository {load(id:string):Promise<AgentRun|undefined>;save(run:AgentRun,expectedVersion:number|null):Promise<void>;list():Promise<AgentRun[]>;remove?(id:string,expectedVersion:number):Promise<boolean>;prune?(olderThanDays:number):Promise<number>;}

export function isLeaseActive(lease?:ExecutorLease):boolean {
 if(!lease)return false;
 return Date.parse(lease.expiresAt)>Date.now();
}

export function canAcquireLease(lease:ExecutorLease|undefined,executorId:string):boolean {
 if(!lease)return true;
 if(Date.parse(lease.expiresAt)<=Date.now())return true;
 return lease.id===executorId;
}

export function buildExecutorLease(params:{id:string;executorType?:ExecutorType;ownerId?:string;durationMs?:number;version?:number}):ExecutorLease {
 const now=new Date();
 const expiresAt=new Date(now.getTime()+(params.durationMs||600000)).toISOString();
 return executorLeaseSchema.parse({
  id:params.id,
  executorType:params.executorType||'cloud_worker',
  ownerId:params.ownerId,
  acquiredAt:now.toISOString(),
  renewedAt:now.toISOString(),
  expiresAt,
  version:params.version,
 });
}

export function renewExecutorLease(lease:ExecutorLease,durationMs=600000):ExecutorLease {
 return executorLeaseSchema.parse({
  ...lease,
  renewedAt:new Date().toISOString(),
  expiresAt:new Date(Date.now()+durationMs).toISOString(),
 });
}

export function createAgentRun(request:z.infer<typeof agentRequestSchema>,ownerId:string,workspaceId:string):AgentRun {
 const stamp=new Date().toISOString();return runSchema.parse({id:request.requestId,ownerId,workspaceId,version:1,status:'created',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,originalPolicyDate:request.policy.date,goal:request.question,request,plan:{id:'plan:'+request.requestId,version:1,goal:request.question,successCriteria:['Answer from available evidence and verify every approved change.'],assumptions:[],steps:[]},observations:[],answer:'',usage:[],budgets:{maxRounds:16,maxTools:48,maxActions:6,maxMillis:480000,maxTokens:60000,maxPaidUsd:MONTHLY_MODEL_LIMIT_USD},counters:{rounds:0,tools:0,actions:0,elapsedMs:0},createdAt:stamp,updatedAt:stamp});
}
