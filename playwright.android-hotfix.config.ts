import {defineConfig} from '@playwright/test';
process.env.HEALTH_OS_TEST_APP_VERSION ||= '1.4';
export default defineConfig({
  testDir:'./tests/web',testMatch:'android-011.spec.ts',workers:1,timeout:60000,
  outputDir:'output/android-hotfix/tests',
  use:{baseURL:'http://127.0.0.1:10144',headless:true,channel:'msedge',viewport:{width:360,height:800},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node node_modules/vite/bin/vite.js preview --config vite.android-011.config.ts --host 127.0.0.1 --port 10144 --strictPort',url:'http://127.0.0.1:10144',reuseExistingServer:false,timeout:60000},
});
