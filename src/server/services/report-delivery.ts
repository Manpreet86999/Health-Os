/** Durable AI report delivery. A workout is always saved first; delivery may be retried safely. */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import * as repo from '../db/repository.js';

export type PendingReport = { sessionId: string; createdAt: string; attempts: number; lastError: string };
const queueFile = path.join(DATA_DIR, 'pending-ai-reports.json');

function readQueue(): PendingReport[] {
  try { const value = JSON.parse(fs.readFileSync(queueFile, 'utf8')); return Array.isArray(value) ? value : []; } catch { return []; }
}
function writeQueue(items: PendingReport[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(queueFile, JSON.stringify(items, null, 2));
}
function queue(sessionId: string, error: string) {
  const items = readQueue();
  const existing = items.find((item) => item.sessionId === sessionId);
  if (existing) { existing.attempts += 1; existing.lastError = error; }
  else items.push({ sessionId, createdAt: new Date().toISOString(), attempts: 1, lastError: error });
  writeQueue(items);
}
function remove(sessionId: string) { writeQueue(readQueue().filter((item) => item.sessionId !== sessionId)); }
/** Supabase Cron owns delivery and retries; local queues are retained only for old installations. */
export function pendingReports() { return []; }

export async function deliverSessionAiReport(sessionId: string): Promise<{ ok: true; sentTo: string[] } | { ok: false; queued: true; error: string }> {
  const session = repo.getSession(sessionId);
  try {
    if (!session) throw new Error('Saved workout could not be found.');
    // The cloud-sync event makes this completed session available to the deployed
    // scheduler. It resolves the Supabase Auth email and owns all SMTP retries.
    return { ok: true, sentTo: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report delivery failed.';
    queue(sessionId, message);
    return { ok: false, queued: true, error: message };
  }
}

export async function retryPendingReports() {
  return [] as Array<{ sessionId: string; ok: boolean; error?: string }>;
}
