import {test,expect} from '@playwright/test';
import {setup,base} from './cloud-fixture';

const flows=[
  {name:'weekly review',route:'#Habits/Weekly%20Review',label:'Wins',value:'Synthetic review draft'},
  {name:'Care commitment',route:'#SkinGoals',label:'Minutes available each day',value:'12'},
  {name:'Care goal composer',route:'#SkinGoals',label:'Concern',value:'Synthetic concern draft'},
  {name:'Care action composer',route:'#SkinRoutine',label:'Action',value:'Synthetic action draft'},
  {name:'Care observation',route:'#SkinCheckIn',label:'What did you notice?',value:'Synthetic observation draft'},
  {name:'Care review',route:'#SkinReviews',label:'Why?',value:'Synthetic review decision'},
  {name:'Care profile',route:'#SkinProfile',label:'Scalp observations',value:'Synthetic profile draft'},
  {name:'training goal',route:'#Targets',label:'Goal name',value:'Synthetic training goal'},
  {name:'calendar schedule',route:'#Calendar',label:'Scheduled title',value:'Synthetic schedule draft'},
  {name:'meal description',route:'#Eat/Describe%20Meal',label:'Describe meal',value:'Synthetic meal description'},
  {name:'Care coach composer',route:'#SkinAi',label:'Message Care coach',value:'Synthetic coach draft'},
  {name:'photo context',route:'#SkinProgress/Photos',label:'Photo context',value:'Synthetic lighting context'},
];
for(const flow of flows)test(`${flow.name} retains unsaved input after refresh`,async({page})=>{
  await setup(page);await page.goto('/'+flow.route);const field=page.getByLabel(flow.label,{exact:true});await expect(field).toBeVisible();
  await field.fill(flow.value);await expect(page.getByText('Draft saved on this device',{exact:true}).first()).toBeVisible();
  await page.reload();await expect(field).toHaveValue(flow.value);
});

test('recipe restores a closed draft with a stable identifier',async({page})=>{
  await setup(page);await page.goto('/#Eat/Recipes');await page.getByRole('button',{name:/Build recipe/}).first().click();
  const dialog=page.getByRole('dialog',{name:'Make a meal worth repeating'});await dialog.getByLabel('Give it a name').fill('Synthetic recipe');await dialog.getByLabel('Makes',{exact:true}).fill('4');
  await expect(dialog.getByText('Draft saved on this device',{exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await page.reload();await page.getByRole('button',{name:/Build recipe/}).first().click();await expect(dialog.getByLabel('Give it a name')).toHaveValue('Synthetic recipe');await expect(dialog.getByLabel('Makes',{exact:true})).toHaveValue('4');
});

test('library import preview survives refresh and partial-save retries preserve identifiers',async({page})=>{
  const cloud=await setup(page);await page.goto('/#Library');await page.getByRole('button',{name:'Import',exact:true}).click();
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({name:'synthetic-exercises.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({exercises:[{name:'Synthetic exercise one',bodyPart:'Chest'},{name:'Synthetic exercise two',bodyPart:'Chest'}]}))});
  await expect(page.getByRole('dialog',{name:'Preview import'})).toBeVisible();await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await page.reload();await page.getByRole('button',{name:'Import',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Preview import'})).toBeVisible();
  let fail=true;const attempts:{id:string;name:string}[]=[];
  await page.route(`${base}/rest/v1/body_os_records**`,async route=>{
    if(route.request().method()==='POST'){const row=route.request().postDataJSON();if(row.entity_type==='exercise'&&row.payload.name.startsWith('Synthetic exercise')){attempts.push({id:row.record_id,name:row.payload.name});if(fail&&row.payload.name.endsWith('two'))return route.fulfill({status:503,json:{message:'Synthetic partial interruption'}});}}
    return route.fallback();
  });
  await page.getByRole('button',{name:'Accept & import',exact:true}).click();await expect(page.getByText(/Supabase save failed/)).toBeVisible();
  fail=false;await page.getByRole('button',{name:'Accept & import',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(cloud.records.filter(r=>r.entity_type==='exercise'&&r.payload.name.startsWith('Synthetic exercise'))).toHaveLength(2);
  for(const name of ['Synthetic exercise one','Synthetic exercise two'])expect(new Set(attempts.filter(a=>a.name===name).map(a=>a.id)).size).toBe(1);
});

test('uncontrolled habit form restores values and does not duplicate a retried submission',async({page})=>{
  const cloud=await setup(page);await page.goto('/#Habits');await page.getByLabel('Habit name',{exact:true}).fill('Synthetic habit');await page.getByLabel('Target value',{exact:true}).fill('2');await page.getByLabel('Unit (e.g. L, mins)',{exact:true}).fill('times');
  await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();await page.reload();await expect(page.getByLabel('Habit name',{exact:true})).toHaveValue('Synthetic habit');
  let fail=true;const attempts:string[]=[];
  await page.route(`${base}/rest/v1/body_os_records**`,async route=>{if(route.request().method()==='POST'){const row=route.request().postDataJSON();if(row.entity_type==='habit'){attempts.push(row.record_id);if(fail)return route.fulfill({status:503,json:{message:'Synthetic interruption'}});}}return route.fallback();});
  await page.getByRole('button',{name:'Add Habit',exact:true}).click();await expect(page.getByText('Couldn’t save. Your entries are retained. Try Save again.',{exact:true})).toBeVisible();await expect(page.getByLabel('Habit name',{exact:true})).toHaveValue('Synthetic habit');fail=false;
  await page.getByRole('button',{name:'Add Habit',exact:true}).click();await expect(page.getByText('Saved to account',{exact:true})).toBeVisible();
  expect(new Set(attempts).size).toBe(1);expect(cloud.records.filter(r=>r.entity_type==='habit'&&r.payload.name==='Synthetic habit')).toHaveLength(1);
  await page.reload();await expect(page.getByLabel('Habit name',{exact:true})).toBeEmpty();
});
