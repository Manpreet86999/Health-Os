import { readCloud,writeCloud,type CloudConfig,type CloudSession } from '../../shared/cloud.js';
import { verifySupabaseSession } from '../../shared/supabase-auth.js';
import type { AppDb } from '../../shared/types.js';
import { resolveSyncRecord,syncKey,syncRecordsFromDb,type SyncConflict,type SyncRecord } from '../../shared/sync.js';

export async function supabaseSessionFromToken(config:CloudConfig,accessToken:string):Promise<CloudSession>{
  const user=await verifySupabaseSession(config,accessToken);
  return {uid:user.uid,accessToken};
}
export async function previewCloudSync(db:AppDb,config:CloudConfig,session:CloudSession,deviceId:string){
  const [remote,local]=await Promise.all([readCloud(config,session),Promise.resolve(syncRecordsFromDb(db,deviceId))]);
  const remoteByKey=new Map(remote.map(record=>[syncKey(record),record]));const conflicts:SyncConflict[]=[];let upload=0,download=0;
  for(const record of local){const resolution=resolveSyncRecord(record,remoteByKey.get(syncKey(record)),false);if(resolution?.kind==='use-local')upload++;if(resolution?.kind==='conflict')conflicts.push(resolution.conflict);}
  for(const record of remote)if(!local.some(item=>syncKey(item)===syncKey(record)))download++;
  return {localRecords:local.length,remoteRecords:remote.length,upload,download,conflicts};
}
export async function pushSupabaseRecords(config:CloudConfig,session:CloudSession,records:SyncRecord[]):Promise<void>{for(const record of records)await writeCloud(config,session,record);}
