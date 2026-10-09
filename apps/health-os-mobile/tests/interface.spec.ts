import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { setup } from '../../../tests/web/cloud-fixture';
import { nativeFixture } from './native-fixture';

test('recovered APK interface renders and navigates its existing domains without runtime errors', async ({page}) => {
  test.setTimeout(240000);
  await page.setViewportSize({width:390,height:844});
  const cloud=await setup(page);
  await nativeFixture(page);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#Today');
  await expect(page.locator('.os-content')).toBeVisible();
  const routes=JSON.parse(fs.readFileSync('apps/health-os-mobile/reference/views.json','utf8'));
  const results:any[]=[];
  fs.mkdirSync('outputs/apk-refinement/screenshots',{recursive:true});
  for(const view of routes){
    const route=view.page;
    await page.evaluate(hash=>{location.hash=hash;},view.hash);
    await expect(page.locator('.os-content')).toBeVisible();
    await expect(page.locator(`[data-route-identity="${view.page}:${view.panel||'overview'}"]`)).toBeVisible({timeout:15000});
    await expect(page.getByText('Loading view…',{exact:true})).toBeHidden({timeout:20000});
    await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
    await page.waitForTimeout(100);
    const layout=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,hash:location.hash,identity:document.querySelector('[data-route-identity]')?.getAttribute('data-route-identity')}));
    results.push({...view,...layout});
    if(!view.panel&&['Today','Tracker','Eat','Health','SkinOverview','Settings'].includes(route))await page.screenshot({path:`outputs/apk-refinement/screenshots/${route.toLowerCase()}-light.png`,fullPage:true});
  }
  fs.writeFileSync('outputs/apk-refinement/routes.json',JSON.stringify({results,errors,originApi:cloud.originApi},null,2));
  expect(errors).toEqual([]);expect(cloud.originApi).toEqual([]);
  expect(results.filter(row=>row.document>row.width+2)).toEqual([]);
});

test('workout draft survives reload and failed-save retry creates one completed session',async({page})=>{
  const {records,rejectSession,originApi}=await setup(page,true,true);await nativeFixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/#Dashboard');
  await expect(page.locator('.os-content')).toBeVisible();
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  const load=page.getByRole('spinbutton',{name:'Set 1 load',exact:true});
  await load.fill('60');await page.getByRole('spinbutton',{name:'Set 1 reps',exact:true}).fill('5');
  await expect(load).toHaveValue('60');
  await expect(page.getByRole('spinbutton',{name:'Set 1 reps',exact:true})).toHaveValue('5');
  await expect.poll(()=>records.find(row=>row.entity_type==='workoutDraft'&&!row.deleted_at)?.payload.draft?.currentEntry?.weights?.[0]).toBe('60');
  await page.reload();await expect(load).toHaveValue('60');
  await page.getByRole('button',{name:'Complete Set',exact:true}).click();
  await page.getByRole('button',{name:'Skip rest · continue',exact:true}).click();
  await page.getByRole('button',{name:'Review workout',exact:true}).click();
  rejectSession(true);await page.getByRole('button',{name:'Save workout',exact:true}).click();
  await expect(page.getByText(/Supabase save failed/)).toBeVisible();
  expect(records.filter(row=>row.entity_type==='session')).toHaveLength(0);
  rejectSession(false);await page.getByRole('button',{name:'Save workout',exact:true}).click();
  await expect.poll(()=>records.filter(row=>row.entity_type==='session').length).toBe(1);
  expect(originApi).toEqual([]);
});

