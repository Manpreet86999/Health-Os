import {test,expect} from '@playwright/test';
import {setup,base,owner} from './cloud-fixture';

test('capture loads prepared workout tools and opens editable set logging',async({page})=>{
  await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/#Today');await page.getByRole('button',{name:'Log an entry',exact:true}).click();
  const capture=page.getByRole('dialog',{name:'Universal Log'});
  await capture.getByRole('button',{name:'Workout',exact:true}).click();await expect(capture.getByRole('heading',{name:"Today's prepared workout",exact:true})).toBeVisible();
  await capture.getByRole('button',{name:'Use Original',exact:true}).click();
  await expect(capture).toBeHidden();await expect(page.getByRole('spinbutton',{name:'Set 1 load',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Log an entry',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Quick Capture',exact:true})).toHaveCount(0);
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Today',exact:true}).click();await expect(page.getByRole('button',{name:'Log an entry',exact:true})).toBeVisible();
});

test('training HTML export loads its report assets on request and retains an embedded logo',async({page})=>{
  await setup(page);await page.goto('/#Today');await expect(page.getByRole('button',{name:'Customize Today',exact:true})).toBeVisible();
  const report=await page.evaluate(async()=>{
    const {cloudFetch}=await import('/lib/cloud-api.ts');const response=await cloudFetch('/api/reports/progress');
    return {status:response.status,type:response.headers.get('content-type'),html:await response.text()};
  });
  expect(report.status).toBe(200);expect(report.type).toContain('text/html');expect(report.html).toContain('data:image/png;base64,');expect(report.html).toContain('Cloud Athlete');
});

test('Today opens optional health tools on demand and explains their empty state',async({page})=>{
  await setup(page);await page.goto('/#Today');
  const panel=page.locator('details.health-detail-section').filter({has:page.locator('summary').filter({hasText:'Health action center'})});
  const empty=panel.getByText('No pending medical actions. Review your records in Health when needed.',{exact:true});
  await expect(panel).toBeVisible();await expect(empty).toHaveCount(0);
  await panel.locator('summary').click();await expect(empty).toBeVisible();
  await panel.locator('summary').click();await expect(empty).toBeHidden();
  await panel.locator('summary').click();await expect(empty).toBeVisible();
});

test('workout device draft survives a failed cloud draft save and retry does not duplicate the session',async({page})=>{
  const cloud=await setup(page,true,true);
  await page.route(`${base}/rest/v1/body_os_records**`,async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON().entity_type==='workoutDraft')return route.fulfill({status:503,json:{message:'Synthetic cloud draft interruption'}});
    return route.fallback();
  });
  await page.goto('/#Dashboard');await page.getByRole('button',{name:'Start session',exact:true}).click();
  const load=page.getByRole('spinbutton',{name:'Set 1 load',exact:true}),reps=page.getByRole('spinbutton',{name:'Set 1 reps',exact:true});
  await load.fill('60');await reps.fill('5');
  await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();
  await expect(page.getByText('Cloud draft save failed — your device draft is separate',{exact:true})).toBeVisible();
  const draft=await page.evaluate(async({base,owner})=>{const {readDraft,draftScope}=await import('/lib/use-draft.ts');return readDraft<any>(`${draftScope(base,owner)}|workout-tracker`);},{base,owner});
  expect(draft.currentEntry.weights[0]).toBe('60');expect(draft.id).toBeTruthy();
  await page.reload();await expect(load).toHaveValue('60');await expect(reps).toHaveValue('5');
  await page.getByRole('button',{name:'Complete Set',exact:true}).click();await page.getByRole('button',{name:'Skip rest · continue',exact:true}).click();await page.getByRole('button',{name:'Save & next',exact:true}).click();cloud.rejectSession(true);
  await page.getByRole('button',{name:'Save workout',exact:true}).click();await expect(page.getByText(/Supabase save failed/)).toBeVisible();
  cloud.rejectSession(false);await page.getByRole('button',{name:'Save workout',exact:true}).click();
  await expect.poll(()=>cloud.records.filter(r=>r.entity_type==='session').length).toBe(1);
  expect(cloud.records.find(r=>r.entity_type==='session')?.record_id).toBe(draft.id);
});

