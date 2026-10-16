import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';

// Read-only owner snapshot. Persist hashes/counts only, never record payloads or credentials.
let session=loadWorkerSession();
if(session.expiresAt<Date.now()+60000){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const rows:any[]=[];let complete=false;
for(let page=0;page<100;page++){
 const query=new URLSearchParams({user_id:'eq.'+session.uid,entity_type:'neq.sharedPreferences',select:'entity_type,record_id,payload,revision,deleted_at',order:'entity_type.asc,record_id.asc',limit:'1000',offset:String(page*1000)});
 const response=await fetch(session.config.url+'/rest/v1/body_os_records?'+query,{headers:{apikey:session.config.publishableKey,Authorization:'Bearer '+session.accessToken},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Owner preservation read failed ('+response.status+').');
 const batch=await response.json();assert.ok(Array.isArray(batch),'Incomplete owner preservation response');rows.push(...batch);
 if(batch.length<1000){complete=true;break;}
}
assert.ok(complete,'Owner preservation snapshot exceeded its bounded page limit.');
const counts:Record<string,{active:number;deleted:number}>={};
for(const row of rows){assert.equal(typeof row.entity_type,'string');assert.equal(typeof row.record_id,'string');counts[row.entity_type]??={active:0,deleted:0};counts[row.entity_type][row.deleted_at?'deleted':'active']++;}
const projectOwnerHash=createHash('sha256').update(session.config.url+'|'+session.uid).digest('hex');
const recordHash=createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex');
const snapshot={asOf:new Date().toISOString(),readOnly:true,credentialConfigurationExcluded:true,rawPayloadsPersisted:false,projectOwnerHash,recordHash,rows:rows.length,counts};
if(process.argv[2]){
 const baseline=JSON.parse(await readFile(path.resolve(process.argv[2]),'utf8'));assert.equal(baseline.projectOwnerHash,projectOwnerHash,'Preservation baseline belongs to another owner or project');assert.equal(baseline.recordHash,recordHash,'Owner records changed since the preservation baseline; inspect intentional changes before rollout.');
 console.log(JSON.stringify({ownerRecordsUnchanged:true,rows:rows.length,rawPayloadsPersisted:false}));
}else{
 const output=path.resolve('output/intelligence-upgrade-evidence/owner-record-preservation-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(snapshot,null,2));console.log(JSON.stringify({baseline:output,rows:rows.length,readOnly:true,rawPayloadsPersisted:false,note:'This establishes a before-rollout baseline; it does not prove preservation before its timestamp.'}));
}
