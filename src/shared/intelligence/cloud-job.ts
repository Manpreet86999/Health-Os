import {goalReviewScheduleSchema} from './goal-review-contracts.js';
import {z} from 'zod';
import {backgroundPolicySchema} from './run-contracts.js';
export const cloudRunControlSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('enable'),runId:z.string().min(1).max(150),consent:z.literal(true),days:z.number().int().min(1).max(30).default(7),backgroundPolicy:backgroundPolicySchema.optional(),monitoring:goalReviewScheduleSchema.optional()}).strict(),
 z.object({operation:z.literal('disable'),runId:z.string().min(1).max(150)}).strict(),
 z.object({operation:z.literal('status'),runId:z.string().min(1).max(150)}).strict(),
]);
export const cloudGrantSchema=z.object({ownerId:z.string().uuid(),runId:z.string().min(1).max(150),leaseId:z.string().uuid(),expiresAt:z.string().datetime(),session:z.object({accessToken:z.string().min(1),refreshToken:z.string().min(1),expiresAt:z.number().finite().positive()}).strict()}).strict();
/** Contains no token or credential reference; this is the only client-visible grant shape. */
export const cloudGrantStatusSchema=z.object({enabled:z.boolean(),expiresAt:z.string().nullable(),lastRunAt:z.string().nullable(),lastError:z.enum(['auth_expired','budget_or_provider','execution_blocked','none']).default('none')}).strict();
