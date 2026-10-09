import type { Request } from 'express';
import { ExerciseCatalogRepository, matchCachedExercise, type ExerciseInput, type CatalogSnapshot } from '../../shared/global-exercises.js';
import { DEFAULT_SUPABASE_CONFIG } from '../../shared/supabase-project.js';
import { getDb, withTransaction } from '../db/connection.js';
import * as repo from '../db/repository.js';
import type { Week } from '../../shared/types.js';

export function requestCatalog(req: Request): ExerciseCatalogRepository | undefined {
  const token = req.get('X-Body-OS-Supabase-Token');
  return token ? new ExerciseCatalogRepository(DEFAULT_SUPABASE_CONFIG, token) : undefined;
}
export function readCatalogCache(): CatalogSnapshot | undefined {
  getDb().exec('CREATE TABLE IF NOT EXISTS global_exercise_cache (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  const row = getDb().prepare('SELECT data FROM global_exercise_cache WHERE id=1').get() as {data: string} | undefined;
  return row ? JSON.parse(row.data) : undefined;
}
export function writeCatalogCache(delta: CatalogSnapshot): void {
  const old = readCatalogCache();
  const rows = new Map((delta.full ? [] : old?.exercises || []).map(e => [e.id,e]));
  for (const e of delta.exercises) rows.set(e.id,e);
  const merged: CatalogSnapshot = {...delta, lastFullSyncAt:delta.full?delta.syncedAt:old?.lastFullSyncAt, exercises: [...rows.values()]};
  getDb().prepare('INSERT INTO global_exercise_cache(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(merged));
}
let activeSync: Promise<void> | undefined;
export async function syncExerciseCatalog(catalog: ExerciseCatalogRepository): Promise<void> {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const old = readCatalogCache();
    // Full reconciliation once daily handles hard removals; media/aliases reconcile each sync.
    const since = old && old.lastFullSyncAt && Date.now() - Date.parse(old.lastFullSyncAt) < 24 * 60 * 60 * 1000 ? old.syncedAt : undefined;
    const delta = await catalog.sync(since);
    withTransaction(() => { writeCatalogCache(delta); migrateExerciseReferences(); });
  })();
  try { await activeSync; } finally { activeSync = undefined; }
}

/** Preserve names, set logs and local custom IDs. Only add canonical identity. */
export function migrateExerciseReferences(): void {
  const exercises = repo.listExercises();
  const db = repo.loadAppDb();
  for (const week of [...db.weeks, ...(db.librarySplits || [])]) {
    let changed = false;
    for (const day of week.days) for (const ex of day.exercises) {
      if (ex.exerciseId && exercises.some(e => e.id === ex.exerciseId && e.source !== 'supabase')) continue;
      const match = exercises.find(e => e.legacyId === ex.exerciseId) || matchCachedExercise(ex,exercises);
      if (match && ex.exerciseId !== match.id) { ex.exerciseId = match.id; changed = true; }
    }
    if (changed) {
      if (db.weeks.some(w => w.id === week.id)) repo.upsertWeek(week);
      else repo.saveLibrarySplit(week);
    }
  }
  for (const session of db.sessions) {
    let changed = false;
    for (const log of session.logs) {
      if(log.exerciseId && exercises.some(e=>e.id===log.exerciseId && e.source!=='supabase')) continue;
      const match = exercises.find(e => e.legacyId === log.exerciseId) || matchCachedExercise({name:log.name,exerciseId:log.exerciseId},exercises);
      if (match && log.exerciseId !== match.id) { log.exerciseId=match.id; changed=true; }
    }
    if (changed) repo.saveSession(session);
  }
}

export async function resolveWeekExercises<T extends Partial<Week>>(week: T, catalog?: ExerciseCatalogRepository): Promise<T> {
  const copy = structuredClone(week);
  const seen = new Map<string,string>();
  for (const day of copy.days || []) for (const ex of day.exercises || []) {
    const custom = repo.listExercises().find(e => e.id === ex.exerciseId && e.source !== 'supabase');
    if (custom) continue;
    const raw=ex as unknown as Record<string,unknown>;
    const input: ExerciseInput = {...ex,exerciseId:ex.exerciseId || (typeof raw.exercise_id==='string'?raw.exercise_id:undefined) || (typeof raw.id==='string'?raw.id:undefined)};
    const key = JSON.stringify([input.name,input.exerciseId,input.equipment,input.movementPattern]);
    const cached = matchCachedExercise(input,repo.listExercises());
    if (seen.has(key)) { ex.exerciseId=seen.get(key); continue; }
    try {
      if (catalog) {
        const result = await catalog.ensureExercise(input);
        ex.exerciseId = result.exerciseId;
        const old=readCatalogCache();
        writeCatalogCache({full:false,syncedAt:old?.syncedAt || '1970-01-01T00:00:00Z',exercises:[result.exercise],aliases:old?.aliases || [],media:old?.media || []});
      } else if (cached) ex.exerciseId=cached.id;
      if (ex.exerciseId) seen.set(key,ex.exerciseId);
    } catch {
      // Import is saved now. The next authenticated sync retries unresolved identities.
      if (cached) ex.exerciseId=cached.id;
    }
  }
  return copy;
}
export async function retryPendingExerciseReferences(catalog: ExerciseCatalogRepository): Promise<void> {
  for(const local of repo.listExercises().filter(e=>e.pendingGlobalResolution)) {
    try {
      const result=await catalog.ensureExercise(local);
      const old=readCatalogCache();
      writeCatalogCache({full:false,syncedAt:old?.syncedAt || '1970-01-01T00:00:00Z',exercises:[result.exercise],aliases:old?.aliases || [],media:old?.media || []});
      repo.saveExercise({...local,id:result.exerciseId,source:'supabase',pendingGlobalResolution:false});
      withTransaction(()=>{
        for(const table of ['weeks','library_splits','sessions','programs']) {
          const rows=getDb().prepare(`SELECT id,data FROM ${table}`).all() as {id:string;data:string}[];
          for(const row of rows) {
            const value=JSON.parse(row.data);
            const remap=(obj:any):void=>{if(!obj || typeof obj!=='object')return;if(obj.exerciseId===local.id)obj.exerciseId=result.exerciseId;for(const item of Object.values(obj))if(item && typeof item==='object')remap(item);};
            remap(value);
            if(JSON.stringify(value)!==row.data)getDb().prepare(`UPDATE ${table} SET data=? WHERE id=?`).run(JSON.stringify(value),row.id);
          }
        }
        repo.deleteExercise(local.id);
      });
    } catch { /* Retain the pending import and its personal metadata for retry. */ }
  }
  const db=repo.loadAppDb();
  for(const week of [...db.weeks,...(db.librarySplits || [])]) {
    if(!week.days.some(d=>d.exercises.some(e=>!e.exerciseId || e.exerciseId.startsWith('builtin-')))) continue;
    const resolved=await resolveWeekExercises(week,catalog);
    if(JSON.stringify(resolved)===JSON.stringify(week)) continue;
    if(db.weeks.some(w=>w.id===week.id)) repo.upsertWeek(resolved); else repo.saveLibrarySplit(resolved);
  }
}
