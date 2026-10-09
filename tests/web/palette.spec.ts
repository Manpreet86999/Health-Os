import { test, expect } from '@playwright/test';
import { setup, owner } from './cloud-fixture';
import fs from 'node:fs';

for (const theme of ['dark', 'light'] as const) test(`mint identity and contextual charts remain consistent in ${theme}`, async ({page}) => {
  test.setTimeout(180000);
  const fixture = await setup(page,true,true);
  await page.addInitScript(theme=>localStorage.setItem('body-os-theme',theme),theme);
  const date = new Date().toLocaleDateString('en-CA'), timestamp = new Date(`${date}T12:00:00`).toISOString();
  fixture.biological.push({record_id:'palette-sleep',revision:1,change_version:1,payload:{id:'palette-sleep',userId:owner,type:'sleep',domain:'Recover',name:'Sleep',value:8,unit:'hours',metadata:{},timestamp,source:'Palette review fixture',deviceId:'test',createdAt:timestamp,updatedAt:timestamp,revision:1,quality:'manual',syncState:'saved'}});
  const primary = theme==='dark'?'rgb(154, 242, 208)':'rgb(8, 122, 98)';
  const ink = theme==='dark'?'rgb(11, 23, 18)':'rgb(255, 255, 255)';
  fs.mkdirSync('output/mint-palette',{recursive:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/#Today',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.os-topbar')).toBeVisible({timeout:30000});
  await expect(page.locator('body')).toHaveCSS('background-color',theme==='dark'?'rgb(16, 19, 17)':'rgb(247, 248, 246)');
  for (const [name,route] of [['today','#Today'],['nutrition','#Eat/Food%20Diary'],['sleep','#Recover/Sleep'],['medical','#Health/Medical%20Intelligence']] as const) {
    await page.evaluate(hash=>{location.hash=hash;},route);
    const identity = name==='today'?'Today:overview':name==='nutrition'?'Eat:Food Diary':name==='sleep'?'Recover:Sleep':'Health:Medical Intelligence';
    await expect(page.locator(`[data-route-identity="${identity}"]`)).toBeVisible({timeout:30000});
    await expect(page.locator('.health-loading-view')).toHaveCount(0,{timeout:30000});
    const cta=page.locator('.os-capture-button');
    await expect(cta).toHaveCSS('background-color',primary);
    await expect(cta).toHaveCSS('color',ink);
    await expect(page.locator('.os-sidebar .health-brand strong span')).toHaveCSS('color',primary);
    for(const button of await page.locator('.btn-hot:visible').all()) {
      await expect(button).toHaveCSS('background-color',primary);
      await expect(button).toHaveCSS('color',ink);
    }
    if(name==='nutrition') await expect(page.locator('.today-energy strong')).toHaveCSS('color',theme==='dark'?'rgb(255, 154, 98)':'rgb(185, 67, 18)');
    if(name==='today') {
      await expect(page.locator('.os-rail-item[data-domain="Today"]')).toHaveCSS('color',primary);
      await expect(page.locator('.health-segment button[aria-pressed="true"]')).toHaveCSS('color',primary);
    }
    if(name==='sleep') await expect(page.locator('.signal-chart').first()).toHaveCSS('color',theme==='dark'?'rgb(185, 169, 255)':'rgb(103, 87, 217)');
    await page.screenshot({path:`output/mint-palette/${theme}-${name}.png`,fullPage:true,animations:'disabled'});
  }
  await page.locator('.os-capture-button').hover();
  await expect(page.locator('.os-capture-button')).toHaveCSS('background-color',theme==='dark'?'rgb(177, 248, 222)':'rgb(6, 106, 85)');
  await page.getByRole('button',{name:'Toggle theme',exact:true}).click();
  await expect(page.locator('.os-capture-button')).toHaveCSS('background-color',theme==='dark'?'rgb(8, 122, 98)':'rgb(154, 242, 208)');
});
