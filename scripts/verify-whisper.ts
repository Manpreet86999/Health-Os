import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/server/app.js';
import { getDb, closeDb } from '../src/server/db/connection.js';
import { migrate } from '../src/server/db/migrate.js';
import { localWhisper } from '../src/server/services/whisper.js';

// Run against an isolated test database; never create a real health record.
if (!process.env.BODY_OS_DATA_DIR?.includes('scratch')) throw new Error('Set BODY_OS_DATA_DIR to a scratch test directory.');
const audioPath = process.argv[2];
if (!audioPath) throw new Error('Pass the generated speech.wav fixture path.');
migrate(getDb());
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing test port');
const base = `http://127.0.0.1:${address.port}`;
const transcribe = (audio: Buffer) => fetch(`${base}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: new Uint8Array(audio) });
const records = async () => (await (await fetch(`${base}/api/biology`)).json() as { records: unknown[] }).records.length;
try {
  const status = await (await fetch(`${base}/api/voice/status`)).json();
  assert.equal(status.available, true);
  const count = await records();
  const start = performance.now();
  const response = await transcribe(readFileSync(audioPath));
  const transcript = await response.json();
  assert.equal(response.status, 200, JSON.stringify(transcript));
  assert.match(transcript.text, /water/i);
  assert.match(transcript.text, /weight|kilogram/i);
  console.log(JSON.stringify({ check: 'real-local-speech', elapsedMs: Math.round(performance.now() - start), ...transcript }));
  const invalid = await transcribe(Buffer.from('invalid audio'));
  assert.equal(invalid.status, 400);
  const silentWav = (seconds: number) => {
    const samples = 16000 * seconds, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    return wav;
  };
  const silent = await transcribe(silentWav(2));
  assert.equal(silent.status, 200); assert.equal((await silent.json()).text, '');
  const tooLong = await transcribe(silentWav(62));
  assert.equal(tooLong.status, 400); assert.equal((await tooLong.json()).code, 'too_long');
  const warm = performance.now();
  const again = await transcribe(readFileSync(audioPath));
  assert.equal(again.status, 200); assert.match((await again.json()).text, /water/i);
  console.log(JSON.stringify({ check: 'warm-worker-recovery', elapsedMs: Math.round(performance.now() - warm) }));
  assert.equal(await records(), count);
  console.log('PASS: offline speech, malformed audio, silence, duration limit, worker reuse, and no saved records.');
} finally {
  localWhisper.dispose();
  await new Promise<void>(resolve => server.close(() => resolve()));
  closeDb();
}
