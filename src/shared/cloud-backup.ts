import { validateRecord, canonical, type CloudRecord } from './cloud.js';
import type { AppDb } from './types.js';
import { syncRecordsFromDb } from './sync.js';

const preferenceKeys=['uxPreferences','version','units','weeklyGoal','restSeconds','aiProvider','aiModel','gender','theme','workoutReportEnabled','weeklyReportEnabled','monthlyReportEnabled','reportSchedule','emailTimezone'];
export function portableRecords(records:CloudRecord[]):CloudRecord[]{
  return records.filter(r=>!r.deletedAt&&r.entityType!=='encryptedVault').map(r=>({ ...r,cloudVersion:undefined,changeVersion:undefined,payload:r.entityType==='sharedPreferences'?Object.fromEntries(Object.entries(r.payload as Record<string,unknown>).filter(([key])=>preferenceKeys.includes(key))):r.payload }));
}
export function backupRecords(input:unknown):CloudRecord[]{
  if(!input||typeof input!=='object')throw new Error('Choose a Health OS JSON backup.');
  const data=input as Record<string,any>;
  if(!Array.isArray(data.cloudRecords)&&(!Array.isArray(data.weeks)||!Array.isArray(data.sessions)))throw new Error('This file is not a Health OS backup.');
  const source=Array.isArray(data.cloudRecords)?data.cloudRecords:syncRecordsFromDb(data as AppDb,'cloud-web-import');
  if(source.length>50000)throw new Error('This backup is too large for a single web import.');
  const records=source.map(validateRecord), keys=new Set<string>();
  for(const record of records){const key=`${record.entityType}:${record.id}`;if(keys.has(key))throw new Error('Backup contains duplicate record IDs.');keys.add(key);}
  return portableRecords(records);
}
export function compareBackup(incoming:CloudRecord[],current:CloudRecord[]){
  const index=new Map(current.filter(r=>!r.deletedAt).map(r=>[`${r.entityType}:${r.id}`,r]));
  return incoming.map(record=>{const previous=index.get(`${record.entityType}:${record.id}`);return {record,previous,status:!previous?'new':canonical(previous.payload)===canonical(record.payload)?'same':'conflict' as 'new'|'same'|'conflict'};});
}
