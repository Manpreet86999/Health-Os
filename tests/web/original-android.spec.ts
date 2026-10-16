import {test,expect} from '@playwright/test';
import {setup} from './cloud-fixture';
import {nativeFixture} from '../../apps/health-os-mobile/tests/native-fixture';
import {viewManifest,routeHref,sections} from '../../src/client/lib/os-navigation';
const baseline=process.env.HOS_ANDROID_REFERENCE==='1';
const fixtures=new WeakMap<any,Awaited<ReturnType<typeof setup>>>();
test.beforeEach(async({page})=>{page.on('pageerror',error=>console.log('Android runtime:',error.stack));fixtures.set(page,await setup(page,true,true));await nativeFixture(page);await page.addInitScript(()=>{localStorage.setItem('health-os-welcome-version','1.4.0');});});
test('original Android appearance and seven-section page access',async({page})=>{
 await page.goto('/#Today');await expect(page.locator('#health-main-content')).toBeVisible();await expect(page.locator('.health-loading-view:visible')).toHaveCount(0);await expect(page.locator('#health-main-content').getByRole('heading').first()).toBeVisible();
 await page.screenshot({path:`output/android-original-ui/${baseline?'baseline':'candidate'}-today.png`,fullPage:true});
 if(baseline)return;
 const nav=page.getByRole('navigation',{name:'Main navigation'});await expect(nav.getByRole('button')).toHaveCount(7);await expect(nav.getByRole('button',{name:'More',exact:true})).toHaveCount(0);
 for(const section of sections){const button=nav.getByRole('button',{name:section.name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-current','page');await expect(button).toBeInViewport();}
});
test('original workout set and rest-card controls retain the confirmed draft',async({page})=>{
 test.skip(baseline);test.setTimeout(45000);const cloud=fixtures.get(page)!;
 cloud.records.find(r=>r.entity_type==='week')!.payload.days.forEach((d:any)=>d.exercises[0].vol='3 x 5');
 await page.goto('/#Dashboard');await page.getByRole('button',{name:'Start workout',exact:true}).click({timeout:10000});await expect(page.getByRole('spinbutton',{name:'Set 1 load',exact:true})).toBeVisible();await page.screenshot({path:'output/android-original-ui/workout-start.png'});
 await page.getByRole('spinbutton',{name:'Set 1 load',exact:true}).press('ArrowUp');await page.getByRole('spinbutton',{name:'Set 1 reps',exact:true}).press('ArrowUp');await page.getByRole('button',{name:'Complete Set',exact:true}).click();
 const rest=page.getByRole('region',{name:'Rest between sets',exact:true});await expect(rest).toBeVisible();await rest.getByRole('button',{name:'Pause rest',exact:true}).click();
 await expect.poll(()=>cloud.records.find(r=>r.entity_type==='workoutDraft')?.payload.draft?.currentEntry?.completedSets?.length).toBe(1);
 await page.reload();await expect(rest).toBeVisible();await expect(rest.getByRole('button',{name:'Resume rest',exact:true})).toBeVisible();await page.screenshot({path:'output/android-original-ui/workout-rest.png'});
 await rest.getByRole('button',{name:'Skip rest · continue',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Set 2 load',exact:true})).toBeVisible();
});
test('updated on-device HEOS reads and observation logging work offline',async({page})=>{
 test.skip(baseline);await page.goto('/#Settings');await page.getByRole('tab',{name:'HEOS MCP',exact:true}).click();const tools=page.getByRole('region',{name:'On-device HEOS tools'});await expect(tools).toContainText('3.3.0');
 await expect(page.getByText('71 capabilities',{exact:false})).toBeVisible();await expect(page.getByText('49 cloud-supported tools',{exact:false})).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});window.dispatchEvent(new Event('offline'));});
 await tools.getByRole('button',{name:'Read on device',exact:true}).click();await expect(tools).toContainText('Completed on this device');
 await tools.getByText('Log an observation',{exact:true}).click();await tools.getByRole('combobox',{name:'Observation',exact:true}).selectOption('water');await tools.getByRole('spinbutton',{name:'Water (mL)',exact:true}).fill('500');await tools.getByRole('button',{name:'Save observation on device',exact:true}).click();await expect(tools.getByRole('spinbutton',{name:'Water (mL)',exact:true})).toHaveValue('');
 await page.screenshot({path:'output/android-original-ui/local-mcp.png',fullPage:true});
});
test('every retained route loads using the original APK components',async({page})=>{
 test.skip(baseline);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const view of viewManifest){await page.goto('/'+view.href);await expect(page.locator('#health-main-content')).toBeVisible();await expect(page.locator('.health-loading-view:visible')).toHaveCount(0);await expect(page.locator('#health-main-content').getByRole('heading').first()).toBeVisible();await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+view.identity).toBe(true);await page.screenshot({path:`output/android-original-ui/screenshots/${view.identity.replace(/[^a-z0-9]/gi,'-')}.png`,fullPage:true});}
 expect(errors).toEqual([]);
 for(const pageName of ['Eat','Intelligence','Health','SkinOverview']){await page.goto('/#'+pageName);await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Today',exact:true})).toHaveAttribute('aria-current','page');}
});
test('daily nutrition totals persist, and Quick Log keeps the retained actions',async({page})=>{
 test.skip(baseline);await page.goto('/'+routeHref('Recover','Nutrition Totals'));
 await page.getByLabel('Recovery date',{exact:true}).fill('2026-10-14');const form=page.getByRole('form',{name:'Daily nutrition totals'});
 await form.getByLabel('Calories (kcal)',{exact:true}).fill('2150');await form.getByLabel('Protein (g)',{exact:true}).fill('160');await form.getByLabel('Water (mL)',{exact:true}).fill('3000');await form.getByRole('button',{name:'Save totals',exact:true}).click();await expect(form.getByRole('status')).toContainText('saved');
 await page.reload();await expect(form.getByLabel('Calories (kcal)',{exact:true})).toHaveValue('2150');
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();const modal=page.getByRole('dialog',{name:'Quick Log',exact:true});for(const name of ['Weight','Sleep','Recovery','Nutrition','Water','Recovery note'])await expect(modal.getByRole('button',{name,exact:true})).toBeVisible();
 await page.screenshot({path:'output/android-original-ui/quick-log.png'});await modal.getByRole('button',{name:'Nutrition',exact:true}).click();await expect(page.getByRole('dialog',{name:'Nutrition',exact:true}).getByLabel('Protein (g)',{exact:true})).toHaveValue('160');
});


