import { test, expect, type Page } from '@playwright/test';
import { setup, base } from './cloud-fixture';
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const panel = (page: Page) => page.getByRole('tabpanel');
test('legacy profile links and avatar open the merged settings workspace', async ({ page }) => {
  await setup(page); await page.goto('/#Profile/Profile');
  await expect(page.locator('.settings-hero h1')).toHaveText('Settings.');
  await expect(tab(page, 'My profile')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.os-rail [data-domain="Profile"]')).toHaveCount(0);
  await expect(page.locator('.primary-view-tabs')).toHaveCount(0);
  await expect(page.locator('.os-navigation')).toHaveAttribute('data-pinned', 'false');
  await tab(page, 'Training').click(); await page.getByRole('button', { name: 'Open profile settings' }).click();
  await expect(tab(page, 'My profile')).toHaveAttribute('aria-selected', 'true');
});
test('profile edits survive section changes, save to cloud and survive reload', async ({ page }) => {
  const cloud = await setup(page, true, true); await page.goto('/#Settings');
  await page.getByLabel('Your name', { exact: true }).fill('Alex Rivera');
  await page.getByLabel('Height (cm)', { exact: true }).fill('178');
  await page.getByRole('button', { name: 'lb Pounds', exact: true }).click();
  await tab(page, 'Reports').click(); await tab(page, 'My profile').click();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Alex Rivera');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => cloud.records.find(record => record.entity_type === 'profile')?.payload.displayName).toBe('Alex Rivera');
  expect(cloud.records.find(record => record.entity_type === 'profile')?.payload.units).toBe('lb');
  await expect(page.locator('.settings-save-bar')).toContainText('Settings saved');
  await page.reload(); await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Alex Rivera');
  await expect(page.getByRole('button', { name: 'lb Pounds', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('discard restores saved values without writing to cloud', async ({ page }) => {
  const cloud = await setup(page); await page.goto('/#Settings');
  await page.getByLabel('Your name', { exact: true }).fill('Discard me');
  await tab(page, 'Training').click(); await page.getByLabel('Rest timer (seconds)').fill('180');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByLabel('Rest timer (seconds)')).toHaveValue('90');
  await tab(page, 'My profile').click(); await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Cloud Athlete');
  expect(cloud.records.some(record => record.entity_type === 'sharedPreferences')).toBe(false);
});
test('failed cloud save preserves edits, exposes an error and allows retry', async ({ page }) => {
  const cloud = await setup(page, true, true); let fail = true;
  await page.route(`${base}/rest/v1/body_os_records**`, async route => {
    if (fail && route.request().method() !== 'GET') return route.fulfill({ status: 503, json: { message: 'Settings temporarily unavailable' } });
    await route.fallback();
  });
  await page.goto('/#Settings'); await page.getByLabel('Your name', { exact: true }).fill('Retry Athlete');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.settings-error')).toBeVisible();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Retry Athlete');
  fail = false; await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => cloud.records.find(record => record.entity_type === 'profile')?.payload.displayName).toBe('Retry Athlete');
  await expect(page.locator('.settings-error')).toHaveCount(0);
});
test('training toggle saves immediately while numeric defaults use explicit save including zero rest', async ({ page }) => {
  const cloud = await setup(page, true, true); await page.goto('/#Settings'); await tab(page, 'Training').click();
  await page.getByRole('switch', { name: 'Use a planned training week' }).uncheck();
  await expect.poll(() => cloud.records.find(record => record.entity_type === 'trainingConfig')?.payload.preplannedWeekMode).toBe(false);
  await page.getByLabel('Weekly workout goal').fill('5'); await page.getByLabel('Rest timer (seconds)').fill('0');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => cloud.records.find(record => record.entity_type === 'sharedPreferences')?.payload.restSeconds).toBe(0);
  await page.reload(); await expect(page.getByLabel('Rest timer (seconds)')).toHaveValue('0');
});
test('report toggles and structured schedule save and reload in the active section', async ({ page }) => {
  const cloud = await setup(page, true, true); await page.goto('/#Settings'); await tab(page, 'Reports').click();
  await expect(page.getByLabel('Report day', { exact: true })).toBeDisabled();
  await page.getByRole('switch', { name: 'Email weekly summaries', exact: true }).check();
  await page.getByLabel('Report day', { exact: true }).selectOption('Wednesday'); await page.getByLabel('Report time', { exact: true }).fill('18:30');
  await page.getByRole('switch', { name: 'Email monthly summaries', exact: true }).check();
  await page.getByRole('switch', { name: 'Email my daily report at 23:00 IST', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => cloud.records.find(record => record.entity_type === 'sharedPreferences')?.payload.reportSchedule).toBe('Wednesday 18:30');
  await page.reload(); await expect(tab(page, 'Reports')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('switch', { name: 'Email weekly summaries', exact: true })).toBeChecked();
  await expect(page.getByLabel('Report time', { exact: true })).toHaveValue('18:30');
});
test('appearance applies instantly and keeps the selected theme after reload', async ({ page }) => {
  await setup(page, true, true); await page.goto('/#Settings'); await tab(page, 'Appearance').click();
  await page.getByRole('button', { name: 'Light Fresh & bright', exact: true }).click();
  await expect(page.locator('body')).not.toHaveClass(/dark/);
  await page.reload(); await expect(page.getByRole('button', { name: 'Light Fresh & bright', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'output/settings-validation/appearance-light.png', fullPage: true });
  await page.getByRole('button', { name: 'Dark Easy on the eyes', exact: true }).click(); await expect(page.locator('body')).toHaveClass(/dark/);
  await page.screenshot({ path: 'output/settings-validation/appearance-dark.png', fullPage: true });
});
test('search finds sections and section controls support keyboard navigation', async ({ page }) => {
  await setup(page); await page.goto('/#Settings'); await page.getByLabel('Search settings').fill('email');
  await expect(page.getByRole('tab')).toHaveCount(2); await tab(page, 'Reports').click();
  await page.getByRole('button', { name: 'Clear settings search' }).click();
  await tab(page, 'My profile').focus(); await page.keyboard.press('ArrowDown');
  await expect(tab(page, 'Appearance')).toBeFocused(); await expect(tab(page, 'Appearance')).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Search settings').fill('nonexistent-setting'); await expect(page.getByText(/No settings found/)).toBeVisible();
});
test('desktop and mobile sections remain within the viewport', async ({ page }) => {
  await setup(page); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/#Settings');
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/settings-validation/profile-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  for (const label of ['My profile', 'Appearance', 'Training', 'Reports', 'Connected services', 'HEOS MCP', 'Data & Backup','Privacy & Account']) {
    await tab(page, label).click(); await expect(panel(page).getByRole('heading', { name: label, exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await tab(page, 'Reports').click(); await page.screenshot({ path: 'output/settings-validation/reports-mobile.png', fullPage: true });
});

