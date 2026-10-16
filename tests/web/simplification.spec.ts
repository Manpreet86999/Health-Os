import {test,expect} from '@playwright/test';
import {setup} from './cloud-fixture';
import {sections,viewManifest,routeHref} from '../../src/client/lib/os-navigation';
test('retained desktop pages load and removed routes safely return to Today',async({page})=>{
 await setup(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#Today');await expect(page.getByRole('navigation',{name:'Health OS domains'})).toBeVisible();
 await expect(page.locator('[data-domain]')).toHaveCount(7);
 for(const view of viewManifest){await page.goto('/'+view.href);await expect(page.locator('#health-main-content')).toBeVisible();await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);await expect(page.getByText('Couldn’t load Health OS',{exact:true})).toHaveCount(0);}
 for(const route of ['Intelligence','Eat','Health','SkinOverview']){await page.goto('/#'+route);await expect(page.getByRole('heading',{name:'Today',exact:true})).toBeVisible();}
 expect(errors).toEqual([]);
});
test('nutrition selected-date edits survive reload and feed Today and Insights',async({page})=>{
 const cloud=await setup(page,true,true);await page.goto('/'+routeHref('Recover','Nutrition Totals'));
 await page.getByLabel('Recovery date').fill('2026-10-14');
 const form=page.getByRole('form',{name:'Daily nutrition totals'});await expect(form).toBeVisible();
 for(const [label,value] of [['Calories (kcal)','2150'],['Protein (g)','165'],['Carbs (g)','220'],['Fat (g)','68'],['Fiber (g)','31'],['Water (mL)','3000']])await form.getByLabel(label,{exact:true}).fill(value);
 await form.getByRole('button',{name:'Save totals'}).click();await expect(form.getByRole('status')).toContainText('saved');
 await expect.poll(()=>cloud.biological.filter((r:any)=>r.payload.type==='nutritionDay').length).toBe(1);
 await page.reload();await expect(form.getByLabel('Calories (kcal)',{exact:true})).toHaveValue('2150');
 await form.getByLabel('Protein (g)',{exact:true}).fill('170');await form.getByRole('button',{name:'Save totals'}).click();await expect(form.getByRole('status')).toContainText('saved');
 await page.goto('/#Today');await page.getByLabel('Today date').fill('2026-10-14');await expect(page.locator('.hos-today').getByText('2,150 kcal',{exact:true})).toBeVisible();await expect(page.locator('.hos-today').getByText('P 170 · C 220 · F 68 g',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();await page.getByRole('dialog',{name:'Quick Log'}).getByRole('button',{name:'Nutrition',exact:true}).click();await expect(page.getByRole('form',{name:'Daily nutrition totals'}).getByLabel('Protein (g)',{exact:true})).toHaveValue('170');
});
test('mobile web offers seven scrollable destinations with fast Quick Log',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.goto('/#Today');
 const nav=page.getByRole('navigation',{name:'Main navigation'});await expect(nav).toBeVisible();
 await expect(nav.getByRole('button')).toHaveCount(7);
 for(const section of sections)await expect(nav.getByRole('button',{name:section.name,exact:true})).toBeAttached();
 await expect(nav.getByRole('button',{name:'More',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();for(const name of ['Weight','Sleep','Recovery','Nutrition','Water','Workout'])await expect(page.getByRole('dialog').getByRole('button',{name,exact:true})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Water',exact:true}).click();await expect(page.getByLabel('Amount (mL)',{exact:true})).toBeVisible();
});

test('Quick Log saves sleep and weight for the selected date and Search finds retained records',async({page})=>{
 const cloud=await setup(page,true,true);await page.goto('/#Today');await page.getByLabel('Today date').fill('2026-10-12');
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();await page.getByRole('dialog',{name:'Quick Log'}).getByRole('button',{name:'Sleep',exact:true}).click();
 const sleep=page.getByRole('dialog',{name:'Sleep',exact:true});await sleep.getByLabel('Sleep duration (hours)',{exact:true}).fill('7.5');await sleep.getByRole('button',{name:'Save entry'}).click();await expect(sleep).toHaveCount(0);
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();await page.getByRole('dialog',{name:'Quick Log'}).getByRole('button',{name:'Weight',exact:true}).click();
 const weight=page.getByRole('dialog',{name:'Weight',exact:true});await weight.getByLabel('Weight (kg)',{exact:true}).fill('75.5');await weight.getByRole('button',{name:'Save entry'}).click();await expect(weight).toHaveCount(0);
 await expect.poll(()=>cloud.biological.filter((r:any)=>['sleep','vital'].includes(r.payload.type)).length).toBe(2);
 await expect(page.getByText('75.5 kg',{exact:true})).toBeVisible();await page.goto('/#Search');await page.getByRole('textbox',{name:'Search',exact:true}).fill('Sleep');await expect(page.locator('section[aria-label="Recorded history"]').getByRole('button').first()).toBeVisible();
 await page.goto('/#Today');await page.screenshot({path:'output/simplification/today-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/simplification/today-mobile.png',fullPage:true});
});
