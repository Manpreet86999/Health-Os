import {type CloudConfig,type CloudSession} from '../../shared/cloud.js';
import {carePhotoBlobs,portableCarePhoto} from '../../shared/care-photo-sync.js';
import {downloadPrivateFile,uploadPrivateFile} from '../../shared/private-file-cloud.js';
import * as repo from '../db/repository.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DATA_DIR} from '../config.js';
import {encryptSecret,decryptSecret} from '../lib/secrets.js';

export interface CarePhotoSyncRecord {
  id:string;
  entityType:'carePhoto';
  payload:Record<string,unknown>;
  revision:number;
  updatedAt:string;
  deviceId:string;
  workspace:'care';
  createdAt:string;
  deletedAt?:string;
}

function parseDataUrl(dataUrl:string):{mime:'image/jpeg'|'image/png'|'image/webp';bytes:Buffer} {
  const match=dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if(!match)throw new Error('Unsupported image format in care photo dataUrl.');
  return {mime:match[1] as 'image/jpeg'|'image/png'|'image/webp',bytes:Buffer.from(match[3],'base64')};
}

/** Descriptors stay in metadata; image bytes are stored in private Storage. */
export function carePhotoRecords(deviceId:string):CarePhotoSyncRecord[] {
  return repo.listCarePhotos().map(photo=>{
    let original=photo.original;
    let preview=photo.preview;
    if(!original||!preview) {
      const parsed=parseDataUrl(photo.dataUrl);
      const sha256=crypto.createHash('sha256').update(parsed.bytes).digest('hex');
      const size=parsed.bytes.length;
      original=original||{name:`${photo.id}.${parsed.mime==='image/png'?'png':parsed.mime==='image/webp'?'webp':'jpg'}`,mime:parsed.mime,sha256,size};
      preview=preview||{name:`preview-${photo.id}.${parsed.mime==='image/png'?'png':parsed.mime==='image/webp'?'webp':'jpg'}`,mime:parsed.mime,sha256,size};
    }
    const payload=portableCarePhoto({
      id:photo.id,
      date:photo.date,
      area:photo.area,
      note:photo.note,
      aiObservation:photo.aiObservation,
      createdAt:photo.createdAt,
      original,
      preview,
    });
    return {
      id:photo.id,
      entityType:'carePhoto',
      payload,
      revision:photo.revision||1,
      updatedAt:photo.createdAt,
      deviceId,
      workspace:'care',
      createdAt:photo.createdAt,
    };
  });
}

/** Upload original and preview bytes to private Storage before publishing metadata. */
export async function uploadCarePhoto(config:CloudConfig,session:CloudSession,record:CarePhotoSyncRecord):Promise<void> {
  if(record.deletedAt)return;
  const photo=repo.listCarePhotos().find(p=>p.id===record.id);
  if(!photo)throw new Error('The queued care photo is unavailable. Local changes remain pending.');
  const blobs=carePhotoBlobs(record.payload);
  const parsed=parseDataUrl(photo.dataUrl);
  // Upload original bytes
  await uploadPrivateFile(config,session,blobs.original,parsed.bytes);
  // If preview is distinct sha256, upload preview; otherwise it's already uploaded
  if(blobs.preview.sha256!==blobs.original.sha256) {
    await uploadPrivateFile(config,session,blobs.preview,parsed.bytes);
  }
}

export function applySyncedCarePhoto(record:CarePhotoSyncRecord,previewBytes?:Buffer,originalBytes?:Buffer):void {
  if(record.deletedAt){repo.deleteCarePhoto(record.id);return;}
  const payload=portableCarePhoto(record.payload);
  const buf=previewBytes&&previewBytes.length>0?previewBytes:originalBytes;
  if(!buf||buf.length===0)throw new Error('Image bytes are required to apply care photo.');
  const previewBlob=payload.preview as {mime:string;name:string;sha256:string;size:number};
  const originalBlob=payload.original as {mime:string;name:string;sha256:string;size:number};
  const mime=previewBlob.mime||originalBlob.mime||'image/jpeg';
  const dataUrl=`data:${mime};base64,${buf.toString('base64')}`;
  repo.saveCarePhoto({
    id:record.id,
    date:payload.date as string,
    area:payload.area as any,
    dataUrl,
    note:(payload.note as string)||'',
    aiObservation:payload.aiObservation as string|undefined,
    createdAt:record.createdAt,
    original:originalBlob,
    preview:previewBlob,
    revision:record.revision,
  });
}

export interface PreparedCarePhoto {apply():void;dispose():void;}
export async function prepareCarePhoto(config:CloudConfig,session:CloudSession,record:CarePhotoSyncRecord):Promise<PreparedCarePhoto> {
  if(record.deletedAt)return {apply:()=>applySyncedCarePhoto(record),dispose:()=>{}};
  const payload=portableCarePhoto(record.payload);
  const blobs=carePhotoBlobs(payload);
  const previewBytes=await downloadPrivateFile(config,session,blobs.preview);
  const originalBytes=blobs.original.sha256===blobs.preview.sha256?previewBytes:await downloadPrivateFile(config,session,blobs.original);
  const prepared={...record,payload};

  const directory=path.join(DATA_DIR,'private-sync-staging');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const filename=path.join(directory,`${crypto.randomUUID()}.sealed`);
  fs.writeFileSync(filename,encryptSecret(JSON.stringify({
    preview:Buffer.from(previewBytes).toString('base64'),
    original:Buffer.from(originalBytes).toString('base64'),
  })),{mode:0o600,flag:'wx'});

  return {
    apply:()=>{
      const data=JSON.parse(decryptSecret(fs.readFileSync(filename,'utf8')));
      applySyncedCarePhoto(prepared,Buffer.from(data.preview,'base64'),Buffer.from(data.original,'base64'));
    },
    dispose:()=>{try{fs.unlinkSync(filename);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}},
  };
}
