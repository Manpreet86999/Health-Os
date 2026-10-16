import { defineConfig } from '@playwright/test';
import base from './playwright.loading.config';
export default defineConfig({ ...base, webServer: undefined, testMatch: ['page-loading.spec.ts', 'settings-workspace.spec.ts', 'cloud.spec.ts'],
  outputDir: 'output/loading-installed-results', use: { ...base.use, baseURL: 'http://localhost:10000' },
});
