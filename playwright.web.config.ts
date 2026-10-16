import { defineConfig } from '@playwright/test';
export default defineConfig({outputDir:'./output/simplification/web-results',
  testDir: './tests/web', workers: 1, timeout: 60000,
  // Retained product, persistence and MCP regression suite.
  testMatch: ['simplification.spec.ts','mcp.spec.ts','session-persistence.spec.ts','completed-workout-sync.spec.ts','exercise-integrations.spec.ts','settings-workspace.spec.ts','page-loading.spec.ts','workspace-cache.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:10118', headless: true, channel: 'msedge', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port 10118 --strictPort', url: 'http://127.0.0.1:10118', reuseExistingServer: false, timeout: 60000 },
});
