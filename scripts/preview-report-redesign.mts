import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { reportTemplate } from '../src/shared/report-email';
const output='outputs/report-redesign';await fs.mkdir(output,{recursive:true});
const names=['Conventional Deadlift','Goblet Squat','Walking Dumbbell Lunge','Barbell Hip Thrust','Standing Calf Raise','Hanging Knee Raise'];
const targets=['Posterior chain','Quads / glutes','Quads / glutes','Glutes','Calves','Core'];
const sets=[[{w:37,r:8},{w:38,r:8},{w:37.5,r:10}],[{w:15,r:8},{w:15,r:8},{w:15,r:8}],[{w:7.5,r:8},{w:1,r:8},{w:1,r:8}],[{w:1,r:8},{w:1,r:10},{w:1,r:16}],[{w:10,r:8},{w:10,r:10},{w:10,r:10},{w:15,r:10}],[{w:1,r:8},{w:1,r:8},{w:1,r:8}]];
const sample={dayTitle:'LEGS B — POSTERIOR CHAIN',date:'2026-10-07',weekName:'Week 1',dayKey:'Legs B',durationMinutes:54,mode:'planned',readiness:{score:82,sleepHours:7,sleepQuality:8,soreness:3,energy:8,stress:2,motivation:8,mood:8,hydration:2.3,mealProtein:95,steps:7600,restingHeartRate:58,painFlag:false,recommendation:'Your saved readiness check-in accompanies this session.'},aiOverallSummary:'Completed all six exercises with 19 logged sets. Review each set and your saved coaching notes below.',logs:names.map((name,i)=>({name,target:targets[i],status:'completed',sets:sets[i].map((set,j)=>({...set,s:j+1,...(i===0&&j===2?{rpe:8,rir:2,restSec:120,tempo:'3-1-1'}:{})})),aiCoachComment:i===0?'Keep your setup consistent. Use these recorded sets as a baseline when reviewing the next session.':undefined})),notes:'Design preview with synthetic demonstration data. These values are not saved to your health record.'};
const {html,text}=reportTemplate('Health OS · Workout report',[sample]);await fs.writeFile(output+'/index.html',html);await fs.writeFile(output+'/report.txt',text);
await fs.writeFile(output+'/missing-data.html',reportTemplate('Health OS · No check-in',[{dayTitle:'Recovery session',date:'2026-10-07',logs:[{name:'Mobility hold',trackingMode:'time',status:'completed',sets:[{durationSec:45}]},{name:'Optional exercise',status:'skipped',sets:[]}]}]).html);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();const checks=[];
 for(const width of [720,390,320]) {
  await page.setViewportSize({width,height:1024});await page.setContent(html,{waitUntil:'load'});
  const layout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,brokenImages:[...document.images].filter(image=>!image.complete||!image.naturalWidth).length}));checks.push(layout);
  if(layout.width>width||layout.brokenImages)throw new Error(JSON.stringify(layout));
  await page.screenshot({path:output+`/report-${width}.png`,fullPage:true});
 }
 await page.emulateMedia({media:'print'});await page.setViewportSize({width:794,height:1123});await page.screenshot({path:output+'/print-layout.png',fullPage:true});
 await fs.writeFile(output+'/checks.json',JSON.stringify(checks,null,2));console.log(checks);
}finally {await browser.close();}
