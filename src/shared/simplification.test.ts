import test from 'node:test';
import assert from 'node:assert/strict';
import {bioSchema,dailyNutrition,nutrition,type BioRecord} from './biology.js';
import {nutritionTotalWrite,nutritionTotalsInput} from './daily-nutrition.js';
import {executeHealthAction,type HealthActionServices} from './health-action-registry.js';
import {sections,viewManifest,readRoute,routeHref} from '../client/lib/os-navigation.js';
import {defaultProfile} from './defaults.js';
import {emptySkinState} from './skin.js';
import {daySeries} from './biological-intelligence.js';
import {describeMcpCapabilities} from './mcp-contracts.js';
import type {AppDb} from './types.js';
const date='2026-10-15';
const row=(patch:Partial<BioRecord>):BioRecord=>bioSchema.parse({id:crypto.randomUUID(),type:'meal',domain:'Eat',userId:'owner',deviceId:'test',name:'Historical meal',timestamp:date+'T12:00:00Z',createdAt:date+'T12:00:00Z',updatedAt:date+'T12:00:00Z',unit:'',source:'test',quality:'manual',syncState:'saved',revision:1,metadata:{},...patch});
const db={meta:{},profile:defaultProfile(),weeks:[],sessions:[],targets:[],habits:[],habitLogs:[],measurements:[],readiness:[],cardio:[],scheduledWorkouts:[],painLogs:[],goalCheckIns:[],programs:[],trainingConfig:{},exercises:[]} as unknown as AppDb;
test('seven public domains and every public route round trips without retired destinations',()=>{
 assert.deepEqual(sections.map(s=>s.name),['Today','Train','Recover','Body','Insights','Search','Settings']);
 for(const view of viewManifest)assert.deepEqual(readRoute(routeHref(view.page,view.panel)),{page:view.page,panel:view.panel});
 for(const removed of ['Intelligence','Eat','Health','SkinOverview','SkinAi','Coach'])assert.deepEqual(readRoute('#'+removed),{page:'Today',panel:''});
 assert.deepEqual(readRoute('#Today/Pods'),{page:'Today',panel:''});
 assert.deepEqual(readRoute('#Settings/Intelligence'),{page:'Settings',panel:''});
 assert.deepEqual(readRoute('#Insights/Analytics%20Care'),{page:'Insights',panel:''});
 assert.deepEqual(readRoute('#Sync'),{page:'Settings',panel:'Data & account'});
});
test('daily totals preserve historical meals, override instead of add, and keep unknowns',()=>{
 const old=row({metadata:{calories:500,protein:30}}),total=row(nutritionTotalWrite([old],date,{calories:2150,protein:165,carbs:220,fat:68,fibre:31,water:3000}));
 assert.equal(dailyNutrition([old,total],date).calories,2150);assert.equal(nutrition([old,total],date).protein,165);assert.equal(old.metadata.calories,500);
 assert.equal(dailyNutrition([old,total],'2026-10-14').calories,null);
 const next=row(nutritionTotalWrite([old,total],date,{protein:170}));assert.equal(next.id,total.id);assert.equal(next.metadata.calories,2150);
 assert.equal(dailyNutrition([old],date).fat,null);
});
test('hydration totals include later water logs once and edits rebase without duplicating them',()=>{
 const water=row({type:'water',value:500,unit:'mL',metadata:{}}),total=row(nutritionTotalWrite([water],date,{water:3000})),later=row({type:'water',value:250,unit:'mL',metadata:{}});
 assert.equal(dailyNutrition([water,total,later],date).water,3250);
 const edit=row(nutritionTotalWrite([water,total,later],date,{water:3500}));assert.equal(dailyNutrition([water,edit,later],date).water,3500);
});
test('daily inputs reject negatives, nonfinite numbers and impossible dates remain schema validated',()=>{
 for(const patch of [{calories:-1},{protein:Infinity},{water:20001}])assert.equal(nutritionTotalsInput.safeParse(patch).success,false);
 assert.throws(()=>row({type:'nutritionDay',metadata:{dailyTotals:true,water:-1}}));
});
test('Insights charts use saved daily totals including zero rather than historical meals',()=>{
 const totals=row(nutritionTotalWrite([],date,{calories:0,protein:160,carbs:215,fat:65}));
 const series=daySeries([totals],db,emptySkinState(),date,1);assert.equal(series[0].Calories,0);assert.equal(series[0].Protein,160);assert.equal(series[0].Fat,65);assert.equal(series[0].Carbohydrates,215);
});
test('MCP daily totals persist atomically, update selected dates and replay receipts once',async()=>{
 const rows:BioRecord[]=[],service:HealthActionServices={dataset:{userId:'owner',db,skin:emptySkinState(),records:rows},today:date,readRecords:async()=>rows,saveMany:async()=>{throw new Error('Use transaction');},commit:async(writes,_deletes,expected)=>{
  for(const e of expected)assert.equal(rows.find(r=>r.id===e.id)?.revision??null,e.revision);
  for(const w of writes){const old=rows.find(r=>r.id===w.id),next=row({...old,...w,revision:(old?.revision||0)+1,updatedAt:new Date().toISOString()});if(old)Object.assign(old,next);else rows.push(next);}
 }};
 const receipt=crypto.randomUUID(),input={date,idempotencyKey:'daily-totals-first',calories:2100,protein:160,carbs:215,fat:65};
 const first=await executeHealthAction('nutrition.set_daily_totals',input,service,receipt);
 assert.deepEqual(await executeHealthAction('nutrition.set_daily_totals',input,service,receipt),first);assert.equal(rows.filter(r=>r.type==='nutritionDay').length,1);
 await executeHealthAction('nutrition.set_daily_totals',{date,idempotencyKey:'daily-totals-update',protein:170},service,crypto.randomUUID());
 const today=await executeHealthAction('nutrition.get_today',{date},service,'read');assert.equal((today.data as any).totals.calories,2100);assert.equal((today.data as any).totals.protein,170);
 const history=await executeHealthAction('nutrition.get_history',{from:date,to:date},service,'history');assert.equal((history.data as any).items[0].protein,170);
 assert.equal(rows.filter(r=>r.type==='nutritionDay').length,1);
});
test('MCP public catalog retains core logging and omits retired food, care, medical and assistant tools',()=>{
 const ids=describeMcpCapabilities().tools.map(t=>t.name);assert.ok(ids.includes('nutrition.set_daily_totals'));assert.ok(ids.includes('sleep.log_session'));assert.ok(ids.includes('training.get_today'));assert.ok(ids.includes('habits.get_today'));assert.ok(ids.includes('goals.get_progress'));
 assert.ok(!ids.some(id=>/^(care|medical|intelligence)\./.test(id)));assert.ok(!ids.includes('nutrition.search_foods'));
});
