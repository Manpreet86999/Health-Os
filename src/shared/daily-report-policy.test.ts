import test from 'node:test';
import assert from 'node:assert/strict';
import {istDate,canSendDailyReport,completeNutritionGoals,weekNeedsGoals} from './daily-report-policy';
test('IST calendar changes at midnight and sending opens exactly at 23:00',()=>{
 assert.equal(istDate(new Date('2026-10-16T18:29:59Z')),'2026-10-16');
 assert.equal(istDate(new Date('2026-10-16T18:30:00Z')),'2026-10-17');
 assert.equal(canSendDailyReport('2026-10-16',new Date('2026-10-16T17:29:59.999Z')),false);
 assert.equal(canSendDailyReport('2026-10-16',new Date('2026-10-16T17:30:00Z')),true);
 assert.equal(canSendDailyReport('2026-10-17',new Date('2026-10-16T18:30:00Z')),false);
 assert.equal(canSendDailyReport('2026-10-15',new Date('2026-10-16T00:00:00Z')),true);
 assert.equal(canSendDailyReport('2026-02-30'),false);
});
test('a new week requires every positive bounded goal, without coercing blank inputs',()=>{
 const goals={calories:2400,protein:150,carbs:280,fat:80,fibre:30,water:3000};
 assert.equal(completeNutritionGoals(goals),true);
 for(const key of Object.keys(goals)){
  assert.equal(completeNutritionGoals({...goals,[key]:0}),false);
  assert.equal(completeNutritionGoals({...goals,[key]:''}),false);
  assert.equal(completeNutritionGoals({...goals,[key]:Infinity}),false);
 }
 assert.equal(weekNeedsGoals({nutritionGoalsRequired:true}),true);
 assert.equal(weekNeedsGoals({nutritionGoalsRequired:true,nutritionGoals:goals}),false);
 assert.equal(weekNeedsGoals({name:'Existing week'}),false);
});
