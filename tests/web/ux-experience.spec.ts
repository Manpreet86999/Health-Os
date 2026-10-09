import { test, expect } from '@playwright/test';
import { setup, base } from './cloud-fixture';

test('mobile destinations, capture drafts and focus survive refresh and Back',async({page})=>{
  await setup(page,true,true);await page.setViewportSize({width:390,height:844});await page.goto('/#Today');
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await expect(nav).toBeVisible();await nav.getByRole('button',{name:'Plan',exact:true}).click();
  await expect(page.getByRole('button',{name:'Upcoming',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.goBack();await expect(page.locator('[data-route-identity="Today:overview"]')).toBeVisible();
  await nav.getByRole('button',{name:'Log an entry'}).click();
  const capture=page.getByRole('dialog',{name:'Universal Log'});
  await capture.getByText('Speak or type an entry',{exact:true}).click();await capture.getByRole('textbox',{name:'Natural language capture'}).fill('Synthetic draft, no health values');
  await expect(capture.getByText('Draft saved on this device',{exact:true})).toBeVisible();
  await page.reload();await nav.getByRole('button',{name:'Log an entry'}).click();
  await capture.getByText('Speak or type an entry',{exact:true}).click();await expect(capture.getByRole('textbox',{name:'Natural language capture'})).toHaveValue('Synthetic draft, no health values');
  await page.keyboard.press('Escape');await expect(capture).toBeHidden();await expect(nav.getByRole('button',{name:'Log an entry'})).toBeFocused();
  await nav.getByRole('button',{name:'More',exact:true}).click();
  const more=page.getByRole('dialog',{name:'All pages'});await expect(more).toBeVisible();
  await more.getByRole('button',{name:'Appointments & Visits',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Appointments & visits',exact:true})).toBeVisible();
});

test('appointment stages save, export selected records and complete linked follow-ups',async({page})=>{
  const cloud=await setup(page,true,true);await page.goto('/#Health/Appointments');
  await page.getByRole('button',{name:'New appointment',exact:true}).click();
  await page.getByRole('textbox',{name:'Appointment title'}).fill('Synthetic visit');
  await page.getByLabel('Date and time',{exact:true}).fill('2027-01-15T10:00');
  await page.getByRole('textbox',{name:'Timezone',exact:true}).fill('Asia/Kolkata');
  await page.getByRole('button',{name:'Save details',exact:true}).click();await expect(page.getByText('Saved to account',{exact:true})).toBeVisible();
  const row=cloud.records.find(r=>r.record_id.startsWith('health-os-appointment:'));expect(row).toBeTruthy();
  expect(row.payload.appointment.scheduledAt).toBe('2027-01-15T04:30:00.000Z');
  await page.getByRole('button',{name:'Prepare',exact:true}).click();
  await page.getByRole('textbox',{name:'New question',exact:true}).fill('Which existing records should I bring?');
  await page.getByRole('button',{name:'Save question',exact:true}).click();
  await expect(page.getByText('Question saved. Save preparation to link it to this visit.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save & preview visit summary',exact:true}).click();
  const preview=page.getByRole('dialog',{name:'Review visit summary'});await expect(preview).toBeVisible();
  await expect(preview.getByText('Which existing records should I bring?',{exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await preview.getByRole('button',{name:'Export JSON',exact:true}).click();expect((await download).suggestedFilename()).toBe('health-os-visit-summary.json');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Visit notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Your visit notes',exact:true}).fill('Synthetic notes for the test');
  await page.getByRole('button',{name:'Save visit notes',exact:true}).click();await expect(page.getByText('Saved to account',{exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Appointment stages'}).getByRole('button',{name:'Follow-ups',exact:true}).click();
  await page.getByRole('textbox',{name:'New follow-up',exact:true}).fill('Arrange next visit');
  await page.getByRole('button',{name:'Create follow-up',exact:true}).click();
  await expect(page.getByText('Follow-up saved. Save follow-up links to attach it to this visit.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save follow-up links',exact:true}).click();await expect(page.getByText('Saved to account',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mark complete',exact:true}).click();await expect(page.getByText('Saved to account',{exact:true})).toBeVisible();
  expect(cloud.records.find(r=>r.record_id==='health-os-medical-actions')?.payload.state.followups[0].status).toBe('completed');
  await page.getByRole('button',{name:'Details',exact:true}).click();
  await page.getByLabel('Date and time',{exact:true}).fill('2027-01-16T11:00');await page.getByLabel('Visit status',{exact:true}).selectOption('cancelled');
  await page.getByRole('button',{name:'Save details',exact:true}).click();await expect(page.getByText('Saved to account',{exact:true})).toBeVisible();
  expect(cloud.records.find(r=>r.record_id===row.record_id)?.payload.appointment.status).toBe('cancelled');
  await page.getByRole('button',{name:'Close & keep draft',exact:true}).click();await page.getByRole('button',{name:'Cancelled',exact:true}).click();
  await page.getByRole('button',{name:/Synthetic visit.*Open visit/}).click();await expect(page.getByRole('textbox',{name:'Appointment title'})).toHaveValue('Synthetic visit');
});

test('failed cloud appointment save retains draft and retry uses one identifier',async({page})=>{
  const cloud=await setup(page,true,true);let fail=true;
  await page.route(`${base}/rest/v1/body_os_records**`,async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON()?.record_id?.startsWith('health-os-appointment:')&&fail)return route.fulfill({status:503,json:{message:'Temporary save failure'}});
    return route.fallback();
  });
  await page.goto('/#Health/Appointments');await page.getByRole('button',{name:'New appointment',exact:true}).click();
  await page.getByRole('textbox',{name:'Appointment title'}).fill('Retry visit');await page.getByLabel('Date and time',{exact:true}).fill('2027-01-15T10:00');
  await page.getByRole('button',{name:'Save details',exact:true}).click();await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await expect(page.getByText('Saved to account',{exact:true})).toHaveCount(0);
  fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByText('Saved to account',{exact:true})).toBeVisible();
  expect(cloud.records.filter(r=>r.record_id.startsWith('health-os-appointment:'))).toHaveLength(1);
});

for(const width of [360,390,768,1024,1280,1440])for(const theme of ['light','dark']){
  test(`UX shell ${width}px ${theme} with large text and reduced motion`,async({page})=>{
    await setup(page);await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(theme=>localStorage.setItem('body-os-theme',theme),theme);
    await page.goto('/#Health/Appointments');await expect(page.getByRole('heading',{name:'Appointments & visits',exact:true})).toBeVisible();
    await page.addStyleTag({content:'html{font-size:20px!important}'});
    await page.getByRole('button',{name:'New appointment',exact:true}).click();await expect(page.getByRole('textbox',{name:'Appointment title'})).toBeVisible();
    const fit=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2);expect(fit).toBe(true);
    await page.screenshot({path:`outputs/ux-validation/${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  });
}

 test('Today customization opens from the corner pencil and restores keyboard focus',async({page})=>{
   await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/#Today');
   const pencil=page.getByRole('button',{name:'Customize Today',exact:true});await expect(pencil).toBeVisible();
   await expect(pencil).toHaveClass(/ux-personalize-corner/);await expect(pencil.locator('svg')).toBeVisible();
   expect((await pencil.innerText()).trim()).toBe('');await pencil.click();await expect(page.getByRole('dialog',{name:'Make Health OS yours'})).toBeVisible();
   await page.keyboard.press('Escape');await expect(pencil).toBeFocused();
   await page.screenshot({path:'outputs/ux-validation/today-pencil-mobile.png',fullPage:true,animations:'disabled'});
 });
