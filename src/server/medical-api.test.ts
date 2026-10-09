import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';
import { getDb } from './db/connection.js';
import { saveSettings } from './db/repository.js';
import type { MedicalReport } from '../shared/medical.js';
test('medical API enforces review, revision, consent and valid calculator inputs',async()=>{
  migrate(getDb());saveSettings({pinHash:'',autoCheckUpdates:false});
  const server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No address');
  const root=`http://127.0.0.1:${address.port}/api/medical`;
  const request=(url:string,method='GET',body?:unknown)=>fetch(`${root}${url}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  try{
    const imported=await request('/import','POST',{name:'api-lab.txt',mime:'text/plain',base64:Buffer.from('Hemoglobin 10.2 g/dL 13-17').toString('base64'),collectedAt:'2026-09-30T08:00:00Z',laboratory:'API lab'});assert.equal(imported.status,201);const {report}=await imported.json() as {report:MedicalReport};
    assert.equal((await request(`/reports/${report.id}/fhir`)).status,409);
    assert.equal((await request(`/reports/${report.id}/review`,'PUT',{revision:report.revision,report,confirmPatient:false})).status,400);
    assert.equal((await request(`/reports/${report.id}/review`,'PUT',{revision:report.revision,report,confirmPatient:true})).status,200);
    assert.equal((await request(`/reports/${report.id}/review`,'PUT',{revision:report.revision,report,confirmPatient:true})).status,409);
    assert.equal((await request(`/reports/${report.id}/fhir`)).status,200);
    assert.equal((await request('/research-export','POST',{consent:false})).status,400);
    assert.equal((await request('/calculate','POST',{type:'BMI',weightKg:72,heightCm:0,age:30})).status,400);
    assert.equal((await request('/cds-services/health-os-report-review','POST',{hook:'patient-view',hookInstance:'00000000-0000-4000-8000-000000000001',context:{patientId:'other'}})).status,400);
    assert.equal((await request(`/reports/${report.id}`,'DELETE')).status,200);
    assert.equal((await request(`/reports/${report.id}/original`)).status,404);
    const failed=await request('/import','POST',{name:'broken.pdf',mime:'application/pdf',base64:Buffer.from('This is not a PDF').toString('base64'),collectedAt:'2026-09-30T08:00:00Z'});assert.equal(failed.status,201);const draft=(await failed.json() as {report:MedicalReport}).report;assert.equal(draft.status,'draft');assert.equal(draft.results.length,0);assert.match(draft.warnings[0],/Extraction failed/);assert.equal((await request(`/reports/${draft.id}/original`)).status,200);await request(`/reports/${draft.id}`,'DELETE');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('medical action API gates research and validates report-linked follow-up provenance',async()=>{
  migrate(getDb());saveSettings({pinHash:'',autoCheckUpdates:false});const server=createApp().listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();if(!address||typeof address==='string')throw new Error('No address');
  const request=(url:string,method='POST',body?:unknown)=>fetch(`http://127.0.0.1:${address.port}/api/medical/actions${url}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  try{
    await request('/enrollment','DELETE',{deleteData:true});assert.equal((await request('/checkins','POST',{feeling:'Normal'})).status,409);assert.equal((await request('/enrollment','POST',{consent:false,purpose:'Local study'})).status,400);
    assert.equal((await request('/enrollment','POST',{consent:true,purpose:'Local study'})).status,200);
    const check=await request('/checkins','POST',{feeling:'Normal'});assert.equal(check.status,200);assert.equal((await check.json() as {checkin:{noIllnessConfirmed:boolean}}).checkin.noIllnessConfirmed,false);
    assert.equal((await request('/checkins','POST',{feeling:'Unwell',noIllnessConfirmed:true})).status,400);
    assert.equal((await request('/followups','POST',{title:'Repeat CBC',type:'repeat_test',provenance:'report',notes:'Repeat in six weeks',sourceRefs:[]})).status,400);
    const created=await request('/followups','POST',{title:'API user follow-up',type:'repeat_test',dueAt:'2026-01-01T12:00:00Z'});assert.equal(created.status,201);const f=(await created.json() as {followup:{id:string;provenance:string}}).followup;assert.equal(f.provenance,'user');
    assert.equal((await request(`/followups/${f.id}`,'PUT',{status:'snoozed',confirm:true,snoozedUntil:'2026-01-01T12:00:00Z'})).status,400);
    assert.equal((await request(`/followups/${f.id}`,'PUT',{status:'completed',confirm:true})).status,200);
    const exported=await request('/research-days','POST',{records:[],consent:true,from:'2026-10-02',to:'2026-10-02'});assert.equal(exported.status,200);const json=await exported.text();assert.ok(!json.includes('medical-report'));assert.ok(!json.includes('medicationData'));
    await request('/enrollment','DELETE',{deleteData:true});const snapshot=await request('/snapshot','POST',{records:[]});const state=(await snapshot.json() as {state:{enrollment:unknown;checkins:unknown[]}}).state;assert.equal(state.enrollment,null);assert.equal(state.checkins.length,0);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
