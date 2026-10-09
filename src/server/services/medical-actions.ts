import { getDb, withTransaction } from '../db/connection.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { ensureAutomationTables, publishSourceEvent } from './automation-store.js';
import { listMedicalReports, medicalAudit } from './medical-store.js';
import { emptyMedicalActions, reconcileMedicalActions, type MedicalActionState } from '../../shared/medical-actions.js';
import type { BioRecord } from '../../shared/biology.js';
import type { DomainEvent } from '../../shared/automation-model.js';

function database(){const db=getDb();db.exec('CREATE TABLE IF NOT EXISTS medical_action_state (id TEXT PRIMARY KEY, data TEXT NOT NULL)');return db;}
export function readMedicalActions():MedicalActionState {const row=database().prepare("SELECT data FROM medical_action_state WHERE id='local-user'").get() as {data:string}|undefined;return row?JSON.parse(decryptSecret(row.data)):emptyMedicalActions();}
export function changeMedicalActions<T>(change:(state:MedicalActionState)=>T):T {
  const db=database();
  return withTransaction(()=>{
    // Reserve the writer before reading: WAL read-to-write upgrades cannot wait
    // when the background worker commits between the two operations.
    db.prepare("UPDATE medical_action_state SET id=id WHERE id='local-user'").run();
    const state=readMedicalActions(),result=change(state);
    db.prepare("INSERT INTO medical_action_state VALUES('local-user',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(encryptSecret(JSON.stringify(state)));
    return result;
  });
}
export function reconcileLocalMedical(records:BioRecord[],now=new Date().toISOString(),rebuild=false){
  ensureAutomationTables();
  const events=(getDb().prepare("SELECT data FROM domain_events WHERE user_id='local-user'").all() as {data:string}[]).map(r=>JSON.parse(decryptSecret(r.data)) as DomainEvent);
  const refs:Record<string,string[]>={};for(const e of events)if(e.source.recordId)(refs[e.source.recordId]||=[]).push(e.id);
  const reports=listMedicalReports();
  return changeMedicalActions(state=>{const before=new Map(state.inbox.map(i=>[i.id,`${i.status}:${i.sourceFingerprint}`]));if(rebuild){state.signalCache={};state.labCache=undefined;}reconcileMedicalActions(state,reports,records,now,refs);
    for(const i of state.inbox)if(before.get(i.id)!==`${i.status}:${i.sourceFingerprint}`){medicalAudit(`inbox-${i.status}`,i.id);if(i.metadata?.rule&&i.status==='pending')medicalAudit('clinical-rule-evidence-generated',i.id);publishSourceEvent(i.status==='expired'?'medical.inbox_item.resolved':'medical.inbox_item.created',i.id,now.slice(0,10),{fingerprint:i.sourceFingerprint,status:i.status});}
    if(rebuild)medicalAudit('derived-rebuild','local-user');return state;
  });
}
