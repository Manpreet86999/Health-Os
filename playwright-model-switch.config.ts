import {defineConfig} from '@playwright/test';
import base from './playwright.chat-installed.config';
export default defineConfig({...base,outputDir:'output/model-switch-browser',use:{...base.use,baseURL:'http://localhost:10001'},testMatch:['intelligence.spec.ts','intelligence-foundation.spec.ts','intelligence-chat.spec.ts','intelligence-orchestrator.spec.ts','intelligence-review-ui.spec.ts']});
