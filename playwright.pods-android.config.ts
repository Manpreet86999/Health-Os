import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/web', testMatch: /(?:today-pods|friend-pods-release)\.spec\.ts/, workers: 1, timeout: 60000,
  outputDir: './output/friend-pods/android-browser', reporter: [['list'], ['json', { outputFile: './output/friend-pods/android-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:10121', viewport: { width: 360, height: 800 }, headless: true, channel: 'msedge', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port 10121 --strictPort', env: { VITE_ANDROID_APP: '1' }, url: 'http://127.0.0.1:10121', timeout: 60000, reuseExistingServer: false },
});
