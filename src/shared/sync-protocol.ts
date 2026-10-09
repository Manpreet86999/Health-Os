import { canonical, sameContent, type CloudRecord } from './cloud.js';
import { SYNC_PROTOCOL_VERSION, syncKey, type SyncAcknowledgement, type SyncDeltaPage, type SyncOperation, type SyncRecord } from './sync.js';

export interface SyncLedgerEntry {
  base?: SyncRecord;
  pending?: SyncOperation;
  conflict?: { local: SyncRecord; remote: SyncRecord; detectedAt: string };
}

export interface SyncLedger {
  version: 2;
  account: string;
  cursor: number;
  entries: Record<string, SyncLedgerEntry>;
}

export function emptySyncLedger(account: string): SyncLedger {
  return { version: 2, account, cursor: 0, entries: {} };
}

export function stableOperationId(record: SyncRecord): string {
  return `${syncKey(record)}:${record.revision}:${record.deviceId}:${hash(canonical({ payload: record.payload, deletedAt: record.deletedAt || null }))}`;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function queueChangedRecords(ledger: SyncLedger, records: SyncRecord[]): SyncLedger {
  const entries = { ...ledger.entries };
  for (const record of records) {
    const key = syncKey(record);
    const current = entries[key] || {};
    if (current.conflict || sameContent(record, current.base)) continue;
    const pending: SyncOperation = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      operationId: stableOperationId(record),
      expectedChangeVersion: (current.base as CloudRecord | undefined)?.changeVersion ?? null,
      record,
    };
    entries[key] = { ...current, pending };
  }
  return { ...ledger, entries };
}

export function applyAcknowledgements(ledger: SyncLedger, acknowledgements: SyncAcknowledgement[]): SyncLedger {
  const entries = { ...ledger.entries };
  for (const acknowledgement of acknowledgements) {
    const pair = Object.entries(entries).find(([, entry]) => entry.pending?.operationId === acknowledgement.operationId);
    if (!pair) continue;
    const [key, entry] = pair;
    if (acknowledgement.status === 'conflict') {
      if (entry.pending && acknowledgement.record) entries[key] = { ...entry, conflict: { local: entry.pending.record, remote: acknowledgement.record, detectedAt: new Date().toISOString() } };
      continue;
    }
    entries[key] = { base: { ...(acknowledgement.record || entry.pending!.record), changeVersion: acknowledgement.changeVersion } as SyncRecord };
  }
  return { ...ledger, entries };
}

export function mergeDelta(ledger: SyncLedger, localRecords: SyncRecord[], page: SyncDeltaPage) {
  if (page.protocolVersion !== SYNC_PROTOCOL_VERSION) throw new Error('This cloud sync version requires a newer Health OS client.');
  const local = new Map(localRecords.map(record => [syncKey(record), record]));
  const entries = { ...ledger.entries };
  const downloads: SyncRecord[] = [];
  const conflicts: NonNullable<SyncLedgerEntry['conflict']>[] = [];
  for (const remote of page.records) {
    const key = syncKey(remote);
    const entry = entries[key] || {};
    const current = local.get(key);
    if (entry.pending && !sameContent(entry.pending.record, remote)) {
      const conflict = { local: current || entry.pending.record, remote, detectedAt: new Date().toISOString() };
      entries[key] = { ...entry, conflict };
      conflicts.push(conflict);
      continue;
    }
    if (!entry.base && current && !sameContent(current, remote)) {
      const untouchedDefault=current.revision<=1&&['profile','exercise','skinProfile','skinRoutine','sharedPreferences'].includes(current.entityType);
      if(!untouchedDefault){const conflict={local:current,remote,detectedAt:new Date().toISOString()};entries[key]={...entry,conflict};conflicts.push(conflict);continue;}
    }
    if (!sameContent(current, remote)) downloads.push(remote);
    entries[key] = { base: remote };
  }
  return { ledger: { ...ledger, cursor: page.cursor, entries }, downloads, conflicts };
}
