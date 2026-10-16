import { defineConfig } from '@playwright/test';
import base from './playwright.web.config';
export default defineConfig({ ...base, webServer: undefined, outputDir: 'output/settings-installed-results', expect: { timeout: 10000 }, testMatch: ['settings-workspace.spec.ts', 'mcp.spec.ts'], use: { ...base.use, baseURL: 'http://localhost:10000', serviceWorkers: 'block' } });
