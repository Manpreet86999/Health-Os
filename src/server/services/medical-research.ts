import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from '../config.js';

const researchRoot=path.join(ROOT,'tooling','medical-research');
let workbenchRunning=false;
export async function runMedicalResearch(operation:'status'|'statistics'|'change-points'|'isolation'|'workbench',input:unknown={}){
  const python=process.env.BODY_OS_MEDICAL_PYTHON||path.join(researchRoot,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  if(!fs.existsSync(python))return {available:false,message:'Install the isolated medical research environment documented in docs/MEDICAL_INTELLIGENCE.md.'};
  if(operation==='workbench'&&workbenchRunning)throw new Error('A research workflow is already running. Wait for it to finish.');
  if(operation==='workbench')workbenchRunning=true;
  return new Promise<Record<string,unknown>>((resolve,reject)=>{
    const child=spawn(python,[path.join(researchRoot,'engine.py'),operation],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2',MKL_NUM_THREADS:'2',NUMBA_NUM_THREADS:'2'}});
    const finish=()=>{if(operation==='workbench')workbenchRunning=false;};
    let output='',errors='';const timer=setTimeout(()=>child.kill(),operation==='workbench'?120000:30000);timer.unref();
    child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>(operation==='workbench'?8_000_000:1_000_000))child.kill();});child.stderr.on('data',chunk=>{errors+=chunk.toString();if(errors.length>100000)child.kill();});
    child.once('error',e=>{clearTimeout(timer);finish();reject(e);});child.once('close',()=>{clearTimeout(timer);finish();try{resolve(JSON.parse(output.trim()));}catch{reject(new Error('Research runtime failed or exceeded its time/output limit. Check the isolated Python environment.'));}});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
  });
}
