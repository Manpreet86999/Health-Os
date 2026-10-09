import {test,expect} from '@playwright/test';
import {verifyTodayPods} from './today-pods-fixture';
import {setup,base} from './cloud-fixture';
test('Today footer connects Pods, invites, joins and displays explicit shared progress',async({page})=>verifyTodayPods(page));
test('Today Pods shows connection failure rather than invented empty or shared data',async({page})=>{
 await setup(page);await page.route(`${base}/rest/v1/health_os_pods?*`,route=>route.fulfill({status:403,json:{message:'Membership denied'}}));await page.goto('/#Today');const card=page.getByRole('region',{name:'Your Pods',exact:true});await expect(card).toContainText('Connection unavailable');await expect(card.getByRole('button',{name:'Retry Pods',exact:true})).toBeVisible();await expect(card.getByText('No connections yet.',{exact:false})).toHaveCount(0);
});
