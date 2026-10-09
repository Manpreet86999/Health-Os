import { test, expect } from '@playwright/test';
import { setup, base, owner } from './cloud-fixture';
import { appointmentSchema } from '../../src/shared/appointments';

const id='22222222-2222-4222-8222-222222222222';
const appointment=()=>appointmentSchema.parse({version:1,id,revision:1,title:'Original visit',scheduledAt:'2027-01-15T04:30:00.000Z',timezone:'Asia/Kolkata',summaryFrom:'2026-10-01',summaryTo:'2026-10-07',createdAt:'2026-10-07T10:00:00Z',updatedAt:'2026-10-07T10:00:00Z'});

test('concurrent appointment edits preserve the draft and require comparison',async({page})=>{
  const cloud=await setup(page,true,true);cloud.add('automationState',`health-os-appointment:${id}`,{kind:'healthAppointment',version:1,appointment:appointment()});
  await page.goto(`/#Health/Appointment%3A${id}`);await page.getByRole('textbox',{name:'Appointment title',exact:true}).fill('My local edit');
  const row=cloud.records.find(row=>row.record_id===`health-os-appointment:${id}`)!;
  row.payload.appointment={...row.payload.appointment,title:'Changed on another device',revision:2,updatedAt:'2026-10-07T11:00:00Z'};
  row.revision++;row.cloud_updated_at='2026-10-07T11:00:00Z';row.change_version=10000;
  await page.evaluate(()=>window.dispatchEvent(new Event('body-os-cloud-refresh')));
  await page.getByRole('button',{name:'Save details',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review changes from another device',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Appointment title',exact:true})).toHaveValue('My local edit');
  await expect(page.getByRole('button',{name:'Apply my reviewed changes',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Load latest into form',exact:true}).click();await expect(page.getByRole('textbox',{name:'Appointment title',exact:true})).toHaveValue('Changed on another device');
});

test('saving one appointment stage retains unsaved work in another stage through refresh',async({page})=>{
  const cloud=await setup(page,true,true);cloud.add('automationState',`health-os-appointment:${id}`,{kind:'healthAppointment',version:1,appointment:appointment()});
  await page.goto(`/#Health/Appointment%3A${id}`);
  const stages=page.getByRole('navigation',{name:'Appointment stages'});
  await stages.getByRole('button',{name:'Visit notes',exact:true}).click();await page.getByRole('textbox',{name:'Your visit notes',exact:true}).fill('Unsaved notes remain a draft');
  await stages.getByRole('button',{name:'Details',exact:true}).click();await page.getByRole('textbox',{name:'Appointment title',exact:true}).fill('Saved title');
  await page.getByRole('button',{name:'Save details',exact:true}).click();await expect(page.getByText('Saved to account. Other stage changes remain in your device draft.',{exact:true})).toBeVisible();
  expect(cloud.records.find(row=>row.record_id===`health-os-appointment:${id}`)?.payload.appointment.visitNotes).toBe('');
  await page.reload();await stages.getByRole('button',{name:'Visit notes',exact:true}).click();await expect(page.getByRole('textbox',{name:'Your visit notes',exact:true})).toHaveValue('Unsaved notes remain a draft');
  await page.getByRole('button',{name:'Save visit notes',exact:true}).click();await expect(page.getByText('Saved to account',{exact:true})).toBeVisible();
});

test('unavailable browser draft storage is explicit and does not claim protection',async({page})=>{
  await setup(page);await page.addInitScript(()=>{const open=IDBFactory.prototype.open;Object.defineProperty(IDBFactory.prototype,'open',{configurable:true,value:function(this:IDBFactory,name:string,version?:number){if(name==='health-os-ui-drafts')throw new DOMException('Storage unavailable','QuotaExceededError');return version===undefined?open.call(this,name):open.call(this,name,version);}});});
  await page.goto('/#Today');await page.getByRole('button',{name:'Log',exact:true}).click();
  expect(await page.evaluate(()=>{try{indexedDB.open('health-os-ui-drafts');return false;}catch{return true;}}),'Storage failure injection must be effective in this browser').toBe(true);
  const capture=page.getByRole('dialog',{name:'Universal Log'});await capture.getByText('Speak or type an entry',{exact:true}).click();await capture.getByRole('textbox',{name:'Natural language capture'}).fill('Synthetic unsaved text');
  await expect(capture.getByText('Draft could not be saved on this device. Keep this page open and retry.',{exact:true})).toBeVisible();
  await expect(capture.getByText('Draft saved on this device',{exact:true})).toHaveCount(0);
  await expect(capture.getByRole('textbox',{name:'Natural language capture'})).toHaveValue('Synthetic unsaved text');
});

test('draft data is project/account scoped and settings drafts exclude credentials',async({page})=>{
  await setup(page);await page.goto('/#Settings');
  await page.getByRole('tab',{name:'Connections',exact:true}).click();
  await page.getByLabel('Provider API key',{exact:true}).fill('synthetic-secret-value');
  await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();
  const result=await page.evaluate(async({base,owner})=>{
    const {readDraft,writeDraft,draftScope}=await import('/lib/use-draft.ts');
    const key=`${draftScope(base,owner)}|settings:public`,saved=await readDraft(key);
    await writeDraft(`${draftScope(base,owner)}|isolation:test`,{text:'Owned draft'});
    const other=await readDraft(`${draftScope(base,'another-account')}|isolation:test`);
    const project=await readDraft(`${draftScope('https://other.supabase.co',owner)}|isolation:test`);
    return {saved,other,project};
  },{base,owner});
  expect(JSON.stringify(result.saved)).not.toContain('synthetic-secret-value');expect(result.other).toBeUndefined();expect(result.project).toBeUndefined();
});

test('search preserves legacy records and groups destinations with keyboard access',async({page})=>{
  const cloud=await setup(page);cloud.add('target','synthetic-goal',{name:'Synthetic stamina goal',type:'custom',current:0,target:10,unit:'sessions',status:'active'});
  await page.goto('/#Search');const search=page.getByRole('textbox',{name:'Search',exact:true});await search.fill('Synthetic stamina');
  await expect(page.getByRole('button',{name:/Synthetic stamina goal/})).toBeVisible();
  await search.fill('Appointments');await expect(page.getByRole('region',{name:'Destinations'})).toBeVisible();
  await search.press('ArrowDown');await expect(page.getByRole('button',{name:/Health Appointments/}).first()).toBeFocused();
  await page.keyboard.press('Escape');await expect(search).toBeFocused();
});
