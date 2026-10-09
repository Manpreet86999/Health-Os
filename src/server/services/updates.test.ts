import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDownloadedUpdate,
  beginUpdateDownload,
  checkForUpdates,
  getDownloadedInstallerPath,
  getUpdateDownloadStatus,
} from './updates.js';
import { UPDATES_DISCONNECTED_MESSAGE } from '../../shared/update-repo.js';

test('disconnected updater never contacts GitHub or prepares an installer', async (t) => {
  const network = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Disconnected updates must not make network requests.');
  });

  for (const options of [undefined, { force: true }, { force: false }]) {
    const result = await checkForUpdates(options);
    assert.equal(result.configured, false);
    assert.equal(result.repo, null);
    assert.equal(result.updateAvailable, false);
    assert.equal(result.latestVersion, null);
    assert.equal(result.downloadUrl, null);
    assert.equal(result.htmlUrl, null);
    assert.equal(result.message, UPDATES_DISCONNECTED_MESSAGE);
  }

  const download = beginUpdateDownload();
  assert.equal(download.phase, 'failed');
  assert.equal(download.error, UPDATES_DISCONNECTED_MESSAGE);
  assert.equal(download.bytesDownloaded, 0);
  assert.equal(getUpdateDownloadStatus().phase, 'failed');
  assert.equal(getDownloadedInstallerPath(), null);
  assert.deepEqual(applyDownloadedUpdate(), { ok: false, error: UPDATES_DISCONNECTED_MESSAGE });
  assert.equal(network.mock.callCount(), 0);
});
