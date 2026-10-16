// Read only OAuth grant scope metadata. Never emit token material or encrypted account props.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
const run=promisify(execFile),cli=resolve('node_modules/wrangler/bin/wrangler.js');
async function json(args){const {stdout}=await run(process.execPath,[cli,...args,'-c','wrangler.mcp.jsonc','--remote'],{maxBuffer:4*1024*1024});return JSON.parse(stdout);}
const keys=await json(['kv','key','list','--binding','OAUTH_KV','--prefix','grant:']);
const summaries=[];
for(const key of keys){const grant=await json(['kv','key','get',key.name,'--binding','OAUTH_KV']);summaries.push({clientName:grant.metadata?.clientName,createdAt:grant.createdAt,scope:grant.scope});}
console.log(JSON.stringify(summaries,null,2));
