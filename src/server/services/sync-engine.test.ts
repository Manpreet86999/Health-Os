import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { syncKey,type SyncOperation } from '../../shared/sync.js';
import { contentToken,type CloudRecord } from '../../shared/cloud.js';

test('desktop v2 sync uses cursors, preserves conflicts, and retries operations idempotently',async()=>{
  assert.ok(process.env.BODY_OS_DATA_DIR?.includes('scratch'));
  process.env.BODY_OS_DATA_DIR=path.join(process.env.BODY_OS_DATA_DIR!,'sync-v2-test');
  const {getDb,closeDb}=await import('../db/connection.js'),{migrate}=await import('../db/migrate.js'),repo=await import('../db/repository.js'),{runDesktopSync}=await import('./sync-engine.js');
  migrate(getDb());repo.saveMeasurement({id:'sync-weight',date:'2026-09-07',weight:80,createdAt:'2026-09-07'});
  const remote=new Map<string,CloudRecord>(),seen=new Map<string,number>();let version=0,writes=0;
  const old=globalThis.fetch;
  globalThis.fetch=async(input,options)=>{
    const url=String(input);
    if(url.includes('body_os_pull_delta')){
      const body=JSON.parse(String(options?.body||'{}')),after=Number(body.after_version||0);
      const records=[...remote.values()].filter(item=>(item.changeVersion||0)>after).sort((a,b)=>(a.changeVersion||0)-(b.changeVersion||0));
      return new Response(JSON.stringify({protocolVersion:2,records,cursor:records.at(-1)?.changeVersion||after,hasMore:false}));
    }
    if(url.includes('body_os_push_batch')){
      const operations=JSON.parse(String(options?.body||'{}')).operations as SyncOperation[],acknowledgements=[];
      for(const operation of operations){const prior=seen.get(operation.operationId),key=syncKey(operation.record),existing=remote.get(key);if(prior){acknowledgements.push({operationId:operation.operationId,status:'duplicate',changeVersion:prior});continue;}if(existing&&operation.expectedChangeVersion!==existing.changeVersion){acknowledgements.push({operationId:operation.operationId,status:'conflict',changeVersion:existing.changeVersion,record:existing});continue;}writes++;version++;seen.set(operation.operationId,version);remote.set(key,{...operation.record,changeVersion:version,cloudVersion:String(version)});acknowledgements.push({operationId:operation.operationId,status:'applied',changeVersion:version});}
      return new Response(JSON.stringify({protocolVersion:2,acknowledgements}));
    }
    throw new Error(`Unexpected sync URL: ${url}`);
  };
  try{
    const config={url:'https://body-os-test.supabase.co',publishableKey:'public'},session={uid:'test',accessToken:'test'},key='measurement:sync-weight';
    const first=await runDesktopSync(config,session,'desktop');assert.ok(first.uploaded>0);assert.equal((remote.get(key)?.payload as {weight:number}).weight,80);
    version++;remote.set(key,{...remote.get(key)!,payload:{...remote.get(key)!.payload as object,weight:81},changeVersion:version,cloudVersion:String(version)});
    const download=await runDesktopSync(config,session,'desktop');assert.equal(download.downloaded,1);assert.equal(repo.listMeasurements().find(item=>item.id==='sync-weight')?.weight,81);
    repo.saveMeasurement({...repo.listMeasurements().find(item=>item.id==='sync-weight')!,weight:82});
    version++;remote.set(key,{...remote.get(key)!,payload:{...remote.get(key)!.payload as object,weight:83},changeVersion:version,cloudVersion:String(version)});
    const conflict=await runDesktopSync(config,session,'desktop');assert.equal(conflict.conflicts.length,1);assert.equal(repo.listMeasurements().find(item=>item.id==='sync-weight')?.weight,82);
    const picked=conflict.conflicts[0];await runDesktopSync(config,session,'desktop',{[key]:{side:'local',cloudVersion:String(picked.remote.changeVersion),localToken:contentToken(picked.local)}});
    assert.equal((remote.get(key)?.payload as {weight:number}).weight,82);
    repo.deleteMeasurement('sync-weight');await runDesktopSync(config,session,'desktop');assert.ok(remote.get(key)?.deletedAt);
    const before=writes;await runDesktopSync(config,session,'desktop');assert.equal(writes,before);
  }finally{globalThis.fetch=old;closeDb();}
});
