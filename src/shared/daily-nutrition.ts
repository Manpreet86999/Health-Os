import { z } from 'zod';
import { dailyNutritionRecord,dateOf,type BioRecord } from './biology.js';
export const nutritionTotalsInput=z.object({
  calories:z.number().min(0).max(20000).optional(),protein:z.number().min(0).max(1000).optional(),
  carbs:z.number().min(0).max(3000).optional(),fat:z.number().min(0).max(1000).optional(),
  fibre:z.number().min(0).max(300).optional(),water:z.number().min(0).max(20000).optional(),
  note:z.string().max(2000).optional(),
}).strict();
export function nutritionTotalWrite(records:BioRecord[],date:string,raw:z.infer<typeof nutritionTotalsInput>){
  const input=nutritionTotalsInput.parse(raw),old=dailyNutritionRecord(records,date);
  const {note,...totals}=input;
  return {id:old?.id||`nutrition-totals-${date}`,type:'nutritionDay' as const,domain:'Recover' as const,name:'Daily nutrition totals',
    timestamp:old?.timestamp||new Date(`${date}T12:00:00`).toISOString(),source:'Health OS daily totals',quality:'manual' as const,
    metadata:{...old?.metadata,...totals,dailyTotals:true,...(note!==undefined?{notes:note}:{}),
      ...(input.water!==undefined?{waterEntryIds:JSON.stringify(records.filter(r=>!r.deletedAt&&r.type==='water'&&dateOf(r.timestamp)===date).map(r=>r.id))}:{})}};
}
