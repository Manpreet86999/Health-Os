import { test, expect } from '@playwright/test';
import { setup, owner } from './cloud-fixture';
import fs from 'node:fs';

test('Today offers actionable missing logs beside a compact recommendation',async({page})=>{
  test.setTimeout(180000);
  const fixture=await setup(page);
  fixture.records.splice(fixture.records.findIndex(row=>row.entity_type==='readiness'),1);
  const timestamp=new Date().toISOString();
  fixture.biological.push({record_id:'unconfirmed-sleep',revision:1,change_version:1,payload:{id:'unconfirmed-sleep',userId:owner,type:'sleep',domain:'Recover',name:'Unconfirmed sleep',value:8,unit:'hours',metadata:{requiresConfirmation:true},timestamp,source:'Test',deviceId:'test',createdAt:timestamp,updatedAt:timestamp,revision:1,quality:'imported',syncState:'saved'}});
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/#Today');
  const guide=page.getByRole('region',{name:'What to log next'}),answer=page.getByRole('region',{name:'Today recommendation'});
  await expect(guide.getByText('0 / 4 recorded')).toBeVisible({timeout:30000});
  await expect(guide.getByRole('heading',{name:'Check in with yourself'})).toBeVisible();
  const a=await answer.boundingBox(),b=await guide.boundingBox();
  expect(a!.height).toBeLessThan(340);
  expect(b!.x).toBeGreaterThan(a!.x+a!.width);
  fs.mkdirSync('output/today-guidance',{recursive:true});
  await page.locator('.web-today-guidance').screenshot({path:'output/today-guidance/dark-desktop.png'});
  await guide.getByRole('button',{name:'Log sleep',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Bedtime',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await expect(guide).toBeVisible();
  const mobileA=await answer.boundingBox(),mobileB=await guide.boundingBox();
  expect(mobileB!.y).toBeGreaterThanOrEqual(mobileA!.y+mobileA!.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.web-today-guidance').screenshot({path:'output/today-guidance/dark-mobile.png'});
});

test('Recorded log types stop being suggested and light theme stays compact',async({page})=>{
  test.setTimeout(180000);
  const fixture=await setup(page);
  Object.assign(fixture.records.find(row=>row.entity_type==='readiness').payload,{soreness:7,score:73});
  await page.addInitScript(()=>localStorage.setItem('body-os-theme','light'));
  const timestamp=new Date().toISOString();
  for(const type of ['sleep','meal','water']) {
    const id=`guide-${type}`;
    fixture.biological.push({record_id:id,revision:1,change_version:fixture.biological.length+1,payload:{id,userId:owner,type,domain:type==='meal'?'Eat':'Recover',name:type,value:type==='sleep'?8:type==='water'?250:undefined,unit:type==='sleep'?'hours':type==='water'?'mL':'',metadata:{},timestamp,source:'Test',deviceId:'test',createdAt:timestamp,updatedAt:timestamp,revision:1,quality:'manual',syncState:'saved'}});
  }
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/#Today');
  const guide=page.getByRole('region',{name:'What to log next'});
  await expect(guide.getByText('4 / 4 recorded')).toBeVisible({timeout:30000});
  await expect(guide.getByRole('heading',{name:'All four log types recorded'})).toBeVisible();
  await expect(guide.getByRole('button',{name:'Log sleep'})).toHaveCount(0);
  fs.mkdirSync('output/today-guidance',{recursive:true});
  await page.locator('.web-today-guidance').screenshot({path:'output/today-guidance/light-desktop.png'});
  await guide.getByRole('button',{name:'Add a note'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.health-calendar-days button:not(.active)').first().click();
  await expect(guide.getByText('0 / 4 recorded')).toBeVisible();
  await expect(guide.getByRole('button',{name:'Check in',exact:true})).toBeVisible();
});
