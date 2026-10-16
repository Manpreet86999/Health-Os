import {test,expect} from '@playwright/test';
import {setup} from './cloud-fixture';
import {viewManifest,routeHref} from '../../src/client/lib/os-navigation';
import {nativeFixture} from '../../apps/health-os-mobile/tests/native-fixture';
const android=process.env.HOS_QA_ANDROID==='1';
const platform=android?'android':'web';
test.beforeEach(async({page})=>{if(android)await page.route('**/health-os-native.js*',route=>route.fulfill({path:'apps/health-os-mobile/runtime/health-os-native.js',contentType:'application/javascript'}));});

test('every retained view renders with no runtime errors or page overflow',async({page})=>{
 await setup(page,true,true);if(android)await nativeFixture(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const view of viewManifest){
  await page.goto('/'+view.href);await expect(page.locator('#health-main-content')).toBeVisible();
  await expect(page.locator('[data-route-identity]:visible')).toHaveAttribute('data-route-identity',view.identity);
  await expect(page.locator('.health-loading-view:visible')).toHaveCount(0);
  await expect(page.locator('[data-route-identity]:visible').getByRole('heading').first()).toBeVisible();
  await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  expect.soft(overflow,'Horizontal overflow: '+view.identity).toBe(false);
  await page.screenshot({path:`output/ui-revamp/screenshots/${platform}-${view.identity.replace(/[^a-z0-9]/gi,'-')}.png`,fullPage:true});
 }
 expect(errors).toEqual([]);
});

test('Today, Quick Log, themes and phone sizes',async({page})=>{
 await setup(page,true,true);if(android)await nativeFixture(page);await page.goto('/#Today');
 await expect(page.locator('.hos-readiness')).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 for(const width of [360,393,412]){
  await page.setViewportSize({width,height:852});await expect(nav).toBeVisible();
  await expect(nav.getByRole('button')).toHaveCount(7);
  await expect(nav.getByRole('button',{name:'More',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`output/ui-revamp/screenshots/${platform}-today-${width}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();
 const log=page.getByRole('dialog',{name:'Quick Log'});
 for(const name of ['Weight','Sleep','Recovery','Nutrition','Water','Recovery note'])await expect(log.getByRole('button',{name,exact:true})).toBeVisible();
 await page.screenshot({path:`output/ui-revamp/screenshots/${platform}-quick-log.png`});
 await log.getByRole('button',{name:'Water',exact:true}).click();
 const entry=page.getByRole('dialog',{name:'Water',exact:true});await entry.getByLabel('Amount (mL)',{exact:true}).fill('250');await entry.getByRole('button',{name:'Save entry'}).click();await expect(entry).toHaveCount(0);
 for(const name of ['Body','Search','Settings','Today']){const button=nav.getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-current','page');await expect(button).toBeInViewport();}
 if(android){const tabs=page.getByRole('navigation',{name:'Today pages',exact:true});for(const name of ['Goals','Habits','Weekly Review','Overview']){const button=tabs.getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-current','page');await expect(button).toBeInViewport();}}
 await page.evaluate(()=>document.body.classList.remove('dark'));
 await page.screenshot({path:`output/ui-revamp/screenshots/${platform}-today-light.png`,fullPage:true});
 if(!android){await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'output/ui-revamp/screenshots/web-today-light-desktop.png',fullPage:true});}
 await page.evaluate(()=>document.body.classList.add('dark'));
 await page.screenshot({path:`output/ui-revamp/screenshots/${platform}-today-dark.png`,fullPage:true});
});

test('empty values and enlarged text remain readable',async({page})=>{
 const cloud=await setup(page,true,true);if(android)await nativeFixture(page);
 cloud.records.splice(0,cloud.records.length,...cloud.records.filter((r:any)=>r.entity_type!=='readiness'));
 await page.setViewportSize({width:360,height:800});await page.goto('/#Today');
 await expect(page.locator('.hos-readiness')).toBeVisible();
 for(const scale of [1,1.3,1.6,2]){
  await page.reload();await expect(page.locator('.hos-readiness')).toBeVisible();
  await page.evaluate(scale=>{const nodes=[...document.querySelectorAll<HTMLElement>('#root *')];const sizes=nodes.map(e=>parseFloat(getComputedStyle(e).fontSize));nodes.forEach((e,i)=>e.style.setProperty('font-size',`${sizes[i]*scale}px`,'important'));},scale);
  expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Text scale '+scale).toBe(true);
  await page.screenshot({path:`output/ui-revamp/screenshots/${platform}-text-${scale}.png`,fullPage:true});
 }
 await page.goto('/'+routeHref('Recover','Nutrition Totals'));await expect(page.getByRole('form',{name:'Daily nutrition totals'})).toBeVisible();
});
