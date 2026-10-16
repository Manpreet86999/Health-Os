import {defineConfig} from '@playwright/test';
import base from './playwright.web.config';
export default defineConfig({...base,testMatch:['intelligence-android-ui.spec.ts'],outputDir:'output/final-integration/android-browser',reporter:[['line'],['json',{outputFile:'output/final-integration/android-browser-results.json'}]],use:{...base.use,baseURL:'http://127.0.0.1:10002',viewport:{width:390,height:844}},webServer:{command:'node scripts/serve-android-preview.mjs',url:'http://127.0.0.1:10002',reuseExistingServer:true,timeout:30000}});
