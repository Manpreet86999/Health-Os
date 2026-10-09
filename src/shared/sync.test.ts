import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSyncRecord, syncKey, type SyncRecord } from './sync.js';

const record = (revision: number, deviceId: string, deletedAt?: string): SyncRecord<{ name: string }> => ({
  id: 'week-1', entityType: 'week', payload: { name: 'Plan' }, updatedAt: `2026-08-0${revision}T12:00:00.000Z`, revision, deviceId, deletedAt,
});

test('sync detects concurrent pending edits instead of overwriting them', () => {
  const result = resolveSyncRecord(record(2, 'phone'), record(2, 'pc'), true);
  assert.equal(result?.kind, 'conflict');
  if (result?.kind === 'conflict') assert.equal(result.conflict.reason, 'concurrent-edit');
});

test('sync detects a delete versus edit conflict', () => {
  const result = resolveSyncRecord(record(2, 'phone', '2026-08-02T12:00:00.000Z'), record(3, 'pc'), true);
  assert.equal(result?.kind, 'conflict');
  if (result?.kind === 'conflict') assert.equal(result.conflict.reason, 'delete-vs-edit');
});

test('sync accepts a newer remote record when there is no pending local change', () => {
  const result = resolveSyncRecord(record(1, 'phone'), record(2, 'pc'), false);
  assert.equal(result?.kind, 'use-remote');
  assert.equal(syncKey(record(1, 'phone')), 'week:week-1');
});
