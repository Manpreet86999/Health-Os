import { getDb, withTransaction } from '../db/connection.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { domainEventSchema, emptyAutomationState, fingerprint, type AutomationState, type DomainEvent } from '../../shared/automation-model.js';

/** Additive local schema. Source tables and existing backups remain untouched. */
export function ensureAutomationTables(){
  const db=getDb();db.exec(`
    CREATE TABLE IF NOT EXISTS domain_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, user_id TEXT NOT NULL, occurred_at TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS automation_runs (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, automation_key TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, output_refs TEXT NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS automation_cache (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS automation_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS automation_inbox (id TEXT PRIMARY KEY, status TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS automation_event_time ON domain_events(occurred_at);
    CREATE INDEX IF NOT EXISTS automation_job_status ON automation_jobs(status);
  `);return db;
}
export function persistDomainEvent(input:DomainEvent){
  const event=domainEventSchema.parse(input),db=ensureAutomationTables();
  db.prepare('INSERT OR IGNORE INTO domain_events(id,type,user_id,occurred_at,data,created_at) VALUES(?,?,?,?,?,?)').run(event.id,event.type,event.userId,event.occurredAt,encryptSecret(JSON.stringify(event)),event.createdAt);
}
export function publishSourceEvent(type:string,recordId:string,date:string,payload:unknown,previousDate?:string){
  // Source commits must succeed even when the event subsystem needs repair.
  try{const now=new Date().toISOString();persistDomainEvent({id:`source:${type}:${recordId}:${fingerprint(payload)}`,type,userId:'local-user',occurredAt:/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(`${date}T12:00:00`).toISOString():now,createdAt:now,schemaVersion:1,source:{kind:'user',recordId},payload:{date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:now.slice(0,10),previousDate,revision:fingerprint(payload)}});wake?.();}catch(e){console.error('[Health OS automation] Source saved; event capture will be repaired by the next source sweep.',(e as Error).message);}
}
let wake:(()=>void)|undefined;
export function setAutomationWake(callback:()=>void){wake=callback;}
export function readAutomationState():AutomationState{
  const row=ensureAutomationTables().prepare("SELECT data FROM automation_cache WHERE id='state'").get() as {data:string}|undefined;
  return row?JSON.parse(decryptSecret(row.data)):emptyAutomationState();
}
export function writeAutomationState(state:AutomationState){
  const db=ensureAutomationTables();withTransaction(()=>{
    db.prepare("INSERT INTO automation_cache(id,data,updated_at) VALUES('state',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").run(encryptSecret(JSON.stringify(state)),state.updatedAt);
    const persistedEvents=new Set((db.prepare('SELECT id FROM domain_events').all() as {id:string}[]).map(e=>e.id));
    for(const event of state.events)if(!persistedEvents.has(event.id)){persistDomainEvent(event);persistedEvents.add(event.id);}
    const run=db.prepare('INSERT INTO automation_runs(id,event_id,automation_key,version,status,started_at,completed_at,output_refs,error) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at,output_refs=excluded.output_refs,error=excluded.error');
    for(const r of Object.values(state.runs))run.run(r.id,r.eventId,r.automationKey,r.version,r.status,r.startedAt,r.completedAt||null,JSON.stringify(r.outputRefs),r.error||null);
    const job=db.prepare('INSERT INTO automation_jobs(id,status,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data');for(const j of Object.values(state.jobs))job.run(j.id,j.status,encryptSecret(JSON.stringify(j)));
    const item=db.prepare('INSERT INTO automation_inbox(id,status,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data');for(const i of Object.values(state.inbox))item.run(i.id,i.status,encryptSecret(JSON.stringify(i)));
  });
}
