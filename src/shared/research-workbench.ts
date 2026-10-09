import { z } from 'zod';
const number=z.number().finite();
const base=z.object({consent:z.literal(true),purpose:z.string().trim().min(3).max(500),track:z.boolean().default(false)});
const vector=z.array(number).min(1).max(8),matrix=z.array(vector).min(1).max(2000);
const features=z.array(z.string().min(1).max(100)).min(1).max(20);
export const researchWorkbenchSchema=z.discriminatedUnion('operation',[
  base.extend({operation:z.literal('forecast'),horizonDays:z.number().int().min(1).max(14).default(7),rows:z.array(z.object({date:z.string().min(10).max(40),value:number,metric:z.string().min(1).max(100),unit:z.string().min(1).max(30),source:z.string().min(1).max(100),deviceId:z.string().max(100)})).min(42).max(2000)}),
  base.extend({operation:z.literal('sequence'),model:z.enum(['aeon-forest','cnn','gru','lstm','transformer']),features:features.max(8),outcomeDefinition:z.string().trim().min(3).max(500),horizonDays:z.number().int().min(1).max(30).default(3),epochs:z.number().int().min(1).max(20).default(5),rows:z.array(z.object({participantId:z.string().min(1).max(80),date:z.string().min(10).max(40),windowEnd:z.string().min(10).max(40),values:matrix.min(7).max(28),label:z.union([z.literal(0),z.literal(1)])})).min(100).max(2000)}),
  base.extend({operation:z.literal('train'),model:z.enum(['logistic','random-forest','xgboost','lightgbm']),features,outcomeDefinition:z.string().trim().min(3).max(500),horizonDays:z.number().int().min(1).max(30).default(3),explain:z.boolean().default(false),rows:z.array(z.object({participantId:z.string().min(1).max(80),date:z.string().min(10).max(40),label:z.union([z.literal(0),z.literal(1)])}).catchall(z.union([number,z.string().max(100),z.null()]))).min(100).max(5000)}),
  base.extend({operation:z.literal('autoencoder'),baseline:matrix.min(28),current:matrix.max(100)}),
  base.extend({operation:z.literal('isolation'),baseline:matrix.min(28),current:matrix.max(100)}),
  base.extend({operation:z.literal('change-points'),values:z.array(number).min(14).max(2000)}),
  base.extend({operation:z.literal('features'),export:z.object({consent:z.object({at:z.string().min(1).max(40),purpose:z.string().min(3).max(500)}),rows:z.array(z.record(z.string(),z.unknown())).min(1).max(2000)})}),
]);
export type ResearchWorkbenchInput=z.infer<typeof researchWorkbenchSchema>;
