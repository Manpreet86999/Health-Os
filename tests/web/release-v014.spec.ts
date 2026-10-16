import {test,expect} from '@playwright/test';
import {setup} from './cloud-fixture';
test('v0.1.4 packaged pages and restored session load without rendering errors',async({page})=>{
 await setup(page,true,true);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const destination of ['Today','Train','Eat','Recover','Recover/Sleep','Health','Intelligence','Settings','Profile','Today/Pods']){
  await page.goto('/#'+destination);await expect(page.locator('.os-frame')).toBeVisible();await expect(page.locator('main')).toBeVisible();await expect(page.getByRole('button',{name:'Sign in to Health OS',exact:true})).toHaveCount(0);
  await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
 }
 await page.goto('/#Settings');await page.getByRole('tab',{name:'Data & account',exact:true}).click();await expect(page.getByText('Health Os · v0.1.4',{exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('.os-frame')).toBeVisible();expect(errors).toEqual([]);
 const release=await page.evaluate(async()=>await (await fetch('/release-config.js')).text());expect(release).toContain("version: '0.1.4'");
});
