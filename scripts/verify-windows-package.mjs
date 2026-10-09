import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {builtinModules} from 'node:module';
const folder=path.resolve(process.argv[2] || 'installer/stage');
for(const name of ['start.bat','requirement.txt','requirements.txt','Health Os.vbs','runtime/node.exe','runtime/LICENSE.txt','scripts/launch-health-os.mjs','scripts/serve-web.mjs','scripts/desktop-updater.mjs','dist/client/index.html','dist/client/release-config.js','dist/client/health-os-release.js','dist/client/health-os-release.css'])await fs.access(path.join(folder,name));
const pkg=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));
if(pkg.type!=='module'||!/^\d+\.\d+\.\d+$/.test(pkg.version)||pkg.dependencies)throw Error('Unexpected runtime package metadata.');
for(const name of ['node_modules','src','tooling']){try{await fs.access(path.join(folder,name));throw Error('Unexpected developer files: '+name);}catch(e){if(e.code!=='ENOENT')throw e;}}
const builtins=new Set(builtinModules.map(m=>m.replace(/^node:/,'')));
for(const file of ['scripts/launch-health-os.mjs','scripts/serve-web.mjs','scripts/desktop-updater.mjs']){
 const text=await fs.readFile(path.join(folder,file),'utf8');
 for(const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)){
  const specifier=match[1];if(specifier.startsWith('.'))await fs.access(path.resolve(folder,path.dirname(file),specifier));
  else if(!builtins.has(specifier.replace(/^node:/,'')))throw Error('Unbundled dependency: '+specifier);
 }
}
const systemRoot=process.env.SystemRoot || 'C:/Windows';
const result=spawnSync(path.join(folder,'runtime/node.exe'),['--version'],{env:{...process.env,PATH:path.join(systemRoot,'System32')},encoding:'utf8',windowsHide:true});
if(result.status!==0||Number(result.stdout.trim().slice(1).split('.')[0])<24)throw Error('Bundled runtime failed with restricted PATH.');
const bat=await fs.readFile(path.join(folder,'start.bat'),'utf8');
if(!bat.includes('cd /d "%~dp0"')||!bat.includes('runtime\\node.exe')||!bat.includes('scripts\\launch-health-os.mjs')||bat.includes('stop.bat'))throw Error('Invalid launcher contract.');
const runtime=crypto.createHash('sha256').update(await fs.readFile(path.join(folder,'runtime/node.exe'))).digest('hex');
console.log(JSON.stringify({folder,version:pkg.version,bundledNode:result.stdout.trim(),runtimeSha256:runtime,launcherIncluded:true,requirementsIncluded:true,externalNodeOrPythonRequired:false,builtinServerImports:true}));
