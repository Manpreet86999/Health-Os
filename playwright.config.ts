import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/e2e',workers:1,timeout:45000,
  globalTeardown:'./scripts/e2e-stop.ts',
  use:{baseURL:'http://127.0.0.1:10091',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})},
  webServer:{command:'node --import tsx scripts/e2e-server.ts',url:'http://127.0.0.1:10091/api/health',reuseExistingServer:false,timeout:60000},
});
