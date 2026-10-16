import {test,expect} from '@playwright/test';
import {setup} from './cloud-fixture';
test('installed production frontend shows the redesign and all seven scrollable destinations',async({page})=>{
 await setup(page,true,true);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#Today');await expect(page.locator('.hos-readiness')).toBeVisible();
 await page.screenshot({path:'output/ui-revamp/screenshots/installed-desktop.png',fullPage:true});
 await page.setViewportSize({width:393,height:852});
 const nav=page.getByRole('navigation',{name:'Main navigation'});await expect(nav.getByRole('button')).toHaveCount(7);
 await expect(nav.getByRole('button',{name:'More',exact:true})).toHaveCount(0);
 for(const name of ['Body','Search','Settings','Today']){const button=nav.getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-current','page');await expect(button).toBeInViewport();}
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();await expect(page.getByRole('dialog',{name:'Quick Log'})).toBeVisible();
 await page.screenshot({path:'output/ui-revamp/screenshots/installed-quick-log.png'});
 expect(errors).toEqual([]);
});
