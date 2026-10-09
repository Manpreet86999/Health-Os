import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeFood } from '../server/services/food-catalog.js';

test('catalogue values use the same gram/milligram/microgram contract across the app',()=>{
  const food=normalizeFood({code:'0123456789012',product_name:'Test cereal',allergens_tags:['en:milk'],nutriments:{energy_100g:418.4,proteins_100g:5,sodium_100g:0.12,'vitamin-b12_100g':0.0000024,iron_100g:-1,fat_100g:'invalid'}})!;
  assert.deepEqual(food.nutrition,{calories:100,protein:5,sodium:120,vitaminB12:2.4});
  assert.equal(food.allergens,'milk');assert.equal(food.code,'0123456789012');
});
test('missing, empty and invalid nutrients remain unknown while real zero stays known',()=>{
  const food=normalizeFood({code:'1234',product_name:'Test',nutriments:{'energy-kcal_100g':null,proteins_100g:'',sodium_100g:false,fiber_100g:0,iron_100g:'0'}})!;
  assert.deepEqual(food.nutrition,{fibre:0,iron:0});
  assert.equal(normalizeFood({code:'invalid',product_name:'Test'}),null);
});
