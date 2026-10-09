import { test, expect } from '@playwright/test';
import { setup, owner } from './cloud-fixture';
import fs from 'node:fs';
import { dateOf } from '../../src/shared/biology';
import { shiftDay, atTime } from '../../src/shared/biological-intelligence';

test('experiments show converted outcomes and explain excluded units without changing source records',async({page})=>{
  const fixture=await setup(page,true,true),date=dateOf(new Date().toISOString()),start=shiftDay(date,-2);
  const add=(id:string,type:string,day:string,value:number|undefined,unit:string,metadata:Record<string,string|number>)=>{
    const timestamp=atTime(day);
    fixture.biological.push({record_id:id,revision:1,change_version:fixture.biological.length+1,payload:{id,userId:owner,type,domain:'Insights',name:id,value,unit,metadata,timestamp,source:'Contract fixture',deviceId:'test',createdAt:timestamp,updatedAt:timestamp,revision:1,quality:'measured',syncState:'saved'}});
  };
  add('Unit comparison experiment','experiment',start,undefined,'',{question:'Compare weight consistently',start,baselineDays:14,days:7,metric:'Weight'});
  add('weight-before','vital',shiftDay(start,-1),70,'kg',{metric:'Weight'});
  add('weight-during','vital',start,154.323583526,'lbs',{metric:'Weight'});
  add('unsupported-weight','vital',shiftDay(start,1),11,'stone',{metric:'Weight'});
  const original=JSON.stringify(fixture.biological);
  await page.goto('/#Experiments',{waitUntil:'domcontentloaded'});
  const result=page.getByRole('heading',{name:'Compare weight consistently',exact:true}).locator('..');
  await expect(result).toContainText('Outcome: Weight (kg)');
  await expect(result.getByRole('button',{name:/Before/})).toContainText('70');
  await expect(result.getByRole('button',{name:/During/})).toContainText('70');
  await expect(result).toContainText('1 outcome readings excluded because their units could not be compared');
  await expect(result).toContainText('Results do not establish causality');
  expect(JSON.stringify(fixture.biological)).toBe(original);
});

