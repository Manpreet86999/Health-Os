import crypto from 'node:crypto';
import { getDb, withTransaction } from '../db/connection.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import { reportInputSchema, type MedicalReport } from '../../shared/medical.js';
import {privateBlobSchema,portableMedicalPayload} from '../../shared/private-attachments.js';
import { publishSourceEvent } from './automation-store.js';

function database(){const db=getDb();db.exec('CREATE TABLE IF NOT EXISTS medical_cloud_reports (id TEXT PRIMARY KEY, data TEXT NOT NULL, original TEXT NOT NULL, hash TEXT NOT NULL); CREATE INDEX IF NOT EXISTS medical_cloud_reports_hash ON medical_cloud_reports(hash); CREATE TABLE IF NOT EXISTS medical_reports (id TEXT PRIMARY KEY, data TEXT NOT NULL, original TEXT NOT NULL, hash TEXT NOT NULL UNIQUE); CREATE TABLE IF NOT EXISTS medical_audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS medical_report_versions (report_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (report_id, revision))');return db;}
function saveRevision(report:MedicalReport){database().prepare('INSERT OR IGNORE INTO medical_report_versions VALUES (?, ?, ?)').run(report.id,report.revision,encryptSecret(JSON.stringify(report)));}
export function medicalReportHistory(id:string){return (database().prepare('SELECT data FROM medical_report_versions WHERE report_id=? ORDER BY revision').all(id) as {data:string}[]).map(r=>JSON.parse(decryptSecret(r.data)) as MedicalReport);}
export function medicalAudit(action:string,reportId:string){database().prepare('INSERT INTO medical_audit VALUES (?, ?, ?)').run(crypto.randomUUID(),new Date().toISOString(),encryptSecret(JSON.stringify({action,reportId})));}
// Cloud identities may share an original checksum. Keep both IDs and their evidence links,
// while the existing import endpoint still deduplicates a newly selected local file.
function reportTable(id:string):'medical_reports'|'medical_cloud_reports' {
  return database().prepare('SELECT id FROM medical_cloud_reports WHERE id=?').get(id)?'medical_cloud_reports':'medical_reports';
}
export function listMedicalReports(){
  const rows=database().prepare('SELECT id,data FROM medical_cloud_reports UNION ALL SELECT id,data FROM medical_reports').all() as {id:string;data:string}[];
  const seen=new Set<string>();return rows.filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true;}).map(row=>JSON.parse(decryptSecret(row.data)) as MedicalReport);
}
export function getMedicalReport(id:string){const row=database().prepare(`SELECT data FROM ${reportTable(id)} WHERE id=?`).get(id) as {data:string}|undefined;return row?JSON.parse(decryptSecret(row.data)) as MedicalReport:null;}
export function updateMedicalExtraction(id:string,input:unknown,warnings:string[]){return withTransaction(()=>{const old=getMedicalReport(id);if(!old)return null;if(old.status!=='draft'||old.revision!==1)return old;const next:MedicalReport={...old,...reportInputSchema.parse(input),revision:2,warnings};database().prepare(`UPDATE ${reportTable(id)} SET data=? WHERE id=?`).run(encryptSecret(JSON.stringify(next)),id);saveRevision(next);medicalAudit('extraction',id);return next;});}
export function originalMedicalReport(id:string){const r=getMedicalReport(id);if(!r)return null;const row=database().prepare(`SELECT original FROM ${reportTable(id)} WHERE id=?`).get(id) as {original:string};medicalAudit('original-read',id);return {report:r,data:Buffer.from(decryptSecret(row.original),'base64')};}
export function createMedicalReport(input:unknown,bytes:Buffer,name:string,mime:string,warnings:string[]){
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const duplicate=database().prepare('SELECT data FROM medical_cloud_reports WHERE hash=? UNION ALL SELECT data FROM medical_reports WHERE hash=? LIMIT 1').get(hash,hash) as {data:string}|undefined;
  if(duplicate)return {report:JSON.parse(decryptSecret(duplicate.data)) as MedicalReport,duplicate:true};
  const report:MedicalReport={...reportInputSchema.parse(input),id:crypto.randomUUID(),status:'draft',createdAt:new Date().toISOString(),revision:1,original:{name,mime,sha256:hash,size:bytes.length},warnings};
  withTransaction(()=>{database().prepare('INSERT INTO medical_reports VALUES (?, ?, ?, ?)').run(report.id,encryptSecret(JSON.stringify(report)),encryptSecret(bytes.toString('base64')),hash);saveRevision(report);medicalAudit('import',report.id);});
  return {report,duplicate:false};
}
export function reviewMedicalReport(id:string,input:unknown,revision:number){
  const result=withTransaction(()=>{const old=getMedicalReport(id);if(!old)return null;if(old.revision!==revision)return {conflict:true as const,report:old};const next:MedicalReport={...old,...reportInputSchema.parse(input),status:'reviewed',reviewedAt:new Date().toISOString(),revision:revision+1};saveRevision(old);database().prepare(`UPDATE ${reportTable(id)} SET data=? WHERE id=?`).run(encryptSecret(JSON.stringify(next)),id);saveRevision(next);medicalAudit('review',id);return {conflict:false as const,report:next};});
  if(result&&!result.conflict)publishSourceEvent('medical.report.reviewed',id,result.report.collectedAt.slice(0,10),{id,revision:result.report.revision});
  return result;
}
export function deleteMedicalReport(id:string){const old=getMedicalReport(id);const deleted=withTransaction(()=>{const cloud=database().prepare('DELETE FROM medical_cloud_reports WHERE id=?').run(id);const local=database().prepare('DELETE FROM medical_reports WHERE id=?').run(id);const result={changes:Number(cloud.changes)+Number(local.changes)};if(result.changes){database().prepare('DELETE FROM medical_report_versions WHERE report_id=?').run(id);medicalAudit('delete',id);}return Boolean(result.changes);});if(deleted)publishSourceEvent('medical.report.deleted',id,old?.collectedAt.slice(0,10)||'',{deleted:true,revision:old?.revision});return deleted;}

