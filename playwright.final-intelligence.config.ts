import {defineConfig} from '@playwright/test';
import base from './playwright.web.config';
// Network fixtures must control config and authorization responses after reload.
// Match the existing MCP acceptance config: service-worker fetches bypass page routes.
export default defineConfig({...base,testMatch:['intelligence.spec.ts','intelligence-foundation.spec.ts','intelligence-chat.spec.ts','intelligence-review-ui.spec.ts','intelligence-orchestrator.spec.ts','intelligence-release.spec.ts','mcp.spec.ts'],outputDir:'output/final-integration/production-browser',reporter:[['line'],['json',{outputFile:'output/final-integration/production-browser-results.json'}]],use:{...base.use,serviceWorkers:'block',baseURL:'http://127.0.0.1:10174'},webServer:{command:'node scripts/serve-web.mjs',env:{PORT:'10174'},url:'http://127.0.0.1:10174',reuseExistingServer:false,timeout:60000}});
