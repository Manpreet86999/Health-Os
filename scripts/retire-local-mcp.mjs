// One-time migration. Retains rollback files and the old broker's receipt history.
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,renameSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const root=resolve(import.meta.dirname,'..'),installed=resolve(root,'..'),archive=resolve(root,'output/retired-local-mcp');
mkdirSync(archive,{recursive:true});
function move(base,file){const from=resolve(base,file),to=resolve(archive,base===root?'source':'installed',file);if(relative(base,from).startsWith('..')||relative(archive,to).startsWith('..'))throw Error('Unsafe path');if(!existsSync(from))return;mkdirSync(dirname(to),{recursive:true});if(existsSync(to))throw Error('Backup already exists: '+file);renameSync(from,to);}
const legacyTest=resolve(root,'src/server/mcp.test.ts');
if(existsSync(legacyTest)){
 const original=readFileSync(legacyTest,'utf8');
 if(original.includes("test('local HTTP rejects")){
  copyFileSync(legacyTest,resolve(archive,'legacy-mcp.test.ts'));
  const normalized=original.replace(/\r\n/g,'\n');
  const modern=normalized.slice(0,normalized.indexOf("test('local HTTP rejects"))
   .replace("import { request as nodeRequest } from 'node:http';\n",'')
   .replace("import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';\n",'')
   .replace("import { createMcpApp } from './mcp/http.js';\n",'');
  writeFileSync(legacyTest,modern);
 }
}
for(const file of ['src/server/mcp/http.ts','src/server/mcp/stdio.ts','src/server/worker/mcp.ts','scripts/start-chatgpt-tunnel.ps1'])move(root,file);
for(const file of ['start-health-os-mcp.bat','start-health-os-chatgpt.bat','tunnel-client'])move(installed,file);
const metadata=resolve(root,'runtime/mcp/metadata.sqlite');
if(existsSync(metadata)){const db=new DatabaseSync(metadata);try{db.exec("UPDATE clients SET enabled=0; UPDATE controls SET enabled=0,write_enabled=0; UPDATE requests SET status='cancelled' WHERE status IN ('pending','queued','running');");}finally{db.close();}}
const packagePath=resolve(root,'package.json'),pkg=JSON.parse(readFileSync(packagePath,'utf8'));
for(const name of ['mcp:http','mcp:stdio','worker:mcp'])delete pkg.scripts[name];
Object.assign(pkg.scripts,{'mcp:dev':'wrangler dev -c wrangler.mcp.jsonc','mcp:deploy':'wrangler deploy -c wrangler.mcp.jsonc','mcp:check':'tsc -p tsconfig.hosted.json','mcp:bundle':'wrangler deploy -c wrangler.mcp.jsonc --dry-run --outdir output/hosted-mcp-build','test:mcp':'npm run mcp:bundle && node --import tsx --test src/hosted/mcp/hosted.test.ts src/server/mcp.test.ts src/shared/health-action-registry.test.ts'});
writeFileSync(packagePath,JSON.stringify(pkg,null,2)+'\n');
console.log('Retired local MCP launchers and transports. Broker metadata and domain receipts retained.');
