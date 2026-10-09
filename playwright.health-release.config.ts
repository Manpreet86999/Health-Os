import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/release', workers: 1, timeout: 45000,
  outputDir: './outputs/release-v0.1.0/browser-results',
  reporter: [['list'], ['json', { outputFile: './outputs/release-v0.1.0/release-tests.json' }]],
  use: { baseURL: 'http://127.0.0.1:10108', channel: 'msedge', headless: true, serviceWorkers: 'block', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-web.mjs', env: { PORT: '10108' }, url: 'http://127.0.0.1:10108', reuseExistingServer: false, timeout: 30000 },
});
