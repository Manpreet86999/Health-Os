import {type CloudConfig,type CloudSession} from '../../shared/cloud.js';
import {privateOriginalDescriptor,portableMedicalPayload} from '../../shared/private-attachments.js';
import {downloadPrivateFile,uploadPrivateFile} from '../../shared/private-file-cloud.js';
import {applySyncedMedicalReport,listMedicalReports,originalMedicalReport} from './medical-store.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DATA_DIR} from '../config.js';
import {encryptSecret,decryptSecret} from '../lib/secrets.js';

export interface MedicalFileRecord {
  id:string;
  entityType:'medicalReport';
  payload:Record<string,unknown>;
  revision:number;
  updatedAt:string;
  deviceId:string;
  workspace:'medical';
  createdAt:string;
  deletedAt?:string;
}

/** File bytes never appear in the metadata ledger or public report payload. */
export function medicalFileRecords(deviceId:string):MedicalFileRecord[] {
  return listMedicalReports().map(report=>({
    id:report.id,entityType:'medicalReport',
    payload:portableMedicalPayload(report as unknown as Record<string,unknown>),
    revision:report.revision,updatedAt:report.reviewedAt||report.createdAt,
    createdAt:report.createdAt,deviceId,workspace:'medical',
  }));
}

/** Upload the exact queued version's original before publishing its metadata. */
export async function uploadMedicalFile(config:CloudConfig,session:CloudSession,record:MedicalFileRecord):Promise<void> {
  if(record.deletedAt)return;
  const expected=privateOriginalDescriptor(record.payload);
  const original=originalMedicalReport(record.id);
  if(!original)throw new Error('The queued medical original is unavailable. Local changes remain pending.');
  await uploadPrivateFile(config,session,expected,original.data);
}

/** Await network verification before entering the encrypted SQLite transaction. */
export interface PreparedMedicalFile {apply():void;dispose():void;}
export async function prepareMedicalFile(config:CloudConfig,session:CloudSession,record:MedicalFileRecord):Promise<PreparedMedicalFile> {
  if(record.deletedAt)return {apply:()=>applySyncedMedicalReport(record),dispose:()=>{}};
  const payload=portableMedicalPayload(record.payload);
  const bytes=await downloadPrivateFile(config,session,privateOriginalDescriptor(payload));
  const prepared={...record,payload};
  // A delta page may contain many originals. Keep only encrypted temporary files
  // between preparation and its atomic metadata commit, rather than every buffer.
  const directory=path.join(DATA_DIR,'private-sync-staging');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const filename=path.join(directory,`${crypto.randomUUID()}.sealed`);
  fs.writeFileSync(filename,encryptSecret(Buffer.from(bytes).toString('base64')),{mode:0o600,flag:'wx'});
  return {
    apply:()=>applySyncedMedicalReport(prepared,Buffer.from(decryptSecret(fs.readFileSync(filename,'utf8')),'base64')),
    dispose:()=>{try{fs.unlinkSync(filename);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}},
  };
}
