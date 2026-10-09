import { bioSchema, type BioRecord } from '../../shared/biology.js';
import type { SupabaseAccountSession } from '../../shared/supabase-auth';

export interface BiologicalCloudRow { record_id: string; payload: BioRecord; revision: number; }
export class BiologicalCloudError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export interface BiologicalDeltaPage { records: BiologicalCloudRow[]; cursor: number; hasMore: boolean; }
/** A new device can show recent activity before downloading its full history. No cursor is advanced. */
export async function readRecentBiologicalCloud(session: SupabaseAccountSession): Promise<BiologicalCloudRow[]> {
  const root = `${session.config.url}/rest/v1/health_os_biological_records?select=record_id,payload,revision&user_id=eq.${encodeURIComponent(session.uid)}&order=change_version.desc`;
  const batches = await Promise.all(['&limit=250', '&payload->>type=eq.checkIn&limit=1'].map(async filter => {
    const raw = await responseJson(await fetch(root + filter, { headers: headers(session), signal: AbortSignal.timeout(20000) }));
    if (!Array.isArray(raw)) throw new Error('Invalid recent biological records');
    return raw.map((row: BiologicalCloudRow) => {
      const payload = bioSchema.parse(row.payload);
      if (payload.userId !== session.uid || payload.id !== row.record_id || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Recent biological account or identity mismatch');
      return { ...row, payload };
    });
  }));
  return [...new Map(batches.flat().map(row => [row.record_id, row])).values()];
}
function headers(session: SupabaseAccountSession) {
  return { apikey: session.config.publishableKey, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' };
}
async function responseJson(response: Response) {
  if (!response.ok) throw new BiologicalCloudError(response.status, response.status === 401 ? 'Sign in again to resume Supabase sync. Your pending entries remain saved.' : `Supabase sync is pending (${response.status}). Your entries are safe in the offline cache.`);
  return response.json();
}
export async function readBiologicalDelta(session: SupabaseAccountSession, afterVersion: number): Promise<BiologicalDeltaPage> {
  if (!Number.isSafeInteger(afterVersion) || afterVersion < 0) throw new Error('Invalid biological sync cursor');
  const raw = await responseJson(await fetch(`${session.config.url}/rest/v1/rpc/health_os_pull_biological_delta`, {
    method: 'POST', headers: headers(session), signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ after_version: afterVersion, page_size: 250 }),
  }));
  if (raw.protocolVersion !== 2 || !Number.isSafeInteger(raw.cursor) || raw.cursor < afterVersion || typeof raw.hasMore !== 'boolean' || !Array.isArray(raw.records) || raw.records.length > 500)
    throw new Error('Invalid biological delta page');
  let previousVersion = afterVersion;
  const identities = new Set<string>();
  const records: BiologicalCloudRow[] = raw.records.map((row: { payload: unknown; revision: number; change_version: number }) => {
    if (!Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isSafeInteger(row.change_version) || row.change_version <= previousVersion || row.change_version > raw.cursor)
      throw new Error('Invalid biological delta revision');
    const payload = bioSchema.parse(row.payload);
    if (payload.userId !== session.uid || identities.has(payload.id)) throw new Error('Biological delta account or identity mismatch');
    previousVersion = row.change_version; identities.add(payload.id);
    return { record_id: payload.id, payload, revision: row.revision };
  });
  if ((records.length && previousVersion !== raw.cursor) || (!records.length && (raw.hasMore || raw.cursor !== afterVersion))) throw new Error('Biological delta cursor did not advance');
  return { records, cursor: raw.cursor, hasMore: raw.hasMore };
}
export async function readBiologicalCloud(session: SupabaseAccountSession): Promise<BiologicalCloudRow[]> {
  const rows: BiologicalCloudRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const url = `${session.config.url}/rest/v1/health_os_biological_records?select=record_id,payload,revision&user_id=eq.${encodeURIComponent(session.uid)}&order=record_id.asc&limit=500&offset=${offset}`;
    const batch = await responseJson(await fetch(url, { headers: headers(session), signal: AbortSignal.timeout(20000) })) as BiologicalCloudRow[];
    rows.push(...batch.map(r => {
      const payload = bioSchema.parse(r.payload);
      if (payload.userId !== session.uid || payload.id !== r.record_id) throw new Error('Biological cloud account or identity mismatch');
      return {...r, payload};
    }));
    if (batch.length < 500) return rows;
  }
}
export async function writeBiologicalCloud(session: SupabaseAccountSession, record: BioRecord, expectedRevision: number | null) {
  const result = await responseJson(await fetch(`${session.config.url}/rest/v1/rpc/health_os_save_biological_record`, {
    method: 'POST', headers: headers(session), signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ p_record_id: record.id, p_payload: { ...record, syncState: 'saved' }, p_expected_revision: expectedRevision }),
  })) as { status: 'saved' | 'conflict'; revision: number; payload: unknown };
  return {...result, payload: bioSchema.parse(result.payload)};
}
