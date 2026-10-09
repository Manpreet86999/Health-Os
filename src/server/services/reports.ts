import * as repo from '../db/repository.js';
import type { Session, Week } from '../../shared/types.js';
import { computeMetrics } from './metrics.js';
import { reportHtml } from './email.js';
import { escapeHtml } from '../lib/ids.js';
import { readAutomationState } from './automation-store.js';

export async function generateDailyReportHtml(sessionId: string): Promise<Buffer> {
  const db = repo.loadAppDb();
  const session = db.sessions.find(s => s.id === sessionId);
  if (!session) throw new Error('Session not found');
  const html = reportHtml(session);
  return Buffer.from(html, 'utf8');
}

export async function generateWeeklyReportHtml(weekId: string): Promise<Buffer> {
  const db = repo.loadAppDb();
  const week = db.weeks.find(w => w.id === weekId);
  if (!week) throw new Error('Week not found');
  let cached: {data_snapshot:unknown}|undefined;
  try { cached=Object.values(readAutomationState().derived).filter(r=>r.kind==='report'&&(r.value as {report_type:string}).report_type==='Weekly training report').at(-1)?.value as {data_snapshot:unknown}|undefined; } catch { /* Automation failures never prevent existing report delivery. */ }
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Weekly Report</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-[#fff7ed] text-[#2d1502] p-8 font-sans max-w-3xl mx-auto">
<h1 class="text-4xl font-bold text-[#ea580c]">Weekly Report: ${escapeHtml(week.name)}</h1>
${cached?`<h2>Health OS automatic summary</h2><pre>${escapeHtml(JSON.stringify(cached.data_snapshot,null,2))}</pre>`:''}
<p class="mt-4 text-orange-950/70">Generated on ${new Date().toLocaleDateString()}</p>
<div class="mt-8 h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 grid place-items-center text-2xl font-black text-white">B</div>
</body></html>`;
  return Buffer.from(html, 'utf8');
}

export async function generateProgressReportHtml(fromDate?: string, toDate?: string): Promise<Buffer> {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Progress Report</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-[#fff7ed] text-[#2d1502] p-8 font-sans max-w-3xl mx-auto">
<h1 class="text-4xl font-bold text-[#ea580c]">Progress Report</h1>
<p class="mt-4 text-orange-950/70">${escapeHtml(fromDate || 'All time')} to ${escapeHtml(toDate || 'Latest')}</p>
<p class="mt-4 text-orange-950/70">Generated on ${new Date().toLocaleDateString()}</p>
<div class="mt-8 h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 grid place-items-center text-2xl font-black text-white">B</div>
</body></html>`;
  return Buffer.from(html, 'utf8');
}