export function applySyncedMedicalReport(record:{id:string;payload:Record<string,unknown>;revision:number;updatedAt:string;deletedAt?:string},bytes?:Buffer):void {
  if(record.deletedAt){deleteMedicalReport(record.id);return;}
  if(!record.id||record.id.length>150||!Number.isSafeInteger(record.revision)||record.revision<=0)throw new Error('Invalid cloud medical identity.');
  const payload=portableMedicalPayload(record.payload),fields=reportInputSchema.parse(payload),raw=payload.original as Record<string,unknown>|undefined;
  if(!raw||typeof raw.name!=='string'||raw.name.length<1||raw.name.length>250)throw new Error('Invalid cloud original descriptor.');
  const blob=privateBlobSchema.parse({version:1,sha256:raw.sha256,size:raw.size,mime:raw.mime});
  if(!bytes||bytes.length!==blob.size||crypto.createHash('sha256').update(bytes).digest('hex')!==blob.sha256)throw new Error('The verified original is required before applying medical metadata.');
  if(!['draft','reviewed'].includes(String(payload.status))||typeof payload.createdAt!=='string'||!Number.isFinite(Date.parse(payload.createdAt)))throw new Error('Invalid cloud medical status or creation date.');
  if(payload.status==='reviewed'&&(typeof payload.reviewedAt!=='string'||!Number.isFinite(Date.parse(payload.reviewedAt))))throw new Error('A reviewed cloud report needs its review date.');
  const report:MedicalReport={...payload,...fields,id:record.id,revision:record.revision,status:payload.status as MedicalReport['status'],createdAt:payload.createdAt,reviewedAt:payload.status==='reviewed'?String(payload.reviewedAt):undefined,
    original:{name:raw.name,mime:blob.mime,sha256:blob.sha256,size:blob.size},warnings:Array.isArray(payload.warnings)?payload.warnings.filter((v):v is string=>typeof v==='string').slice(0,100):[]};
  withTransaction(()=>{
    const prior=getMedicalReport(record.id);if(prior)saveRevision(prior);
    database().prepare('INSERT INTO medical_cloud_reports(id,data,original,hash) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,original=excluded.original,hash=excluded.hash').run(record.id,encryptSecret(JSON.stringify(report)),encryptSecret(bytes.toString('base64')),blob.sha256);
    saveRevision(report);medicalAudit('cloud-applied',record.id);
  });
  publishSourceEvent(report.status==='reviewed'?'medical.report.reviewed':'medical.report.imported',report.id,report.collectedAt.slice(0,10),{id:report.id,revision:report.revision,source:'cloud'});
}
