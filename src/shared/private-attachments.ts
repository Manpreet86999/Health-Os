import {z} from 'zod';

export const PRIVATE_ATTACHMENT_BUCKET='health-os-private';
export const PRIVATE_ATTACHMENT_MAX_BYTES=20_000_000;
export const privateBlobSchema=z.object({version:z.literal(1),sha256:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().int().min(1).max(PRIVATE_ATTACHMENT_MAX_BYTES),mime:z.enum(['application/pdf','application/dicom','image/jpeg','image/png','image/webp','text/plain','application/json','application/fhir+json','application/octet-stream'])});
export type PrivateBlob=z.infer<typeof privateBlobSchema>;
export function privateOriginalDescriptor(payload:Record<string,unknown>):PrivateBlob {
  const original=payload.original;
  if(!original||typeof original!=='object'||Array.isArray(original))throw new Error('Missing private original descriptor.');
  const value=original as Record<string,unknown>;
  return privateBlobSchema.parse({version:1,sha256:value.sha256,size:value.size,mime:value.mime});
}
export function portablePrivatePayload(payload:Record<string,unknown>):Record<string,unknown> {
  privateOriginalDescriptor(payload);
  const original=payload.original as Record<string,unknown>;
  return {...payload,original:Object.fromEntries(Object.entries(original).filter(([key])=>key!=='localPath'))};
}
export function portableMedicalPayload(payload:Record<string,unknown>):Record<string,unknown> {
  const portable=portablePrivatePayload(payload);
  const optional=new Set(['loinc','value','valueText','comparator','referenceLow','referenceHigh']);
  const result={...portable};
  if(result.reviewedAt===null)delete result.reviewedAt;
  if(Array.isArray(result.results))result.results=result.results.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
    return Object.fromEntries(Object.entries(raw).filter(([key,value])=>!(optional.has(key)&&value===null)));
  });
  return result;
}
export function privateObjectKey(uid:string,blob:PrivateBlob):string {
  privateBlobSchema.parse(blob);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(uid))throw new Error('Invalid private-file account.');
  return `${uid}/${blob.sha256}`;
}
export async function privateChecksum(bytes:Uint8Array):Promise<string> {
  const hash=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes));
  return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
}
