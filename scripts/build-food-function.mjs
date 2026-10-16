import { build } from 'esbuild';
await build({entryPoints:['supabase/functions/body-os-food/index.ts'],outfile:'output/food-function/index.js',bundle:true,platform:'neutral',format:'esm',target:'es2022',minify:true});
