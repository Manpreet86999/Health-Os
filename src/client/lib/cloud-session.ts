import { refreshSupabaseSession, supabaseSignIn, supabaseSignUp, type SupabaseAccountSession } from '../../shared/supabase-auth';
import { DEFAULT_SUPABASE_CONFIG } from '../../shared/supabase-project';
import type { CloudConfig } from '../../shared/cloud';

const KEY = 'body-os-supabase-session-v1';
export const ACCOUNT_EVENT = 'body-os-account-changed';
export const SESSION_EVENT = 'health-os-session-refreshed';
let pending: { scope: string; task: Promise<SupabaseAccountSession> } | null = null;
const scope = (s: SupabaseAccountSession) => `${s.config.url}|${s.uid}`;
export function storedSession(): SupabaseAccountSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && typeof s.uid === 'string' && typeof s.accessToken === 'string' && typeof s.refreshToken === 'string' && Number.isFinite(s.expiresAt) && typeof s.config?.url === 'string' && typeof s.config?.publishableKey === 'string' ? s : null;
  } catch { return null; }
}
export function saveSession(session: SupabaseAccountSession | null) {
  if (session) localStorage.setItem(KEY, JSON.stringify(session));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(ACCOUNT_EVENT));
}
export async function activeSession(): Promise<SupabaseAccountSession> {
  const current = storedSession();
  if (!current) throw Object.assign(new Error('Sign in to your Health OS account.'), { status: 401 });
  if (Date.now() < current.expiresAt) return current;
  const identity = scope(current);
  if (pending?.scope === identity) return pending.task;
  const refresh = async () => {
    // Re-read under the browser lock: another tab may have rotated the token.
    const latest = storedSession();
    if (!latest || scope(latest) !== identity) throw new Error('Account changed. Please sign in again.');
    if (Date.now() < latest.expiresAt) return latest;
    try {
      const next = await refreshSupabaseSession(latest);
      const saved = storedSession();
      if (!saved || scope(saved) !== identity) throw new Error('Account changed. Please sign in again.');
      if (saved.refreshToken !== latest.refreshToken) {
        if (saved.expiresAt > Date.now()) return saved;
        throw new Error('Your session changed in another tab. Retry connecting.');
      }
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SESSION_EVENT));
      return next;
    } catch (error) {
      const saved = storedSession();
      if (saved && scope(saved) === identity && saved.refreshToken !== latest.refreshToken && saved.expiresAt > Date.now()) return saved;
      const e = error as Error & {status?: number; code?: string};
      // Retain the session on network errors, timeouts and temporary server failures.
      if (saved?.refreshToken === latest.refreshToken && (e.status === 401 || ['refresh_token_not_found','refresh_token_already_used','session_not_found','user_banned','user_not_found'].includes(e.code || ''))) saveSession(null);
      throw error;
    }
  };
  const task = (async () => navigator.locks ? await navigator.locks.request(`health-os-auth:${identity}`, {signal:AbortSignal.timeout(20000)}, refresh) : await refresh())().finally(() => { if (pending?.task === task) pending = null; });
  pending = { scope: identity, task };
  return task;
}

window.addEventListener('storage', event => {
  if (event.key !== KEY && event.key !== null) return;
  let before: SupabaseAccountSession | null = null;
  try { before = event.oldValue ? JSON.parse(event.oldValue) : null; } catch { /* Recheck current storage. */ }
  const after = storedSession();
  window.dispatchEvent(new Event(before && after && scope(before) === scope(after) ? SESSION_EVENT : ACCOUNT_EVENT));
});
export async function connectCloud(email: string, password: string, create: boolean, config: CloudConfig = DEFAULT_SUPABASE_CONFIG) {
  const session = await (create ? supabaseSignUp : supabaseSignIn)(config, email, password);
  saveSession(session);
  return session;
}
export async function signOutCloud() {
  const session = storedSession();
  saveSession(null);
  if (session) await fetch(`${session.config.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: session.config.publishableKey, Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(10000) }).catch(() => {});
}
export async function invokeCloud(name: string, body: unknown): Promise<any> {
  const session = await activeSession();
  const response = await fetch(`${session.config.url}/functions/v1/${name}`, {
    method: 'POST', headers: { apikey: session.config.publishableKey, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Cloud service failed (${response.status}).`), { status: response.status, code: data.code });
  return data;
}
