import {chromium} from 'playwright';
import {expect} from '@playwright/test';
import fs from 'node:fs';
import {setup} from '../tests/web/cloud-fixture';

process.env.HEALTH_OS_TEST_APP_VERSION='1.4';
const output='outputs/android-hotfix';
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:19223',{timeout:20000});
const page=await browser.contexts()[0].newPage();
const debugSession=await page.context().newCDPSession(page);
await debugSession.send('Storage.clearDataForOrigin',{origin:'http://127.0.0.1:10148',storageTypes:'indexeddb,local_storage,cache_storage,service_workers'});
await debugSession.detach();
// tsx preserves class names in serialized fixture functions; provide its helper in the test document.
await page.addInitScript('globalThis.__name=(value,name)=>Object.defineProperty(value,"name",{value:name,configurable:true});');
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 const cloud=await setup(page,true,true),ready=cloud.records.find(row=>row.entity_type==='readiness')!.payload;
 cloud.records.splice(cloud.records.findIndex(row=>row.entity_type==='readiness'),1);
 const sets=[{s:1,w:'40',r:'8',rpe:'7',rir:'3',type:'work'}];
 const draft={id:'66666666-6666-4666-8666-666666666666',weekId:'week-one',weekName:'Cloud strength',weekNumber:1,dayKey:ready.dayKey,dayTitle:'Phone test pull day',date:ready.date,name:'Synthetic Athlete',sleep:8,soreness:2,index:1,logs:[{name:'Bench Press',target:'Chest',status:'completed',sets}],exercises:[{name:'Bench Press',target:'Chest',vol:'1 x 8',cue:'Control'},{name:'Row',target:'Back',vol:'1 x 8',cue:'Control'}],startedAt:new Date(Date.now()-120000).toISOString(),gymMode:true};
 cloud.add('workoutDraft','active-workout',{draft});
 await page.goto('http://127.0.0.1:10148/#Intelligence');
 await expect(page.locator('.intel-priority h3').filter({hasText:'Phone test pull day'})).toBeVisible({timeout:30000});
 await expect(page.locator('.view-error')).toHaveCount(0);
 await page.screenshot({path:`${output}/phone-active-workout-intelligence.png`,fullPage:true});
 await page.reload();
 await expect(page.locator('.intel-priority h3').filter({hasText:'Phone test pull day'})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Resume workout',exact:true}).first().click();
 await expect(page.locator('.android-workout-cards')).toBeVisible();
 expect(cloud.records.find(row=>row.entity_type==='workoutDraft')!.payload.draft.logs[0].sets).toEqual(sets);
 await page.getByRole('button',{name:'Workout options',exact:true}).click();
 await page.getByRole('button',{name:/Skip this exercise/}).click();
 await expect(page.locator('.android-workout-summary')).toBeVisible();
 const save=page.getByRole('button',{name:'Save & send AI report',exact:true});
 await expect(save).toBeVisible();
 await page.screenshot({path:`${output}/phone-workout-review-fixture.png`,fullPage:true});
 await save.click();
 await expect.poll(()=>cloud.records.filter(row=>row.entity_type==='session').length).toBe(1);
 expect(cloud.records.find(row=>row.entity_type==='session')!.payload.logs[0].sets.map((set:any)=>[Number(set.s),Number(set.w),Number(set.r),Number(set.rpe),Number(set.rir)])).toEqual([[1,40,8,7,3]]);
 const checked:string[]=[];
 for(const destination of ['Today','Intelligence','Train','Eat','Recover','Health','Body','Care','Insights','Pods','Reports','Organization','Sync','Research']){
  await page.locator(`[data-destination="${destination}"]`).click();
  await expect(page.locator(`[data-destination="${destination}"]`)).toHaveAttribute('aria-current','page');
  await expect(page.locator('.primary-workspace')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.health-loading-view:visible')).toHaveCount(0);
  await expect(page.locator('.view-error:visible')).toHaveCount(0);
  checked.push(destination);
 }
 expect(errors).toEqual([]);
 const report={version:'1.4',platform:'Physical Android phone / Chrome',activeWorkoutCrash:'Passed, including reload',confirmedSetsPreserved:true,workoutSave:'Passed against isolated mocked cloud',destinations:checked,renderErrors:errors,realHealthRecordsModified:false};
 fs.writeFileSync(`${output}/phone-browser-validation.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}catch(error){
 process.exitCode=1;
 await page.screenshot({path:`${output}/phone-fixture-failure.png`,fullPage:true}).catch(()=>{});
 console.error((error as Error).message);
}finally{
 await page.close();
 // Close the owned tab, then disconnect the helper without closing other browser tabs.
 setTimeout(()=>process.exit(process.exitCode||0),100);
}
