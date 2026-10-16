import {intelligenceActionDefinitions} from './intelligence/action-families.js';
import { z } from 'zod';
import {expandedActionDefinitions,reversibleMcpActions} from './mcp-expanded-contracts.js';
import {cloudReadDefinitions} from './mcp-read-aliases.js';
import {intelligenceReadDefinitions} from './intelligence/read-contracts.js';

export const mcpVersion='3.3.0';
export type Risk='R0'|'R1'|'R2'|'R3';
export const scopes=['health.read','today.read','nutrition.read','nutrition.write','training.read','training.write','recovery.read','recovery.write','sleep.read','sleep.write','body.read','body.write','medical.read','medical.write','care.read','care.write','goals.read','goals.write','reports.read','intelligence.read','admin.mcp','developer.diagnostics'] as const;
export const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Use a real date');
const dateInput=z.object({date:day.optional()}).strict();
const key={idempotencyKey:z.string().min(8).max(128)};
export const actionDefinitions={
  ...expandedActionDefinitions,
  ...intelligenceActionDefinitions,
  ...cloudReadDefinitions,
  ...intelligenceReadDefinitions,
  'nutrition.get_history':expandedActionDefinitions['nutrition.get_history'],
  'health.get_current_state':{scope:'health.read',risk:'R0',description:'Read the canonical current health summary, without medical records.',schema:dateInput},
  'health.get_today':{scope:'today.read',risk:'R0',description:'Read today’s readiness and priorities.',schema:dateInput},
  'health.get_priorities':{scope:'today.read',risk:'R0',description:'Read the highest priority health recommendations.',schema:dateInput},
  'health.get_context':{scope:'intelligence.read',risk:'R0',description:'Get minimal recorded non-medical evidence for a health question over 7–366 days. Missing values remain unknown.',schema:z.object({purpose:z.string().min(1).max(300),timeRange:z.enum(['7d','14d','28d','90d','366d']).default('14d')}).strict()},
  'health.undo_action':{scope:'health.read',risk:'R2',description:'Undo an unchanged reversible MCP observation. Requires its original write scope and approval in Health OS.',schema:z.object({...key,receiptId:z.string().uuid()}).strict()},
  'intelligence.get_current_state':{scope:'intelligence.read',risk:'R0',description:'Read Health OS Intelligence’s non-medical metrics and baselines.',schema:dateInput},
  'nutrition.get_today':{scope:'nutrition.read',risk:'R0',description:'Read recorded nutrition totals and saved targets.',schema:dateInput},
  'nutrition.get_usual_meals':{scope:'nutrition.read',risk:'R0',description:'List saved usual meal templates.',schema:z.object({}).strict()},
  'training.get_today':{scope:'training.read',risk:'R0',description:'Read today’s workout from Health OS programming.',schema:dateInput},
  'training.get_active_workout':{scope:'training.read',risk:'R0',description:'Read the active workout and current exercise. Includes a state token for safe adaptation.',schema:z.object({}).strict()},
  'training.create_adaptation_plan':{scope:'training.read',risk:'R0',description:'Preview a lighter active workout before the first set. Returns an expiring state-bound plan.',schema:z.object({}).strict()},
  'training.start_workout':{scope:'training.write',risk:'R1',description:'Start today’s original planned workout. Rejects if another workout is active.',schema:z.object({...key}).strict()},
  'training.log_set':{scope:'training.write',risk:'R1',description:'Log one completed weight/reps set in the active exercise through Train’s validation.',schema:z.object({...key,workoutId:z.string().min(1).max(150),exercise:z.string().min(1).max(150),setNumber:z.number().int().min(1).max(100),weight:z.number().min(0).max(500),reps:z.number().int().min(1).max(200),unit:z.enum(['kg','lb']),rir:z.number().min(0).max(10).optional(),rpe:z.number().min(1).max(10).optional()}).strict()},
  'training.apply_adaptation_plan':{scope:'training.write',risk:'R2',description:'Apply the previewed current-workout plan after approval in Health OS. Rejects stale or expired plans.',schema:z.object({...key,workoutId:z.string().min(1).max(150),stateToken:z.string().min(1).max(100),expiresAt:z.number().int().positive()}).strict()},
  'intelligence.analyze_period':{scope:'intelligence.read',risk:'R0',description:'Analyze 7–366 days using Health OS’s canonical non-medical period summary.',schema:z.object({days:z.number().int().min(7).max(366).default(28),date:day.optional()}).strict()},
  'medical.get_recent_symptoms':{scope:'medical.read',risk:'R0',description:'Read up to 20 recent recorded symptom summaries. Provides no diagnosis or treatment.',schema:z.object({limit:z.number().int().min(1).max(20).default(10)}).strict()},
  'recovery.get_current':{scope:'recovery.read',risk:'R0',description:'Read recovery metrics and soreness.',schema:dateInput},
  'sleep.get_latest':{scope:'sleep.read',risk:'R0',description:'Read the most recent recorded sleep summary.',schema:z.object({}).strict()},
  'body.get_weight_trend':{scope:'body.read',risk:'R0',description:'Read the canonical recorded weight trend.',schema:dateInput},
  'goals.get_active':{scope:'goals.read',risk:'R0',description:'Read active goal names and targets.',schema:z.object({}).strict()},
  'body.log_weight':{scope:'body.write',risk:'R1',description:'Log measured weight once. Requires an explicit user request.',schema:z.object({...key,weight:z.number().min(20).max(500),unit:z.enum(['kg','lb']).default('kg'),date:day.optional()}).strict()},
  'recovery.log_soreness':{scope:'recovery.write',risk:'R1',description:'Log soreness from 0 to 10 for a named muscle area.',schema:z.object({...key,area:z.string().min(1).max(80),severity:z.number().int().min(0).max(10),date:day.optional()}).strict()},
  'nutrition.log_usual_meal':{scope:'nutrition.write',risk:'R1',description:'Log a saved itemized meal using Food Intelligence’s frozen nutrition provenance.',schema:z.object({...key,templateId:z.string().min(1).max(150),meal:z.enum(['Breakfast','Lunch','Dinner','Snacks']),date:day.optional()}).strict()},
  'nutrition.log_natural_language':{scope:'nutrition.write',risk:'R1',description:'Resolve explicit foods and portions with Food Intelligence. Uncertain foods require review in Eat.',schema:z.object({...key,text:z.string().min(1).max(2000),meal:z.enum(['Breakfast','Lunch','Dinner','Snacks']),date:day.optional()}).strict()},
  'sleep.set_target':{scope:'sleep.write',risk:'R2',description:'Propose a lasting sleep target. Approval in Health OS is required.',schema:z.object({...key,hours:z.number().min(4).max(12)}).strict()},
} as const;
export type ActionId=keyof typeof actionDefinitions;
/** Public tool surface for the lightweight tracker. Historic definitions remain for receipt/data compatibility. */
export function isRetainedMcpAction(id:string){
 if(id.startsWith('training.')||id.startsWith('sleep.')||id.startsWith('recovery.')||id.startsWith('body.')||id.startsWith('reports.'))return true;
 return ['health.get_current_state','health.get_today','health.get_capabilities','health.undo_action','nutrition.get_today','nutrition.get_history','nutrition.set_daily_totals','nutrition.get_water','nutrition.log_water','reports.get_history','goals.get_active','goals.get_progress','goals.create','goals.update','goals.log_progress','habits.get_today','habits.create','habits.complete'].includes(id);
}
export const retainedActionIds=()=>Object.keys(actionDefinitions).filter(isRetainedMcpAction) as ActionId[];
export function describeMcpCapabilities(allowedScopes?:string[]){
 const entries=Object.entries(actionDefinitions).filter(([id,d])=>isRetainedMcpAction(id)&&(!allowedScopes||allowedScopes.includes(d.scope)));
 return {name:'HEOS MCP',version:mcpVersion,supportedToolCount:retainedActionIds().length,availableToolCount:entries.length,tools:entries.map(([name,d])=>({name,scope:d.scope,approvalRequired:d.risk==='R2',description:d.description})),requires:'Authorized cloud reads and selected logging writes use synchronized records with apps closed. Local workouts, drafts and approval workflows require a compatible device.',permissions:'This catalog does not grant permissions. Writes require both granted access and the Health OS write switch.',undoableActions:reversibleMcpActions.filter(id=>isRetainedMcpAction(id)&&(!allowedScopes||allowedScopes.includes(actionDefinitions[id].scope)))};
}
export const resources={
  'healthos://today':'health.get_today','healthos://state/current':'health.get_current_state',
  'healthos://nutrition/today':'nutrition.get_today','healthos://training/today':'training.get_today',
  'healthos://recovery/current':'recovery.get_current','healthos://sleep/latest':'sleep.get_latest',
  'healthos://body/trends':'body.get_weight_trend','healthos://goals':'goals.get_active',
  'healthos://capabilities':'health.get_capabilities','healthos://nutrition/water':'nutrition.get_water',
  'healthos://training/program':'training.get_program','healthos://habits/today':'habits.get_today',
} as const;
export class McpDomainError extends Error {constructor(public code:string,message:string,public retryable=false){super(message);}}
export const executionSchema=z.object({executor:z.enum(['cloud','web','android','unavailable']),reason:z.string(),requiredCapability:z.string().optional(),availableExecutors:z.array(z.enum(['cloud','web','android'])).optional(),source:z.enum(['synchronized','device']).optional(),verified:z.boolean().optional(),asOf:z.string().optional()});
export const responseSchema=z.object({runId:z.string().max(150).optional(),actionType:z.string().max(100).optional(),executedAt:z.string().datetime().optional(),executor:z.string().max(150).optional(),verificationState:z.enum(['verified','pending','failed']).optional(),success:z.boolean(),data:z.unknown().optional(),actionReceiptId:z.string().optional(),summary:z.string().optional(),changedRecords:z.array(z.object({id:z.string(),type:z.string()})).optional(),warnings:z.array(z.string()).optional(),requiresUserAttention:z.boolean().optional(),undoable:z.boolean().optional(),pendingActionId:z.string().optional(),expiresAt:z.number().optional(),status:z.string().optional(),action:z.string().optional(),execution:executionSchema.optional(),error:z.object({code:z.string(),message:z.string(),retryable:z.boolean(),nextStep:z.string()}).optional()}).strict();
export function safeError(error:unknown){const known=error instanceof McpDomainError;return {success:false,error:{code:known?error.code:'INTERNAL_ERROR',message:known?error.message:'Health OS could not complete the request.',retryable:known&&error.retryable,nextStep:'Review Health OS and retry with the same idempotency key.'}};}
