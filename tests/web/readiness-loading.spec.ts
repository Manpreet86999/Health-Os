import { test, expect } from '@playwright/test';
import { setup, base } from './cloud-fixture';

test('loading uses a continuous CSS buffer without requesting any video', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setup(page); const blocked = () => {};
  await page.route(`${base}/rest/v1/body_os_records?*`, blocked);
  const videos: string[] = []; page.on('request', r => { if (/\.mp4/.test(r.url())) videos.push(r.url()); });
  await page.goto('/'); const spinner = page.locator('.health-buffer-ring'); await expect(spinner).toBeVisible();
  expect(await spinner.evaluate(el => getComputedStyle(el).animationIterationCount)).toBe('infinite');
  await expect(page.locator('video')).toHaveCount(0); expect(videos).toEqual([]);
  await page.screenshot({ path: 'outputs/health-os-buffering-spinner.png' });
});

test('readiness changes by date, stays connected to Recovery, and does not overlap', async ({ page }) => {
  test.setTimeout(120000);
  const { add } = await setup(page);
  const values = { sleepHours: 8, sleepQuality: 8, soreness: 2, energy: 8, stress: 2, motivation: 8, mood: 8, steps: 4000, painFlag: false, restingHeartRate: '', notes: '', recommendation: 'Test guidance' };
  add('readiness', 'monday', { ...values, date: '2026-09-14', score: 81, band: 'Ready' });
  add('readiness', 'tuesday', { ...values, date: '2026-09-15', energy: 2, sleepHours: 4, score: 42, band: 'Reduced' });
  await page.goto('/#Today'); await expect(page.getByLabel('Overview date')).toBeVisible({ timeout: 30000 });
  await page.getByText('Readiness evidence & other actions',{exact:true}).click();
  const card = page.locator('.health-ready');
  await page.getByLabel('Overview date').fill('2026-09-14'); await expect(card.getByRole('img', { name: 'Readiness: 81 out of 100', exact: true })).toBeVisible();
  await page.getByLabel('Overview date').fill('2026-09-15'); await expect(card.getByRole('img', { name: 'Readiness: 42 out of 100', exact: true })).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 950 });
    const ring = await card.locator('.health-readiness-ring').boundingBox(), contributors = await card.locator('.health-contributors').boundingBox();
    expect(ring && contributors && (ring.x + ring.width <= contributors.x + 1 || ring.y + ring.height <= contributors.y + 1)).toBe(true);
    await card.screenshot({ path: `outputs/readiness-${width}.png` });
  }
  await card.getByRole('button', { name: 'View recovery details ↗', exact: true }).click();
  await expect(page.getByLabel('Recovery date', { exact: true })).toHaveValue('2026-09-15');
  await page.goto('/#Today'); await page.getByLabel('Overview date').fill('2026-09-16');
  const recommendation=page.getByRole('region',{name:'Today recommendation'});
  await expect(recommendation.getByRole('img', { name: 'Readiness: no data', exact: true })).toBeVisible();
  await recommendation.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Readiness · 2026-09-16', exact: true })).toBeVisible();
});

test('training day tabs use the selected day readiness instead of today', async ({ page }) => {
  const { add, records } = await setup(page);
  records.find(r => r.entity_type === 'week')!.payload.startDate = '2026-09-14';
  const values = { sleepHours: 8, sleepQuality: 8, soreness: 2, energy: 8, stress: 2, motivation: 8, mood: 8, steps: 4000, painFlag: false, restingHeartRate: '', notes: '', recommendation: 'Test' };
  add('readiness', 'monday', { ...values, date: '2026-09-14', score: 81, band: 'Ready' });
  add('readiness', 'tuesday', { ...values, date: '2026-09-15', score: 42, band: 'Reduced' });
  add('readiness', 'wednesday', { ...values, date: '2026-09-16', score: 63, band: 'Controlled' });
  await page.goto('/#Dashboard'); await expect(page.getByRole('navigation', { name: 'Health OS domains' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /^Mon/ }).first().click(); await expect(page.getByText('Readiness · 2026-09-14 · 81', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Tue/ }).first().click(); await expect(page.getByText('Readiness · 2026-09-15 · 42', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Wed/ }).first().click(); await expect(page.getByText('Readiness · 2026-09-16 · 63', { exact: true })).toBeVisible();
});
