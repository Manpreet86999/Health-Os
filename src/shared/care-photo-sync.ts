import {z} from 'zod';
import {privateBlobSchema,type PrivateBlob} from './private-attachments.js';

const imageOriginal=z.object({name:z.string().min(1).max(250),mime:z.enum(['image/jpeg','image/png','image/webp']),sha256:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().int().min(1).max(20_000_000)}).passthrough();
const photo=z.object({id:z.string().min(1).max(200),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value),area:z.enum(['face','body','hair','scalp']),note:z.string().max(500),aiObservation:z.string().max(1000).optional(),createdAt:z.string().datetime({offset:true}),original:imageOriginal,preview:imageOriginal.extend({size:z.number().int().min(1).max(180_000)})}).passthrough();

/** Original and resized preview bytes use private Storage; the ledger has descriptors only. */
export function portableCarePhoto(payload:Record<string,unknown>):Record<string,unknown> {
  const copy={...payload};
  delete copy.dataUrl;delete copy.versionToken;
  if(copy.aiObservation===null)delete copy.aiObservation;
  for(const key of ['original','preview']){
    const value=copy[key];
    if(value&&typeof value==='object'&&!Array.isArray(value))copy[key]=Object.fromEntries(Object.entries(value).filter(([field])=>field!=='localPath'));
  }
  photo.parse(copy);
  return copy;
}
export function carePhotoBlobs(payload:Record<string,unknown>):{original:PrivateBlob;preview:PrivateBlob} {
  const value=portableCarePhoto(payload);
  const descriptor=(key:string)=>{const blob=value[key] as Record<string,unknown>;return privateBlobSchema.parse({version:1,sha256:blob.sha256,size:blob.size,mime:blob.mime});};
  return {original:descriptor('original'),preview:descriptor('preview')};
}
