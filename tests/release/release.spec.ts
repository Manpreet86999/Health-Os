import { test, expect } from '@playwright/test';
const repo = 'Manpreet86999/Health-Os';
function release(tag = 'v0.1.1', platform = 'windows') {
  const name = platform === 'android' ? `Health-OS-${tag}.apk` : `Health-OS-Setup-${tag}.exe`;
  return { tag_name: tag, draft: false, prerelease: false, body: 'A brighter daily experience.\nFaster workspace loading and thoughtful improvements across training, nutrition and recovery.', assets: [{ name, size: 100, browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${name}` }] };
}
test.beforeEach(async ({page}) => {
  await page.route('https://**.supabase.co/**', route => route.abort());
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType:'text/css', body:'' }));
  await page.route(`https://api.github.com/repos/${repo}/releases/latest`, route => route.fulfill({ json: release('v0.1.0') }));
});
test('first install tour covers every workspace, supports keyboard tabs and stays dismissed after reload', async ({page}) => {
  await page.goto('/'); const dialog = page.getByRole('dialog', {name:'Health Os is here'}); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab')).toHaveCount(11);
  await dialog.getByRole('tab', {name:/Train/}).click(); await expect(dialog.getByRole('tabpanel')).toContainText('log sets and weights');
  await page.keyboard.press('ArrowRight'); await expect(dialog.getByRole('tab', {name:/Eat/})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.reload(); await expect(dialog).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('health-os-show-welcome'))); await expect(dialog).toBeVisible();
});
test('new installed version shows the welcome tour again without modifying stored account records', async ({page}) => {
  await page.addInitScript(() => { localStorage.setItem('health-os-welcome-version','0.0.9'); localStorage.setItem('release-record-sentinel','keep-me'); });
  await page.goto('/'); await expect(page.getByRole('dialog',{name:'Health Os is here'})).toBeVisible();
  await page.getByRole('button',{name:'Start exploring',exact:true}).click();
  expect(await page.evaluate(() => localStorage.getItem('release-record-sentinel'))).toBe('keep-me');
});
test('new stable GitHub release opens dialog and only starts verified desktop installation after a click', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('health-os-welcome-version','0.1.0'));
  await page.route(`https://api.github.com/repos/${repo}/releases/latest`, route => route.fulfill({ json: release() }));
  let installs = 0;
  await page.route('**/health-os-desktop', route => route.fulfill({ json:{app:'Health OS',canInstall:true,token:'test-token'} }));
  await page.route('**/health-os-desktop/install', async route => { expect(route.request().headers()['x-health-os-token']).toBe('test-token'); expect(route.request().postDataJSON()).toEqual({tag:'v0.1.1'}); installs++; await route.fulfill({json:{ok:true}}); });
  await page.goto('/'); const dialog = page.getByRole('dialog',{name:'Health OS v0.1.1 update available'}); await expect(dialog).toBeVisible({timeout:12000}); expect(installs).toBe(0);
  await dialog.getByRole('button',{name:'Download & install →'}).click(); await expect(dialog.getByRole('status')).toContainText('Choose your installation folder'); expect(installs).toBe(1);
});
test('Later defers this version and manual check can reopen it', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('health-os-welcome-version','0.1.0'));
  await page.route(`https://api.github.com/repos/${repo}/releases/latest`, route => route.fulfill({json:release()}));
  await page.goto('/'); const dialog = page.getByRole('dialog',{name:'Health OS v0.1.1 update available'}); await expect(dialog).toBeVisible({timeout:12000});
  await dialog.getByRole('button',{name:'Later',exact:true}).click(); await page.reload(); await page.waitForTimeout(4500); await expect(dialog).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('health-os-check-updates'))); await expect(dialog).toBeVisible();
});
test('same, lower, prerelease and untrusted assets never offer installation', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('health-os-welcome-version','0.1.0')); await page.goto('/');
  for (const candidate of [release('v0.1.0'),release('v0.0.9'),{...release(),prerelease:true},{...release(),draft:true},{...release(),assets:[{...release().assets[0],browser_download_url:'https://example.com/installer.exe'}]}]) {
    await page.route(`https://api.github.com/repos/${repo}/releases/latest`, route => route.fulfill({json:candidate}));
    await page.evaluate(() => window.dispatchEvent(new Event('health-os-check-updates'))); await page.waitForTimeout(300); await expect(page.getByRole('dialog')).not.toBeVisible();
  }
});
test('offline checks preserve the app and a manual check reports the failure', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('health-os-welcome-version','0.1.0'));
  await page.route(`https://api.github.com/repos/${repo}/releases/latest`, route => route.abort()); await page.goto('/');
  await page.evaluate(() => { (window as any).releaseStatus=''; window.addEventListener('health-os-update-status',e=>(window as any).releaseStatus=(e as CustomEvent).detail); window.dispatchEvent(new Event('health-os-check-updates')); });
  await expect.poll(() => page.evaluate(() => (window as any).releaseStatus)).not.toBe(''); await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('desktop and phone previews fit, trap focus, and export the actual dialogs', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000}); await page.goto('/?health-os-preview=welcome');
  let dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible(); await page.emulateMedia({reducedMotion:'reduce'});
  await dialog.screenshot({path:'outputs/release-v0.1.0/welcome-desktop.png'});
  await page.getByRole('tab',{name:/Pods/}).click(); await expect(page.getByRole('tabpanel')).toContainText('Share completions only when you choose');
  for(let i=0;i<7;i++)await page.keyboard.press('Tab'); expect(await page.evaluate(()=>document.querySelector('dialog')?.contains(document.activeElement))).toBe(true);
  await page.setViewportSize({width:390,height:844}); await page.goto('/?health-os-preview=welcome'); dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true); await dialog.screenshot({path:'outputs/release-v0.1.0/welcome-phone.png'});
  await page.setViewportSize({width:1440,height:1000}); await page.goto('/?health-os-preview=update'); dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible(); await dialog.screenshot({path:'outputs/release-v0.1.0/update-desktop.png'});
  await page.getByRole('button',{name:'Download & install →'}).click(); await expect(page.getByRole('status')).toContainText('This is a preview');
});
test('Android offers the APK and leaves installation approval to Android', async ({page}) => {
  await page.addInitScript(() => { localStorage.setItem('health-os-welcome-version','0.1.0'); (window as any).Capacitor={getPlatform:()=> 'android'}; });
  await page.route(`https://api.github.com/repos/${repo}/releases/latest`, route => route.fulfill({json:release('v0.1.1','android')}));
  await page.goto('/'); await expect(page.getByRole('button',{name:'Download Android update ↗'})).toBeVisible({timeout:12000});
  await expect(page.getByRole('dialog')).toContainText('Android controls installation approval');
});
