import {test,expect} from '@playwright/test';
import {setup} from './cloud-fixture';
import {nativeFixture} from '../../apps/health-os-mobile/tests/native-fixture';
import {sections,routeHref} from '../../src/client/lib/os-navigation';
test('Android uses retained navigation and saves daily totals through the shared form',async({page})=>{
 await setup(page,true,true);await nativeFixture(page);await page.setViewportSize({width:412,height:915});await page.goto('/#Today');
 const nav=page.getByRole('navigation',{name:'Main navigation'});await expect(nav).toBeVisible();expect(await nav.getByRole('button').count()).toBe(7);
 for(const section of sections)await expect(nav.getByRole('button',{name:section.name,exact:true})).toBeAttached();
 await expect(nav.getByRole('button',{name:'More',exact:true})).toHaveCount(0);
 await page.goto('/'+routeHref('Recover','Nutrition Totals'));await page.getByLabel('Recovery date').fill('2026-10-13');
 const form=page.getByRole('form',{name:'Daily nutrition totals'});await form.getByLabel('Calories (kcal)',{exact:true}).fill('2100');await form.getByLabel('Protein (g)',{exact:true}).fill('160');await form.getByRole('button',{name:'Save totals'}).click();await expect(form.getByRole('status')).toContainText('saved');
 await page.goto('/#Today');await page.getByLabel('Today date').fill('2026-10-13');await expect(page.locator('.hos-today').getByText('2,100 kcal',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();await page.getByRole('dialog',{name:'Quick Log'}).getByRole('button',{name:'Sleep',exact:true}).click();await expect(page.getByLabel('Sleep duration (hours)',{exact:true})).toBeVisible();
 await page.screenshot({path:'output/simplification/android-quick-log.png',fullPage:true});
});
