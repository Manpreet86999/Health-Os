import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/web', testMatch: /(?:pods-workspace|today-pods|friend-pods-release)\.spec\.ts/, workers: 1, timeout: 60000,
  outputDir: './output/friend-pods/browser', reporter: [['list'], ['json', { outputFile: './output/friend-pods/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:10119', headless: true, channel: 'msedge', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port 10119 --strictPort', url: 'http://127.0.0.1:10119', timeout: 60000, reuseExistingServer: false },
});
