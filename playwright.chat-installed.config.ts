import {defineConfig} from '@playwright/test';
import base from './playwright.web.config';
export default defineConfig({...base,webServer:undefined,outputDir:'output/chat-installed-validation',expect:{timeout:10000},testMatch:['intelligence.spec.ts','intelligence-foundation.spec.ts','intelligence-chat.spec.ts'],use:{...base.use,baseURL:'http://localhost:10000'}});
