import {build} from 'esbuild';
await build({entryPoints:['supabase/functions/body-os-ai/index.ts'],outfile:'output/agent-function/index.js',bundle:true,platform:'neutral',format:'esm',target:'es2022',minify:true});
await build({entryPoints:['supabase/functions/health-os-intelligence-worker/index.ts'],outfile:'output/intelligence-worker-function/index.js',bundle:true,platform:'neutral',format:'esm',target:'es2022',minify:true});
