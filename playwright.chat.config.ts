import {defineConfig} from '@playwright/test';
import base from './playwright.web.config';
export default defineConfig({...base,outputDir:'output/chat-validation',expect:{timeout:10000},testMatch:['intelligence.spec.ts','intelligence-foundation.spec.ts','intelligence-chat.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:10132'},webServer:{command:'node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port 10132 --strictPort',url:'http://127.0.0.1:10132',reuseExistingServer:false,timeout:60000}});
