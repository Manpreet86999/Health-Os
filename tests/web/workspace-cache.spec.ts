import { test, expect, type Page } from '@playwright/test';
import { setup, base } from './cloud-fixture';

const ready = (page: Page) => expect(page.getByRole('navigation', { name: 'Health OS domains' })).toBeVisible({ timeout: 30000 });
const bootstrap = (page: Page) => page.evaluate(async () => {
  const { cloudFetch } = await import('/lib/cloud-api.ts');
  return (await cloudFetch('/api/bootstrap')).json();
});

test('reload reuses history and applies additions, edits and deletions with fresh shared catalog data', async ({ page }) => {
  const { add, records } = await setup(page);
  for (let i = 0; i < 1100; i++) add('healthReading', `step-${i}`, { kind: 'Steps', value: 5, unit: 'steps', date: '2026-10-07', source: 'Test watch', startTime: '2026-10-07T01:00:00Z', endTime: '2026-10-07T01:01:00Z', sourceRecordId: `step-${i}`, importedAt: '2026-10-07T01:02:00Z' });
  const first = '30000000-0000-4000-8000-000000000001', second = '30000000-0000-4000-8000-000000000002';
  add('exercise', first, {});
  const catalogIds = [first];
  let fullReads = 0; const cursors: number[] = [], catalogReads: string[] = [];
  page.on('request', req => {
    if (new URL(req.url()).pathname.endsWith('/body_os_records') && req.method() === 'GET') fullReads++;
    if (req.url().includes('/rpc/body_os_pull_delta')) cursors.push(req.postDataJSON().after_version);
  });
  await page.route(`${base}/rest/v1/body_os_exercises?*`, route => {
    const query = new URL(route.request().url()).searchParams;
    const ids = query.has('id') ? query.get('id')!.slice(4, -1).split(',') : catalogIds.slice(Number(query.get('offset') || 0), Number(query.get('offset') || 0) + Number(query.get('limit') || 1000));
    catalogReads.push(...ids);
    return route.fulfill({ json: ids.map(id => ({ id, name: `Exercise ${id}`, muscles: [], equipment: [], source_payload: {} })) });
  });
  await page.goto('/'); await ready(page);
  expect(fullReads).toBeGreaterThan(1); expect(catalogReads).toEqual([first]);
  const initialCursor = Math.max(...records.map(r => r.change_version));
  const initialKeys=records.map(r=>`${r.entity_type}:${r.record_id}`);
  // Startup is usable before its optional cache finishes committing. Verify
  // that commit independently before testing the warm-reload path.
  await expect.poll(async () => {const cached=await page.evaluate(async () => {
    const { readWorkspaceCache } = await import('/lib/workspace-cache.ts');
    const session = JSON.parse(localStorage.getItem('body-os-supabase-session-v1')!);
    const cached = await readWorkspaceCache(session);
    return cached ? { cursor: cached.cursor, keys: cached.records.map(r=>`${r.entityType}:${r.id}`) } : null;
  });
    // Background automation may save a legitimate additional row after startup.
    // Require every original row and reject unknown rows, without freezing a
    // pre-save count. A save must still leave the pull cursor unchanged.
    const known=new Set(records.map(r=>`${r.entity_type}:${r.record_id}`));
    return cached?{cursor:cached.cursor,missing:initialKeys.filter(key=>!cached.keys.includes(key)).length,unknown:cached.keys.filter(key=>!known.has(key)).length}:null;
  }).toEqual({cursor:initialCursor,missing:0,unknown:0});
  fullReads = 0; catalogReads.length = 0; cursors.length = 0;
  await page.reload(); await ready(page);
  expect(fullReads).toBe(0); expect(cursors[0]).toBe(initialCursor);
  add('profile', 'profile', { displayName: 'Updated elsewhere', units: 'kg' });
  add('target', 'remote-target', { name: 'New goal', value: 10 });
  add('exercise', second, {});
  catalogIds.push(second);
  await page.reload(); await ready(page);
  let b = await bootstrap(page);
  expect(b.db.profile.displayName).toBe('Updated elsewhere'); expect(b.db.targets.some((r: any) => r.id === 'remote-target')).toBe(true);
  expect(b.db.exercises.map((row: any) => row.id)).toEqual(expect.arrayContaining([first, second])); expect(fullReads).toBe(0);
  add('target', 'remote-target', {}); records.at(-1)!.deleted_at = new Date().toISOString();
  await page.reload(); await ready(page); b = await bootstrap(page);
  expect(b.db.targets.some((r: any) => r.id === 'remote-target')).toBe(false); expect(fullReads).toBe(0);
});

