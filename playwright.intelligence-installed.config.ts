import {defineConfig} from '@playwright/test';
import base from './playwright.intelligence.config';
export default defineConfig({...base,webServer:undefined,use:{...base.use,baseURL:'http://localhost:10000'}});
