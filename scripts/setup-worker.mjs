import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve('tooling/medical-research');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);}
if(!existsSync(python))run(process.env.HEALTH_OS_PYTHON||'python',['-m','venv',path.join(root,'.venv')]);
const version=spawnSync(python,['-c','import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],{encoding:'utf8',windowsHide:true});
const requirements=process.platform==='win32'&&version.stdout?.trim()==='3.13'?'requirements-lock-windows-py313.txt':'requirements.txt';
run(python,['-m','pip','install','-r',path.join(root,requirements)]);
console.log('Research dependencies installed. Run npm run worker:verify, then npm run worker:login.');