test('diagnostics export only bounded measurement fields and stop retains a stable snapshot',async({page})=>{
  await setup(page);await page.goto('/#Today');await expect(page.getByRole('button',{name:'Customize Today',exact:true})).toBeVisible();
  const result=await page.evaluate(async()=>{
    const diagnostics=await import('/lib/ux-diagnostics.ts');await diagnostics.startUxDiagnostics();
    diagnostics.stopUxDiagnostics();const before=diagnostics.getUxDiagnostics();
    document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));const after=diagnostics.getUxDiagnostics();
    diagnostics.clearUxDiagnostics();return {before,after,cleared:diagnostics.getUxDiagnostics()};
  });
  expect(result.after).toEqual(result.before);expect(result.cleared.sample).toBeNull();
  expect(Object.keys(result.before.sample!).sort()).toEqual(['startedAt','lcpMs','cls','inpMs','viewportWidth','viewportHeight'].sort());
  for(const key of ['lcpMs','cls','inpMs'] as const){const value=result.before.sample![key];expect(value===null||Number.isFinite(value)&&value>=0).toBe(true);}
  expect(JSON.stringify(result.before)).not.toContain(base);expect(JSON.stringify(result.before)).not.toContain('Cloud Athlete');
});

test('medical reconciliation cannot race explicit question saves in the same account',async({page})=>{
  const cloud=await setup(page);await page.goto('/#Health');await expect(page.locator('main')).toBeVisible();
  await page.route(`${base}/rest/v1/body_os_records**`,async route=>{
    if(['POST','PATCH'].includes(route.request().method())&&route.request().postDataJSON()?.payload?.state)await new Promise(resolve=>setTimeout(resolve,150));
    return route.fallback();
  });
  const statuses=await page.evaluate(async()=>{
    const {cloudFetch}=await import('/lib/cloud-api.ts');
    const requests=[cloudFetch('/api/medical/actions/snapshot',{method:'POST',body:JSON.stringify({records:[]})}),...['First synthetic question','Second synthetic question'].map(text=>cloudFetch('/api/medical/actions/questions',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),text,source:'user',sourceRefs:[]})}))];
    return Promise.all(requests.map(async request=>(await request).status));
  });
  expect(statuses).toEqual([200,200,200]);
  const saved=cloud.records.find(r=>r.record_id==='health-os-medical-actions')!.payload.state.questions;
  expect(saved.map((q:any)=>q.text)).toEqual(expect.arrayContaining(['First synthetic question','Second synthetic question']));
});

test('separate cardio logs receive separate identifiers after acknowledgement',async({page})=>{
  const cloud=await setup(page);await page.goto('/#Recover');
  for(let index=0;index<2;index++){
    await page.getByRole('button',{name:/Log cardio/}).click();await page.getByRole('dialog',{name:'A little movement'}).getByRole('button',{name:'Log activity',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const logs=cloud.records.filter(r=>r.entity_type==='cardio');expect(logs).toHaveLength(2);expect(new Set(logs.map(r=>r.record_id)).size).toBe(2);
});

test('editing another training goal preserves the new-goal working draft',async({page})=>{
  const cloud=await setup(page);cloud.add('target','goal-existing',{name:'Existing synthetic goal',type:'custom',current:0,target:10,unit:'sessions',status:'active'});
  await page.goto('/#Targets');const name=page.getByLabel('Goal name',{exact:true});await name.fill('Unsaved new goal');
  await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();await expect(name).toHaveValue('Existing synthetic goal');
  await name.fill('Unsaved existing goal change');await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(name).toHaveValue('Unsaved new goal');
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();await expect(name).toHaveValue('Unsaved existing goal change');
});

for(const theme of ['light','dark'])test(`critical destinations reflow at 320px with ${theme} appearance`,async({page})=>{
  await setup(page);await page.setViewportSize({width:320,height:720});await page.addInitScript(theme=>localStorage.setItem('body-os-theme',theme),theme);
  for(const route of ['#Today','#Timeline','#Health/Appointments','#Settings','#Eat/Describe%20Meal','#SkinGoals']){
    await page.goto('/'+route);await expect(page.locator('main')).toBeVisible();await expect(page.getByText('Loading view…',{exact:true})).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),route).toBe(true);
  }
});
