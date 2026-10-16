import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorkerSession, saveWorkerSession } from '../src/server/worker/credentials.js';
import { refreshSupabaseSession } from '../src/shared/supabase-auth.js';

// Uses the existing owner's credentials without displaying them. Never writes a health-source table.
let session=loadWorkerSession();
assert.equal(session.config.url,'https://lphlihwyrcqgmdiwlvuq.supabase.co');
if(Date.now()>=session.expiresAt){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const root=session.config.url,headers={apikey:session.config.publishableKey,Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'};
const marker=`preservation-check-${crypto.randomUUID()}`,results:{check:string;status:string}[]=[],fixtures:{id:string;embeddingHash?:string}[]=[];
const ledger='output/memory-preservation/live-validation.json';
const record=(check:string)=>{results.push({check,status:'PASS'});console.log(`PASS: ${check}`);};
const persist=async()=>{await mkdir('output/memory-preservation',{recursive:true});await writeFile(ledger,JSON.stringify({marker,results,fixtures,checkedAt:new Date().toISOString()},null,2));};
async function api(action:unknown,authenticated=true){
  const response=await fetch(`${root}/functions/v1/body-os-memory`,{method:'POST',headers:authenticated?headers:{apikey:session.config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(action),signal:AbortSignal.timeout(90000)});
  const body=await response.json().catch(()=>({}));return {status:response.status,body};
}
async function rest(path:string,method='GET',body?:unknown){
  const response=await fetch(`${root}/rest/v1/${path}`,{method,headers:{...headers,Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  return {status:response.status,body:await response.json().catch(()=>null)};
}
async function remember(domain:string,summary:string){
  const result=await api({action:'remember',summary,domain,sourceId:marker,confidence:1});
  assert.equal(result.status,200,`Remember failed (${result.status})`);assert.ok(result.body.id);
  const id=result.body.id;fixtures.push({id});await persist();
  const source=await rest(`health_memory_item?user_id=eq.${session.uid}&id=eq.${id}&select=id,summary,valid_to,source_id`);
  assert.equal(source.status,200);assert.equal(source.body.length,1);assert.equal(source.body[0].summary,summary);assert.equal(source.body[0].valid_to,null);
  const vector=await rest(`health_memory_embedding?user_id=eq.${session.uid}&memory_id=eq.${id}&select=embedding,invalidated_at`);
  assert.equal(vector.status,200);assert.equal(vector.body.length,1);assert.equal(vector.body[0].invalidated_at,null);
  fixtures.at(-1)!.embeddingHash=createHash('md5').update(vector.body[0].embedding).digest('hex');await persist();return id;
}
try {
  const anon=await api({action:'list'},false);assert.ok([401,403].includes(anon.status));record('deployed endpoint anonymous denial');
  const existing=await api({action:'list'});assert.equal(existing.status,200,`Owner authentication failed (${existing.status})`);
  assert.equal(existing.body.length,0,'Existing active memories detected; refuse owner-wide reset test.');
  const id=await remember('nutri','Preservation fixture prefers rice with lentils');record('deployed remember, source/vector read-after-write');
  const list=await api({action:'list'});assert.ok(list.body.some((m:{id:string})=>m.id===id));record('deployed owner list');
  const matches=await api({action:'retrieve',query:'Prefers rice with lentils',domain:'nutri'});assert.equal(matches.status,200);assert.ok(matches.body.some((m:{id:string})=>m.id===id));record('deployed embedding retrieval');
  const denied=await rest(`health_memory_item?user_id=eq.${session.uid}&id=eq.${id}`,'DELETE');assert.ok([401,403].includes(denied.status),`Client DELETE not denied (${denied.status})`);record('scoped authenticated HTTP DELETE denial');
  const forgotten=await api({action:'forget',id});assert.equal(forgotten.status,200);assert.equal(forgotten.body.permanent,false);assert.equal(forgotten.body.operation,'soft_expiration');assert.equal(forgotten.body.expired,1);
  const source=await rest(`health_memory_item?user_id=eq.${session.uid}&id=eq.${id}&select=id,summary,valid_to,source_id`);assert.equal(source.body.length,1);assert.ok(source.body[0].valid_to);assert.equal(source.body[0].summary,'Preservation fixture prefers rice with lentils');record('deployed forget retains source memory');
  const hidden=await api({action:'list'});assert.equal(hidden.body.some((m:{id:string})=>m.id===id),false);
  const excluded=await api({action:'retrieve',query:'Prefers rice with lentils',domain:'nutri'});assert.equal(excluded.status,200);assert.equal(excluded.body.some((m:{id:string})=>m.id===id),false);record('expired memory excluded from list and semantic retrieval');
  const id2=await remember('train','Preservation reset fixture likes morning walks');
  const active=await api({action:'list'});assert.equal(active.body.length,1);assert.equal(active.body[0].id,id2,'Non-fixture memory appeared; refuse reset.');
  const reset=await api({action:'reset'});assert.equal(reset.status,200);assert.equal(reset.body.expired,1);assert.equal(reset.body.permanent,false);
  const retained=await rest(`health_memory_item?user_id=eq.${session.uid}&id=eq.${id2}&select=id,summary,valid_to`);assert.equal(retained.body.length,1);assert.ok(retained.body[0].valid_to);assert.equal(retained.body[0].summary,'Preservation reset fixture likes morning walks');record('deployed reset retains source memory and soft-expires it');
  const permanent=await api({action:'permanent_delete',id:id2,confirmed:true});assert.equal(permanent.status,409);assert.equal(permanent.body.code,'permanent_deletion_not_enabled');record('permanent erasure explicitly distinct and disabled in preservation-only scope');
  await persist();
}catch(error){results.push({check:error instanceof Error?error.message:'Validation failed',status:'FAIL'});await persist();throw error;}
// Fixtures are retained, soft-expired. No physical cleanup or source-health mutation is performed.
