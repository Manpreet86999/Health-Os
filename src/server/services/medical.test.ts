import assert from 'node:assert/strict';
import test from 'node:test';
import { createMedicalReport, deleteMedicalReport, getMedicalReport, originalMedicalReport, reviewMedicalReport, medicalReportHistory } from './medical-store.js';
import { getDb } from '../db/connection.js';
import { extractMedical, fhirReport } from './medical-ingest.js';
import { reportBundle } from '../../shared/medical.js';
import { executeRecordInventory } from './medical-cql.js';
import { validateLocalFhir, validateMedicalUnits } from './medical-standards.js';
const date='2026-09-30T08:00:00Z';
test('medical originals are encrypted, deduplicated and require versioned review',async()=>{
  const bytes=Buffer.from('Hemoglobin 11.8 g/dL 13-17');const imported=await extractMedical({name:'cbc.txt',mime:'text/plain',base64:bytes.toString('base64'),collectedAt:date,laboratory:'Test lab'});
  const {report}=createMedicalReport(imported,bytes,'cbc.txt','text/plain',imported.warnings);assert.equal(report.status,'draft');
  const row=getDb().prepare('SELECT data,original FROM medical_reports WHERE id=?').get(report.id) as {data:string;original:string};assert.match(row.data,/^enc:v1:/);assert.match(row.original,/^enc:v1:/);assert.equal(originalMedicalReport(report.id)?.data.toString(),bytes.toString());
  assert.equal(createMedicalReport(imported,bytes,'other.txt','text/plain',[]).duplicate,true);
  assert.equal(reviewMedicalReport(report.id,report,2)?.conflict,true);assert.equal(reviewMedicalReport(report.id,report,1)?.report.status,'reviewed');
  assert.deepEqual(medicalReportHistory(report.id).map(v=>v.revision),[1,2]);
  const bundle=reportBundle(getMedicalReport(report.id)!);const parsed=fhirReport(Buffer.from(JSON.stringify(bundle)),date);assert.equal(parsed.results[0].value,11.8);
  const validation=validateLocalFhir(bundle);assert.equal(validation.issue.filter(i=>i.severity==='error'||i.severity==='fatal').length,0,JSON.stringify(validation));assert.equal(validateMedicalUnits(report)[0].validation.status,'valid');
  const result=await executeRecordInventory(bundle);assert.equal(result.patientResults['local-patient'].ObservationCount,1);
  const obs=bundle.entry!.find(e=>e.resource?.resourceType==='Observation')!.resource;if(obs?.resourceType==='Observation')obs.subject={reference:'Patient/someone-else'};
  assert.throws(()=>fhirReport(Buffer.from(JSON.stringify(bundle)),date),/different/);assert.equal(deleteMedicalReport(report.id),true);assert.equal(originalMedicalReport(report.id),null);assert.equal(medicalReportHistory(report.id).length,0);
});
test('local FHIR checker rejects missing required observation fields',()=>{const bundle={resourceType:'Bundle' as const,type:'collection' as const,entry:[{resource:{resourceType:'Observation' as const,id:'bad',code:{text:'Example'}}}]};const result=validateLocalFhir(bundle as never);assert.ok(result.issue.some(i=>i.severity==='error'),JSON.stringify(result));});
test('PDF text extraction preserves editable numerical rows',async()=>{
  const {default:PDFDocument}=await import('pdfkit');const pdf=new PDFDocument();const chunks:Buffer[]=[];pdf.on('data',c=>chunks.push(c));const ended=new Promise<void>(resolve=>pdf.on('end',resolve));pdf.text('Hemoglobin 11.8 g/dL 13-17');pdf.end();await ended;
  const imported=await extractMedical({name:'cbc.pdf',mime:'application/pdf',base64:Buffer.concat(chunks).toString('base64'),collectedAt:date,laboratory:'PDF lab'});assert.equal(imported.results[0].value,11.8);
});
