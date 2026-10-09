import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { getDb, closeDb } from './db/connection.js';
import { migrate } from './db/migrate.js';
import * as repo from './db/repository.js';

test('Care API saves setup, validates proposals, and records plan history', async () => {
  migrate(getDb());
  const server=createApp().listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address(); if(!address || typeof address==='string') throw new Error('No test port');
  const base=`http://127.0.0.1:${address.port}/api`;
  const post=async(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    const initial=(await (await fetch(base+'/skin')).json()).care;
    const setup=await post('/skin/care',{...initial,onboardingComplete:true,goals:[{id:'goal',area:'face',concern:'dryness',desiredChange:'less tightness',baseline:'tight in afternoon',reviewDate:'2026-10-01',status:'active'}]});
    assert.equal(setup.status,200);
    const savedSetup=await setup.json();
    const secondSave=await post('/skin/care',{...savedSetup,commitment:{...savedSetup.commitment,minutesPerDay:8}});
    assert.equal(secondSave.status,200);
    assert.equal(repo.getCareData().commitment.minutesPerDay,8);
    assert.equal((await (await fetch(base+'/skin')).json()).care.goals[0].concern,'dryness');
    const stale=await post('/skin/care',{...initial,tasks:[],goals:[],events:[],checkIns:[]});
    assert.equal(stale.status,409);
    const proposal=await post('/skin/proposal/validate',{reason:'Simple care',tasks:[{label:'Moisturize',area:'face',productId:'',days:[],time:'evening',minutes:2,notes:''}]});
    assert.equal(proposal.status,200);
    const candidate=await proposal.json();
    const applied=await post('/skin/proposal/apply',candidate);
    assert.equal(applied.status,200);
    assert.equal(repo.getCareData().tasks[0].label,'Moisturize');
    const baseHistory = initial.planHistory?.length || 0;
    assert.equal(repo.getCareData().planHistory.length, baseHistory + 1);
    assert.equal((await post('/skin/proposal/apply',candidate)).status,409);
    const photo=await post('/skin/photos',{id:'local-photo',date:'2026-09-23',area:'face',dataUrl:'data:image/jpeg;base64,AA==',note:'same lighting',createdAt:new Date().toISOString()});
    assert.equal(photo.status,200);
    assert.equal((await (await fetch(base+'/skin/photos')).json()).length,1);
    assert.equal(JSON.stringify(await (await fetch(base+'/backup')).json()).includes('local-photo'),false);
    assert.equal((await post('/skin/photos/observe',{id:'local-photo',consent:false})).status,400);
    assert.equal((await post('/skin/products/read-label',{dataUrl:'data:image/jpeg;base64,AA==',consent:false})).status,400);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));closeDb();}
});
