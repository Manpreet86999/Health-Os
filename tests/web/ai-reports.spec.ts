import { test, expect } from '@playwright/test';
import { setup, base } from './cloud-fixture';

test('Send AI Report starts the cloud pipeline and reports queued work without claiming email was sent', async ({ page }) => {
  const { add, originApi } = await setup(page);
  add('session','saved-session',{weekId:'week-one',dayKey:'Wed',date:'2026-10-07',dayTitle:'Strength day',status:'finished',logs:[{name:'Squat',status:'completed',sets:[{s:1,w:50,r:8}]}]});
  let queued=false,deliveries=0;
  await page.route(`${base}/functions/v1/body-os-email`,route=>{
    const body=route.request().postDataJSON();
    if(body.action==='queue')return route.fulfill({json:{jobs:queued?[{report_id:'saved-session',status:'processing',attempts:1,created_at:new Date().toISOString()}]:[]}});
    expect(body).toEqual({reportType:'workout',reportId:'saved-session'});deliveries++;queued=true;
    return route.fulfill({status:202,json:{ok:true,status:'queued',sentTo:[],deliveryId:'1'}});
  });
  await page.goto('/#Reports/Workout%20Reports');
  await page.getByRole('button',{name:'Send AI Report',exact:true}).click();
  await expect(page.getByText('AI report generation and email delivery started. Failed attempts retry automatically.',{exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'Generating AI report and sending email'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Send AI Report',exact:true})).toBeDisabled();
  expect(deliveries).toBe(1);expect(originApi).toEqual([]);
});
