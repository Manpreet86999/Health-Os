import {test,expect as baseExpect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import {setup} from './cloud-fixture';
import {viewManifest} from '../../src/client/lib/os-navigation';

const tags=['wcag2a','wcag2aa','wcag21aa','wcag22aa'];
const expect=baseExpect.configure({timeout:30000});
for(const theme of ['light','dark'])test(`registered views accessibility ${theme}`,async({page})=>{
  test.setTimeout(900000);await setup(page);await page.setViewportSize({width:1440,height:1000});
  await page.addInitScript(theme=>localStorage.setItem('body-os-theme',theme),theme);
  await page.goto('/#Today',{waitUntil:'domcontentloaded'});const results=[];
  const views=process.env.UX_AUDIT_ROUTE?viewManifest.filter(view=>new RegExp(process.env.UX_AUDIT_ROUTE!).test(view.identity)):process.env.UX_AUDIT_SAMPLE?viewManifest.filter((_,index)=>index%13===0):viewManifest;
  for(const view of views){
    console.log(`Accessibility ${theme}: ${view.identity}`);
    await page.evaluate(hash=>{location.hash=hash;},view.href);
    const screen=page.locator(`[data-route-identity="${view.identity}"]`);
    await expect(screen).toBeVisible();await expect(screen.getByText('Loading view…',{exact:true})).toBeHidden();
    const audit=await new AxeBuilder({page}).options({resultTypes:['violations','incomplete']}).withTags(tags).analyze();
    results.push({identity:view.identity,violations:audit.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:audit.incomplete.map(v=>({id:v.id,count:v.nodes.length,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  }
  const scope=process.env.UX_AUDIT_ROUTE?'targeted':process.env.UX_AUDIT_SAMPLE?'sample':'full';
  fs.mkdirSync('outputs/ux-acceptance',{recursive:true});fs.writeFileSync(`outputs/ux-acceptance/accessibility-${scope}-${theme}.json`,JSON.stringify({theme,scope,engine:'axe-core',results},null,2));
  expect(results.filter(r=>r.violations.length).map(r=>({identity:r.identity,rules:r.violations.map(v=>v.id)})),'See accessibility report for affected routes and selectors').toEqual([]);
});

for(const theme of ['light','dark'])test(`active workflow accessibility ${theme}`,async({page})=>{
  test.setTimeout(300000);await setup(page);await page.setViewportSize({width:1440,height:1000});
  await page.addInitScript(theme=>localStorage.setItem('body-os-theme',theme),theme);
  const results=[];
  const inspect=async(identity:string)=>{const audit=await new AxeBuilder({page}).options({resultTypes:['violations','incomplete']}).withTags(tags).analyze();results.push({identity,violations:audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:audit.incomplete.map(v=>({id:v.id,count:v.nodes.length,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});};
  console.log(`Accessibility workflows ${theme}: load training`);
  await page.goto('/#Dashboard',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'Set 1 load',exact:true})).toBeVisible();await inspect('active-workout');
  console.log(`Accessibility workflows ${theme}: load Today`);
  await page.goto('/#Today',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Customize Today',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Make Health OS yours'})).toBeVisible();await inspect('today-customization');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Log',exact:true}).click();await expect(page.getByRole('dialog',{name:'Universal Log'})).toBeVisible();await inspect('capture-dialog');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Log',exact:true}).click();const capture=page.getByRole('dialog',{name:'Universal Log'});await capture.getByRole('button',{name:'Workout',exact:true}).click();await expect(capture.getByRole('heading',{name:"Today's prepared workout",exact:true})).toBeVisible();await inspect('prepared-workout');await page.keyboard.press('Escape');
  await page.goto('/#Health/Appointments',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'New appointment',exact:true}).click();await expect(page.getByLabel('Appointment title',{exact:true})).toBeVisible();await inspect('new-appointment');
  fs.mkdirSync('outputs/ux-acceptance',{recursive:true});fs.writeFileSync(`outputs/ux-acceptance/accessibility-workflows-${theme}.json`,JSON.stringify({theme,scope:'active workflows',engine:'axe-core',results},null,2));
  expect(results.filter(r=>r.violations.length)).toEqual([]);
});
