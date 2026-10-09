import { z } from 'zod';
import { SYNC_ENTITY_TYPES, SYNC_PROTOCOL_VERSION, type SyncAcknowledgement, type SyncDeltaPage, type SyncOperation, type SyncRecord } from './sync.js';
import { measurementInputSchema, sessionInputSchema } from './schemas.js';
import { healthReadingSchema } from './health.js';

export function createTimeoutSignal(ms:number):AbortSignal|undefined {
  if(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function')return AbortSignal.timeout(ms);
  if(typeof AbortController==='undefined')return undefined;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
  (timer as unknown as {unref?:()=>void}).unref?.();return controller.signal;
}

export interface CloudConfig { url: string; publishableKey: string; }
export interface CloudSession { uid: string; accessToken: string; }
export type CloudRecord = SyncRecord & { cloudVersion?: string; changeVersion?: number; localPayload?: unknown };
export type SyncChoice = { side: 'local' | 'remote'; cloudVersion: string; localToken: string };
const envelope = z.object({ id:z.string().min(1).max(200),entityType:z.enum(SYNC_ENTITY_TYPES),payload:z.record(z.string(),z.unknown()),updatedAt:z.string().min(1),revision:z.number().int().positive(),deviceId:z.string().min(1),deletedAt:z.string().optional(),workspace:z.string().min(1).max(80).optional(),payloadVersion:z.number().int().positive().optional(),createdAt:z.string().min(1).optional(),cloudVersion:z.string().optional() });
export function validateRecord(value:unknown):CloudRecord { const record=envelope.parse(value);if(!record.deletedAt){if(record.entityType==='session')sessionInputSchema.parse(record.payload);if(record.entityType==='measurement')measurementInputSchema.parse(record.payload);if(record.entityType==='healthReading')healthReadingSchema.parse(record.payload);}return record; }
export function canonical(value:unknown):string { if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(value)??'null'; }
export function sameContent(a?:SyncRecord,b?:SyncRecord):boolean { if(!a||!b)return a===b;return Boolean(a.deletedAt)===Boolean(b.deletedAt)&&canonical(a.payload)===canonical(b.payload); }
export function contentToken(record?:SyncRecord):string { return canonical(record?{payload:record.payload,deleted:Boolean(record.deletedAt)}:null); }
export function mergeDecision(local:SyncRecord|undefined,remote:CloudRecord|undefined,base?:SyncRecord):'same'|'upload'|'download'|'conflict' { if(sameContent(local,remote))return 'same';if(!local)return 'download';if(!remote)return 'upload';if(base&&sameContent(local,{...base,payload:(base as CloudRecord).localPayload??base.payload})&&sameContent(remote,base))return 'same';if(base&&sameContent(local,{...base,payload:(base as CloudRecord).localPayload??base.payload}))return 'download';if(base&&sameContent(remote,base))return 'upload';return 'conflict'; }
export class CloudConflictError extends Error { readonly status=409; constructor(){super('Cloud data changed during sync. Retry to review the latest conflict.');this.name='CloudConflictError';} }

export function normalizeCloudConfig(config:CloudConfig):CloudConfig { const url=String(config.url||'').trim().replace(/\/+$/,'');const publishableKey=String(config.publishableKey||'').trim();let parsed:URL;try{parsed=new URL(url);}catch{throw new Error('Enter a valid Supabase project URL.');}if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('Supabase project URL must use HTTPS.');if(!publishableKey)throw new Error('Enter the Supabase publishable key.');return {url,publishableKey}; }
function requestHeaders(config:CloudConfig,session:CloudSession,prefer?:string):HeadersInit { const safe=normalizeCloudConfig(config);return {apikey:safe.publishableKey,Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})}; }
function table(config:CloudConfig){return `${normalizeCloudConfig(config).url}/rest/v1/body_os_records`;}
function rpc(config:CloudConfig,name:string){return `${normalizeCloudConfig(config).url}/rest/v1/rpc/${name}`;}
type Row={user_id:string;entity_type:string;record_id:string;payload:Record<string,unknown>;updated_at:string;revision:number|string;device_id:string;deleted_at?:string|null;workspace?:string|null;payload_version?:number|string|null;created_at?:string|null;cloud_updated_at:string;change_version?:number|string|null};
function fromRow(row:Row):CloudRecord{return {...validateRecord({id:row.record_id,entityType:row.entity_type,payload:row.payload,updatedAt:row.updated_at,revision:Number(row.revision),deviceId:row.device_id,deletedAt:row.deleted_at||undefined,workspace:row.workspace||undefined,payloadVersion:row.payload_version?Number(row.payload_version):undefined,createdAt:row.created_at||undefined,cloudVersion:row.cloud_updated_at}),changeVersion:row.change_version?Number(row.change_version):undefined};}
function toRow(session:CloudSession,record:CloudRecord){return {user_id:session.uid,entity_type:record.entityType,record_id:record.id,payload:record.payload,updated_at:record.updatedAt,revision:record.revision,device_id:record.deviceId,deleted_at:record.deletedAt||null,workspace:record.workspace||null,payload_version:record.payloadVersion||null,created_at:record.createdAt||null};}
export async function readCloud(config:CloudConfig,session:CloudSession,options:{signal?:AbortSignal;onProgress?:(count:number)=>void;keyset?:boolean}={}):Promise<CloudRecord[]> {
  const select='user_id,entity_type,record_id,payload,updated_at,revision,device_id,deleted_at,workspace,payload_version,created_at,cloud_updated_at,change_version';
  const records:CloudRecord[]=[];
  if(options.keyset){
    // Indexed cursor paging avoids increasingly expensive OFFSET scans for large histories.
    // Continue until empty: a project's configured row cap can be below our requested limit.
    const values=new Map<string,CloudRecord>();let cursor=0;
    while(true){
      options.signal?.throwIfAborted();
      const response=await fetch(`${table(config)}?select=${select}&user_id=eq.${encodeURIComponent(session.uid)}&order=change_version.asc&limit=1000&change_version=gt.${cursor}`,{headers:requestHeaders(config,session),signal:options.signal||createTimeoutSignal(60000)});
      if(!response.ok)throw Object.assign(new Error(`Supabase read failed (${response.status}). Check your connection or sign in again.`),{status:response.status});
      const page=(await response.json() as Row[]).map(fromRow);if(!page.length)return [...values.values()];
      for(const record of page){if(!Number.isSafeInteger(record.changeVersion)||record.changeVersion!<=cursor)throw new Error('Cloud loading cursor did not advance. Retry loading your workspace.');values.set(`${record.entityType}:${record.id}`,record);}
      cursor=page.at(-1)!.changeVersion!;options.onProgress?.(values.size);
    }
  }
  // PostgREST caps responses. Always page; a first-page-only snapshot silently hides workouts.
  for(let offset=0;;offset+=500){
    const response=await fetch(`${table(config)}?select=${select}&user_id=eq.${encodeURIComponent(session.uid)}&order=change_version.asc&limit=500&offset=${offset}`,{headers:requestHeaders(config,session),signal:options.signal||createTimeoutSignal(60000)});
    if(!response.ok)throw new Error(`Supabase read failed (${response.status}). Check the project setup and sign in again.`);
    const page=await response.json() as Row[];
    records.push(...page.map(fromRow));
    if(page.length<500)return records;
  }
}
export async function writeCloud(config:CloudConfig,session:CloudSession,input:SyncRecord,previous?:CloudRecord):Promise<CloudRecord>{const record=validateRecord(input),body=JSON.stringify(toRow(session,record));let url=table(config),method='POST';if(previous){if(!previous.cloudVersion&&!previous.changeVersion)throw new Error('Missing cloud version; refresh before saving.');method='PATCH';url+=`?user_id=eq.${encodeURIComponent(session.uid)}&entity_type=eq.${encodeURIComponent(record.entityType)}&record_id=eq.${encodeURIComponent(record.id)}&${previous.cloudVersion?'cloud_updated_at=eq.'+encodeURIComponent(previous.cloudVersion):'change_version=eq.'+previous.changeVersion}`;}const response=await fetch(url,{method,headers:requestHeaders(config,session,'return=representation'),body,signal:AbortSignal.timeout(60000)});if([409,412].includes(response.status))throw new CloudConflictError();if(!response.ok)throw new Error(`Supabase save failed (${response.status}). Local changes remain pending.`);const rows=await response.json() as Row[];if(!rows[0])throw new CloudConflictError();return fromRow(rows[0]);}

