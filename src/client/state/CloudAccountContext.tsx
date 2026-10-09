import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { contentToken, type CloudConfig, type CloudRecord, type SyncChoice } from '../../shared/cloud';
import type { SyncRecord } from '../../shared/sync';
import { ACCOUNT_EVENT, SESSION_EVENT, activeSession, connectCloud, signOutCloud, storedSession } from '../lib/cloud-session';
import { subscribeToCloudChanges } from '../lib/supabase-realtime';
import { queryClient } from '../lib/query-client';
export type CloudStatus = 'loading' | 'signed-out' | 'saved' | 'syncing' | 'offline' | 'pending' | 'needs-review' | 'error';
type SyncResult = { uploaded: number; downloaded: number; conflicts: { key: string; local: SyncRecord; remote: CloudRecord }[] };
interface CloudState {
  user: { id: string; email: string } | null; status: CloudStatus; error: string | null;
  result: SyncResult | null; choices: Record<string, SyncChoice>; migrationRequired: boolean;
  migrationPreview: { localRecords: number; remoteRecords: number; upload: number; download: number; conflicts: number } | null;
  savedConfig: CloudConfig | null;
  getSession: typeof activeSession;
  connect(config: CloudConfig, email: string, password: string, create: boolean): Promise<void>;
  signOut(): Promise<void>; syncNow(): Promise<void>; choose(key: string, choice: SyncChoice | null): void; approveMigration(): Promise<void>;
}
const Context = createContext<CloudState | null>(null);
export function CloudAccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(storedSession);
  const [status, setStatus] = useState<CloudStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const changed = () => { queryClient.clear(); setSession(storedSession()); setStatus(storedSession() ? 'saved' : 'signed-out'); };
    const renewed = () => { setSession(storedSession()); setStatus('saved'); setError(null); };
    window.addEventListener(ACCOUNT_EVENT, changed);
    window.addEventListener(SESSION_EVENT, renewed);
    if (!storedSession()) setStatus('signed-out');
    else void activeSession().then(s => { if (alive) { setSession(s); setStatus('saved'); } }).catch(e => { if (alive) { setError(e.message); setStatus('error'); } });
    return () => { alive = false; window.removeEventListener(ACCOUNT_EVENT, changed); window.removeEventListener(SESSION_EVENT, renewed); };
  }, []);
  useEffect(() => {
    if (!session) return;
    const renew = () => { if (storedSession()) void activeSession().catch(e => setError(e.message)); };
    const timer = window.setInterval(renew, 30000);
    window.addEventListener('focus', renew); window.addEventListener('online', renew);
    return () => { clearInterval(timer); window.removeEventListener('focus', renew); window.removeEventListener('online', renew); };
  }, [session?.uid]);
  useEffect(() => {
    if (!session) return;
    const notify = () => window.dispatchEvent(new Event('body-os-cloud-refresh'));
    const unsubscribe = subscribeToCloudChanges(session.config, session.accessToken, session.uid, notify, ['body_os_records'], async () => {
      const current = await activeSession();
      if (current.uid !== session.uid || current.config.url !== session.config.url) throw new Error('Account changed.');
      return current.accessToken;
    });
    window.addEventListener('focus', notify);
    window.addEventListener('online', notify);
    return () => { unsubscribe(); window.removeEventListener('focus', notify); window.removeEventListener('online', notify); };
  }, [session]);
  async function connect(config: CloudConfig, email: string, password: string, create: boolean) {
    setError(null);
    try { const s = await connectCloud(email, password, create, config); setSession(s); setStatus('saved'); }
    catch (e) { setError((e as Error).message); setStatus('signed-out'); throw e; }
  }
  async function syncNow() {
    setStatus('syncing'); setError(null);
    try { await activeSession(); await queryClient.invalidateQueries(); window.dispatchEvent(new Event('body-os-cloud-refresh')); setStatus('saved'); }
    catch (e) { setError((e as Error).message); setStatus('error'); }
  }
  return <Context.Provider value={{ user: session ? { id: session.uid, email: session.email } : null, status, error, savedConfig: session?.config || null,
    result: null, choices: {}, migrationRequired: false, migrationPreview: null, connect, syncNow, getSession: activeSession,
    signOut: async () => { await signOutCloud(); setSession(null); setStatus('signed-out'); }, choose: () => {}, approveMigration: syncNow,
  }}>{children}</Context.Provider>;
}
export function useCloudAccount() { const value = useContext(Context); if (!value) throw new Error('CloudAccountProvider is required.'); return value; }
export function resolveConflictChoice(conflict: SyncResult['conflicts'][number], side: 'local' | 'remote'): SyncChoice { return { side, cloudVersion: conflict.remote.cloudVersion || '', localToken: contentToken(conflict.local) }; }
