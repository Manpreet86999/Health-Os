import {z} from 'zod';
const dated=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v).optional()}).strict();
const history=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v).optional(),days:z.number().int().min(1).max(366).default(28),limit:z.number().int().min(1).max(100).default(30),offset:z.number().int().min(0).max(10000).default(0)}).strict();
export const cloudReadDefinitions={
 'body.get_current':{scope:'body.read',risk:'R0',description:'Read current recorded body metrics and normalized weight trend from available observations.',schema:dated},
 'training.get_recent_history':{scope:'training.read',risk:'R0',description:'Read paginated synchronized completed workouts; equivalent to training.get_history.',schema:history},
 'training.get_recent_load':{scope:'training.read',risk:'R0',description:'Read recent completed training load using Health OS calculations, without local workout drafts.',schema:dated},
 'nutrition.get_remaining_targets':{scope:'nutrition.read',risk:'R0',description:'Read remaining saved daily calorie and macro targets. Missing targets stay unknown; unlogged intake is not inferred.',schema:dated},
 'nutrition.get_recent_meals':{scope:'nutrition.read',risk:'R0',description:'Read paginated recorded meals; equivalent to nutrition.get_meals.',schema:history},
 'recovery.get_soreness':{scope:'recovery.read',risk:'R0',description:'Read recorded general and regional soreness; missing observations stay unknown.',schema:dated},
 'sleep.get_baseline':{scope:'sleep.read',risk:'R0',description:'Read personal sleep baseline, recorded coverage and target from Health OS calculations.',schema:dated},
 'intelligence.get_priorities':{scope:'intelligence.read',risk:'R0',description:'Read non-medical Health OS priorities; equivalent to health.get_priorities.',schema:dated},
 'intelligence.get_predictions':{scope:'intelligence.read',risk:'R0',description:'Read conservative non-medical predictions computed from available evidence; does not change Intelligence projections.',schema:dated},
} as const;
export const readAliases={'training.get_recent_history':'training.get_history','nutrition.get_recent_meals':'nutrition.get_meals','intelligence.get_priorities':'health.get_priorities'} as const;
