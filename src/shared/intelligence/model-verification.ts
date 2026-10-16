import {z} from 'zod';
export const modelVerificationSchema=z.object({approved:z.boolean(),grounded:z.boolean(),missingEvidence:z.array(z.string().max(500)).max(20),unsupportedClaims:z.array(z.string().max(500)).max(20),risk:z.enum(['low','medium','high']),needsRevision:z.boolean()}).strict();
export type ModelVerification=z.infer<typeof modelVerificationSchema>;
