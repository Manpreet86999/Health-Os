import { z } from 'zod';
import { validateRecord } from './cloud.js';
import { syncKey, syncRecordsFromDb, type SyncRecord } from './sync.js';
import { unwrapBackup } from './domain.js';
import type { AppDb } from './types.js';

const mobileSchema=z.object({format:z.literal('body-os-mobile'),version:z.union([z.literal(1),z.literal(2)]),createdAt:z.string(),account:z.string().optional(),originDeviceId:z.string().optional(),records:z.array(z.unknown()).max(100000)});
const portableSchema=z.object({format:z.literal('body-os-portable-backup'),version:z.union([z.literal(1),z.literal(2)]),createdAt:z.string(),originDeviceId:z.string().optional(),records:z.array(z.unknown()).max(100000)});
const desktopEnvelopeSchema=z.object({format:z.literal('workout-os-backup'),version:z.number().int().positive(),exportedAt:z.string(),data:z.unknown()});
export type PortableBackupFormat='body-os-mobile'|'body-os-portable-backup'|'workout-os-backup';
export function parseMobileBackup(text:string):{format:PortableBackupFormat;version:number;createdAt:string;account?:string;records:SyncRecord[]} {
  if(text.length>25*1024*1024)throw new Error('Backup exceeds the 25 MB import limit.');
  const parsed:unknown=JSON.parse(text);
  const mobile=mobileSchema.safeParse(parsed);
  const keys=new Set<string>();
  const clean=(rawRecords:unknown[])=>rawRecords.map(raw=>{const record=validateRecord(raw),key=syncKey(record);if(keys.has(key))throw new Error(`Duplicate record in backup: ${key}`);keys.add(key);const {cloudVersion,localPayload,...local}=record;return local;});
  if(mobile.success)return {...mobile.data,records:clean(mobile.data.records)};
  const portable=portableSchema.safeParse(parsed);
  if(portable.success)return {...portable.data,records:clean(portable.data.records)};

  const desktop=desktopEnvelopeSchema.safeParse(parsed);
  const unwrapped=unwrapBackup<AppDb>(parsed);
  if(!desktop.success||!unwrapped)throw new Error('This is not a supported Health OS backup.');
  if(!Array.isArray(unwrapped.weeks)||!Array.isArray(unwrapped.sessions)||!unwrapped.meta?.createdAt)throw new Error('This desktop backup is incomplete and cannot be restored safely.');
  // The shared snapshot converter deliberately leaves out settings, OAuth
  // refresh tokens and desktop-only service configuration.
  return {format:'workout-os-backup',version:desktop.data.version,createdAt:desktop.data.exportedAt,records:clean(syncRecordsFromDb(unwrapped,'desktop-backup'))};
}
