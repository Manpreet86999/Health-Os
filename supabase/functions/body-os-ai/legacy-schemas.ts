import {z} from 'zod';
import {careTaskSchema} from '../../../src/shared/intelligence/agent-contracts.ts';
import {PRODUCT_CATEGORIES} from '../../../src/shared/skin.ts';
const text=z.string().max(16000),note=z.string().max(4000),nutrient=z.number().finite().min(0).max(4000);
export function legacyResponseSchema(action:string){
 if(['/ai/workout-gen','/ai/auto-regulate'].includes(action))return z.object({name:z.string().min(1).max(250),exercises:z.array(z.object({name:z.string().min(1).max(250),target:z.string().max(250),vol:z.string().min(1).max(250),cue:z.string().max(1000),trackingMode:z.enum(['weight_reps','reps','time']).optional()}).strict()).min(1).max(50)}).strict();
 if(action==='/ai/exercise-cues')return z.object({cues:z.array(z.string().min(1).max(1000)).min(1).max(20)}).strict();
 if(action==='/ai/plateau-buster')return z.object({advice:z.array(z.string().min(1).max(1000)).min(1).max(20)}).strict();
 if(action==='/ai/skin/build-routine'){const item=z.object({product:z.string().min(1).max(250),waitMin:z.number().min(0).max(120)}).strict();return z.object({am:z.array(item).max(30),pm:z.array(item).max(30),notes:note}).strict();}
 if(action==='/ai/skin')return z.object({answer:text,proposal:z.object({reason:z.string().min(1).max(500),tasks:z.array(careTaskSchema).min(1).max(30)}).strict().nullable()}).strict();
 if(['/skin/products/read-label','/skin/products/search-web'].includes(action))return z.object({answer:text,proposal:z.object({name:z.string().max(200),brand:z.string().max(150),category:z.enum(PRODUCT_CATEGORIES),actives:z.array(z.string().max(200)).max(30),useCase:z.string().max(1000),bestFor:z.array(z.string().max(200)).max(10),sourceUrl:z.string().max(2000),sourceExcerpt:z.string().max(1500)}).strict()}).strict();
 if(action==='/biology/estimate-meal')return z.object({name:z.string().min(1).max(250),calories:z.number().finite().min(0).max(20000),protein:nutrient,carbs:nutrient,fat:nutrient,fibre:nutrient,notes:note.optional()}).strict();
 if(action==='/biology/parse-capture')return z.object({kind:z.enum(['meal','water','sleep','vital','recoveryNote','symptom','bodyMeasurement','journal','dose']),defaults:z.record(z.string().max(100),z.union([z.string().max(4000),z.boolean(),z.number().finite()])),explanation:note}).strict();
 if(action==='/ai/analyze-session')return z.object({overallSummary:z.string().min(1).max(4000),exerciseComments:z.record(z.string().max(250),z.string().max(2000))}).strict();
 return z.object({answer:z.string().min(1).max(16000)}).strict();
}
