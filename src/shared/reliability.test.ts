import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKeySchema, sessionInputSchema, aiReportSchema } from './schemas.js';
import { hydrationLiters } from './evidence.js';
import { normalizeReadiness } from './readiness.js';
import { mergeDecision, readCloud, writeCloud, CloudConflictError, type CloudRecord } from './cloud.js';
import { summarizeHealth, type HealthReading } from './health.js';
import { reminderMinute } from './reminders.js';

test('validation rejects impossible dates, nonnumeric loads and malformed AI reports',()=>{
  assert.equal(dateKeySchema.safeParse('2026-02-30').success,false);
  assert.equal(dateKeySchema.safeParse('2024-02-29').success,true);
  assert.equal(sessionInputSchema.safeParse({logs:[{name:'Bench',sets:[{s:1,w:'oops',r:8}]}]}).success,false);
  assert.equal(aiReportSchema.safeParse({overallSummary:'Fine',exerciseComments:['invented']}).success,false);
});
test('equivalent explicit hydration units convert consistently',()=>{
  assert.equal(hydrationLiters(2000,'mL'),hydrationLiters(2,'L'));
  assert.ok(Math.abs(hydrationLiters(67.6280454,'fl oz')-2)<1e-6);
});
test('readiness requires complete inputs, ignores protein/hydration, and includes capped steps',()=>{
  assert.ok(normalizeReadiness({date:'2026-09-07',sleepHours:8}).error);
  const input={date:'2026-09-07',sleepHours:8,sleepQuality:8,soreness:3,energy:8,stress:3,motivation:8,mood:8,painFlag:false};
  const a=normalizeReadiness(input).item!, b=normalizeReadiness({...input,mealProtein:1000,hydration:8,steps:8000}).item!, c=normalizeReadiness({...input,steps:100000}).item!;
  assert.ok(b.score > a.score); assert.equal(b.score,c.score); assert.equal(a.evidence?.kind,'estimated');
});
const record=(value:number):CloudRecord=>({id:'m1',entityType:'measurement',payload:{weight:value,date:'2026-09-07'},revision:1,updatedAt:'2026-09-07T00:00:00Z',deviceId:'test',cloudVersion:'2026-09-07T00:00:00Z'});
test('three-way merge distinguishes one-sided edits, concurrent edits and deletion',()=>{
  assert.equal(mergeDecision(record(80),record(80)),'same');
  assert.equal(mergeDecision(record(81),record(80),{...record(80),localPayload:record(81).payload} as CloudRecord),'same');
  assert.equal(mergeDecision(record(81),record(80),record(80)),'upload');
  assert.equal(mergeDecision(record(80),record(81),record(80)),'download');
  assert.equal(mergeDecision(record(82),record(81),record(80)),'conflict');
  assert.equal(mergeDecision({...record(80),deletedAt:'2026-09-07'},record(81),record(80)),'conflict');
});
test('Supabase cloud reads rows and writes use version preconditions',async()=>{
  const old=globalThis.fetch;const urls:string[]=[];
  const row={user_id:'test',entity_type:'measurement',record_id:'m1',payload:{weight:80,date:'2026-09-07'},revision:1,updated_at:'2026-09-07',device_id:'phone',cloud_updated_at:'2026-09-07T00:00:00Z'};
  try {
    globalThis.fetch=async(input)=>{urls.push(String(input));return new Response(JSON.stringify([row]));};
    const records=await readCloud({url:'https://test.supabase.co',publishableKey:'public'},{uid:'test',accessToken:'test'});
    assert.equal(records.length,1);assert.match(urls[0],/body_os_records/);
    globalThis.fetch=async(input)=>{urls.push(String(input));return new Response('{}',{status:412});};
    await assert.rejects(()=>writeCloud({url:'https://test.supabase.co',publishableKey:'public'},{uid:'test',accessToken:'test'},record(81),record(80)),CloudConflictError);
    assert.match(urls.at(-1)!,/cloud_updated_at=eq/);
  } finally {globalThis.fetch=old;}
});
test('health deduplicates IDs and refuses to sum overlapping source records',()=>{
  const r:HealthReading={id:'one',kind:'Steps',value:100,unit:'steps',date:'2026-09-07',startTime:'2026-09-07T00:00:00Z',endTime:'2026-09-07T01:00:00Z',source:'watch',sourceRecordId:'one',importedAt:'2026-09-07T02:00:00Z'};
  assert.equal(summarizeHealth([r,r],r.date)[0].value,100);
  assert.equal(summarizeHealth([r,{...r,id:'two'}],r.date)[0].value,null);
  assert.equal(summarizeHealth([r,{...r,id:'two',source:'phone'}],r.date).length,2);
});
test('reminders respect overnight quiet hours and reject invalid times',()=>{
  assert.equal(reminderMinute('23:00','22:00','07:00'),420);
  assert.equal(reminderMinute('17:00','22:00','07:00'),1020);
  assert.throws(()=>reminderMinute('25:00','22:00','07:00'));
});
