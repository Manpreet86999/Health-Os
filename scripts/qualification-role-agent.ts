import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
/** Isolated benchmark binding: production agent/prompts/schema are bundled unchanged.
 * Only the model-stack dependency binds GLM to planner/complex_reasoner for measurement.
 * This module is never deployed and changes no production qualification policy.
 */
export async function loadRoleEvaluationAgent(){
 const original=path.resolve('supabase/functions/body-os-ai/model-stack.ts');
 const result=await build({entryPoints:['supabase/functions/body-os-ai/agent.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',plugins:[{name:'qualification-role-bindings',setup(b){
  b.onResolve({filter:/^\.\/model-stack\.ts$/},()=>({path:'role-bindings',namespace:'qualification'}));
  b.onLoad({filter:/.*/,namespace:'qualification'},()=>({loader:'ts',resolveDir:process.cwd(),contents:`import {productionModelStack as original} from ${JSON.stringify(original.replaceAll('\\','/'))}; export async function productionModelStack(){const roles=await original();if(!roles.fallback)throw new Error('GLM production endpoints unavailable');return {...roles,planner:{...roles.fallback},complex_reasoner:{...roles.fallback},general_reasoner:{...roles.fallback}};}`}));
 }}]});
 const bytes=result.outputFiles[0].contents,hash=createHash('sha256').update(bytes).digest('hex');
 const dir='output/role-qualification-20261015';await mkdir(dir,{recursive:true});const file=path.resolve(dir,'agent-'+hash+'-'+process.pid+'.mjs');await writeFile(file,bytes);
 const loaded=await import(pathToFileURL(file).href);if(typeof loaded.agentStep!=='function')throw new Error('Role agent binding did not load; no provider request is authorized.');return {agentStep:loaded.agentStep,hash};
}
