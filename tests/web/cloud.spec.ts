import { test, expect, type Page } from '@playwright/test';

import { setup, base, owner } from './cloud-fixture';

const ready=async(page:Page)=>{await expect(page.getByRole('navigation',{name:'Health OS domains'})).toBeVisible();};

test('large cloud workspace loads all history and resolves exercise references',async({page})=>{
  test.setTimeout(120000);
  const {add}=await setup(page);
  for(let i=0;i<19472;i++){
    const start=new Date(Date.UTC(2026,0,1)+i*60000),end=new Date(start.getTime()+60000);
    add('healthReading',`synthetic-health-${i}`,{kind:'Steps',value:5,unit:'steps',date:start.toISOString().slice(0,10),startTime:start.toISOString(),endTime:end.toISOString(),source:'Synthetic watch',sourceRecordId:`synthetic-${i}`,importedAt:end.toISOString()});
  }
  for(let i=0;i<2520;i++)add('exercise',`30000000-0000-4000-8000-${String(i).padStart(12,'0')}`,{});
  let active=0,maximum=0,resolved=0;
  await page.route(`${base}/rest/v1/body_os_exercises?*`,async route=>{
    active++;maximum=Math.max(maximum,active);
    const query=new URL(route.request().url()).searchParams;
    const ids=query.has('id')?query.get('id')!.slice(4,-1).split(','):Array.from({length:2520},(_,i)=>`30000000-0000-4000-8000-${String(i).padStart(12,'0')}`).slice(Number(query.get('offset')||0),Number(query.get('offset')||0)+Number(query.get('limit')||1000));
    await new Promise(resolve=>setTimeout(resolve,20));
    await route.fulfill({json:ids.map(id=>({id,name:`Synthetic exercise ${id}`,muscles:['Chest'],equipment:[],source_payload:{}}))});
    active--;resolved+=ids.length;
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('navigation',{name:'Health OS domains'})).toBeVisible({timeout:60000});
  expect(resolved).toBe(2520);expect(maximum).toBeGreaterThanOrEqual(1);expect(maximum).toBeLessThanOrEqual(4);
});

test('stalled cloud loading times out and can retry without clearing account data',async({page})=>{
  await setup(page);await page.clock.install();
  const pattern=`${base}/rest/v1/body_os_records?*`;
  const stalled=()=>{};await page.route(pattern,stalled);
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Downloading your cloud records…',{exact:true})).toBeVisible();
  await page.clock.fastForward(91000);
  await expect(page.getByText('Couldn’t load Health OS',{exact:true})).toBeVisible();
  await expect(page.getByText('Cloud loading took too long. Check your connection and retry.',{exact:true})).toBeVisible();
  await page.unroute(pattern,stalled);await page.clock.resume();
  await page.getByRole('button',{name:'Retry loading',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Health OS domains'})).toBeVisible({timeout:30000});
});

test('Health OS sign-in and install identity load without a local API',async({page})=>{
  const {originApi}=await setup(page,false);await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page).toHaveTitle('Health OS');
  await page.getByPlaceholder('Email address').fill('cloud-test@example.com');await page.getByPlaceholder('Password (min 6 characters)').fill('test-password');await page.getByRole('button',{name:'Sign in to Health OS',exact:true}).click();await ready(page);expect(originApi).toEqual([]);
});

test('complete Health OS domain interface opens on main without runtime errors',async({page})=>{
  const {originApi}=await setup(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#Today');await ready(page);
  for(const domain of ['Today','Train','Eat','Recover','Health','Body','Care','Insights'])await expect(page.getByRole('navigation',{name:'Health OS domains'}).getByRole('button',{name:domain,exact:true})).toBeVisible();
  for(const path of ['#Today','#Eat','#Recover','#Health','#Body','#SkinOverview','#Insights','#Reports','#Settings']){await page.goto('/'+path);await ready(page);await expect(page.locator('.os-content')).toBeVisible();await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);}
  await page.goto('/#Today');await page.screenshot({path:'outputs/health-os-today.png',fullPage:true});expect(errors).toEqual([]);expect(originApi).toEqual([]);
});

test('workout UI retains cloud draft recovery and failed-save retry',async({page})=>{
  const {records,originApi,rejectSession}=await setup(page);await page.goto('/#Dashboard');await ready(page);
  await page.getByRole('button',{name:'Start session',exact:true}).click();await page.getByRole('spinbutton',{name:'Set 1 load',exact:true}).fill('60');await page.getByRole('spinbutton',{name:'Set 1 reps',exact:true}).fill('5');
  await expect.poll(()=>records.find(r=>r.entity_type==='workoutDraft'&&!r.deleted_at)?.payload.draft?.currentEntry?.weights?.[0]).toBe('60');
  await page.reload();await ready(page);await expect(page.getByRole('spinbutton',{name:'Set 1 load',exact:true})).toHaveValue('60');
  await page.getByRole('button',{name:'Complete Set',exact:true}).click();await page.getByRole('button',{name:'Skip rest · continue',exact:true}).click();await page.getByRole('button',{name:'Save & next',exact:true}).click();rejectSession(true);await page.getByRole('button',{name:'Save workout',exact:true}).click();await expect(page.getByText(/Supabase save failed/)).toBeVisible();expect(records.filter(r=>r.entity_type==='session')).toHaveLength(0);
  rejectSession(false);await page.getByRole('button',{name:'Save workout',exact:true}).click();await expect.poll(()=>records.filter(r=>r.entity_type==='session').length).toBe(1);expect(originApi).toEqual([]);
});

test('nutrition and health records use Supabase and survive browser reload',async({page})=>{
  const {biological,originApi}=await setup(page);await page.goto('/#Today');await ready(page);
  await page.getByRole('button',{name:'Add water',exact:true}).click();
  await page.getByRole('group',{name:'Water amount'}).getByRole('button',{name:'350',exact:true}).click();
  await page.getByRole('dialog',{name:'A water break'}).getByRole('button',{name:'Log water',exact:true}).click();
  await expect.poll(()=>biological.find(r=>r.payload.type==='water')?.payload.value,{timeout:20000}).toBe(350);
  expect(biological[0].payload.value).toBe(350);await page.reload();await ready(page);await page.goto('/#Eat/Water');await expect(page.locator('.os-content')).toContainText('350');expect(originApi).toEqual([]);
});

test('medical cloud import preserves original, requires review and exports FHIR',async({page})=>{
  const {records,originApi}=await setup(page);const objects=new Map<string,unknown>();
  await page.route(`${base}/storage/v1/**`,async route=>{const req=route.request(),url=new URL(req.url());if(req.method()==='POST'){objects.set(url.pathname.split('/').at(-1)!,req.postDataJSON());return route.fulfill({json:{Key:'saved'}});}return route.fulfill({json:objects.get(url.pathname.split('/').at(-1)!)||{}});});
  await page.goto('/#Health');await ready(page);
  const result=await page.evaluate(async()=>{const {cloudFetch}=await import('/lib/cloud-api.ts');const call=async(path:string,body?:unknown,method='POST')=>{const r=await cloudFetch('/api/medical/'+path,{method,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};const imported=await call('import',{name:'Cloud report.txt',mime:'text/plain',base64:btoa('Hemoglobin 14 g/dL 12-16'),collectedAt:new Date().toISOString(),laboratory:'Test lab'});if(imported.status!==200)throw new Error(JSON.stringify(imported));const report=imported.data.report;const denied=await call(`reports/${report.id}/fhir`,undefined,'GET');const original=await call(`reports/${report.id}/original`,undefined,'GET');const reviewed=await call(`reports/${report.id}/review`,{revision:report.revision,report,confirmPatient:true});const bundle=await call(`reports/${report.id}/fhir`,undefined,'GET');const history=await call(`reports/${report.id}/history`,undefined,'GET');const summary=await call('doctor-summary',{records:[],from:'2000-01-01T00:00:00Z',to:'2001-01-01T00:00:00Z'});const invalid=await call('doctor-summary',{records:[],from:'2001-01-01',to:'2000-01-01'});return {denied:denied.status,original:original.data,reviewed:reviewed.status,bundle:bundle.data,history:history.data.versions.length,summaryStatus:summary.status,summaryReports:summary.data.reports?.length,invalid:invalid.status};});
  expect(result.denied).toBe(409);expect(result.reviewed).toBe(200);expect(result.original.name).toBe('Cloud report.txt');expect(result.bundle.resourceType).toBe('Bundle');expect(result.history).toBe(2);expect(result.summaryStatus).toBe(200);expect(result.summaryReports).toBe(0);expect(result.invalid).toBe(400);expect(records.find(r=>r.entity_type==='medicalReport')?.payload.status).toBe('reviewed');expect(originApi).toEqual([]);
});

test('automation state and full record backups are cloud-backed and preserve conflicts',async({page})=>{
  const {records,originApi}=await setup(page);await page.goto('/#Today');await ready(page);
  const result=await page.evaluate(async()=>{const {cloudFetch}=await import('/lib/cloud-api.ts');const call=async(path:string,body?:unknown,method='POST')=>{const r=await cloudFetch('/api/'+path,{method,body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(await r.text());return r.json();};await call('programs',{id:'cycle',name:'Cloud cycle',weekIds:['week-one']});const backup=await call('backup',undefined,'GET');backup.cloudRecords.find((r:any)=>r.id==='cycle').payload.name='Conflicting copy';const restored=await call('backup/restore',backup);return {restored,hasBiology:Array.isArray(backup.biologicalRecords)};});
  expect(result.restored.conflicts).toBeGreaterThan(0);expect(result.hasBiology).toBe(true);expect(records.find(r=>r.record_id==='cycle')?.payload.name).toBe('Cloud cycle');await expect.poll(()=>records.some(r=>r.entity_type==='automationState')).toBe(true);expect(originApi).toEqual([]);
});

test('mobile Health OS fits the viewport',async({page})=>{await page.setViewportSize({width:390,height:844});const {originApi}=await setup(page);await page.goto('/#Today');await expect(page.locator('.os-content')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'outputs/health-os-mobile.png',fullPage:true});expect(originApi).toEqual([]);});

test('personal worker shows offline jobs and allows cancellation',async({page})=>{
  const {jobs,originApi}=await setup(page);await page.goto('/#Settings');await ready(page);
  await page.getByRole('tab',{name:'Connections',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Local worker',exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'Your worker is offline'})).toBeVisible();
  await page.getByRole('button',{name:'Run synthetic connection check'}).click();
  await expect.poll(()=>jobs.length).toBe(1);expect(jobs[0].user_id).toBe(owner);
  await page.getByRole('button',{name:'Cancel job',exact:true}).click();await expect.poll(()=>jobs[0].status).toBe('cancelled');expect(originApi).toEqual([]);
});

test('waiting for research does not block cloud saves and returns the worker result',async({page})=>{
  const {jobs,records}=await setup(page);await page.goto('/#Today');await ready(page);
  await page.evaluate(async()=>{const {cloudFetch}=await import('/lib/cloud-api.ts');(window as any).researchResult=cloudFetch('/api/medical/research/workbench',{method:'POST',body:JSON.stringify({operation:'change-points',consent:true,purpose:'Synthetic queue verification',track:false,values:Array.from({length:20},(_,i)=>i)})}).then(r=>r.json());});
  await expect.poll(()=>jobs.length).toBe(1);
  const saved=await page.evaluate(async()=>{const {cloudFetch}=await import('/lib/cloud-api.ts');return (await cloudFetch('/api/programs',{method:'POST',body:JSON.stringify({id:'during-analysis',name:'Saved while research waits',weekIds:[]})})).status;});
  expect(saved).toBe(200);expect(records.some(r=>r.record_id==='during-analysis')).toBe(true);
  jobs[0].status='completed';jobs[0].result={ok:true,result:{indices:[10]}};
  expect(await page.evaluate(()=>(window as any).researchResult)).toEqual({ok:true,result:{indices:[10]}});
});

test('private study enrollment, explicit check-ins and doctor question edits persist',async({page})=>{
  const {records}=await setup(page);await page.goto('/#Health');await ready(page);
  const result=await page.evaluate(async()=>{const {cloudFetch}=await import('/lib/cloud-api.ts');const call=async(path:string,body:any,method='POST')=>{const r=await cloudFetch('/api/medical/actions/'+path,{method,body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
    const denied=await call('checkins',{feeling:'Normal'});await call('enrollment',{consent:true,purpose:'Private synthetic study'});
    const checkin=await call('checkins',{feeling:'Normal',noIllnessConfirmed:true});const question=await call('questions',{text:'Original question',source:'user',sourceRefs:[]});await call(`questions/${question.data.question.id}`,{text:'Updated question',answered:true},'PUT');const audit=await call('audit',{},'GET');return {denied:denied.status,checkin:checkin.status,audit:audit.data.entries.length};});
  expect(result.denied).toBe(409);expect(result.checkin).toBe(200);expect(result.audit).toBeGreaterThan(0);expect(records.find(r=>r.record_id==='health-os-medical-actions')?.payload.state.questions[0].text).toBe('Updated question');
});
