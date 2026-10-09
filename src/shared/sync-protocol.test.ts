import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAcknowledgements, emptySyncLedger, mergeDelta, queueChangedRecords, stableOperationId } from './sync-protocol.js';
import { SYNC_PROTOCOL_VERSION, type SyncRecord } from './sync.js';

const record = (value: number, revision = value): SyncRecord => ({ id: 'r1', entityType: 'measurement', payload: { id: 'r1', weight: value }, updatedAt: `2026-09-${String(value).padStart(2,'0')}T00:00:00.000Z`, revision, deviceId: 'phone' });

test('durable operations are stable and acknowledgements clear only their matching pending write', () => {
  const queued = queueChangedRecords(emptySyncLedger('account'), [record(80)]);
  const operation = queued.entries['measurement:r1'].pending!;
  assert.equal(operation.operationId, stableOperationId(record(80)));
  const next = applyAcknowledgements(queued, [{ operationId: operation.operationId, status: 'applied', changeVersion: 3, record: record(80) }]);
  assert.equal(next.entries['measurement:r1'].pending, undefined);
});

test('delta merge isolates conflicts and continues unrelated downloads', () => {
  let ledger = queueChangedRecords(emptySyncLedger('account'), [record(81)]);
  const result = mergeDelta(ledger, [record(81)], { protocolVersion: SYNC_PROTOCOL_VERSION, cursor: 9, hasMore: false, records: [
    { ...record(82), changeVersion: 8 },
    { id: 'h1', entityType: 'habit', payload: { id: 'h1', name: 'Walk' }, updatedAt: '2026-09-23T00:00:00.000Z', revision: 1, deviceId: 'web', changeVersion: 9 },
  ] });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.downloads.length, 1);
  assert.equal(result.ledger.cursor, 9);
});