test('Today mounts deeper evidence on request and keeps its domain actions usable',async({page})=>{
  await setup(page,true,true);await page.goto('/#Today',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('region',{name:'Today recommendation'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Next action',exact:true})).toHaveCount(0);
  await page.getByText('Readiness evidence & other actions',{exact:true}).click();
  await expect(page.getByRole('heading',{name:'Next action',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Your health domains'})).toHaveCount(0);
  await page.getByText('Your health at a glance',{exact:true}).click();
  const domains=page.getByRole('region',{name:'Your health domains'});await expect(domains).toBeVisible();
  await domains.getByRole('button',{name:/Body.*View your progress/}).click();
  await expect(page).toHaveURL(/#Body/);
});

test('automation editor loads on demand and creates a reminder only after an explicit action',async({page})=>{
  const fixture=await setup(page,true,true);
  await page.goto('/#Nudges',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:/Your day, on autopilot/})).toBeVisible();
  expect(fixture.biological.filter(row=>row.payload.type==='automation')).toHaveLength(0);
  await page.getByRole('button',{name:/Hydration breaks/}).click();
  await expect.poll(()=>fixture.biological.filter(row=>row.payload.type==='automation').length).toBe(1);
  const reminder=fixture.biological.find(row=>row.payload.type==='automation')!.payload;
  expect(reminder.metadata).toMatchObject({trigger:'time',time:'09:00',action:'water',enabled:true});
  await page.getByRole('tab',{name:'Reminders',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pause Hydration breaks',exact:true})).toBeVisible();
});

test('Today ranks personal recovery with inspectable evidence from recorded history',async({page})=>{
  const fixture=await setup(page,true,true),date=dateOf(new Date().toISOString());
  for(let index=0;index<29;index++){
    const day=shiftDay(date,-index),timestamp=atTime(day);
    const id=`phase-six-sleep-${index}`;
    fixture.biological.push({record_id:id,revision:1,change_version:fixture.biological.length+1,payload:{id,userId:owner,type:'sleep',domain:'Recover',name:'Sleep',value:index===0?5:8,unit:'hours',metadata:{},timestamp,source:'Contract fixture',deviceId:'test',createdAt:timestamp,updatedAt:timestamp,revision:1,quality:'measured',syncState:'saved'}});
  }
  await page.goto('/#Today',{waitUntil:'domcontentloaded'});const answer=page.getByRole('region',{name:'Today recommendation'});
  await expect(answer.getByRole('heading',{name:'Make room to recover'})).toBeVisible();
  await answer.getByText('Personal evidence',{exact:true}).click();await expect(answer).toContainText('180 min below');await expect(answer).toContainText('not diagnoses');
  await answer.getByRole('button',{name:'View recovery',exact:true}).click();await expect(page).toHaveURL(/Recover/);
});

test('repeat meals and command navigation produce measured friction evidence',async({page})=>{
  const fixture=await setup(page,true,true),timestamp=new Date().toISOString(),id='phase6-meal';
  fixture.biological.push({record_id:id,revision:1,change_version:1,payload:{id,userId:owner,type:'meal',domain:'Eat',name:'Repeat lunch',unit:'',metadata:{meal:'Lunch',calories:500,protein:35},timestamp,source:'Contract fixture',deviceId:'test',createdAt:timestamp,updatedAt:timestamp,revision:1,quality:'manual',syncState:'saved'}});
  await page.goto('/#Eat/Food%20Diary',{waitUntil:'domcontentloaded'});const repeat=page.getByRole('button',{name:'Repeat Repeat lunch',exact:true});await expect(repeat).toBeVisible();
  const start=performance.now();await repeat.click();await expect.poll(()=>fixture.biological.filter(row=>row.payload.type==='meal').length).toBe(2);
  const repeatMs=performance.now()-start;
  const navigationStart=performance.now();await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'Health OS command center'}).getByRole('textbox').fill('Personal Baselines');await page.keyboard.press('Enter');await expect(page.getByRole('region',{name:'Personal baseline evidence'})).toBeVisible();
  fs.mkdirSync('outputs/health-os-6',{recursive:true});fs.writeFileSync('outputs/health-os-6/friction.json',JSON.stringify({measuredAt:new Date().toISOString(),environment:'Local Vite + mocked authenticated Supabase',repeatMeal:{clicks:1,typedFields:0,pageChanges:0,saveObservedMs:repeatMs},openBaseline:{interactions:3,pageChanges:1,completionMs:performance.now()-navigationStart},limitations:['Single synthetic run; not real-user percentiles.','Save observation includes browser test polling and fixture latency.','No competitor timing was measured.']},null,2));
});

test('training adaptation previews constraints and starts only after explicit acceptance',async({page})=>{
  const fixture=await setup(page);await page.goto('/#Dashboard',{waitUntil:'domcontentloaded'});const adaptation=page.getByRole('group',{name:'Session adaptation'});
  await adaptation.getByText('Adapt this session to today',{exact:true}).click();await adaptation.getByRole('spinbutton',{name:'Available minutes',exact:true}).fill('20');
  await expect(adaptation).toContainText('Estimated');expect(fixture.records.filter(row=>row.entity_type==='session')).toHaveLength(0);
  await adaptation.getByRole('button',{name:'Use this session proposal',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Set 1 load',exact:true})).toBeVisible();
  expect(fixture.records.filter(row=>row.entity_type==='session')).toHaveLength(0);
  await page.getByRole('spinbutton',{name:'Set 1 load',exact:true}).fill('60');await page.getByRole('spinbutton',{name:'Set 1 reps',exact:true}).fill('5');
  const start=performance.now();await page.getByRole('button',{name:'Complete Set',exact:true}).click();await page.getByRole('button',{name:'Skip rest · continue',exact:true}).click();await page.getByRole('button',{name:'Save & next',exact:true}).click();await expect(page.getByRole('button',{name:'Save workout',exact:true})).toBeVisible();
  const path='outputs/health-os-6/friction.json',report=fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):{};
  fs.mkdirSync('outputs/health-os-6',{recursive:true});fs.writeFileSync(path,JSON.stringify({...report,logSet:{interactionsAfterValuesReady:1,completionObservedMs:performance.now()-start,note:'One exercise fixture; performed session still requires explicit save.'}},null,2));
});
