import { defineConfig } from '@playwright/test';
import base from './playwright.web.config';
export default defineConfig({ ...base, testMatch: ['page-loading.spec.ts', 'cloud.spec.ts', 'settings-workspace.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:10108', serviceWorkers: 'block' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port 10108 --strictPort', url: 'http://127.0.0.1:10108', reuseExistingServer: false, timeout: 60000 },
});
