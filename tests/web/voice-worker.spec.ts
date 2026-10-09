import { test, expect } from '@playwright/test';
import { setup, base } from './cloud-fixture';

for (const scenario of [
  { name: 'unconnected', workers: [], message: 'Connect your personal worker to this Health OS account.' },
  { name: 'offline', workers: [{ id: 'voice-worker', name: 'Personal computer', updated_at: '2020-01-01T00:00:00Z', capabilities: { voice: { available: true } } }], message: 'Your personal worker is offline.' },
  { name: 'missing voice setup', workers: [{ id: 'voice-worker', name: 'Personal computer', updated_at: new Date().toISOString(), capabilities: { voice: { available: false } } }], message: 'Your online worker needs voice setup.' },
]) {
  test(`voice capture explains an ${scenario.name} worker without requesting microphone access`, async ({ page }) => {
    const { jobs } = await setup(page);
    await page.route(`${base}/rest/v1/health_os_workers?*`, route => route.fulfill({ json: scenario.workers }));
    await page.addInitScript(() => {
      (window as any).microphoneRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => { (window as any).microphoneRequests++; throw new Error('Unexpected microphone request'); };
    });
    await page.goto('/#Today');
    await page.getByRole('button', { name: 'Voice capture', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: scenario.message })).toBeVisible();
    expect(await page.evaluate(() => (window as any).microphoneRequests)).toBe(0);
    expect(jobs).toHaveLength(0);
    await page.getByRole('textbox', { name: 'Natural language capture', exact: true }).fill('Weight today 80 kg');
    await expect(page.getByRole('button', { name: 'Prepare draft', exact: true })).toBeEnabled();
  });
}

test('voice recording reaches the personal worker queue and returns an editable transcript', async ({ page }) => {
  const { jobs, records, biological, originApi } = await setup(page);
  await page.route(`${base}/rest/v1/health_os_workers?*`, route => route.fulfill({ json: [{ id: 'voice-worker', name: 'Personal computer', updated_at: new Date().toISOString(), capabilities: { voice: { available: true } } }] }));
  await page.addInitScript(() => {
    (window as any).AudioContext = undefined;
    (window as any).webkitAudioContext = undefined;
    (window as any).stoppedTracks = 0;
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop: () => { (window as any).stoppedTracks++; } }] }) as unknown as MediaStream;
    class Recorder {
      static isTypeSupported() { return true; }
      state = 'inactive'; mimeType = 'audio/webm';
      onstop?: () => void;
      ondataavailable?: (event: { data: Blob }) => void;
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['synthetic voice fixture'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    (window as any).MediaRecorder = Recorder;
  });
  await page.goto('/#Today');
  await page.getByRole('button', { name: 'Voice capture', exact: true }).click();
  await expect(page.getByText('Recording… speak now. Press Stop speaking to transcribe your words.', { exact: true })).toBeVisible();
  // Background reconciliation may update its derived envelope while recording.
  // Transcription must leave every source record and biological value unchanged.
  const sourceRecords = () => records.filter(record => record.record_id !== 'health-os-automations');
  const beforeRecords = structuredClone(sourceRecords()), beforeBiological = structuredClone(biological);
  await page.getByRole('button', { name: 'Stop speaking', exact: true }).click();
  await expect.poll(() => jobs.length).toBe(1);
  expect(jobs[0].operation).toBe('voice.transcribe');
  expect(Buffer.from(jobs[0].input.base64, 'base64').toString()).toBe('synthetic voice fixture');
  jobs[0].status = 'completed';
  jobs[0].result = { text: 'Weight today 80 kilograms', language: 'en', duration: 3 };
  await expect(page.getByRole('textbox', { name: 'Natural language capture', exact: true })).toHaveValue('Weight today 80 kilograms');
  await expect(page.getByRole('button', { name: 'Prepare draft', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).stoppedTracks)).toBeGreaterThan(0);
  expect(sourceRecords()).toEqual(beforeRecords);
  expect(biological).toEqual(beforeBiological);
  expect(originApi).toEqual([]);
});
