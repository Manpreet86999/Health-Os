import {defineConfig} from '@playwright/test';
import base from './playwright.foundation.config';
export default defineConfig({...base,outputDir:'output/foundation-installed-validation',webServer:undefined,use:{...base.use,baseURL:'http://localhost:10000'}});
