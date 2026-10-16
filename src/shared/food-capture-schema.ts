import { z } from 'zod';
export const nutrientKeys = ['calories','protein','carbs','fat','fibre','sugars','saturatedFat','sodium','iron','calcium','potassium','magnesium','zinc','folate','vitaminB12','vitaminC','vitaminD'] as const;
export type Nutrients = Partial<Record<typeof nutrientKeys[number], number>>;
export const units = ['g','kg','ml','l','piece','serving','katori','glass','cup','tsp','tbsp','pack'] as const;
export type FoodUnit = typeof units[number];
export const positive = z.number().finite().positive().max(100000);
export const nutrientsSchema = z.object(Object.fromEntries(nutrientKeys.map(k=>[k,z.number().finite().min(0).max(1000000).optional()]))).strict();
export const profileSchema = z.object({id:z.string().min(1),basisAmount:positive,basisUnit:z.enum(['g','ml','serving']),values:nutrientsSchema,source:z.string().min(1),sourceType:z.enum(['manufacturer_label','open_food_facts','licensed_reference','health_os_curated','user_entered','recipe_calculated','ai_estimated']),confidence:z.number().min(0).max(1),capturedAt:z.string(),sourceUrl:z.string().optional()});
export type NutritionProfile = z.infer<typeof profileSchema> & {values:Nutrients};

export const candidateSchema=z.object({name:z.string().trim().min(1).max(250),quantity:positive.optional(),unit:z.enum(units).optional(),identityConfidence:z.number().min(0).max(1),portionConfidence:z.number().min(0).max(1),alternatives:z.array(z.string().max(250)).max(4).default([])}).strict();
export const captureSchema=z.object({items:z.array(candidateSchema).min(1).max(30),notes:z.string().max(2000).default('')}).strict();
export type Candidate=z.infer<typeof candidateSchema>;
export const labelSchema=z.object({name:z.string().trim().min(1).max(250),brand:z.string().max(200).default(''),basisAmount:positive,basisUnit:z.enum(['g','ml','serving']),servingAmount:positive.optional(),servingsPerPack:positive.optional(),values:nutrientsSchema,confidence:z.number().min(0).max(1),notes:z.string().max(2000).default('')}).strict();
export type Label=z.infer<typeof labelSchema> & {values:Nutrients};
