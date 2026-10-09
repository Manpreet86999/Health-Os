import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bioSchema, readiness, type BioRecord } from './biology.js';
import { atTime, buildTimeline, daySeries, shiftDay } from './biological-intelligence.js';
import { quietHours, evaluateNudges } from './biological-automations.js';
import { emptySkinState } from './skin.js';
import type { AppDb } from './types.js';

const date='2026-09-30';

test('dense imported history produces 90-day charts without freezing and preserves daily selections',()=>{
  const history=Array.from({length:20000},(_,i)=>{
    const day=shiftDay(date,-(i%90));
    return record({id:`dense-${i}`,timestamp:atTime(day,`${String(Math.floor(i/90)%24).padStart(2,'0')}:00`),value:i,metadata:{metric:'Steps'}});
  });
  const start=performance.now();
  const series=daySeries(history,db(),emptySkinState(),date,90);
  const elapsed=performance.now()-start;
  assert.equal(series.length,90);
  for(const point of series){
    const timestamp=atTime(point.date,'23:00');
    const latest=history.find(r=>r.timestamp===timestamp);
    assert.equal(point.Steps,latest?.value??null);
  }
  for(const point of series.filter((_,i)=>i%15===0)){
    assert.equal(point.Readiness,readiness(history,point.date).score);
    assert.equal(point.Calories,null);
  }
  assert.ok(elapsed<3000,`90-day chart blocked for ${elapsed.toFixed(0)} ms`);
});
function record(patch:Partial<BioRecord>):BioRecord{return bioSchema.parse({id:crypto.randomUUID(),userId:'test-user',domain:'Health',type:'vital',name:'Test',timestamp:atTime(date),source:'Test',deviceId:'test',quality:'manual',syncState:'saved',revision:1,createdAt:atTime(date),updatedAt:atTime(date),unit:'',metadata:{},...patch});}
function db():AppDb{return {sessions:[],cardio:[],habitLogs:[],habits:[],scheduledWorkouts:[],measurements:[],readiness:[],profile:{units:'kg'},trainingConfig:{reminders:{trainTime:'17:00'}}} as unknown as AppDb;}

test('a multi-time dose schedule completes only its matching time and stays idempotent',()=>{
  const schedule=record({id:'schedule',type:'medication',name:'Scheduled dose',metadata:{times:'09:00, 21:00',dose:'As prescribed'}});
  const dose=record({type:'dose',name:'Scheduled dose',timestamp:atTime(date,'09:05'),metadata:{parentId:'schedule',scheduledTime:'09:00',status:'Taken'}});
  const events=buildTimeline([schedule,dose],db(),emptySkinState(),date);
  assert.equal(events.filter(e=>e.type==='dose').length,1);
  assert.equal(events.filter(e=>e.type==='medication'&&e.status==='planned').length,1);
  assert.equal(events.find(e=>e.type==='medication')?.timestamp,atTime(date,'21:00'));
});
test('setup entries never pretend to be actual meals or completed habits',()=>{
  const recipe=record({type:'recipe',domain:'Eat',metadata:{calories:500}}),habit=record({type:'habit',domain:'Today'});
  const events=buildTimeline([recipe,habit],db(),emptySkinState(),date);
  assert.equal(events.some(e=>e.type==='recipe'||e.type==='meal'||e.status==='done'),false);
  assert.equal(events.find(e=>e.type==='habit')?.status,'planned');
});
test('a medication explicitly marked Stopped does not create a scheduled dose',()=>{
  const stopped=record({type:'medication',metadata:{status:'Stopped',time:'09:00'}});
  assert.equal(buildTimeline([stopped],db(),emptySkinState(),date).some(e=>e.type==='medication'&&e.status==='planned'),false);
});
test('missing training and an empty finished session never produce infinite strength',()=>{
  const data=db();
  data.sessions=[{id:'empty',date,status:'finished',logs:[]} as any];
  const series=daySeries([],data,emptySkinState(),date,2);
  assert.equal(series[1].Strength,null);
  assert.equal(series[0].Volume,null);
});
test('quiet hours wrap midnight and dismissed reminders do not reappear',()=>{
  assert.equal(quietHours(new Date(`${date}T23:00:00`),'22:00','07:00'),true);
  assert.equal(quietHours(new Date(`${date}T12:00:00`),'22:00','07:00'),false);
  const dismissed=record({type:'automationEvent',domain:'Today',metadata:{eventId:`checkin-${date}`,status:'dismissed'}});
  assert.equal(evaluateNudges([dismissed],db(),emptySkinState(),new Date(`${date}T12:00:00`)).some(n=>n.id===`checkin-${date}`),false);
  assert.equal(shiftDay('2026-10-01',-1),date);
});

test('automation switches cannot replace the reminder quiet-hour preference',()=>{
  const reminder=record({id:'reminder-preferences',type:'nudgePreference',domain:'Today',metadata:{quietStart:'11:00',quietEnd:'14:00'}});
  const automation=record({id:'health-os-automation-settings',type:'nudgePreference',domain:'Today',updatedAt:`${date}T14:00:00.000Z`,metadata:{mealPatterns:false}});
  assert.deepEqual(evaluateNudges([reminder,automation],db(),emptySkinState(),new Date(`${date}T12:00:00`)),[]);
});

test('legacy quiet hours remain effective until a dedicated reminder preference exists',()=>{
  const legacy=record({id:'health-os-automation-settings',type:'nudgePreference',domain:'Today',metadata:{quietStart:'11:00',quietEnd:'14:00'}});
  assert.deepEqual(evaluateNudges([legacy],db(),emptySkinState(),new Date(`${date}T12:00:00`)),[]);
  const dedicated=record({id:'reminder-preferences',type:'nudgePreference',domain:'Today',metadata:{quietStart:'22:00',quietEnd:'07:00'}});
  assert.ok(evaluateNudges([legacy,dedicated],db(),emptySkinState(),new Date(`${date}T12:00:00`)).length>0);
});


test('description-only meals do not invent zero-calorie or zero-protein observations',()=>{
  const meal=record({type:'meal',metadata:{notes:'A meal without verified nutrition'}});
  const values=daySeries([meal],db(),emptySkinState(),date,1)[0];
  assert.equal(values.Calories,null);assert.equal(values.Protein,null);assert.equal(values.Carbohydrates,null);
  const measured=daySeries([{...meal,metadata:{calories:0,protein:25}}],db(),emptySkinState(),date,1)[0];
  assert.equal(measured.Calories,0);assert.equal(measured.Protein,25);assert.equal(measured.Carbohydrates,null);
});
