import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const root=path.resolve('tooling/medical-research'),python=process.env.BODY_OS_MEDICAL_PYTHON||path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
// Verification uses synthetic fixtures in a temporary directory, never a user's health history.
const env={...process.env,HEALTH_OS_RESEARCH_RUN_DIR:mkdtempSync(path.join(tmpdir(),'health-os-verify-')),PYTHONUTF8:'1',OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2',MKL_NUM_THREADS:'2'};
for(const args of [[path.join(root,'verify_runtime.py')],['-m','unittest','discover','-s',root,'-p','test_*.py']]){
  const result=spawnSync(python,args,{stdio:'inherit',windowsHide:true,env,timeout:600000});if(result.status!==0)process.exit(result.status||1);
}
console.log('Scientific imports, synthetic models and research workflow tests passed. This does not establish clinical accuracy.');
