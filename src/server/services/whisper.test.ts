import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { LocalWhisper } from './whisper.js';

function fixture(timeoutMs = 10000) {
  const root = mkdtempSync(path.join(ROOT, 'scratch/whisper-test-'));
  const modelPath = path.join(root, 'model');
  mkdirSync(modelPath);
  for (const file of ['model.bin', 'config.json', 'tokenizer.json']) writeFileSync(path.join(modelPath, file), '{}');
  const workerPath = path.join(root, 'worker.mjs');
  writeFileSync(workerPath, `
    import { createInterface } from 'node:readline';
    let count = 0;
    createInterface({input:process.stdin}).on('line',line=>{
      const {id,audio}=JSON.parse(line),command=Buffer.from(audio,'base64').toString();
      if(command==='hang')return;
      if(command==='crash'){process.exit(1);return;}
      setTimeout(()=>console.log(command==='invalid'?'broken':JSON.stringify({id,
        ...(command==='long'?{error:'too_long'}:{text:'Water 350 ml',language:'en',duration:3,count:++count})})),30);
    });
  `);
  const voice = new LocalWhisper({ python: process.execPath, pythonArgs: [], modelPath, workerPath, timeoutMs });
  return { voice, cleanup: () => { voice.dispose(); rmSync(root, { recursive: true, force: true }); } };
}

test('Whisper runtime status handles a missing installation without starting a process', async () => {
  const voice = new LocalWhisper({ python: path.join(ROOT, 'scratch/missing-whisper-python') });
  assert.equal(voice.status().available, false);
  await assert.rejects(voice.transcribe(Buffer.from('voice')), { code: 'not_installed', status: 503 });
});

test('local worker returns text only and rejects simultaneous inference', async () => {
  const { voice, cleanup } = fixture();
  try {
    const first = voice.transcribe(Buffer.from('voice'));
    assert.equal(voice.status().busy, true);
    await assert.rejects(voice.transcribe(Buffer.from('second')), { code: 'busy', status: 429 });
    assert.deepEqual(await first, { text: 'Water 350 ml', language: 'en', duration: 3 });
    assert.equal(voice.status().busy, false);
    assert.equal((await voice.transcribe(Buffer.from('another'))).text, 'Water 350 ml');
    await assert.rejects(voice.transcribe(Buffer.from('long')), { code: 'too_long', status: 400 });
  } finally { cleanup(); }
});

test('cancelling inference kills the worker and lets a new request start', async () => {
  const { voice, cleanup } = fixture();
  try {
    const controller = new AbortController();
    const rejected = assert.rejects(voice.transcribe(Buffer.from('hang'), controller.signal), { code: 'cancelled' });
    controller.abort(); await rejected;
    assert.equal((await voice.transcribe(Buffer.from('voice'))).text, 'Water 350 ml');
  } finally { cleanup(); }
});

test('worker timeout and malformed output recover with an actionable error', async () => {
  const timed = fixture(1000);
  try { await assert.rejects(timed.voice.transcribe(Buffer.from('hang')), { code: 'timeout', status: 504 }); }
  finally { timed.cleanup(); }
  // Process startup can exceed one second on Windows under parallel build load.
  // Keep the short timeout assertion separate from malformed-output recovery.
  const { voice, cleanup } = fixture();
  try {
    await assert.rejects(voice.transcribe(Buffer.from('invalid')), { code: 'worker_failed' });
    await assert.rejects(voice.transcribe(Buffer.from('crash')), { code: 'worker_failed' });
    assert.equal((await voice.transcribe(Buffer.from('voice'))).text, 'Water 350 ml');
  } finally { cleanup(); }
});
