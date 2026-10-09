import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import type { AppDb } from '../../shared/types.js';
import { DUCKDB_FILE } from '../config.js';

export interface AnalyticsLab { sessions: number; volume: number; avgReadiness: number | null; readinessPerformanceCorrelation: number | null; weekly: Array<{ week: string; volume: number; sessions: number }>; }
let instance: DuckDBInstance | null = null;
async function connection() { if (!instance) instance = await DuckDBInstance.create(DUCKDB_FILE); return instance.connect(); }
async function rows(connection: DuckDBConnection, sql: string) { const reader = await connection.runAndReadAll(sql); return reader.getRowObjectsJS() as Array<Record<string, unknown>>; }

/** Rebuilds a non-authoritative analytical mirror from safe structured records. */
export async function rebuildAnalyticsMirror(db: AppDb): Promise<AnalyticsLab> {
  const c = await connection();
  try {
    await c.run('CREATE TABLE IF NOT EXISTS body_sessions(date VARCHAR, volume DOUBLE, readiness DOUBLE)');
    await c.run('DELETE FROM body_sessions');
    for (const session of db.sessions.filter((item) => item.status === 'finished' || item.status === 'completed')) {
      const volume = (session.logs || []).filter((log) => log.status !== 'skipped').flatMap((log) => log.sets || []).reduce((sum, set) => sum + (Number(set.w) || 0) * (Number(set.r) || 0), 0);
      const readiness = Number(session.readiness?.score);
      await c.run('INSERT INTO body_sessions VALUES (?, ?, ?)', [String(session.date || ''), volume, Number.isFinite(readiness) ? readiness : null] as any);
    }
    const [summary] = await rows(c, 'SELECT count(*) AS sessions, coalesce(sum(volume),0) AS volume, avg(readiness) AS avgReadiness, corr(readiness, volume) AS correlation FROM body_sessions');
    const weekly = await rows(c, "SELECT strftime(CAST(date AS DATE), '%G-W%V') AS week, sum(volume) AS volume, count(*) AS sessions FROM body_sessions WHERE date <> '' GROUP BY 1 ORDER BY 1 DESC LIMIT 52");
    return { sessions: Number(summary?.sessions || 0), volume: Number(summary?.volume || 0), avgReadiness: summary?.avgReadiness == null ? null : Number(summary.avgReadiness), readinessPerformanceCorrelation: summary?.correlation == null ? null : Number(summary.correlation), weekly: weekly.map((row) => ({ week: String(row.week), volume: Number(row.volume), sessions: Number(row.sessions) })) };
  } finally { c.closeSync(); }
}

export async function duckDbStatus() { const c = await connection(); try { const [row] = await rows(c, 'SELECT version() AS version'); return { available: true, version: String(row?.version || ''), file: DUCKDB_FILE }; } finally { c.closeSync(); } }
