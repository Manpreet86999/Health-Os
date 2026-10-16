import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {setup,base} from './cloud-fixture';
import {nativeFixture} from '../../apps/health-os-mobile/tests/native-fixture';
import {istDate} from '../../src/shared/daily-report-policy';
const reportHtml=readFileSync('output/daily-report-validation/report.html','utf8');
test('new week blocks training until all six nutrition goals are saved',async({page},info)=>{
 const cloud=await setup(page,true,true);if(info.project.name==='android'){await nativeFixture(page);await page.addInitScript(()=>localStorage.setItem('health-os-welcome-version','1.4.0'));}
 const week=cloud.records.find(r=>r.entity_type==='week')!;week.payload.nutritionGoalsRequired=true;
 await page.route(`${base}/functions/v1/body-os-email`,async route=>{const input=route.request().postDataJSON();if(input.action==='week-goals'){week.payload.nutritionGoals=input.goals;week.payload.nutritionGoalsSetAt=new Date().toISOString();week.change_version+=100;week.revision++;return route.fulfill({json:{ok:true}});}return route.fulfill({json:{reports:[],jobs:[],today:istDate(),serverNow:new Date().toISOString()}});});
 await page.goto('/#Dashboard');const dialog=page.getByRole('dialog',{name:'Set your week goals'});await expect(dialog).toBeVisible();
 const save=dialog.getByRole('button',{name:'Save all goals'});await expect(save).toBeDisabled();
 for(const [label,val]of [['Calories','2400'],['Protein','150'],['Carbohydrates','280'],['Fat','80'],['Fiber','30']])await dialog.getByLabel(label+' goal',{exact:true}).fill(val);
 await expect(save).toBeDisabled();await dialog.getByLabel('Water goal',{exact:true}).fill('3000');await save.click();await expect(dialog).toBeHidden();expect(week.payload.nutritionGoals.water).toBe(3000);
 await page.reload();await expect(page.locator('#health-main-content')).toBeVisible();await expect(dialog).toHaveCount(0);
});
test('next-day report requires scrolling and persists acknowledgment',async({page},info)=>{
 await setup(page,true,true);if(info.project.name==='android'){await nativeFixture(page);await page.addInitScript(()=>localStorage.setItem('health-os-welcome-version','1.4.0'));}
 let read=false;await page.route(`${base}/functions/v1/body-os-email`,async route=>{const input=route.request().postDataJSON();if(input.action==='daily-list')return route.fulfill({json:{reports:[{report_date:'2026-10-15',sent_at:'2026-10-15T17:30:00Z',read_at:read?'2026-10-16T04:00:00Z':null}],jobs:[],today:'2026-10-16',serverNow:'2026-10-16T17:29:59Z'}});if(input.action==='daily-get')return route.fulfill({json:{report:{report_date:'2026-10-15',html:reportHtml}}});if(input.action==='daily-read'){read=true;return route.fulfill({json:{ok:true}});}return route.fulfill({json:{ok:true,jobs:[]}});});
 await page.goto('/#Today');const dialog=page.getByRole('dialog',{name:'Your daily report'});await expect(dialog).toBeVisible();const button=dialog.getByRole('button',{name:'I’ve read it'});await expect(button).toBeDisabled();
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
 await page.frameLocator('iframe[title="Full daily report"]').getByText('Your body, in perspective',{exact:true}).scrollIntoViewIfNeeded();
 await page.locator('iframe[title="Full daily report"]').evaluate((el:HTMLIFrameElement)=>el.contentWindow!.scrollTo(0,el.contentDocument!.documentElement.scrollHeight));
 await expect(button).toBeEnabled();await page.screenshot({path:`output/daily-report-validation/${info.project.name}-report-dialog.png`});await button.click();await expect(dialog).toHaveCount(0);expect(read).toBe(true);await page.reload();await expect(page.locator('#health-main-content')).toBeVisible();await expect(dialog).toHaveCount(0);
});
