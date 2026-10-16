import {defineConfig} from '@playwright/test';
import base from './playwright.web.config';
export default defineConfig({...base,testMatch:'mcp.spec.ts',workers:1,use:{...base.use,serviceWorkers:'block',baseURL:'http://127.0.0.1:10105'},webServer:{command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 10105 --strictPort',url:'http://127.0.0.1:10105',reuseExistingServer:false,timeout:60000}});
