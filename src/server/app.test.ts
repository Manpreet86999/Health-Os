import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import { createApp } from './app.js';

async function withServer(run: (url: string) => Promise<void>) {
  const server = createApp().listen(0, '127.0.0.1') as Server;
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a TCP address.');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('health endpoint is reachable without credentials and applies browser protections', async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { ok: boolean }).ok, true);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('permissions-policy'), 'camera=(self), microphone=(self), geolocation=()');
    assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  });
});


test('browser policy permits Supabase and restricts tutorial frames to YouTube', async () => {
  await withServer(async (url) => {
    const response = await fetch(url);
    const directives = new Map((response.headers.get('content-security-policy') || '').split(';').map(part => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }));
    assert.deepEqual(directives.get('script-src'), ["'self'", 'https://apis.google.com']);
    assert.deepEqual(directives.get('frame-src'), ['https://www.youtube.com', 'https://www.youtube-nocookie.com']);
    assert.ok(directives.get('connect-src')?.includes('https://*.supabase.co'));
    assert.deepEqual(directives.get('default-src'), ["'self'"]);
  });
});

test('voice status is private and invalid uploads do not start Whisper', async () => {
  await withServer(async url => {
    const status = await fetch(`${url}/api/voice/status`);
    assert.equal(status.headers.get('cache-control'), 'no-store');
    assert.equal((await status.json() as { engine: string }).engine, 'local-whisper');
    const wrongType = await fetch(`${url}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'not audio' });
    assert.equal(wrongType.status, 415);
    const empty = await fetch(`${url}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array() });
    assert.equal(empty.status, 400);
    const oversized = await fetch(`${url}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array(4 * 1024 * 1024 + 1) });
    assert.equal(oversized.status, 413);
  });
});
