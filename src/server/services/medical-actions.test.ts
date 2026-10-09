import test from 'node:test';
import assert from 'node:assert/strict';
import { createMedicalReport, reviewMedicalReport, deleteMedicalReport } from './medical-store.js';
import { changeMedicalActions, readMedicalActions, reconcileLocalMedical } from './medical-actions.js';
import { labSchema } from '../../shared/medical.js';
import { getDb } from '../db/connection.js';
test('encrypted medical projections preserve decisions across replay, source deletion and explicit rebuild',()=>{
  const timestamp='2026-10-02T08:00:00Z',input={title:'Action test',category:'laboratory',collectedAt:timestamp,results:[labSchema.parse({id:'hb',name:'Hemoglobin',value:10,unit:'g/dL',referenceLow:13,referenceHigh:17,collectedAt:timestamp})]};
  const {report}=createMedicalReport(input,Buffer.from('unique-action-test-report'),'action.txt','text/plain',[]);reviewMedicalReport(report.id,input,report.revision);
  let state=reconcileLocalMedical([],timestamp);const item=state.inbox.find(i=>i.type==='abnormal_result'&&i.sourceRefs.some(r=>r.id===report.id))!;assert.ok(item);assert.ok(item.sourceEventIds.length);
  changeMedicalActions(s=>{s.inbox.find(i=>i.id===item.id)!.status='reviewed';});state=reconcileLocalMedical([],timestamp,true);assert.equal(state.inbox.find(i=>i.id===item.id)?.status,'reviewed');
  assert.match((getDb().prepare('SELECT data FROM medical_action_state').get() as {data:string}).data,/^enc:v1:/);
  deleteMedicalReport(report.id);state=reconcileLocalMedical([],timestamp);assert.equal(state.inbox.find(i=>i.id===item.id)?.status,'expired');assert.equal(readMedicalActions().inbox.filter(i=>i.id===item.id).length,1);
});
