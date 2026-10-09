import * as repo from '../db/repository.js';
import {medicalFileRecords,prepareMedicalFile,uploadMedicalFile,type MedicalFileRecord,type PreparedMedicalFile} from './medical-file-sync.js';
import {carePhotoRecords,prepareCarePhoto,uploadCarePhoto,type CarePhotoSyncRecord,type PreparedCarePhoto} from './care-photo-sync.js';
import {applySyncedMedicalReport} from './medical-store.js';
import {medicalActionRecords,applyMedicalActionRecord} from './medical-action-sync.js';
import { getDb, withTransaction } from '../db/connection.js';
import { SYNC_PROTOCOL_VERSION, syncKey, syncRecordsFromDb, type SharedPreferences, type SyncOperation, type SyncRecord } from '../../shared/sync.js';
import { stableOperationId } from '../../shared/sync-protocol.js';
import { contentToken, type SyncChoice, pullCloudDelta, pushCloudBatch, sameContent, validateRecord, type CloudConfig, type CloudRecord, type CloudSession } from '../../shared/cloud.js';
import { healthReadingSchema } from '../../shared/health.js';
import { CARE_SYNC_TYPES,careFromRecords,careRecords } from '../../shared/care-sync.js';
import { logFailure, logger } from '../lib/logger.js';

function tables() {
  getDb().exec(`CREATE TABLE IF NOT EXISTS cloud_bases (account TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(account,key));
    CREATE TABLE IF NOT EXISTS cloud_identity (id INTEGER PRIMARY KEY CHECK(id=1), account TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cloud_sync_state (account TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0, metrics TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS cloud_pending_ops (account TEXT NOT NULL, key TEXT NOT NULL, operation TEXT NOT NULL, PRIMARY KEY(account,key));
    CREATE TABLE IF NOT EXISTS cloud_conflicts (account TEXT NOT NULL, key TEXT NOT NULL, local_data TEXT NOT NULL, remote_data TEXT NOT NULL, detected_at TEXT NOT NULL, PRIMARY KEY(account,key));
    CREATE TABLE IF NOT EXISTS health_readings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS synced_extension_records (key TEXT PRIMARY KEY, data TEXT NOT NULL);`);
}
const stmtCache = new Map<string, any>();
function stmt(sql: string) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = getDb().prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}