test('cloud saves persist without skipping earlier changes from another device', async ({ page }) => {
  const { add, records } = await setup(page); await page.goto('/'); await ready(page);
  const before = Math.max(...records.map(r => r.change_version));
  add('target', 'another-device', { name: 'Remote goal' });
  await page.evaluate(async () => {
    const { cloudFetch } = await import('/lib/cloud-api.ts');
    const result = await cloudFetch('/api/targets', { method: 'POST', body: JSON.stringify({ id: 'my-save', name: 'Saved here' }) });
    if (!result.ok) throw new Error(await result.text());
  });
  const cached = await page.evaluate(async () => {
    const { readWorkspaceCache } = await import('/lib/workspace-cache.ts');
    const s = JSON.parse(localStorage.getItem('body-os-supabase-session-v1')!);
    return readWorkspaceCache(s);
  });
  expect(cached!.records.some((r: any) => r.id === 'my-save')).toBe(true);
  // A concurrent UI refresh may already have consumed the gap; it must never skip it.
  if (cached!.cursor > before) expect(cached!.records.some((r: any) => r.id === 'another-device')).toBe(true);
  await page.reload(); await ready(page); const b = await bootstrap(page);
  expect(b.db.targets.map((r: any) => r.id)).toEqual(expect.arrayContaining(['my-save', 'another-device']));
});

test('incomplete cache rebuilds safely and other accounts/projects cannot reuse it', async ({ page }) => {
  const { add } = await setup(page); add('target', 'recover-me', { name: 'Durable goal' }); await page.goto('/'); await ready(page);
  const isolated = await page.evaluate(async () => {
    const { readWorkspaceCache } = await import('/lib/workspace-cache.ts');
    const s = JSON.parse(localStorage.getItem('body-os-supabase-session-v1')!);
    return [await readWorkspaceCache({ ...s, uid: '22222222-2222-4222-8222-222222222222' }), await readWorkspaceCache({ ...s, config: { ...s.config, url: 'https://other.supabase.co' } })];
  });
  expect(isolated).toEqual([null, null]);
  await page.evaluate(async () => {
    const { openDB } = await import('/@fs/G:/Body OS/node_modules/idb/build/index.js');
    const { workspaceScope } = await import('/lib/workspace-cache.ts');
    const s = JSON.parse(localStorage.getItem('body-os-supabase-session-v1')!);
    const db = await openDB(`health-os-workspace-v1:${workspaceScope(s)}`, 1);
    if (!await db.get('records', 'target:recover-me')) throw new Error('Test record missing before corruption');
    await db.delete('records', 'target:recover-me'); db.close();
  });
  let reads = 0; page.on('request', req => { if (req.url().includes('/body_os_records?')) reads++; });
  await page.reload(); await ready(page); expect(reads).toBeGreaterThan(0);
  expect((await bootstrap(page)).db.targets.some((r: any) => r.id === 'recover-me')).toBe(true);
  const gap = await page.evaluate(async () => {
    const { readWorkspaceCache, writeWorkspaceCache } = await import('/lib/workspace-cache.ts');
    const s = JSON.parse(localStorage.getItem('body-os-supabase-session-v1')!);
    const saved = (await readWorkspaceCache(s))!;
    // A failed disk write or another tab replacing an older snapshot must never
    // let a later page advance the persisted cursor over missing changes.
    const written = await writeWorkspaceCache(s, [], [], saved.cursor + 2, false, saved.cursor + 1);
    return { written, saved: await readWorkspaceCache(s) };
  });
  expect(gap).toEqual({ written: false, saved: null });
});


test('a stalled optional IndexedDB cache cannot block authoritative cloud startup',async({page})=>{
  test.setTimeout(90000);await setup(page);
  await page.addInitScript(()=>{
    const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(name:string,version?:number){
      if(!name.startsWith('health-os-workspace-v1:'))return version===undefined?open.call(this,name):open.call(this,name,version);
      const request=open.call(this,'health-os-stalled-cache-test',1);
      request.addEventListener('upgradeneeded',()=>{
        const store=request.result.createObjectStore('hold'),transaction=request.transaction!;
        const hold=()=>{try{store.get('pending').onsuccess=hold;}catch{/* The test releases this transaction. */}};
        hold();setTimeout(()=>{try{transaction.abort();}catch{/* Already closed. */}},15000);
      });
      return request;
    };
  });
  let downloads=0;page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/body_os_records'))downloads++;});
  await page.goto('/');await ready(page);expect(downloads).toBeGreaterThan(0);
  await expect(page.getByRole('heading',{name:/Cloud Athlete/})).toBeVisible();
});
