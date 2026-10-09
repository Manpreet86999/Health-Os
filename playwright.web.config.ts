import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/web', workers: 1, timeout: 60000,
  // Run heavyweight audits and production measurements with their own servers.
  testIgnore: /ux-(?:accessibility|performance)\.spec\.ts/,
  use: { baseURL: 'http://127.0.0.1:10092', headless: true, channel: 'msedge', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port 10092 --strictPort', url: 'http://127.0.0.1:10092', reuseExistingServer: false, timeout: 60000 },
});
