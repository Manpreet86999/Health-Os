import {defineConfig} from '@playwright/test';
import base from './playwright.web.config';
export default defineConfig({...base,outputDir:'output/foundation-validation',expect:{timeout:10000},testMatch:['intelligence.spec.ts','intelligence-foundation.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:10122'},webServer:{command:'node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port 10122 --strictPort',url:'http://127.0.0.1:10122',reuseExistingServer:false,timeout:60000}});
