import { z } from 'zod';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { runMedicalResearch } from '../services/medical-research.js';
import { researchWorkbenchSchema } from '../../shared/research-workbench.js';
import { snapshotFromRecords } from '../../shared/record-snapshot.js';
import { validateMedicalUnits, validateLocalFhir } from '../services/medical-standards.js';
import { reportBundle } from '../../shared/medical.js';
import { executeRecordInventory } from '../services/medical-cql.js';
import { extractMedical, importMedicalSchema } from '../services/medical-ingest.js';
import { rebuildAnalyticsMirror, duckDbStatus } from '../services/duckdb-analytics.js';
import { LocalWhisper } from '../services/whisper.js';
import type { WorkerJob } from '../../shared/worker-jobs.js';
import type { WorkerCloud } from './cloud.js';
import { REPORT_LOGO_DATA_URI } from '../../shared/report-logo.js';

const voice=new LocalWhisper();
export async function capabilities(){
  const research=await runMedicalResearch('status').catch(()=>({available:false}));
  const duckdb=await duckDbStatus().catch(()=>({available:false}));
  return {research,duckdb,voice:voice.status(),medical:{ocr:true,fhir:true,ucum:true,cql:true,dicomMetadata:true},pdf:true};
}
export async function executeJob(job:WorkerJob,cloud:WorkerCloud):Promise<any>{
  if(job.user_id!==cloud.owner)throw new Error('Job belongs to another account.');
  const input=job.input;
  if(job.operation==='research.status')return runMedicalResearch('status');
  if(job.operation==='research.statistics'){
    const data=z.object({values:z.array(z.number().finite()).min(2).max(2000)}).parse(input);
    const response=await runMedicalResearch('statistics',data);if(response.ok===false||response.available===false)throw new Error(String(response.error||response.message));return response;
  }
  if(job.operation==='research.workbench'){
    const data=researchWorkbenchSchema.parse(input);
    const response=await runMedicalResearch('workbench',data);if(response.ok===false||response.available===false)throw new Error(String(response.error||response.message));return response;
  }
  if(job.operation==='research.notebook')return JSON.parse(readFileSync(path.join(ROOT,'tooling/medical-research/medical-workbench.ipynb'),'utf8'));
  if(job.operation==='analytics.rebuild'){
    const records=await cloud.trainingSnapshot();
    return {...await rebuildAnalyticsMirror(snapshotFromRecords(records)),sourceVersions:records.filter(r=>r.entityType==='session').map(r=>({id:r.id,revision:r.revision})),generatedAt:new Date().toISOString()};
  }
  if(job.operation==='voice.transcribe'){
    const {base64}=z.object({base64:z.string().min(1).max(4000000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).parse(input);
    return voice.transcribe(Buffer.from(base64,'base64'));
  }
  if(job.operation==='report.pdf'){
    const {sessionId}=z.object({sessionId:z.string().min(1).max(200)}).parse(input);
    const records=await cloud.trainingSnapshot(),db=snapshotFromRecords(records),session=db.sessions.find(s=>s.id===sessionId);
    if(!session)throw new Error('Workout not found in your account.');
    const {default:PDFDocument}=await import('pdfkit');
    return new Promise((resolve,reject)=>{
      const doc=new PDFDocument({margin:48}),chunks:Buffer[]=[];doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve({name:'health-os-workout.pdf',mime:'application/pdf',base64:Buffer.concat(chunks).toString('base64')}));
      doc.image(Buffer.from(REPORT_LOGO_DATA_URI.split(',')[1],'base64'),50,45,{width:48});
      doc.fontSize(26).fillColor('#12695d').text('Health OS',110,55);doc.moveDown().fontSize(18).text(session.dayTitle||'Workout report',50,110);doc.fontSize(11).fillColor('#333333').text(String(session.date));
      for(const log of session.logs||[]){doc.moveDown().fontSize(13).text(db.exercises.find(e=>e.id===log.exerciseId)?.name||'Exercise');doc.fontSize(10).text((log.sets||[]).map(s=>`${s.w} ${db.profile.units||'kg'} × ${s.r} reps`).join('  ·  '));}doc.end();
    });
  }
  const {reportId}=z.object({reportId:z.string().min(1).max(200)}).parse(input);
  const [row]=await cloud.request(`rest/v1/body_os_records?user_id=eq.${cloud.owner}&entity_type=eq.medicalReport&record_id=eq.${encodeURIComponent(reportId)}&deleted_at=is.null&select=payload,revision`);
  if(!row)throw new Error('Medical report not found in your account.');
  const report=row.payload;
  if(job.operation==='medical.extract'){
    const digest=z.string().regex(/^[a-f0-9]{64}$/).parse(report.originalStorage?.sha256);
    const original=await cloud.request(`storage/v1/object/authenticated/health-os-private/${cloud.owner}/${digest}`);
    const data=importMedicalSchema.parse({...original,collectedAt:report.collectedAt,laboratory:report.laboratory||''});
    const {bytes,...extracted}=await extractMedical(data);
    return {reportId,sourceRevision:row.revision,reportRevision:report.revision,report:extracted};
  }
  if(job.operation==='medical.units')return {units:validateMedicalUnits(report)};
  if(report.status!=='reviewed')throw new Error('Review the medical report before FHIR validation or CQL execution.');
  const bundle=reportBundle(report,cloud.owner);
  if(job.operation==='medical.fhir')return validateLocalFhir(bundle);
  if(job.operation==='medical.cql')return executeRecordInventory(bundle);
  throw new Error('Unsupported worker operation.');
}
export function disposeHandlers(){voice.dispose();}
