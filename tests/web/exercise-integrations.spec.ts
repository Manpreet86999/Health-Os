import { test, expect } from '@playwright/test';
import { setup, base } from './cloud-fixture';
const id = '22222222-2222-4222-8222-222222222222';
const video = (asset = 'abcdefghijk') => ({id: asset, exercise_id: id, media_type:'tutorial', provider:'youtube', provider_asset_id:asset, url:`https://www.youtube.com/watch?v=${asset}`, embed_url:`https://www.youtube-nocookie.com/embed/${asset}`, status:'usable', is_primary:true});
const exercise = {id,name:'Bench Press',equipment:[],muscles:['Chest'],movement_pattern:'push',source_payload:{},catalog_status:'active'};

test('settings offers shared YouTube configuration without GIFs or key inputs', async ({page}) => {
  const {records} = await setup(page);
  await page.route(`${base}/functions/v1/body-os-ai`, route => route.fulfill({json:{youtubeConfigured:true}}));
  await page.goto('/#Settings');
  await page.getByRole('tab',{name:'Connections',exact:true}).click();
  const region=page.getByRole('region',{name:'YouTube guides connection'});
  await expect(region.locator('input')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'GIF guides connection'})).toHaveCount(0);
  await region.getByRole('button').click();
  await expect(region).toContainText('configured for all users');
  expect(records.some(r=>r.payload.youtubeApiKey||r.payload.giphyApiKey)).toBe(false);
});

test('community cards open the player directly and a contribution survives reload', async ({page}) => {
  const {catalog,records}=await setup(page,true,true);
  let primary=video(); catalog.push({...exercise,body_os_exercise_media:[primary]});
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({body:'player'}));
  await page.route(`${base}/functions/v1/body-os-exercise-library`,route=>{
    const input=route.request().postDataJSON();
    if(input.action==='contribute') {
      expect(input.youtubeUrl).toBe('https://youtu.be/lmnopqrstuv'); primary=video('lmnopqrstuv');
      catalog[0].body_os_exercise_media=[primary];
    }
    return route.fulfill({json:{exercise,media:[primary],errors:[]}});
  });
  await page.goto('/#Library');
  await page.getByRole('button',{name:'Bench Press',exact:true}).click();
  await expect(page.locator('iframe[title="Bench Press tutorial"]')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/abcdefghijk');
  await expect(page.getByRole('button',{name:'How to',exact:true})).toHaveCount(0);
  await page.getByLabel('Contribute a YouTube guide').fill('https://youtu.be/lmnopqrstuv');
  await page.getByRole('button',{name:'Save for everyone',exact:true}).click();
  await expect(page.locator('iframe[title="Bench Press tutorial"]')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/lmnopqrstuv');
  await page.reload();
  await page.getByRole('button',{name:'Bench Press',exact:true}).click();
  await expect(page.locator('iframe[title="Bench Press tutorial"]')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/lmnopqrstuv');
  expect(records.filter(r=>r.entity_type==='exercise')).toHaveLength(1);
});

test('week imports link shared exercise IDs and retain the week if search is unavailable',async({page})=>{
  const {catalog,records}=await setup(page);
  catalog.push({...exercise,body_os_exercise_media:[]});
  await page.route(`${base}/functions/v1/body-os-exercise-library`,route=>{
    const input=route.request().postDataJSON();
    return route.fulfill({json:{exercise,media:[],errors:input.fetchMissing===false?[]:['YouTube quota reached']}});
  });
  await page.goto('/#Programs');
  const result=await page.evaluate(async()=>{
    const {cloudFetch}=await import('/lib/cloud-api.ts');
    const response=await cloudFetch('/api/weeks/import',{method:'POST',body:JSON.stringify({id:'import-shared',name:'Shared week',days:[{key:'Mon',exercises:[{name:'Bench Press'},{name:'Bench Press'}]}]})});
    return {status:response.status,data:await response.json()};
  });
  expect(result.status).toBe(200);
  expect(result.data.days[0].exercises.map((e:any)=>e.exerciseId)).toEqual([id,id]);
  expect(result.data.mediaErrors.join(' ')).toContain('quota');
  expect(records.some(r=>r.record_id==='import-shared')).toBe(true);
});