function pendingOperations(account:string):Map<string,SyncOperation>{
  const rows=stmt('SELECT key,operation FROM cloud_pending_ops WHERE account=?').all(account) as {key:string;operation:string}[];
  return new Map(rows.map(row=>[row.key,JSON.parse(row.operation) as SyncOperation]));
}
function savePending(account:string,key:string,operation:SyncOperation){stmt('INSERT INTO cloud_pending_ops(account,key,operation) VALUES(?,?,?) ON CONFLICT(account,key) DO UPDATE SET operation=excluded.operation').run(account,key,JSON.stringify(operation));}
function deletePending(account:string,key:string){stmt('DELETE FROM cloud_pending_ops WHERE account=? AND key=?').run(account,key);}
function saveConflict(account:string,key:string,local:SyncRecord,remote:CloudRecord){stmt('INSERT INTO cloud_conflicts(account,key,local_data,remote_data,detected_at) VALUES(?,?,?,?,?) ON CONFLICT(account,key) DO UPDATE SET local_data=excluded.local_data,remote_data=excluded.remote_data,detected_at=excluded.detected_at').run(account,key,JSON.stringify(local),JSON.stringify(remote),new Date().toISOString());}
function deleteConflict(account:string,key:string){stmt('DELETE FROM cloud_conflicts WHERE account=? AND key=?').run(account,key);}
function listConflicts(account:string){return (stmt('SELECT key,local_data,remote_data FROM cloud_conflicts WHERE account=? ORDER BY detected_at').all(account) as {key:string;local_data:string;remote_data:string}[]).map(row=>({key:row.key,local:JSON.parse(row.local_data) as SyncRecord,remote:JSON.parse(row.remote_data) as CloudRecord}));}
function cursor(account:string):number{const row=stmt('SELECT cursor FROM cloud_sync_state WHERE account=?').get(account) as {cursor:number}|undefined;return Number(row?.cursor||0);}
function saveCursor(account:string,value:number){stmt("INSERT INTO cloud_sync_state(account,cursor,metrics) VALUES(?,?,'{}') ON CONFLICT(account) DO UPDATE SET cursor=excluded.cursor").run(account,value);}
export function saveSyncedExtension(record:SyncRecord){tables();stmt('INSERT INTO synced_extension_records(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(syncKey(record),JSON.stringify(record));}
export function getSyncedExtension(entityType:SyncRecord['entityType'],id:string):SyncRecord|undefined{tables();const row=stmt('SELECT data FROM synced_extension_records WHERE key=?').get(`${entityType}:${id}`) as {data:string}|undefined;return row?JSON.parse(row.data) as SyncRecord:undefined;}
export function listSyncedConversations(): SyncRecord[] {
  tables();
  const rows = stmt("SELECT data FROM synced_extension_records WHERE key LIKE 'conversation:%'").all() as { data: string }[];
  return rows.map(r => JSON.parse(r.data) as SyncRecord);
}
function sharedPreferencesRecord(deviceId:string):SyncRecord<SharedPreferences>{
  const settings=repo.getSettings(),profile=repo.getProfile();
  const row=stmt("SELECT max(updated_at) updated_at FROM (SELECT updated_at FROM settings UNION ALL SELECT updated_at FROM profiles)").get() as {updated_at?:string};
  const updatedAt=row.updated_at||new Date(0).toISOString();
  return {
    id:'shared-preferences',
    entityType:'sharedPreferences',
    payload:{
      version:1,
      units:profile.units,
      weeklyGoal:settings.weeklyGoal||4,
      restSeconds:settings.restSeconds||90,
      aiProvider:settings.aiProvider||'openrouter',
      aiModel:settings.aiModel||'openrouter/free',
      aiApiKey:settings.aiApiKey || '',
      openRouterApiKey:settings.openRouterApiKey || '',
      nvidiaNimApiKey:settings.nvidiaNimApiKey || '',
      tavilyApiKey:settings.tavilyApiKey || '',
      braveSearchApiKey:settings.braveSearchApiKey || '',
      gender:settings.gender,
      reportRecipients:settings.recipients||[],
      backupSchedule:settings.gdriveSchedule||'weekly',
      updatedAt
    },
    updatedAt,
    createdAt:updatedAt,
    revision:1,
    deviceId,
    workspace:'core',
    payloadVersion:1
  };
}
function bases(account: string): Map<string, CloudRecord> {
  tables();
  const rows = stmt('SELECT key,data FROM cloud_bases WHERE account=?').all(account) as {key:string;data:string}[];
  return new Map(rows.map(r => [r.key, JSON.parse(r.data)]));
}
function saveBase(account: string, record: CloudRecord) {
  stmt('INSERT INTO cloud_bases(account,key,data) VALUES(?,?,?) ON CONFLICT(account,key) DO UPDATE SET data=excluded.data').run(account, syncKey(record), JSON.stringify(record));
}
export function localSnapshot(base: Map<string, CloudRecord>, deviceId: string): Map<string, SyncRecord> {
  tables();
  const current = new Map(syncRecordsFromDb(repo.loadAppDb(), deviceId).map(r => [syncKey(r), r]));
  const extensionRows=stmt('SELECT key,data FROM synced_extension_records').all() as {key:string;data:string}[];
  for(const row of extensionRows){const record=JSON.parse(row.data) as SyncRecord;current.set(row.key,record);}
  for(const record of medicalFileRecords(deviceId))current.set(syncKey(record),record);
  for(const record of carePhotoRecords(deviceId))current.set(syncKey(record),record);
  for(const record of medicalActionRecords(base,deviceId))current.set(syncKey(record),record);
  const preferences=sharedPreferencesRecord(deviceId);current.set(syncKey(preferences),preferences);
  for (const [key, previous] of base) if (!current.has(key)) current.set(key, { ...previous, deletedAt: previous.deletedAt || new Date().toISOString(), deviceId });
  return current;
}
const tablesByType: Partial<Record<SyncRecord['entityType'], string>> = {
  session:'sessions', week:'weeks', librarySplit:'library_splits', readiness:'readiness', target:'targets', measurement:'measurements', habit:'habits', habitLog:'habit_logs',
  cardio:'cardio_sessions', goalCheckIn:'goal_check_ins', weeklyReview:'weekly_reviews', exercise:'exercise_library', program:'programs', painLog:'pain_logs', scheduledWorkout:'scheduled_workouts',
  skinProduct:'skin_products', skinRoutine:'skin_routines', skinLog:'skin_logs', healthReading:'health_readings',
};
function applyRecord(raw: CloudRecord,preparedMedical?:PreparedMedicalFile,preparedCare?:PreparedCarePhoto) {
  const record = validateRecord(raw);
  if(record.entityType==='medicalFollowUp'||record.entityType==='doctorQuestion'){applyMedicalActionRecord(record);return;}
  if(record.entityType==='medicalReport') {
    if(record.deletedAt)applySyncedMedicalReport(record as MedicalFileRecord);
    else {if(!preparedMedical)throw new Error('Verify the medical original before applying cloud metadata.');preparedMedical.apply();}
    return;
  }
  if(record.entityType==='carePhoto') {
    if(record.deletedAt)repo.deleteCarePhoto(record.id);
    else {if(!preparedCare)throw new Error('Verify the care photo before applying cloud metadata.');preparedCare.apply();}
    return;
  }
  const careType=(CARE_SYNC_TYPES as readonly string[]).includes(record.entityType);
  if(careType){
    const current=new Map(careRecords(repo.getCareData(),'desktop').map(item=>[syncKey(item),item]));
    if(record.deletedAt)current.delete(syncKey(record));else current.set(syncKey(record),record);
    repo.replaceCareDataFromSync(careFromRecords([...current.values()]));
    return;
  }
  if (record.deletedAt) {
    const table = tablesByType[record.entityType];
    if (!table) {
      if (['sharedPreferences','encryptedVault','workoutDraft','reportJob','conversation'].includes(record.entityType)) {
        stmt('DELETE FROM synced_extension_records WHERE key=?').run(syncKey(record));
        return;
      }
      throw new Error('A profile or settings record cannot be deleted through sync.');
    }
    if (record.entityType === 'session') stmt('DELETE FROM session_sets WHERE session_id=?').run(record.id);
    stmt(`DELETE FROM ${table} WHERE id=?`).run(record.id);
    return;
  }
  const value = { ...(record.payload as object), id: record.id };
  const writers = {
    week: repo.upsertWeek, librarySplit: repo.saveLibrarySplit, session: repo.saveSession, readiness: repo.saveReadiness, target: repo.saveTarget,
    measurement: repo.saveMeasurement, habit: repo.saveHabit, habitLog: repo.saveHabitLog, cardio: repo.saveCardioSession,
    goalCheckIn: repo.saveGoalCheckIn, weeklyReview: repo.saveWeeklyReview, exercise: repo.saveExercise,
    program: repo.saveProgram, painLog: repo.savePainLog, scheduledWorkout: repo.saveScheduledWorkout,
    profile: repo.saveProfile, trainingConfig: repo.saveTrainingConfig, skinProfile: repo.saveSkinProfile,
    skinProduct: repo.saveSkinProduct, skinRoutine: repo.saveSkinRoutine, skinLog: repo.saveSkinLog, skinCareData: repo.saveCareData,
  };
  if (record.entityType === 'workspaceState') {
    const active=(value as {activeWeekId?:unknown}).activeWeekId;
    if(typeof active!=='string')throw new Error('Invalid active plan setting.');
    repo.setActiveWeekId(active);
  } else if (record.entityType === 'healthReading') {
    const reading = healthReadingSchema.parse(value);
    stmt('INSERT INTO health_readings(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(record.id, JSON.stringify(reading));
  } else if(record.entityType==='sharedPreferences'){
    const preferences=value as unknown as SharedPreferences;
    if(preferences.version!==1||!['kg','lb'].includes(preferences.units)||!Number.isFinite(preferences.restSeconds))throw new Error('Invalid shared preferences record.');
    repo.saveProfile({...repo.getProfile(),units:preferences.units});
    const updateSettings: any = {
      weeklyGoal:Math.max(1,Math.min(14,Number(preferences.weeklyGoal)||4)),
      restSeconds:Math.max(0,Math.min(600,Number(preferences.restSeconds)||90)),
      aiProvider:String(preferences.aiProvider||'openrouter'),
      aiModel:String(preferences.aiModel||'openrouter/free'),
      recipients:Array.isArray(preferences.reportRecipients)?preferences.reportRecipients.map(String):[],
      gdriveSchedule:['daily','weekly','monthly'].includes(preferences.backupSchedule)?preferences.backupSchedule:'weekly'
    };
    if (typeof preferences.aiApiKey === 'string' && preferences.aiApiKey) updateSettings.aiApiKey = preferences.aiApiKey;
    if (typeof preferences.openRouterApiKey === 'string' && preferences.openRouterApiKey) updateSettings.openRouterApiKey = preferences.openRouterApiKey;
    if (typeof preferences.nvidiaNimApiKey === 'string' && preferences.nvidiaNimApiKey) updateSettings.nvidiaNimApiKey = preferences.nvidiaNimApiKey;
    if (typeof preferences.tavilyApiKey === 'string' && preferences.tavilyApiKey) updateSettings.tavilyApiKey = preferences.tavilyApiKey;
    if (typeof preferences.braveSearchApiKey === 'string' && preferences.braveSearchApiKey) updateSettings.braveSearchApiKey = preferences.braveSearchApiKey;
    if (preferences.gender === 'male' || preferences.gender === 'female') updateSettings.gender = preferences.gender;
    repo.saveSettings(updateSettings);
  } else {
    if (record.entityType === 'session') {
      const s = value as { status?: string };
      if (s.status === 'completed' || !s.status) s.status = 'finished';
    }
    const writer = writers[record.entityType as keyof typeof writers];
    if (writer) writer(value as never);
    else stmt('INSERT INTO synced_extension_records(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(syncKey(record),JSON.stringify(record));
  }
}
let running = false;
export async function runDesktopSync(config: CloudConfig, session: CloudSession, deviceId: string, choices: Record<string, SyncChoice> = {}, allowAccountMigration = false) {
  if (running) throw new Error('Sync is already running.');
  running = true;
  try {
    const account = `${config.url}/${session.uid}`;
    let base = bases(account);
    const identity=stmt('SELECT account FROM cloud_identity WHERE id=1').get() as {account:string}|undefined;
    const previousAccounts=stmt('SELECT account FROM cloud_identity').all() as {account:string}[];
    const accountChanged=(identity&&identity.account!==account)||previousAccounts.some(row=>row.account!==account);
    if(accountChanged&&!allowAccountMigration)throw new Error('These local records belong to another cloud account. Review the first Supabase migration before switching.');
    if(accountChanged&&allowAccountMigration){withTransaction(()=>{stmt('DELETE FROM cloud_bases').run();stmt('DELETE FROM cloud_pending_ops').run();stmt('DELETE FROM cloud_conflicts').run();stmt('DELETE FROM cloud_sync_state').run();stmt('DELETE FROM cloud_identity').run();});base=new Map();}
    stmt('INSERT OR REPLACE INTO cloud_identity(id,account) VALUES(1,?)').run(account);
    for(const conflict of listConflicts(account)){
      if (conflict.key === 'sharedPreferences:shared-preferences') {
        const localPayload = (conflict.local?.payload || {}) as Record<string, any>;
        const remotePayload = (conflict.remote?.payload || {}) as Record<string, any>;
        const mergedPayload = { ...remotePayload };
        for (const k of ['aiApiKey', 'openRouterApiKey', 'nvidiaNimApiKey', 'tavilyApiKey', 'braveSearchApiKey']) {
          if (!mergedPayload[k] && localPayload[k]) mergedPayload[k] = localPayload[k];
        }
        conflict.remote.payload = mergedPayload;
        withTransaction(() => {
          applyRecord(conflict.remote);
          saveBase(account, conflict.remote);
          deletePending(account, conflict.key);
          deleteConflict(account, conflict.key);
        });
        continue;
      }
      const choice=choices[conflict.key];
      if(!choice||choice.localToken!==contentToken(conflict.local)||choice.cloudVersion!==String(conflict.remote.changeVersion||''))continue;
      if(choice.side==='remote') {
        const preparedMed=conflict.remote.entityType==='medicalReport'?await prepareMedicalFile(config,session,conflict.remote as MedicalFileRecord):undefined;
        const preparedCare=conflict.remote.entityType==='carePhoto'?await prepareCarePhoto(config,session,conflict.remote as CarePhotoSyncRecord):undefined;
        try {withTransaction(()=>{applyRecord(conflict.remote,preparedMed,preparedCare);saveBase(account,conflict.remote);deletePending(account,conflict.key);deleteConflict(account,conflict.key);});}
        finally {preparedMed?.dispose();preparedCare?.dispose();}
      }
      else withTransaction(()=>{saveBase(account,conflict.remote);deleteConflict(account,conflict.key);});
    }
    let uploaded = 0, downloaded = 0;
    const pullChanges=async()=>{
      let nextCursor=cursor(account),hasMore=true;
      let baseMap = bases(account);
      let localMap = localSnapshot(baseMap, deviceId);
      let pendingMap = pendingOperations(account);
      while(hasMore){
        const page=await pullCloudDelta(config,session,nextCursor);
        const preparedMed=new Map<string,PreparedMedicalFile>();
        const preparedCare=new Map<string,PreparedCarePhoto>();
        try {
          for(const record of page.records){
            if(record.entityType==='medicalReport' && !record.deletedAt)preparedMed.set(syncKey(record),await prepareMedicalFile(config,session,record as MedicalFileRecord));
            if(record.entityType==='carePhoto' && !record.deletedAt)preparedCare.set(syncKey(record),await prepareCarePhoto(config,session,record as CarePhotoSyncRecord));
          }
        withTransaction(()=>{
          for(const remoteRecord of page.records){
            const remote={...remoteRecord,cloudVersion:String(remoteRecord.changeVersion)} as CloudRecord,key=syncKey(remote);
            const currentBase=baseMap.get(key),current=localMap.get(key),pendingNow=pendingMap.get(key);

            // Auto-merge preferences to preserve configured API keys when remote lacks them
            if (remote.entityType === 'sharedPreferences' && current?.entityType === 'sharedPreferences') {
              const localPayload = (current.payload || {}) as Record<string, any>;
              const remotePayload = (remote.payload || {}) as Record<string, any>;
              const mergedPayload = { ...remotePayload };
              for (const k of ['aiApiKey', 'openRouterApiKey', 'nvidiaNimApiKey', 'tavilyApiKey', 'braveSearchApiKey']) {
                if (!mergedPayload[k] && localPayload[k]) mergedPayload[k] = localPayload[k];
              }
              remote.payload = mergedPayload;
              if (!sameContent(current, remote)) {
                applyRecord(remote);
                downloaded++;
              }
              saveBase(account, remote);
              baseMap.set(key, remote);
              localMap.set(key, remote);
              deleteConflict(account, key);
              deletePending(account, key);
              pendingMap.delete(key);
              continue;
            }

            if(pendingNow&&!sameContent(pendingNow.record,remote)){saveConflict(account,key,pendingNow.record,remote);continue;}
            if(currentBase&&current&&!sameContent(current,currentBase)&&!sameContent(remote,currentBase)){saveConflict(account,key,current,remote);continue;}
            if(!currentBase&&current&&!sameContent(current,remote)){
              // Fresh installations often contain untouched defaults. Prefer established cloud data.
              const untouchedDefault=Number(current.revision)<=1&&['profile','exercise','skinProfile','skinRoutine','sharedPreferences'].includes(current.entityType);
              if(!untouchedDefault){saveConflict(account,key,current,remote);continue;}
            }
            if(!sameContent(current,remote)){applyRecord(remote,preparedMed.get(key),preparedCare.get(key));localMap.set(key,remote);downloaded++;}
            saveBase(account,remote);baseMap.set(key,remote);deletePending(account,key);pendingMap.delete(key);
          }
          saveCursor(account,page.cursor);
        });
        } finally {
          for(const item of preparedMed.values())item.dispose();
          for(const item of preparedCare.values())item.dispose();
        }
        nextCursor=page.cursor;hasMore=page.hasMore;
      }
      return nextCursor;
    };
    // Pull first so a fresh device cannot upload its defaults over established cloud data.
    await pullChanges();
    base=bases(account);
    const local = localSnapshot(base, deviceId), blocked=new Set(listConflicts(account).map(item=>item.key));
    let pending=pendingOperations(account);
    for(const [key,record] of local){
      if(blocked.has(key)||pending.has(key)||sameContent(record,base.get(key)))continue;
      const operation:SyncOperation={protocolVersion:SYNC_PROTOCOL_VERSION,operationId:stableOperationId(record),expectedChangeVersion:base.get(key)?.changeVersion??null,record};
      savePending(account,key,operation);pending.set(key,operation);
    }
    const operations=[...pending.values()];
    for(let offset=0;offset<operations.length;offset+=100){
      const batch=operations.slice(offset,offset+100);
      for(const operation of batch){
        if(operation.record.entityType==='medicalReport')await uploadMedicalFile(config,session,operation.record as MedicalFileRecord);
        if(operation.record.entityType==='carePhoto')await uploadCarePhoto(config,session,operation.record as CarePhotoSyncRecord);
      }
      const acks=await pushCloudBatch(config,session,batch);
      withTransaction(()=>{for(const ack of acks){const operation=batch.find(item=>item.operationId===ack.operationId);if(!operation)continue;const key=syncKey(operation.record);if(ack.status==='conflict'&&ack.record){const remote={...ack.record,changeVersion:ack.changeVersion,cloudVersion:String(ack.changeVersion)} as CloudRecord;saveConflict(account,key,operation.record,remote);continue;}saveBase(account,{...operation.record,changeVersion:ack.changeVersion,cloudVersion:String(ack.changeVersion)});deletePending(account,key);deleteConflict(account,key);uploaded++;}});
    }
    const nextCursor=await pullChanges();
    const conflicts=listConflicts(account);
    logger.info({event:'sync.completed',uploaded,downloaded,conflicts:conflicts.length,queueSize:pendingOperations(account).size,cursor:nextCursor}, 'Sync completed');
    return {uploaded,downloaded,conflicts};
  } catch(error) { logFailure('sync.failed',error); throw error; }
  finally { running = false; }
}
