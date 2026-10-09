import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { openDB } from 'idb';
import { get, post } from '../lib/api';
import { bioSchema, type BioRecord, type BioKind, type BioDomain } from '../../shared/biology';
import { useCloudAccount } from './CloudAccountContext';
import { useApp } from './AppContext';
import { BiologicalCloudError, readBiologicalCloud, readRecentBiologicalCloud, readBiologicalDelta, writeBiologicalCloud, type BiologicalCloudRow } from '../lib/biology-cloud';
import { subscribeToCloudChanges } from '../lib/supabase-realtime';

function cache(scope = 'guest') {
  return openDB(scope === 'guest' ? 'body-os-biology-v1' : `health-os-biology-${scope}`, 4, { upgrade(db) {
    for (const store of ['records','outbox','bases','conflicts','cursors']) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
  } });
}
export type BioInput = { type: BioKind; domain: BioDomain; name: string; value?: number; unit?: string; timestamp?: string; endTime?: string; source?: string; sourceId?: string; quality?: BioRecord['quality']; metadata?: BioRecord['metadata']; id?: string };
interface BiologyState {
  records: BioRecord[]; ready: boolean; status: string; error: string; conflicts: BioRecord[]; fallbackRecords: number;
  save: (input: BioInput) => Promise<void>; saveMany: (inputs: BioInput[]) => Promise<void>; remove: (record: BioRecord) => Promise<void>; restore: (record: BioRecord) => Promise<void>; sync: () => Promise<void>;
  importRecords: (rows: unknown[]) => Promise<void>; adoptFallback: () => Promise<void>;
  resolveConflict: (id: string, side: 'cloud' | 'browser') => Promise<void>;
  undoBatch: (ids:string[], previous:BioRecord[]) => Promise<void>;
}
const Context = createContext<BiologyState>(null!);
export const useBiology = () => useContext(Context);
export function BiologyProvider({ children }: { children: ReactNode }) {
  const cloud = useCloudAccount(), app = useApp();
  const scope = cloud.user ? `${new URL(cloud.savedConfig!.url).hostname}-${cloud.user.id}` : 'guest';
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const [records, setRecords] = useState<BioRecord[]>([]), [ready, setReady] = useState(false), [status, setStatus] = useState('Loading records'), [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<BioRecord[]>([]), [fallbackRecords,setFallbackRecords] = useState(0);
  const syncing = useRef<string|null>(null), queuedSync = useRef<string|null>(null);
  const recentScope = useRef<string|null>(null);
  const historyDirty = useRef(false), continuation = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const refresh = async () => {
    const db=await cache(scope); const [rows, pendingConflicts]=await Promise.all([db.getAll('records'),db.getAll('conflicts')]);
    if(scopeRef.current===scope) { setRecords(rows);setConflicts(pendingConflicts.map(r=>r.payload)); }
  };
  const sync = async () => {
    if(syncing.current===scope){queuedSync.current=scope;return;}
    if(!app.unlocked || cloud.status==='loading') return;
    syncing.current=scope;
    try {
      const db=await cache(scope);
      if (cloud.user) {
        const session=await cloud.getSession();
        if(scopeRef.current!==scope) return;
        const mergePage=async(remote:BiologicalCloudRow[],cursor?:number)=>{
          if(scopeRef.current!==scope) return false;
          if(remote.length)historyDirty.current=true;
          const tx=db.transaction(['records','outbox','bases','cursors'],'readwrite');
          const pendingIds=new Set(await tx.objectStore('outbox').getAllKeys());
          await Promise.all(remote.filter(r=>!pendingIds.has(r.record_id)).flatMap(r=>[
            tx.objectStore('records').put(r.payload),tx.objectStore('bases').put({id:r.record_id,revision:r.revision}),
          ]));
          if(cursor!==undefined) await tx.objectStore('cursors').put({id:'biological',version:cursor});
          await tx.done;return true;
        };
        let cursor=(await db.get('cursors','biological'))?.version??0;
        if (recentScope.current !== scope) {
          if (!await mergePage(await readRecentBiologicalCloud(session))) return;
          await refresh();
          recentScope.current = scope;
          if (scopeRef.current === scope) setStatus('Loading older records from Supabase…');
        }
        let moreHistory=false;
        try {
          for(let batch=0;batch<4;batch++) {
            const page=await readBiologicalDelta(session,cursor);
            if(!await mergePage(page.records,page.cursor)) return;
            cursor=page.cursor;moreHistory=page.hasMore;if(!page.hasMore)break;
          }
        } catch(e) {
          // Existing independently configured projects can upgrade later.
          if(!(e instanceof BiologicalCloudError) || e.status!==404) throw e;
          if(!await mergePage(await readBiologicalCloud(session)))return;
        }
        if(scopeRef.current!==scope)return;
        const pending:BioRecord[]=await db.getAll('outbox');
        for(const r of pending) {
          if(await db.get('conflicts',r.id)) continue;
          const base=await db.get('bases',r.id);
          const result=await writeBiologicalCloud(session,r,base?.revision??null);
          if(result.status==='conflict') {await db.put('conflicts',{id:r.id,revision:result.revision,payload:result.payload});continue;}
          const ack=db.transaction(['records','outbox','bases'],'readwrite');
          await ack.objectStore('bases').put({id:r.id,revision:result.revision});
          const current=await ack.objectStore('outbox').get(r.id);
          if(current?.revision===r.revision) {await ack.objectStore('outbox').delete(r.id);await ack.objectStore('records').put({...r,syncState:'saved'});}
          await ack.done;
        }
        if(pending.length||(!moreHistory&&historyDirty.current)){await refresh();historyDirty.current=false;}
        if(moreHistory){clearTimeout(continuation.current);continuation.current=setTimeout(()=>{if(scopeRef.current===scope)void sync();},2000);}
        if(scopeRef.current===scope) setStatus((await db.count('conflicts'))?'Pending changes need review':(await db.count('outbox'))?'Changes queued for Supabase':moreHistory?'Loading older records…':'Synced with Supabase');
      } else {
        const pending:BioRecord[]=await db.getAll('outbox');
        for(let i=0;i<pending.length;i+=2000) {
          const chunk=pending.slice(i,i+2000), result=await post<{conflicts:BioRecord[]}>('/api/biology/batch',{records:chunk});
          const tx=db.transaction(['records','outbox','conflicts'],'readwrite');
          for(const conflict of result.conflicts) await tx.objectStore('conflicts').put({id:conflict.id,revision:conflict.revision,payload:conflict});
          for(const r of chunk) {const current=await tx.objectStore('outbox').get(r.id);if(current?.revision!==r.revision||result.conflicts.some(c=>c.id===r.id))continue;await tx.objectStore('outbox').delete(r.id);await tx.objectStore('records').put({...r,syncState:'saved'});}
          await tx.done;
        }
        const remote=await get<{records:BioRecord[]}>('/api/biology');const tx=db.transaction(['records','outbox'],'readwrite');
        for(const r of remote.records) if(!await tx.objectStore('outbox').get(r.id))await tx.objectStore('records').put(bioSchema.parse(r));
        await tx.done;await refresh();if(scopeRef.current===scope)setStatus('Offline fallback · sign in to sync');
        // Refresh training analytics only after the shared check-in reaches SQLite.
        // Offline readiness already works from the local record and stays usable.
        if(pending.some(r=>r.type==='checkIn')&&scopeRef.current===scope)void app.refresh().catch(()=>{});
      }
      if(scopeRef.current===scope)setError('');
    }catch(e){if(scopeRef.current===scope){setStatus(cloud.user?'Offline cache · sync pending':'Offline fallback');setError((e as Error).message);}}
    finally{if(syncing.current===scope)syncing.current=null;if(queuedSync.current===scope){queuedSync.current=null;if(scopeRef.current===scope)queueMicrotask(()=>void sync());}}
  };
  const persist=async(rows:BioRecord[])=>{
    if(scopeRef.current!==scope)throw new Error('Your account changed. Reopen this form.');
    const db=await cache(scope),tx=db.transaction(['records','outbox'],'readwrite');
    for(const r of rows){await tx.objectStore('records').put(r);await tx.objectStore('outbox').put(r);}
    await tx.done;await refresh();setStatus(cloud.user?'Saving to Supabase…':'Saved in offline fallback');void sync();
  };
  const cloudLoading=cloud.status==='loading';
  useEffect(()=>{
    setReady(false);setRecords([]);setConflicts([]);
    void refresh().then(()=>{if(scopeRef.current===scope)setReady(true);void sync();}).catch(e=>setError(e.message));
    if(cloud.user)void cache('guest').then(async db=>setFallbackRecords((await db.getAll('records')).filter(r=>!r.deletedAt).length));else setFallbackRecords(0);
    const online=()=>void sync(),timer=setInterval(online,30000);window.addEventListener('online',online);window.addEventListener('focus',online);
    const requested=()=>{recentScope.current=null;void sync();};window.addEventListener('health-os-sync-request',requested);
    let cancelled=false,stopRealtime:(()=>void)|undefined;
    if(cloud.user&&app.unlocked&&!cloudLoading)void cloud.getSession().then(session=>{
      if(!cancelled&&scopeRef.current===scope)stopRealtime=subscribeToCloudChanges(session.config,session.accessToken,session.uid,online,['health_os_biological_records'],async()=>{if(scopeRef.current!==scope)throw new Error('Account changed');return (await cloud.getSession()).accessToken;});
    }).catch(()=>{/* Offline polling retains the saved outbox. */});
    return()=>{cancelled=true;stopRealtime?.();window.removeEventListener('online',online);window.removeEventListener('focus',online);window.removeEventListener('health-os-sync-request',requested);clearTimeout(continuation.current);clearInterval(timer);};
  },[scope,app.unlocked,cloudLoading]);
  const saveMany=async(inputs:BioInput[])=>{
    if(inputs.length>100)throw new Error('Save up to 100 entries at a time');
    const db=await cache(scope),now=new Date().toISOString(),rows:BioRecord[]=[];
    let deviceId=localStorage.getItem('health-os-device-id');if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('health-os-device-id',deviceId);}
    for(const input of inputs){const id=input.id||crypto.randomUUID(),old:BioRecord|undefined=await db.get('records',id);rows.push(bioSchema.parse({...input,id,userId:cloud.user?.id||'local-user',source:input.source||'Health OS manual',deviceId,quality:input.quality||'manual',unit:input.unit||'',timestamp:input.timestamp||now,createdAt:old?.createdAt||now,updatedAt:now,revision:(old?.revision||0)+1,syncState:'pending',metadata:input.metadata||{}}));}
    await persist(rows);
  };
  const save=(input:BioInput)=>saveMany([input]);
  const undoBatch=async(ids:string[],previous:BioRecord[])=>{
    const db=await cache(scope),now=new Date().toISOString(),rows:BioRecord[]=[];
    for(const id of ids){const current:BioRecord|undefined=await db.get('records',id);if(!current)continue;const old=previous.find(r=>r.id===id);rows.push(bioSchema.parse({...old||current,...(old?{}:{deletedAt:now}),updatedAt:now,revision:current.revision+1,syncState:'pending'}));}
    await persist(rows);
  };
  const remove=async(record:BioRecord)=>persist([{...record,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:record.revision+1,syncState:'pending'}]);
  const restore=async(record:BioRecord)=>{const db=await cache(scope),current:BioRecord|undefined=await db.get('records',record.id);await persist([{...record,deletedAt:undefined,updatedAt:new Date().toISOString(),revision:(current?.revision||record.revision)+1,syncState:'pending'}]);};
  const importRecords=async(rows:unknown[])=>{
    if(rows.length>2000)throw new Error('Import at most 2,000 records at a time');
    const parsed=rows.map(r=>bioSchema.parse(r)),db=await cache(scope);const existing:BioRecord[]=await db.getAll('records'),imported:BioRecord[]=[];
    for(const r of parsed){if(existing.some(e=>(r.sourceId&&e.source===r.source&&e.sourceId===r.sourceId)||(e.id===r.id&&e.updatedAt>=r.updatedAt)))continue;const old=existing.find(e=>e.id===r.id);const next={...r,userId:cloud.user?.id||'local-user',revision:(old?.revision||0)+1,syncState:'pending' as const};imported.push(next);existing.push(next);}
    await persist(imported);
  };
  const adoptFallback=async()=>{const db=await cache('guest');await importRecords(await db.getAll('records'));setFallbackRecords(0);};
  const resolveConflict=async(id:string,side:'cloud'|'browser')=>{
    const db=await cache(scope);const conflict=await db.get('conflicts',id);if(!conflict)return;
    const tx=db.transaction(['records','outbox','bases','conflicts'],'readwrite');
    if(cloud.user)await tx.objectStore('bases').put({id,revision:conflict.revision});
    if(side==='cloud'){await tx.objectStore('records').put(conflict.payload);await tx.objectStore('outbox').delete(id);}
    else{const local=await tx.objectStore('records').get(id);const next={...local,revision:Math.max(local.revision,conflict.payload.revision)+1,updatedAt:new Date().toISOString(),syncState:'pending'};await tx.objectStore('records').put(next);await tx.objectStore('outbox').put(next);}
    await tx.objectStore('conflicts').delete(id);await tx.done;await refresh();void sync();
  };
  return <Context.Provider value={{records,ready,status,error,conflicts,fallbackRecords,save,saveMany,remove,restore,sync,importRecords,adoptFallback,resolveConflict,undoBatch}}>{children}</Context.Provider>;
}
