import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {dailyReportTemplate,type DailyReportData} from '../src/shared/daily-report';
const output=path.resolve('output/daily-report-validation');await fs.mkdir(output,{recursive:true});
const sample:DailyReportData={date:'2026-10-15',cutoff:'23:00',weekName:'Week 1',dayName:'Thursday',units:'kg',readiness:{score:82,sleepHours:7,soreness:3,energy:8,stress:2,motivation:8,mood:8,hydration:2.3,mealProtein:128,steps:8420,sleepQuality:8,restingHeartRate:58},nutrition:{calories:2180,protein:128,carbs:264,fat:66,fibre:26,water:2300},goals:{calories:2400,protein:150,carbs:280,fat:80,fibre:30,water:3000},movement:{cardioMinutes:20,mobilityMinutes:10,activeMinutes:null},workouts:[{dayTitle:'Legs B',durationMinutes:54,mode:'planned',logs:[{name:'Conventional Deadlift',status:'completed',target:'Posterior chain',sets:[{s:1,w:37,r:8},{s:2,w:38,r:8},{s:3,w:37.5,r:10,rpe:8,rir:2}],aiCoachComment:'Use the recorded sets as your baseline for your next comparable session.'}]}],measurement:{date:'2026-10-15',weight:72.4,bodyFat:18.6,muscleMass:55.1,waterPercentage:56.8,bmr:1680,waist:81,chest:98,hips:94,neck:36,arms:32},previousMeasurement:{date:'2026-10-08',weight:72.7,waist:82},analysis:'Completed the saved session. Review the recorded sets and readiness before the next session.',recommendations:[{title:'Match meals to your plan',body:'Plan tomorrow’s meals toward your saved protein and energy goals, if today’s food log is complete.',basis:'Based on completed training and recorded daily intake.'},{title:'Review recovery before progressing',body:'Use tomorrow’s sleep, soreness and energy check-in when reviewing your next session.',basis:'Based on saved readiness and workout effort.'}]};
const html=dailyReportTemplate(sample).html;await fs.writeFile(path.join(output,'report.html'),html);
const bundle=await build({stdin:{contents:`import * as React from 'react';import{createRoot}from'react-dom/client';import{createReportExperience}from'./src/shared/report-experience';
const scenario=window.__scenario__,calls=[];window.__calls__=calls;let saved=false;
const data={app:{db:{meta:{activeWeekId:'week'},weeks:[{id:'week',name:'New training week',nutritionGoalsRequired:scenario==='goals',nutritionGoals:undefined}]},refresh:async()=>{saved=true;window.__saved__=true;data.app.db.weeks[0].nutritionGoals={calories:2400,protein:150,carbs:280,fat:80,fibre:30,water:3000};render();}}};
const invoke=async body=>{calls.push(body);if(body.action==='daily-list')return {today:'2026-10-16',serverNow:'2026-10-16T17:29:59Z',jobs:[],reports:scenario==='gate'&&!saved?[{report_date:'2026-10-15',sent_at:'2026-10-15T17:30:00Z',read_at:null}]:[]};if(body.action==='daily-get')return{report:{report_date:'2026-10-15',html:${JSON.stringify(html)}}};if(body.action==='daily-read'){saved=true;return{ok:true}};return{ok:true};};
const features=createReportExperience(React,()=>data,invoke),root=createRoot(document.getElementById('root'));function render(){root.render(React.createElement(scenario==='goals'?features.WeekGoalsGate:scenario==='gate'?features.DailyReportGate:features.DailyReportsPanel));}render();`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({channel:'msedge',headless:true});const checks=[];
try{
 const page=await browser.newPage();
 for(const width of [900,390,320]){
  await page.setViewportSize({width,height:1000});await page.setContent(html,{waitUntil:'load'});
  const result=await page.evaluate(()=>({width:document.documentElement.scrollWidth,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,steps:document.querySelectorAll('[data-indicator="steps"]').length,duplicates:document.querySelectorAll('[data-indicator="mealProtein"],[data-indicator="hydration"]').length,sections:[...document.querySelectorAll('h2')].map(el=>el.textContent?.trim())}));
  assert.ok(result.width<=width,JSON.stringify(result));assert.equal(result.brokenImages,0);assert.equal(result.steps,1);assert.equal(result.duplicates,0);assert.equal(result.sections.at(-1),'Your body, in perspective');
  await page.screenshot({path:path.join(output,`report-${width}.png`),fullPage:true});checks.push({test:'layout',viewport:width,...result});
 }
 const mount=async(scenario:string)=>{await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>');await page.evaluate(`window.__scenario__=${JSON.stringify(scenario)}`);await page.addScriptTag({content:bundle.outputFiles[0].text});};
 await page.setViewportSize({width:390,height:844});await mount('goals');
 const save=page.getByRole('button',{name:'Save all goals'});await save.waitFor();assert.equal(await save.isDisabled(),true);
 for(const [label,val]of [['Calories','2400'],['Protein','150'],['Carbohydrates','280'],['Fat','80'],['Fiber','30']])await page.getByLabel(label+' goal',{exact:true}).fill(val);
 assert.equal(await save.isDisabled(),true);await page.getByLabel('Water goal',{exact:true}).fill('3000');assert.equal(await save.isEnabled(),true);
 await page.screenshot({path:path.join(output,'week-goals-390.png')});await save.click();await page.waitForFunction(()=>Boolean((window as any).__saved__));checks.push({test:'all six goals required before saving',passed:true});
 await mount('gate');const read=page.getByRole('button',{name:'I’ve read it'});await read.waitFor();assert.equal(await read.isDisabled(),true);
 const frame=page.frameLocator('iframe');await frame.getByText('Your body, in perspective',{exact:true}).scrollIntoViewIfNeeded();
 await page.locator('iframe').evaluate((el:HTMLIFrameElement)=>el.contentWindow!.scrollTo(0,el.contentDocument!.documentElement.scrollHeight));
 await page.waitForFunction(()=>!(document.querySelector('.daily-primary') as HTMLButtonElement)?.disabled);
 await page.screenshot({path:path.join(output,'next-day-report-390.png')});await read.click();await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>(window as any).__calls__.filter((c:any)=>c.action==='daily-read').length),1);checks.push({test:'read button unlocks after scrolling, acknowledgment closes gate',passed:true});
 await mount('reports');await page.getByRole('button',{name:'Send daily report'}).waitFor();assert.equal(await page.getByRole('button',{name:'Send daily report'}).isDisabled(),true);checks.push({test:'manual send disabled before 23:00 using server time',passed:true});
 await fs.writeFile(path.join(output,'browser.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));
}finally{await browser.close();}
