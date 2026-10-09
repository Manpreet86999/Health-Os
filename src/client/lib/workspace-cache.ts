import { openDB } from 'idb';
import { validateRecord, type CloudRecord, type CloudConfig } from '../../shared/cloud';

type Scope = { uid: string; config: CloudConfig };
type CatalogEntry = Record<string, any> & { id: string };
const key = (r: CloudRecord) => `${r.entityType}:${r.id}`;
export const workspaceScope = (session: Scope) => `${session.config.url.replace(/\/+$/, '')}|${session.uid}`;
function database(session: Scope) {
  return openDB(`health-os-workspace-v1:${workspaceScope(session)}`, 1, {
    upgrade(db) {
      db.createObjectStore('records');
      db.createObjectStore('catalog', { keyPath: 'id' });
      db.createObjectStore('meta');
    },
  });
}

/** A cursor is usable only alongside the complete, atomically stored record set. */
export async function readWorkspaceCache(session: Scope) {
  let expired=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const read=async()=>{
  try {
    const db = await database(session);
    if(expired){db.close();return null;}
    try {
      const tx = db.transaction(['records', 'catalog', 'meta']);
      const [state, raw, catalog] = await Promise.all([
        tx.objectStore('meta').get('state'), tx.objectStore('records').getAll(), tx.objectStore('catalog').getAll(),
      ]);
      await tx.done;
      if (state?.version !== 1 || state.scope !== workspaceScope(session) || state.count !== raw.length || !Number.isSafeInteger(state.cursor) || state.cursor < 0) return null;
      const records = raw.map((r: CloudRecord) => {
        if (!Number.isSafeInteger(r.changeVersion) || r.changeVersion! < 1) throw new Error('Incomplete cached record');
        return { ...validateRecord(r), changeVersion: r.changeVersion };
      });
      return { records, catalog: catalog as CatalogEntry[], cursor: state.cursor };
    } finally { db.close(); }
  } catch { return null; } // Private browsing, eviction or an old/corrupt cache: fetch safely.
  };
  // An optional cache must not block cloud startup when IndexedDB stalls across tabs.
  try {
    return await Promise.race([read(),new Promise<null>(resolve=>{
      timer=setTimeout(()=>{expired=true;resolve(null);},2500);
    })]);
  } finally {if(timer!==undefined)clearTimeout(timer);}
}

/** Only changed rows are written; cursor and rows commit in the same transaction. */
export async function writeWorkspaceCache(session: Scope, records: CloudRecord[], catalog: CatalogEntry[], cursor?: number, replace = false, afterCursor?: number) {
  try {
    const db = await database(session);
    try {
      const tx = db.transaction(['records', 'catalog', 'meta'], 'readwrite');
      const rows = tx.objectStore('records'), details = tx.objectStore('catalog'), meta = tx.objectStore('meta');
      const previous = await meta.get('state');
      if (!replace && !previous) { await tx.done; return false; }
      if (!replace && previous && (previous.count !== await rows.count() || afterCursor !== undefined && previous.cursor < afterCursor)) {
        // Never bless an externally truncated cache with a newer cursor.
        await meta.delete('state'); await tx.done; return false;
      }
      if (replace) { await rows.clear(); await details.clear(); }
      // Another tab may already have stored a newer revision.
      await Promise.all(records.map(async record => {
        const old = replace ? undefined : await rows.get(key(record));
        if (!old || (record.changeVersion || 0) >= (old.changeVersion || 0)) await rows.put(record, key(record));
      }));
      await Promise.all(catalog.map(entry => details.put(entry)));
      // A save must not jump the pull cursor over changes made by another device.
      if (cursor !== undefined || previous) await meta.put({
        version: 1, scope: workspaceScope(session), count: await rows.count(),
        cursor: replace ? cursor : Math.max(previous?.cursor || 0, cursor || 0),
      }, 'state');
      await tx.done;
    } finally { db.close(); }
    return true;
  } catch { return false; } // Browser storage failure must never turn a cloud save into failure.
}
