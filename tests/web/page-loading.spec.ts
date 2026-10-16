import { test, expect } from '@playwright/test';
import { setup, base } from './cloud-fixture';

const ready = (page: import('@playwright/test').Page) => expect(page.getByRole('navigation', { name: 'Health OS domains' })).toBeVisible({ timeout: 10000 });

test('a stalled exercise catalog does not block the first usable page', async ({ page }) => {
  await setup(page);
  await page.route(`${base}/rest/v1/body_os_exercises?*`, () => {});
  await page.goto('/#Today', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
});

test('saved workspace opens and navigates while cloud refresh is stalled', async ({ page }) => {
  const cloud = await setup(page, true, true);
  await page.goto('/#Today'); await ready(page);
  // Wait for the atomic saved record set, rather than racing the first cache commit.
  await expect.poll(() => page.evaluate(async () => {
    const names = await indexedDB.databases();
    const name = names.find(db => db.name?.startsWith('health-os-workspace-v1:'))?.name;
    if (!name) return false;
    return new Promise<boolean>(resolve => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const db = request.result, read = db.transaction('meta').objectStore('meta').get('state');
        read.onsuccess = () => { resolve(!!read.result); db.close(); };
      };
    });
  })).toBe(true);
  let deltaRequested = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${base}/rest/v1/rpc/body_os_pull_delta`, async route => { deltaRequested = true; await gate; await route.fallback(); });
  await page.route(`${base}/rest/v1/body_os_exercises?*`, () => {});
  const start = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
  await expect.poll(() => deltaRequested).toBe(true);
  console.log(`Saved workspace visible with stalled cloud: ${Date.now() - start}ms`);
  for (const hash of ['#Body', '#Recover', '#Settings', '#Today']) {
    await page.evaluate(hash => { location.hash = hash; }, hash);
    await expect(page.locator('.os-content')).toBeVisible();
    await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
  }
  await page.evaluate(() => { location.hash = '#Settings'; });
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Cloud Athlete');
  const profile = cloud.records.find(record => record.entity_type === 'profile');
  cloud.records.splice(cloud.records.indexOf(profile), 1);
  cloud.add('profile', 'profile', { ...profile.payload, displayName: 'Updated from another device' });
  release();
  await expect(page.locator('.settings-account-preview strong')).toHaveText('Updated from another device');
  // The open form retains its device draft until the user saves or discards it.
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Cloud Athlete');
  await page.getByLabel('Your name', { exact: true }).fill('Saved after refresh');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => cloud.records.find(record => record.entity_type === 'profile')?.payload.displayName).toBe('Saved after refresh');
});
