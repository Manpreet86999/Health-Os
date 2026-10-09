import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentSchema, zonedLocalToIso, zonedDateTime, resolveAppointmentTime, type HealthAppointment } from './appointments.js';
import { appointmentsCloudRoute, appointmentSummary } from '../client/lib/appointments-cloud.js';
import { emptyMedicalActions } from './medical-actions.js';
import { doctorSummaryHtml } from '../client/lib/medical-summary.js';

const stamp='2026-10-07T10:00:00.000Z';
function appointment(patch: Partial<HealthAppointment> = {}) { return appointmentSchema.parse({version:1,id:'11111111-1111-4111-8111-111111111111',revision:1,title:'Annual visit',scheduledAt:stamp,timezone:'Asia/Kolkata',summaryFrom:'2026-10-01',summaryTo:'2026-10-07',createdAt:stamp,updatedAt:stamp,...patch}); }
test('appointment timezone conversion preserves wall time and rejects impossible local dates',()=>{
  assert.equal(zonedLocalToIso('2026-10-07T15:30','Asia/Kolkata'),stamp);
  assert.equal(zonedDateTime(stamp,'Asia/Kolkata'),'2026-10-07T15:30');
  assert.throws(()=>zonedLocalToIso('2026-03-08T02:30','America/New_York'),/does not exist/);
  assert.equal(zonedLocalToIso('2026-11-01T01:30','America/New_York'),'2026-11-01T05:30:00.000Z');
  assert.equal(resolveAppointmentTime('2026-11-01T01:30','America/New_York',{timezone:'America/New_York',scheduledAt:'2026-11-01T06:30:00.000Z'}),'2026-11-01T06:30:00.000Z');
  assert.throws(()=>zonedLocalToIso('2026-02-30T12:00','UTC'));
  assert.equal(appointmentSchema.safeParse({...appointment(),timezone:'Unknown/Zone'}).success,false);
  assert.equal(appointmentSchema.safeParse({...appointment(),remoteUrl:'javascript:alert(1)'}).success,false);
  assert.equal(appointmentSchema.safeParse({...appointment(),summaryFrom:'2026-11-01'}).success,false);
});
test('appointment saves are idempotent, revision checked, and archive requires confirmation',async()=>{
  const rows:any[]=[];const ws={records:rows,get:(type:string,id:string)=>rows.find(r=>r.entityType===type&&r.id===id),save:async(type:string,payload:any,id?:string)=>{const row=rows.find(r=>r.id===id);if(row)row.payload=payload;else rows.push({entityType:type,id,payload});},remove:async(_type:string,id:string)=>{rows.find(r=>r.id===id).deletedAt=stamp;}};
  const evidence={reports:[],records:[],state:emptyMedicalActions()};
  const invoke=(method:string,path:string,body:any)=>appointmentsCloudRoute(path,method,body,ws,evidence);
  const value=appointment();const create=await invoke('POST','/medical/appointments',{appointment:value,expectedRevision:0});assert.equal(create.status,200);
  assert.equal((await invoke('POST','/medical/appointments',{appointment:value,expectedRevision:0})).status,200);assert.equal(rows.length,1);
  const changed=appointment({title:'Rescheduled',scheduledAt:'2026-10-08T10:00:00.000Z'});
  assert.equal((await invoke('PATCH',`/medical/appointments/${value.id}`,{appointment:changed,expectedRevision:0})).status,409);
  const saved=await (await invoke('PATCH',`/medical/appointments/${value.id}`,{appointment:changed,expectedRevision:1})).json();assert.equal(saved.appointment.revision,2);
  assert.equal((await invoke('PATCH',`/medical/appointments/${value.id}`,{appointment:appointment({sourceRefs:[{kind:'record',id:'unowned'}]}),expectedRevision:2})).status,400);
  await assert.rejects(()=>invoke('DELETE',`/medical/appointments/${value.id}`,{expectedRevision:2}));
  assert.equal((await invoke('DELETE',`/medical/appointments/${value.id}`,{expectedRevision:1,confirm:true})).status,409);
  assert.equal((await invoke('DELETE',`/medical/appointments/${value.id}`,{expectedRevision:2,confirm:true})).status,200);
  assert.equal((await (await invoke('GET','/medical/appointments',null)).json()).appointments.length,0);
});
test('visit summaries respect selection, local dates, review status and missing evidence',()=>{
  const value=appointment({title:'<script>alert(1)</script>',sourceRefs:[{kind:'report',id:'draft',revision:1},{kind:'report',id:'reviewed',revision:1},{kind:'record',id:'late',revision:1},{kind:'record',id:'missing',revision:1}]});
  const reports:any[]=[{id:'draft',title:'Unreviewed',revision:1,status:'draft',collectedAt:stamp,results:[]},{id:'reviewed',title:'Reviewed',revision:2,status:'reviewed',collectedAt:stamp,results:[]}];
  const records:any[]=[{id:'late',type:'symptom',name:'Selected symptom',revision:1,timestamp:'2026-10-07T23:30:00Z',metadata:{}}];
  const summary=appointmentSummary(value,reports,records,emptyMedicalActions());
  assert.deepEqual(summary.reports.map(r=>r.id),['reviewed']);assert.equal(summary.unreviewedReports.length,1);assert.equal(summary.symptoms.length,0);
  assert.equal(summary.warnings.length,2);const html=doctorSummaryHtml(summary);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Unreviewed documents'));assert.ok(html.includes('Selection needs review'));
});
