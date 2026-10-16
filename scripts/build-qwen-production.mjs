import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const root='output/qwen-production-deploy/supabase';
const names=['body-os-ai','health-os-intelligence-worker','body-os-food','body-os-email','body-os-email-scheduler'];
await mkdir(root,{recursive:true});
for(const name of names)await build({entryPoints:[`supabase/functions/${name}/index.ts`],outfile:`${root}/functions/${name}/index.js`,bundle:true,platform:'neutral',format:'esm',target:'es2022',minify:true,alias:{nodemailer:'npm:nodemailer@6.10.1'},external:['npm:*','node:*']});
await writeFile(`${root}/config.toml`,'project_id = "health-os"\n'+names.map(name=>`[functions.${name}]\nverify_jwt = false\nentrypoint = "./functions/${name}/index.js"\n`).join('\n'));
console.log('Built five production model callers with existing custom authentication.');
