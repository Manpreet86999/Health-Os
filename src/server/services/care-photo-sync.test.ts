import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { carePhotoRecords, uploadCarePhoto, prepareCarePhoto, applySyncedCarePhoto, type CarePhotoSyncRecord } from './care-photo-sync.js';
import { getDb, closeDb } from '../db/connection.js';
import { migrate } from '../db/migrate.js';
import * as repo from '../db/repository.js';
import type { CloudConfig, CloudSession } from '../../shared/cloud.js';

test('care-photo-sync exports portable records, uploads private blobs, and restores photos with dataUrls', async () => {
  if (!process.env.BODY_OS_DATA_DIR) {
    process.env.BODY_OS_DATA_DIR = path.join(process.cwd(), 'scratch', 'care-photo-test');
  }
  migrate(getDb());

  // 1. Create a test care photo
  const testBytes = Buffer.from('fake-jpeg-photo-content-for-testing-purposes-12345');
  const base64 = testBytes.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  const photo = repo.saveCarePhoto({
    id: 'test-photo-1',
    date: '2026-10-05',
    area: 'face',
    dataUrl,
    note: 'Baseline comparison photo',
    createdAt: '2026-10-05T10:00:00.000Z',
  });
  assert.equal(photo.id, 'test-photo-1');

  // 2. carePhotoRecords extracts descriptors and produces portable metadata
  const records = carePhotoRecords('desktop');
  const record = records.find(r => r.id === 'test-photo-1');
  assert.ok(record, 'Record was generated');
  assert.equal(record.entityType, 'carePhoto');
  assert.equal(record.workspace, 'care');
  assert.equal((record.payload as any).dataUrl, undefined, 'dataUrl must not be in metadata payload');
  assert.equal((record.payload as any).area, 'face');

  const origBlob = (record.payload as any).original;
  const prevBlob = (record.payload as any).preview;
  assert.ok(origBlob && prevBlob, 'original and preview descriptors exist');
  assert.equal(origBlob.sha256, crypto.createHash('sha256').update(testBytes).digest('hex'));
  assert.equal(origBlob.size, testBytes.length);
  assert.equal(origBlob.localPath, undefined, 'localPath stripped from portable');

  // 3. Upload photo to mock private cloud
  const config: CloudConfig = { url: 'https://test.supabase.co', publishableKey: 'test-key' };
  const session: CloudSession = { uid: '11111111-1111-4111-8111-111111111111', accessToken: 'test-token' };
  const uploadedFiles = new Map<string, Buffer>();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.includes('/health-os-private/')) {
      const parts = url.split('/health-os-private/')[1].split('?')[0];
      if (options?.method === 'POST') {
        const bodyBuf = Buffer.from(options.body as ArrayBuffer);
        uploadedFiles.set(parts, bodyBuf);
        return new Response(JSON.stringify({ Key: parts }), { status: 200 });
      }
      if (options?.method === 'GET' || !options?.method) {
        const file = uploadedFiles.get(parts);
        if (!file) return new Response('Not found', { status: 404 });
        return new Response(file, { status: 200 });
      }
    }
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
  };

  try {
    await uploadCarePhoto(config, session, record);
    assert.ok(uploadedFiles.size > 0, 'Private file was uploaded');

    // 4. Download and prepare from remote sync record (simulating arriving on another device)
    repo.deleteCarePhoto('test-photo-1');
    assert.equal(repo.listCarePhotos().some(p => p.id === 'test-photo-1'), false);

    const remoteRecord: CarePhotoSyncRecord = {
      id: 'test-photo-1',
      entityType: 'carePhoto',
      payload: record.payload,
      revision: 1,
      updatedAt: '2026-10-05T10:00:00.000Z',
      deviceId: 'remote-device',
      workspace: 'care',
      createdAt: '2026-10-05T10:00:00.000Z',
    };

    const prepared = await prepareCarePhoto(config, session, remoteRecord);
    prepared.apply();
    prepared.dispose();

    // Verify photo was restored into repository with valid dataUrl
    const restored = repo.listCarePhotos().find(p => p.id === 'test-photo-1');
    assert.ok(restored, 'Photo was restored');
    assert.equal(restored.note, 'Baseline comparison photo');
    assert.ok(restored.dataUrl.startsWith('data:image/jpeg;base64,'));
    const restoredBytes = Buffer.from(restored.dataUrl.replace('data:image/jpeg;base64,', ''), 'base64');
    assert.deepEqual(restoredBytes, testBytes);

    // 5. Test tombstone application
    applySyncedCarePhoto({ ...remoteRecord, deletedAt: '2026-10-05T11:00:00.000Z' });
    assert.equal(repo.listCarePhotos().find(p => p.id === 'test-photo-1'), undefined, 'Deleted photo removed');
  } finally {
    globalThis.fetch = oldFetch;
    closeDb();
  }
});
