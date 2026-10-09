import { test, expect } from '@playwright/test';
import { setup, owner, base } from './cloud-fixture';
import { routeHref } from '../../src/client/lib/os-navigation';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

function seed(fixture:Awaited<ReturnType<typeof setup>>) {
  for(let index=0;index<30;index++){
    const day=new Date();day.setDate(day.getDate()-29+index);const date=day.toLocaleDateString('en-CA'),timestamp=new Date(`${date}T12:00:00`).toISOString();
    for(const [type,value,unit,metadata] of [['sleep',7+index%3*.5,'hours',{bedtime:'23:00',wake:'07:00',quality:8}],['vital',55+index%3,'bpm',{metric:'Resting HR'}],['meal',undefined,'',{calories:1800,protein:120+index%3*20,carbs:180,fat:60}],['vital',80-index*.02,'kg',{metric:'Weight'}]] as const){
      const id=`unified-${index}-${type}-${unit}`;fixture.biological.push({record_id:id,revision:1,change_version:fixture.biological.length+1,payload:{id,userId:owner,type,domain:type==='meal'?'Eat':type==='sleep'?'Recover':'Health',name:type==='meal'?'Private meal title':type,value,unit,metadata,timestamp,source:'Browser validation fixture',deviceId:'test',createdAt:timestamp,updatedAt:timestamp,revision:1,quality:'manual',syncState:'saved'}});
    }
  }
}
async function emptyPods(page:import('@playwright/test').Page){await page.route(`${base}/rest/v1/health_os_pods?*`,route=>route.fulfill({json:[]}));}
test('command center keeps suggestions private and prepares water without writing',async({page})=>{
  const fixture=await setup(page,true,true);seed(fixture);await page.goto('/');await expect(page.locator('.os-topbar')).toBeVisible();
  await page.keyboard.press('Control+k');const dialog=page.getByRole('dialog',{name:'Health OS command center'});await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText('Private meal title');await dialog.getByRole('textbox').fill('log 500 ml water');
  const before=fixture.biological.length;await page.keyboard.press('Enter');await expect(page.getByRole('dialog',{name:'A water break'})).toBeVisible();expect(fixture.biological.length).toBe(before);
  await page.getByRole('button',{name:'Log water',exact:true}).click();await expect.poll(()=>fixture.biological.some(row=>row.payload.type==='water'&&row.payload.value===500)).toBe(true);
  await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'Health OS command center'}).getByRole('textbox').fill('sleep');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('Universal Log is keyboard accessible and exposes every capture category',async({page})=>{
  await setup(page);await page.goto('/');await page.getByRole('button',{name:'Log',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Universal Log'});await expect(dialog).toBeVisible();
  for(const name of ['Food','Water','Workout','Weight','Measurement','Vital','Medication','Lab','Feeling','Voice','Photo','Note'])await expect(dialog.locator('.web-log-picker').getByRole('button',{name,exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(page.getByRole('button',{name:'Log',exact:true})).toBeFocused();
});
test('Report Studio saves an account-scoped evidence snapshot and opens delivery settings',async({page})=>{
  const fixture=await setup(page,true,true);seed(fixture);await page.goto('/'+routeHref('Reports'));await expect(page.getByRole('heading',{name:'Report Studio'})).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'Save snapshot',exact:true}).click();await expect.poll(()=>fixture.biological.some(row=>row.payload.metadata.subtype==='reportSnapshot'&&row.payload.userId===owner)).toBe(true);
  await page.getByRole('button',{name:'Email & schedules',exact:true}).click();await expect(page.getByRole('tab',{name:'Reports',exact:true})).toHaveAttribute('aria-selected','true');
});
test('baseline evidence discloses its dates, sample counts and units',async({page})=>{
  const fixture=await setup(page,true,true);seed(fixture);await page.goto('/'+routeHref('Insights','Personal Baselines'));
  const evidence=page.getByRole('region',{name:'Personal baseline evidence'});await expect(evidence).toContainText('28 observed days');await expect(evidence).toContainText('bpm');await expect(evidence).toContainText('Building your baseline');
});
test('flagship desktop views preserve navigation and fit representative widths',async({page})=>{
  test.setTimeout(240000);const fixture=await setup(page,true,true);seed(fixture);await emptyPods(page);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  fs.mkdirSync('output/web-unified-review',{recursive:true});
  const views=[['today','Today',''],['train','Dashboard',''],['nutrition','Eat','Food Diary'],['recovery','Recover',''],['sleep','Recover','Sleep'],['insights','Insights','Trends'],['explore','Search',''],['medical','Health','Medical Intelligence'],['body','Body','Weight'],['pods','Today','Pods'],['reports','Reports','']] as const;
  await page.goto('/');await expect(page.locator('.os-topbar')).toBeVisible();
  for(const width of [1280,1440,1920]){
    await page.setViewportSize({width,height:1000});
    for(const [name,destination,panel] of views){
      await page.evaluate(hash=>{window.location.hash=hash;},routeHref(destination,panel));
      await expect(page.locator(`[data-route-identity="${destination}:${panel||'overview'}"]`)).toBeVisible();
      await expect(page.locator('.health-loading-view')).toHaveCount(0);
      await expect(page.getByRole('navigation',{name:'Health OS domains'})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${name} overflow at ${width}`).toBe(true);
      await page.screenshot({path:`output/web-unified-review/${name}-${width}.png`,fullPage:true,animations:'disabled'});
    }
  }
  expect(errors).toEqual([]);
});
test('new workspaces and command dialog meet accessibility rules in both themes',async({page})=>{
  test.setTimeout(180000);await setup(page,true,true);await emptyPods(page);await page.goto('/');
  const issues:unknown[]=[];
  for(const theme of ['dark','light']){
    if(await page.evaluate(()=>document.body.classList.contains('dark'))!==(theme==='dark'))await page.getByRole('button',{name:'Toggle theme',exact:true}).click();
    for(const [destination,panel] of [['Reports',''],['Today','Pods'],['Insights','Personal Baselines']] as const){
      await page.evaluate(hash=>{window.location.hash=hash;},routeHref(destination,panel));await expect(page.locator(`[data-route-identity="${destination}:${panel||'overview'}"]`)).toBeVisible();await expect(page.locator('.health-loading-view')).toHaveCount(0);
      const audit=await new AxeBuilder({page}).options({resultTypes:['violations','incomplete']}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();issues.push(...audit.violations.map(row=>({theme,destination,rule:row.id,nodes:row.nodes.map(node=>({target:node.target,message:node.failureSummary}))})));
    }
    await page.keyboard.press('Control+k');await expect(page.getByRole('dialog',{name:'Health OS command center'})).toBeVisible();
    const command=await new AxeBuilder({page}).options({resultTypes:['violations','incomplete']}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();issues.push(...command.violations.map(row=>({theme,rule:row.id,nodes:row.nodes.map(node=>({target:node.target,message:node.failureSummary}))})));await page.keyboard.press('Escape');
  }
  fs.mkdirSync('output/web-unified-review',{recursive:true});fs.writeFileSync('output/web-unified-review/accessibility.json',JSON.stringify(issues,null,2));expect(issues).toEqual([]);
});


test('explicit command search hands private queries to Search without putting them in URLs',async({page})=>{
  const fixture=await setup(page,true,true);seed(fixture);await page.goto('/');
  await expect(page.locator('.os-topbar')).toBeVisible();await page.keyboard.press('Control+k');
  const dialog=page.getByRole('dialog',{name:'Health OS command center'});await dialog.getByRole('textbox').fill('Private meal title');
  await expect(dialog.locator('.web-command-results')).not.toContainText('Private meal title');
  await dialog.getByRole('button',{name:'Search private records, foods & exercises',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Search',exact:true})).toHaveValue('Private meal title');
  await expect(page.getByRole('region',{name:'Recorded history'})).toContainText('Private meal title');
  expect(page.url()).not.toContain('Private');
  await page.getByRole('combobox',{name:'Domain',exact:true}).selectOption('Health');await page.keyboard.press('Control+k');
  await dialog.getByRole('textbox').fill('water');await dialog.getByRole('button',{name:'Search private records, foods & exercises',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Search',exact:true})).toHaveValue('water');await expect(page.getByRole('combobox',{name:'Domain',exact:true})).toHaveValue('All');
});


test('specialist report exports contain only the selected domain',async({page})=>{
  const fixture=await setup(page,true,true);seed(fixture);await page.goto('/'+routeHref('Reports'));await expect(page.getByRole('heading',{name:'Report Studio'})).toBeVisible({timeout:20000});
  for(const kind of ['Training','Nutrition','Body']){
    await page.locator('[aria-label="Report type"]').getByRole('button',{name:kind,exact:true}).click();
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();const download=await downloaded;
    const data=JSON.parse(fs.readFileSync((await download.path())!,'utf-8'));expect(data.kind).toBe(kind);expect(data.series.length).toBeGreaterThan(0);
    const allowed=kind==='Training'?['date','Volume','Strength']:kind==='Nutrition'?['date','Calories','Protein','Carbohydrates']:['date','Weight'];
    expect(Object.keys(data.series[0])).toEqual(allowed);expect(data).not.toHaveProperty('averageSleep');expect(data).not.toHaveProperty('careAdherence');
  }
});
