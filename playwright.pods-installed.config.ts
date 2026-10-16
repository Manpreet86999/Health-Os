import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/web', testMatch: /(?:pods-workspace|today-pods|friend-pods-release)\.spec\.ts/, workers: 1, timeout: 60000,
  outputDir: './output/friend-pods/installed-browser', reporter: [['list'], ['json', { outputFile: './output/friend-pods/installed-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:10123', headless: true, channel: 'msedge', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node ../scripts/serve-web.mjs', env: { PORT: '10123' }, url: 'http://127.0.0.1:10123', timeout: 60000, reuseExistingServer: false },
});