function cleanRemote(value:Record<string,unknown>):SyncRecord & {changeVersion:number}{
  const candidate={...value};
  for(const key of ['deletedAt','workspace','payloadVersion','createdAt'])if(candidate[key]===null)delete candidate[key];
  const changeVersion=Number(candidate.changeVersion);
  if(!Number.isSafeInteger(changeVersion)||changeVersion<1)throw new Error('Supabase returned an invalid sync cursor.');
  delete candidate.changeVersion;
  return {...validateRecord(candidate),changeVersion};
}

export async function pullCloudDelta(config:CloudConfig,session:CloudSession,cursor=0,pageSize=250,signal?:AbortSignal):Promise<SyncDeltaPage>{
  const response=await fetch(rpc(config,'body_os_pull_delta'),{method:'POST',headers:requestHeaders(config,session),body:JSON.stringify({after_version:cursor,page_size:pageSize}),signal:signal||createTimeoutSignal(60000)});
  if(!response.ok)throw new Error(`Supabase delta read failed (${response.status}). Run the v5.1 Supabase setup and try again.`);
  const raw=await response.json() as {protocolVersion?:number;records?:Record<string,unknown>[];cursor?:number;hasMore?:boolean};
  if(raw.protocolVersion!==SYNC_PROTOCOL_VERSION)throw new Error('This Supabase project uses an incompatible Health OS sync protocol.');
  const records=(raw.records||[]).map(cleanRemote);
  return {protocolVersion:SYNC_PROTOCOL_VERSION,records,cursor:Number(raw.cursor||cursor),hasMore:Boolean(raw.hasMore)};
}

export async function pushCloudBatch(config:CloudConfig,session:CloudSession,operations:SyncOperation[]):Promise<SyncAcknowledgement[]>{
  if(!operations.length)return [];
  if(operations.length>100)throw new Error('A sync batch cannot contain more than 100 operations.');
  const response=await fetch(rpc(config,'body_os_push_batch'),{method:'POST',headers:requestHeaders(config,session),body:JSON.stringify({operations}),signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Supabase batch save failed (${response.status}). Local changes remain pending.`);
  const raw=await response.json() as {protocolVersion?:number;acknowledgements?:SyncAcknowledgement[]};
  if(raw.protocolVersion!==SYNC_PROTOCOL_VERSION||!Array.isArray(raw.acknowledgements))throw new Error('Supabase returned an invalid sync acknowledgement.');
  return raw.acknowledgements;
}
