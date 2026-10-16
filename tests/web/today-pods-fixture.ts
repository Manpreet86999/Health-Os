import { expect, type Page } from '@playwright/test';
import { setupFriendPods } from './friend-pods-fixture';
export async function verifyTodayPods(page: Page, native = false, version: 1 | 2 = 1) {
  const backend = await setupFriendPods(page, version, 'connected');
  if (native) { const { nativeFixture } = await import('../../apps/health-os-mobile/tests/native-fixture'); await nativeFixture(page); }
  await page.goto('/#Today'); const card = page.getByRole('region', { name: 'Your Pods', exact: true });
  await expect(card).toBeVisible(); await card.scrollIntoViewIfNeeded(); await expect(card).toContainText('Winter Arc');
  await expect(card).toContainText(version === 2 ? 'Parm' : 'Your partner');
  await expect(card.getByRole('textbox', { name: 'Pod name' })).toHaveCount(0);
  backend.failNext('complete'); await card.getByRole('button', { name: 'Mark today · Gym', exact: true }).click();
  await expect(card).toContainText('Could not save check-in'); expect(backend.completions).toHaveLength(0);
  await card.getByRole('button', { name: 'Retry Pods', exact: true }).click();
  await card.getByRole('button', { name: 'Mark today · Gym', exact: true }).click();
  await expect(card).toContainText('You · 1 / 5 days'); await expect(card).toContainText('Together this week · 1 check-ins');
  await card.getByRole('button', { name: 'Undo today · Gym', exact: true }).click(); await expect(card).toContainText('You · 0 / 5 days');
  await card.getByRole('button', { name: 'Open Pod →', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Winter Arc', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark today · Gym', exact: true }).click(); await expect(page.getByText('You · 1 / 5 days', { exact: true })).toBeVisible();
  if (native && await page.getByRole('button', { name: 'Back to Today', exact: true }).count()) await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
  else { await page.goto('/#Today'); }
  await expect(page.getByRole('region', { name: 'Your Pods', exact: true })).toContainText('You · 1 / 5 days');
  expect(backend.unexpected).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `output/friend-pods/${native ? 'android' : 'web'}-v${version}-today.png`, fullPage: true });
}
