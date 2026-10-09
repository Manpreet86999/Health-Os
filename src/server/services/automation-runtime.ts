import { Worker } from 'node:worker_threads';
import { effectiveCare } from '../../shared/automation-care.js';
import * as repo from '../db/repository.js';
import { getDb } from '../db/connection.js';
import { decryptSecret } from '../lib/secrets.js';
import { effectiveBiology } from '../../shared/legacy-biology.js';
import type { BioRecord } from '../../shared/biology.js';
import { reconcileAutomations, drainAutomationJobs, processDomainEvent } from '../../shared/automation-engine.js';
import type { Dataset, DomainEvent } from '../../shared/automation-model.js';
import { ensureAutomationTables, readAutomationState, setAutomationWake, writeAutomationState } from './automation-store.js';
import { reconcileLocalMedical } from './medical-actions.js';

export function automationDataset():Dataset{
  const db=repo.loadAppDb();const exists=getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='biological_records'").get();
  const records:BioRecord[]=exists?(getDb().prepare('SELECT data FROM biological_records').all() as {data:string}[]).map(r=>JSON.parse(decryptSecret(r.data))):[];
  return {db,photoDates:repo.listCarePhotos().map(p=>({id:p.id,date:p.date})),skin:effectiveCare(repo.loadSkinState(),records),records:[...effectiveBiology(db,records),...records.filter(r=>r.deletedAt)],userId:'local-user'};
}
export function runServerAutomations(rebuild=false,now=new Date()){
  ensureAutomationTables();const state=readAutomationState(),data=automationDataset();
  const knownEvents=new Set(state.events.map(e=>e.id));
  const saved=(getDb().prepare('SELECT id,data FROM domain_events WHERE user_id=? ORDER BY created_at').all('local-user') as {id:string;data:string}[]).filter(r=>!knownEvents.has(r.id)).map(r=>JSON.parse(decryptSecret(r.data)) as DomainEvent);
  reconcileAutomations(data,state,now,rebuild,saved);drainAutomationJobs(data,state,now);writeAutomationState(state);reconcileLocalMedical(data.records,now.toISOString(),rebuild);return state;
}
let started=false,pending=false;
export function startAutomationRuntime(){
  if(started)return;started=true;
  const run=()=>{
    if(pending)return;pending=true;
    // Calculation and encrypted cache writes run away from the HTTP event loop.
    const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const runtime=workerData.endsWith('.ts')?await (await import('tsx/esm/api')).tsImport(workerData,workerData):await import(workerData);runtime.runServerAutomations();parentPort.postMessage({ok:true});})().catch(error=>parentPort.postMessage({error:error.message}));`,{eval:true,workerData:import.meta.url});
    worker.unref();
    worker.once('message',(result:{error?:string})=>{if(result.error)console.error('[Health OS automation] Retryable background error:',result.error);void worker.terminate();});
    worker.once('error',error=>console.error('[Health OS automation] Retryable background error:',error.message));
    worker.once('exit',()=>{pending=false;});
  };
  setAutomationWake(run);run();setInterval(run,60000).unref();
}
