import { useCallback, useEffect, useRef, useState } from 'react';
import { openDB } from 'idb';
import { useCloudAccount } from '../state/CloudAccountContext';

const writes = new Map<string, Promise<unknown>>();
async function database() {
  return openDB('health-os-ui-drafts', 1, { upgrade(db) { db.createObjectStore('drafts'); } });
}
export function draftScope(project: string, user: string) { return `${project.replace(/\/+$/, '')}|${user}`; }
export async function readDraft<T>(key: string): Promise<T | undefined> {
  const pending = writes.get(key); if (pending) await pending;
  const db = await database(); try { return (await db.get('drafts', key))?.value; } finally { db.close(); }
}
export function writeDraft(key: string, value: unknown, remove = false) {
  const next = (writes.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const db = await database();
    try { if (remove) await db.delete('drafts', key); else await db.put('drafts', { version: 1, value, updatedAt: new Date().toISOString() }, key); }
    finally { db.close(); }
  });
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => {});
  return next;
}

/** Account-scoped drafts survive interrupted sessions; only a successful save or explicit discard removes one. */
export function useDraftState<T>(workflow: string, initial: T | (() => T), redact: readonly string[] = []) {
  const cloud = useCloudAccount();
  const key = `${draftScope(cloud.savedConfig?.url || 'local', cloud.user?.id || 'guest')}|${workflow}`;
  const [value, update] = useState<T>(initial), [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const redactions = useRef(redact); redactions.current = redact;
  const initialValue=useRef(value), initialFactory=useRef(initial),activeKey=useRef(key);initialFactory.current=initial;
  const current = useRef(value), dirty = useRef(false), loaded = useRef(false), generation = useRef(0);
  current.current = value;
  const persist = useCallback(async () => {
    if (!dirty.current || !loaded.current) return false;
    const revision = generation.current;
    try { const safe = redactions.current.length && current.current && typeof current.current === 'object' ? Object.fromEntries(Object.entries(current.current).filter(([field])=>!redactions.current.includes(field))) : current.current;
    await writeDraft(key, safe); if (revision === generation.current) setStatus('Draft saved on this device'); return true; }
    catch { if(revision===generation.current)setStatus('Draft could not be saved on this device. Keep this page open and retry.'); return false; }
  }, [key]);
  useEffect(() => {
    if(activeKey.current!==key){activeKey.current=key;const factory=initialFactory.current;const fresh=typeof factory==='function'?(factory as ()=>T)():factory;initialValue.current=fresh;current.current=fresh;update(fresh);dirty.current=false;loaded.current=false;generation.current++;setReady(false);setStatus('');}
    let active = true;
    void readDraft<T>(key).then(saved => { if (active && saved !== undefined && !dirty.current) { const restored = saved && typeof saved === 'object' && !Array.isArray(saved) ? {...initialValue.current,...saved} : saved; current.current = restored; update(restored); setStatus('Draft restored from this device'); } })
      .catch(() => { if (active) setStatus('Draft storage is unavailable. Keep this page open until your save succeeds.'); })
      .finally(() => { if (active) { loaded.current = true; setReady(true); } });
    return () => { active = false; void persist(); };
  }, [key, persist]);
  useEffect(() => { if (!ready || !dirty.current) return; const timer = setTimeout(() => void persist(), 350); return () => clearTimeout(timer); }, [value, ready, persist]);
  useEffect(() => { const flush = () => { void persist(); }; window.addEventListener('pagehide', flush); return () => window.removeEventListener('pagehide', flush); }, [persist]);
  const setValue = useCallback((next: T | ((previous: T) => T)) => {
    dirty.current = true; generation.current++;
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(current.current) : next;
    current.current = resolved; update(resolved); setStatus('Saving draft…');
  }, []);
  const clear = useCallback(async () => {
    dirty.current = false; generation.current++;
    const revision=generation.current;
    try { await writeDraft(key, undefined, true); if(revision===generation.current)setStatus(''); return true; }
    catch { if(revision===generation.current)setStatus('Draft cleanup failed on this device. The saved record is unaffected.'); return false; }
  }, [key]);
  return { value, setValue, ready:ready&&activeKey.current===key, status, clear, persist };
}

/** Group fields in one durable snapshot instead of issuing one write per input. */
export function useDraftFields<T extends Record<string, unknown>>(workflow:string, initial:T|(()=>T), redact:readonly string[]=[]){
  const draft=useDraftState(workflow,initial,redact);
  function field<K extends keyof T>(name:K):[T[K],(next:T[K]|((previous:T[K])=>T[K]))=>void]{
    return [draft.value[name],next=>draft.setValue(previous=>({...previous,[name]:typeof next==='function'?(next as (value:T[K])=>T[K])(previous[name]):next}))];
  }
  return {...draft,field};
}
