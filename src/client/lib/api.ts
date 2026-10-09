import { cloudFetch } from './cloud-api';
let authToken = sessionStorage.getItem('body-os-token') || sessionStorage.getItem('powerpulse-token') || '';

export function setAuthToken(token: string) {
  authToken = token;
  if (token) sessionStorage.setItem('body-os-token', token);
  else sessionStorage.removeItem('body-os-token');
}

export function getAuthToken() {
  return authToken;
}

export async function api<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (authToken) headers['X-Body-OS-Token'] = authToken;
  const res = await cloudFetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || 'Request failed') as Error & {
      code?: string;
      status?: number;
    };
    err.code = (data as { code?: string }).code;
    err.status = res.status;
    throw err;
  }
  // The shared cloud service observes successful persisted-record changes.
  // Read-only, authentication and sync calls deliberately do not trigger it.
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && !url.startsWith('/api/auth') && !url.startsWith('/api/cloud-sync') && !url.startsWith('/api/gdrive') && !url.startsWith('/api/ai')) {
    window.dispatchEvent(new Event('body-os-record-changed'));
  }
  return data as T;
}

export const get = <T = unknown>(url: string) => api<T>(url);
export const post = <T = unknown>(url: string, body?: unknown) =>
  api<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const put = <T = unknown>(url: string, body?: unknown) =>
  api<T>(url, { method: 'PUT', body: JSON.stringify(body ?? {}) });
export const del = <T = unknown>(url: string) => api<T>(url, { method: 'DELETE' });
