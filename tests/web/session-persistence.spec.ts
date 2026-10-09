import { test, expect, type Page } from '@playwright/test';
import { setup, base, owner } from './cloud-fixture';
const ready = (page: Page) => expect(page.getByRole('navigation', { name: 'Health OS domains' })).toBeVisible({ timeout: 30000 });
const expire = (page: Page) => page.evaluate(() => {
  const key = 'body-os-supabase-session-v1', s = JSON.parse(localStorage.getItem(key)!);
  s.expiresAt = Date.now() - 1000; localStorage.setItem(key, JSON.stringify(s));
});

test('saved login survives reload, closing a tab and expired access-token renewal', async ({ page, context }) => {
  test.setTimeout(120000);
  await setup(page, true, true); await page.goto('/'); await ready(page);
  await page.reload(); await ready(page);
  const reopened = await context.newPage(); await setup(reopened, true, true);
  await page.close(); await reopened.goto('/'); await ready(reopened);
  await reopened.addInitScript(() => {
    if (localStorage.getItem('health-os-expired-once')) return;
    const key = 'body-os-supabase-session-v1', s = JSON.parse(localStorage.getItem(key)!);
    s.expiresAt = Date.now() - 1000; localStorage.setItem(key, JSON.stringify(s));
    localStorage.setItem('health-os-expired-once', 'yes');
  });
  let refreshes = 0;
  await reopened.route(`${base}/auth/v1/token?grant_type=refresh_token`, route => {
    refreshes++; return route.fulfill({ json: { access_token: 'test-access-token', refresh_token: 'rotated-refresh-token', expires_in: 3600, user: { id: owner, email: 'cloud-test@example.com' } } });
  });
  await reopened.reload(); await ready(reopened); expect(refreshes).toBe(1);
  expect(await reopened.evaluate(() => JSON.parse(localStorage.getItem('body-os-supabase-session-v1')!).refreshToken)).toBe('rotated-refresh-token');
  await reopened.reload(); await ready(reopened); expect(refreshes).toBe(1);
});

test('temporary auth failure keeps remembered login and retry recovers', async ({ page }) => {
  await setup(page, true, true); await page.goto('/'); await ready(page); await expire(page);
  let unavailable = true;
  await page.route(`${base}/auth/v1/token?grant_type=refresh_token`, route => unavailable
    ? route.fulfill({ status: 503, json: { message: 'Temporary connection failure' } })
    : route.fulfill({ json: { access_token: 'test-access-token', refresh_token: 'renewed', expires_in: 3600, user: { id: owner, email: 'cloud-test@example.com' } } }));
  await page.reload(); await expect(page.getByRole('button', { name: 'Retry loading', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean(localStorage.getItem('body-os-supabase-session-v1')))).toBe(true);
  await expect(page.getByRole('button', { name: 'Sign in to Health OS', exact: true })).toHaveCount(0);
  unavailable = false; await page.getByRole('button', { name: 'Retry loading', exact: true }).click(); await ready(page);
});

test('two tabs serialize refresh-token rotation and sign-out stays signed out', async ({ page, context }) => {
  test.setTimeout(120000);
  await setup(page, true, true); await page.goto('/'); await ready(page);
  const other = await context.newPage(); await setup(other, true, true); await other.goto('/'); await ready(other);
  let refreshes = 0;
  for (const tab of [page, other]) await tab.route(`${base}/auth/v1/token?grant_type=refresh_token`, async route => {
    refreshes++; await new Promise(resolve => setTimeout(resolve, 100));
    return route.fulfill({ json: { access_token: 'test-access-token', refresh_token: 'rotated-once', expires_in: 3600, user: { id: owner, email: 'cloud-test@example.com' } } });
  });
  await expire(page);
  await Promise.all([page, other].map(tab => tab.evaluate(async () => {
    const { activeSession } = await import('/lib/cloud-session.ts'); await activeSession();
  })));
  expect(refreshes).toBe(1);
  await page.evaluate(async () => { const { signOutCloud } = await import('/lib/cloud-session.ts'); await signOutCloud(); });
  await expect(other.getByRole('button', { name: 'Sign in to Health OS', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Sign in to Health OS', exact: true })).toBeVisible();
});
