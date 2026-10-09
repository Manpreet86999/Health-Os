import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import type { SupabaseAccountSession } from '../../shared/supabase-auth.js';

export const workerHome=path.join(homedir(),'.health-os-worker');
const credentialFile=path.join(workerHome,'session');
function dpapi(input:string,protect:boolean):string {
  const script=`Add-Type -AssemblyName System.Security; $value=[Console]::In.ReadToEnd(); $bytes=[Convert]::FromBase64String($value); $result=[Security.Cryptography.ProtectedData]::${protect?'Protect':'Unprotect'}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input,encoding:'utf8',windowsHide:true,timeout:15000});
  if(result.status!==0)throw new Error('Windows could not protect/unlock the worker session.');
  return result.stdout.trim();
}
export function saveWorkerSession(session:SupabaseAccountSession){
  mkdirSync(workerHome,{recursive:true,mode:0o700});
  if(process.platform!=='win32')chmodSync(workerHome,0o700);
  const value=JSON.stringify(session);
  const pending=`${credentialFile}.${process.pid}.tmp`;
  writeFileSync(pending,process.platform==='win32'?dpapi(Buffer.from(value).toString('base64'),true):value,{mode:0o600});
  if(process.platform!=='win32')chmodSync(pending,0o600);
  renameSync(pending,credentialFile);
}
export function loadWorkerSession():SupabaseAccountSession{
  let value:string;
  try{value=readFileSync(credentialFile,'utf8');}catch{throw new Error('Run npm run worker:login first.');}
  return JSON.parse(process.platform==='win32'?Buffer.from(dpapi(value,false),'base64').toString('utf8'):value);
}
