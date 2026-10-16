import {defineConfig} from '@playwright/test';
export default defineConfig({outputDir:'./output/simplification/focused-results',testDir:'./tests/web',testMatch:'simplification.spec.ts',workers:1,timeout:120000,use:{baseURL:'http://127.0.0.1:10117',headless:true,channel:'msedge',screenshot:'only-on-failure',trace:'retain-on-failure'},webServer:{command:'node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port 10117 --strictPort',url:'http://127.0.0.1:10117',reuseExistingServer:false,timeout:60000}});

