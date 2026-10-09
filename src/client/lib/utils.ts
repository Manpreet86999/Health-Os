import type { Readiness, Week } from './types';

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localDayKey(): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function money(n: number, units = 'kg'): string {
  return `${(Number(n || 0) / 1000).toFixed(1)}k ${units}`;
}

export function readyTone(r?: Readiness | null): 'green' | 'blue' | 'orange' | 'rose' {
  if (!r) return 'orange';
  if (r.score >= 80) return 'green';
  if (r.score >= 60) return 'blue';
  if (r.score >= 40) return 'orange';
  return 'rose';
}

export function weekStatus(week: Week, sessions: Array<{ weekId: string; dayKey: string; status: string }>) {
  const trainingDays = week.days.filter((d) => d.type !== 'rest');
  const doneKeys = new Set(
    sessions.filter((s) => s.weekId === week.id && (s.status === 'finished' || s.status === 'completed')).map((s) => s.dayKey),
  );
  const done = trainingDays.filter((d) => doneKeys.has(d.key)).length;
  return {
    done,
    total: trainingDays.length,
    complete: trainingDays.length > 0 && done >= trainingDays.length,
    label: trainingDays.length > 0 && done >= trainingDays.length ? 'Completed' : 'In Progress',
  };
}

export function parseSetCount(vol: string): number {
  return Math.max(1, parseInt(String(vol).split(/x/i)[0], 10) || 3);
}

export const PAGES = [
  'Dashboard',
  'Planner',
  'Tracker',
  'Records',
  'Analyzer',
  'Coach',
  'Targets',
  'Body',
  'Library',
  'Settings',
] as const;

export const NAV_MOBILE = ['Dashboard', 'Tracker', 'Records', 'Analyzer', 'Settings'] as const;

/** Last N local calendar day keys ending today (for heatmap). */
export function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }
  return out;
}
