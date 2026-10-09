import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAttemptGdriveBackup } from './cron.js';

const configured = {
  enabled: true,
  schedule: 'weekly' as const,
  googleClientId: 'id',
  googleClientSecret: 'secret',
  gdriveRefreshToken: 'token',
};

describe('shouldAttemptGdriveBackup', () => {
  it('skips when Drive is enabled but OAuth client credentials are missing', () => {
    const result = shouldAttemptGdriveBackup({
      enabled: true,
      schedule: 'weekly',
      gdriveRefreshToken: 'token',
      lastBackup: '',
    });
    assert.equal(result.attempt, false);
    assert.equal(result.skipReason, 'not-configured');
  });

  it('skips when Drive is disabled', () => {
    const result = shouldAttemptGdriveBackup({
      ...configured,
      enabled: false,
    });
    assert.equal(result.attempt, false);
    assert.equal(result.skipReason, 'disabled');
  });

  it('attempts a first backup when Drive is fully configured', () => {
    const result = shouldAttemptGdriveBackup({
      ...configured,
      lastBackup: '',
      now: Date.parse('2026-08-19T12:00:00Z'),
    });
    assert.equal(result.attempt, true);
  });

  it('does not retry every minute after a weekly success', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    const result = shouldAttemptGdriveBackup({
      ...configured,
      lastBackup: new Date(now - 60 * 60 * 1000).toISOString(),
      now,
    });
    assert.equal(result.attempt, false);
    assert.equal(result.skipReason, 'not-due');
  });

  it('is due again after the weekly interval', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    const result = shouldAttemptGdriveBackup({
      ...configured,
      lastBackup: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      now,
    });
    assert.equal(result.attempt, true);
  });

  it('backs off after a failed attempt instead of retrying every minute', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    const result = shouldAttemptGdriveBackup({
      ...configured,
      lastBackup: '',
      now,
      lastFailureAt: now - 5 * 60 * 1000,
      failureBackoffMs: 60 * 60 * 1000,
    });
    assert.equal(result.attempt, false);
    assert.equal(result.skipReason, 'backoff');
  });
});