test('sign-in survives reload and temporary authentication failure preserves the session for retry',async({page})=>{
  const {originApi}=await setup(page,false,true);await nativeFixture(page);
  await page.goto('/');
  await page.getByPlaceholder('Email address').fill('cloud-test@example.com');
  await page.getByPlaceholder('Password (min 6 characters)').fill('test-password');
  await page.getByRole('button',{name:'Sign in to Health OS',exact:true}).click();
  await expect(page.locator('.os-content')).toBeVisible();
  await page.reload();await expect(page.locator('.os-content')).toBeVisible();
  await page.addInitScript(()=>{
    if(localStorage.getItem('health-os-test-expired'))return;
    const key='body-os-supabase-session-v1',session=JSON.parse(localStorage.getItem(key)!);
    session.expiresAt=Date.now()-1000;localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('health-os-test-expired','yes');
  });
  let unavailable=true;
  await page.route('https://lphlihwyrcqgmdiwlvuq.supabase.co/auth/v1/token?grant_type=refresh_token',route=>unavailable
    ?route.fulfill({status:503,json:{message:'Temporary connection failure'}})
    :route.fulfill({json:{access_token:'test-access-token',refresh_token:'test-refresh-token',expires_in:3600,user:{id:'11111111-1111-4111-8111-111111111111',email:'cloud-test@example.com'}}}));
  await page.reload();await expect(page.getByRole('button',{name:'Retry loading',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>Boolean(localStorage.getItem('body-os-supabase-session-v1')))).toBe(true);
  unavailable=false;await page.getByRole('button',{name:'Retry loading',exact:true}).click();
  await expect(page.locator('.os-content')).toBeVisible();expect(originApi).toEqual([]);
});

test('the APK water flow saves an owner-scoped record and retains it across reload',async({page})=>{
  const {biological,originApi}=await setup(page,true,true);await nativeFixture(page);
  await page.setViewportSize({width:390,height:844});await page.goto('/#Eat');
  await expect(page.locator('.os-content')).toBeVisible();
  await page.getByRole('button',{name:'Add water',exact:true}).click();
  await page.getByRole('group',{name:'Water amount'}).getByRole('button',{name:'350',exact:true}).click();
  await page.getByRole('button',{name:'Log water',exact:true}).click();
  await expect.poll(()=>biological.find(row=>row.payload.type==='water')?.payload.value,{timeout:20000}).toBe(350);
  await page.reload();await expect(page.locator('.os-content')).toBeVisible();
  await page.evaluate(()=>{location.hash='#Eat/Water';});
  await expect(page.locator('.os-content')).toContainText('350');
  expect(biological.filter(row=>row.payload.type==='water')).toHaveLength(1);
  expect(originApi).toEqual([]);
});

test('reminder consent in the existing settings uses Android permission and persists only the accepted choice',async({page})=>{
  const {biological}=await setup(page);await nativeFixture(page);
  await page.setViewportSize({width:390,height:844});await page.goto('/#Nudges');
  await page.getByRole('tab',{name:'Preferences',exact:true}).click();
  const toggle=page.getByRole('checkbox',{name:/Android notifications/});
  await expect(toggle).toBeVisible();await toggle.click();
  await expect.poll(()=>biological.some(row=>row.payload.type==='nudgePreference'&&row.payload.metadata.browserNotifications===true)).toBe(true);
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(()=>(window as any).__nativeCalls.some((call:any)=>call.plugin==='LocalNotifications'&&call.method==='requestPermissions'))).toBe(true);
  await toggle.click();
  await expect.poll(()=>biological.find(row=>row.payload.type==='nudgePreference')?.payload.metadata.browserNotifications).toBe(false);
});

test('Today, nutrition and care retain the supplied APK pixels in Android light and dark modes',async({browser})=>{
  test.setTimeout(180000);
  for(const dark of [false,true]){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const reference=await context.newPage(),refined=await context.newPage();
    for(const page of [reference,refined]){
      await setup(page);await nativeFixture(page);
      await page.addInitScript(dark=>localStorage.setItem('body-os-theme',dark?'dark':'light'),dark);
    }
    for(const route of ['Today','Eat','SkinOverview']){
      for(const [page,port] of [[reference,10107],[refined,10106]] as const){
        await page.bringToFront();
        await page.goto(`http://127.0.0.1:${port}/#${route}`);
        await expect(page.locator('.os-content')).toBeVisible({timeout:20000});
        await expect(page.getByText('Loading view…',{exact:true})).toBeHidden();
        await expect(page.locator('html')).toHaveAttribute('data-native','android');
        await page.waitForTimeout(250);
      }
      await reference.bringToFront();const before=await reference.screenshot({animations:'disabled'});
      await refined.bringToFront();const after=await refined.screenshot({animations:'disabled'});
      fs.writeFileSync(`outputs/apk-refinement/screenshots/${route.toLowerCase()}-${dark?'dark':'light'}-reference.png`,before);
      fs.writeFileSync(`outputs/apk-refinement/screenshots/${route.toLowerCase()}-${dark?'dark':'light'}-refined.png`,after);
      expect(after.equals(before),`${route} ${dark?'dark':'light'} differs from the supplied APK`).toBe(true);
    }
    await context.close();
  }
});
