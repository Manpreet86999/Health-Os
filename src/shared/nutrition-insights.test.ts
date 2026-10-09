import test from 'node:test';
import assert from 'node:assert/strict';
import { observedChange, proteinEnergyInsight } from './nutrition-insights.js';

const series=Array.from({length:28},(_,index)=>({date:`2026-09-${String(index+1).padStart(2,'0')}`,Protein:index%2?170:100,Energy:index%2?8:4}));
test('insight differences require coverage in both windows',()=>{
  assert.equal(observedChange(series.map((row,index)=>({date:row.date,value:index<14?null:8}))).difference,null);
  assert.equal(observedChange(series.map((row,index)=>({date:row.date,value:index<14?6:8}))).difference,2);
});
test('Smart Insight suppresses short histories',()=>assert.equal(proteinEnergyInsight(series.slice(0,27)),null));
test('Smart Insight suppresses a missing comparison group',()=>assert.equal(proteinEnergyInsight(series.map(row=>({...row,Protein:150}))),null));
test('Smart Insight suppresses unstable and reversed associations',()=>{
  assert.equal(proteinEnergyInsight(series.map((row,index)=>({...row,Energy:index<14?row.Energy:12-row.Energy}))),null);
  assert.equal(proteinEnergyInsight(series.map(row=>({...row,Energy:12-row.Energy}))),null);
});
test('Smart Insight exposes actual samples, dates and comparison means',()=>{
  const result=proteinEnergyInsight(series);assert.ok(result);assert.equal(result.samples,28);assert.equal(result.lowerCount,14);assert.equal(result.higherCount,14);assert.equal(result.low,4);assert.equal(result.high,8);assert.equal(result.from,'2026-09-01');assert.equal(result.to,'2026-09-28');
});
test('duplicate days cannot inflate Smart Insight sample size',()=>assert.equal(proteinEnergyInsight([...series,series[0]]),null));
