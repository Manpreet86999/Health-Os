import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './apps/health-os-mobile/tests', workers: 1, timeout: 60000,
  outputDir: './outputs/apk-refinement/browser-results',
  reporter: [['list'], ['json', { outputFile: './outputs/apk-refinement/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:10106', channel: 'msedge', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node apps/health-os-mobile/scripts/serve.mjs', url: 'http://127.0.0.1:10106', reuseExistingServer: false, timeout: 30000 },
    { command: 'node apps/health-os-mobile/scripts/serve.mjs', env: { HEALTH_OS_REFERENCE:'1', PORT:'10107' }, url: 'http://127.0.0.1:10107', reuseExistingServer: false, timeout: 30000 },
  ],
});
