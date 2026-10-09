import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
// Keep this API fixture's provider settings separate from every other test file.
mkdirSync(path.resolve('scratch'),{recursive:true});
const fixtureRoot=mkdtempSync(path.resolve('scratch/ai-api-'));
process.env.BODY_OS_DATA_DIR=path.join(fixtureRoot,'data');
process.env.BODY_OS_BACKUP_DIR=path.join(fixtureRoot,'backups');
const {createApp}=await import('./app.js');
const {getDb}=await import('./db/connection.js');
const {migrate}=await import('./db/migrate.js');
const repo=await import('./db/repository.js');

test('Care, training and biological AI APIs recover blank replies and preserve useful failures',async()=>{
  migrate(getDb());
  const previous=repo.getSettings();repo.saveSettings({aiProvider:'openrouter',aiModel:'openrouter/free',aiApiKey:'fixture-api-key'});
  const app=createApp(),server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const root=`http://127.0.0.1:${(server.address() as {port:number}).port}`,original=globalThis.fetch;
  let calls=0,mode:'care'|'training'|'limit'='care';
  globalThis.fetch=async(input,init)=>{
    if(!String(input).includes('/chat/completions'))return original(input,init);
    calls++;
    if(mode==='limit')return Response.json({choices:[{finish_reason:'length',message:{content:null,reasoning:'internal'}}]});
    return Response.json({model:'working-model:free',choices:[{finish_reason:'stop',message:{content:calls===1?null:mode==='care'?JSON.stringify({answer:'Tell me your goals and the products you own.',proposal:null}):'A workout log records exercises, sets and reps.'}}]});
  };
  const post=(path:string,body:unknown)=>original(root+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    let response=await post('/api/ai/skin',{question:'Build a care plan',history:[]}),body=await response.json();
    assert.equal(response.status,200);assert.equal(calls,2);assert.equal(body.answer,'Tell me your goals and the products you own.');assert.equal(body.model,'working-model:free');
    mode='training';calls=0;response=await post('/api/ai/ask',{question:'What can a workout log record?'});body=await response.json();
    assert.equal(response.status,200);assert.equal(body.ok,true);assert.match(body.answer,/sets and reps/);assert.equal(calls,2);
    mode='limit';calls=0;response=await post('/api/biology/coach',{consent:true,question:'Explain these empty logs.',evidence:{records:[]}});body=await response.json();
    assert.equal(response.status,502);assert.match(body.error,/token output limit/);assert.notEqual(body.error,'Request failed');assert.equal(calls,5);assert.doesNotMatch(body.error,/fixture-api-key|internal/);
  }finally{globalThis.fetch=original;repo.saveSettings(previous);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
