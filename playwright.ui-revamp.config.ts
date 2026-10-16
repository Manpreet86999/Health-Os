import {defineConfig} from '@playwright/test';
const android=process.env.HOS_QA_ANDROID==='1';
const external=process.env.HOS_QA_BASE;
const port=android?10148:10147;
const url=`http://127.0.0.1:${port}`;
export default defineConfig({
 outputDir:'./output/ui-revamp/'+(android?'android':'web'),
 testDir:'./tests/web',
 testMatch:android?['ui-revamp.spec.ts','simplification-android.spec.ts']:['ui-revamp.spec.ts','simplification.spec.ts'],
 workers:1,timeout:180000,
 use:{baseURL:external||url,headless:true,channel:'msedge',viewport:android?{width:393,height:852}:{width:1440,height:1000},screenshot:'only-on-failure'},
 webServer:external?undefined:{command:`node node_modules/vite/bin/vite.js --config vite.acceptance.config.ts --host 127.0.0.1 --port ${port} --strictPort`,url,reuseExistingServer:false,timeout:60000,env:{VITE_ANDROID_APP:android?'1':'0'}},
});
