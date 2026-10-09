import fs from 'node:fs';
import {
  BACKUP_DIR,
  LEGACY_JSON_DB,
  LEGACY_SETTINGS,
} from '../config.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import { id } from '../lib/ids.js';
import { emptySettings, defaultProfile } from '../../shared/defaults.js';
import type { AppSettings, Measurement, Readiness, Session, Target, Week } from '../../shared/types.js';
import type { AppDatabase } from './connection.js';
import { starterWeek } from './seed.js';
import { defaultWorkoutSplits } from './seed.js';

function tableExists(db: AppDatabase, name: string): boolean {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name),
  );
}

function columnNames(db: AppDatabase, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

export function migrate(db: AppDatabase): void {
  upgradeLegacySchemaIfNeeded(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL,
      units TEXT NOT NULL DEFAULT 'kg',
      height REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weeks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      week_number INTEGER,
      active INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      start_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      week_id TEXT,
      day_key TEXT,
      day_title TEXT DEFAULT '',
      athlete_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'finished',
      sleep REAL,
      soreness REAL,
      notes TEXT DEFAULT '',
      readiness_json TEXT,
      completed_by_library INTEGER DEFAULT 0,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS session_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      exercise_target TEXT DEFAULT 'Other',
      exercise_status TEXT DEFAULT 'completed',
      set_index INTEGER NOT NULL,
      weight REAL,
      reps REAL,
      rpe REAL,
      rir REAL,
      journal TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS readiness (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      week_id TEXT,
      day_key TEXT,
      sleep_hours REAL,
      sleep_quality REAL,
      steps REAL,
      soreness REAL,
      energy REAL,
      stress REAL,
      motivation REAL,
      mood REAL,
      hydration REAL,
      meal_protein REAL,
      pain_flag INTEGER DEFAULT 0,
      resting_heart_rate REAL,
      notes TEXT DEFAULT '',
      score INTEGER NOT NULL,
      band TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT '',
      current_value TEXT DEFAULT '',
      target_value TEXT DEFAULT '',
      unit TEXT DEFAULT '',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS measurements (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      weight REAL,
      waist REAL,
      chest REAL,
      arms REAL,
      neck REAL,
      bmr REAL, body_fat REAL, muscle_mass REAL, water_percentage REAL,
      notes TEXT DEFAULT '',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coach_history (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      score INTEGER,
      advice_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_week ON sessions(week_id, day_key);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sets_session ON session_sets(session_id);
    CREATE INDEX IF NOT EXISTS idx_sets_exercise ON session_sets(exercise_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_readiness_week_day ON readiness(week_id, day_key);

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cardio_sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goal_check_ins (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_reviews (
      id TEXT PRIMARY KEY,
      week_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercise_library (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_splits (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pain_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_workouts (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS care_photos (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS care_data (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skin_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skin_products (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skin_routines (
      id TEXT PRIMARY KEY,
      slot TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skin_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_skin_logs_date ON skin_logs(date);

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
      document_id UNINDEXED,
      title,
      content
    );
  `);

  const applied = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  const versions = new Set(applied.map((r) => r.version));
  if (!versions.has(1)) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(
      new Date().toISOString(),
    );
  }

  const profile = db.prepare('SELECT id FROM profiles WHERE id = 1').get();
  if (!profile) {
    const p = defaultProfile();
    db.prepare(
      'INSERT INTO profiles (id, display_name, units, created_at, updated_at) VALUES (1, ?, ?, ?, ?)',
    ).run(p.displayName, p.units, p.createdAt, p.createdAt);
  }

  const settings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settings) {
    db.prepare('INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)').run(
      JSON.stringify(emptySettings(), null, 2),
      new Date().toISOString(),
    );
  }

  migrateLegacyIfNeeded(db);
  ensureStarterWeek(db);
  migrateWeeksIntoLibrary(db);
  seedV240Library(db);
  try {
    db.prepare("UPDATE sessions SET status = 'finished', data = json_set(data, '$.status', 'finished') WHERE status = 'completed'").run();
  } catch {
    // ignore if table or json_set unavailable
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/** Preserve built-in workout templates. Exercise identity is resolved from Supabase. */
function seedV240Library(db: AppDatabase): void {
  const existsSplit = db.prepare('SELECT 1 FROM library_splits WHERE id = ?');
  const insertSplit = db.prepare('INSERT INTO library_splits (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING');
  const now = new Date().toISOString();
  const splitCount = (db.prepare('SELECT COUNT(*) as count FROM library_splits').get() as { count: number }).count;
  let splits = 0;
  for (const week of splitCount < 16 ? defaultWorkoutSplits().filter((item) => item.id.startsWith('builtin-')) : []) {
    if (!existsSplit.get(week.id)) {
      insertSplit.run(week.id, JSON.stringify(week), now);
      splits += 1;
    }
  }
  if (splits) console.log(`[migrate] library added ${splits} workout templates (existing data kept).`);
}

/** Move the old v2.4 library records out of program weeks exactly once. */
function migrateWeeksIntoLibrary(db: AppDatabase): void {
  const legacySplits = db.prepare("SELECT id, data, updated_at FROM weeks WHERE status = 'library' OR id LIKE 'builtin-v240-split-%'").all() as { id: string; data: string; updated_at: string }[];
  if (!legacySplits.length) return;
  const saveSplit = db.prepare('INSERT INTO library_splits (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING');
  const removeWeek = db.prepare('DELETE FROM weeks WHERE id = ?');
  for (const split of legacySplits) {
    saveSplit.run(split.id, split.data, split.updated_at || new Date().toISOString());
    removeWeek.run(split.id);
  }
}

/** Rebuild tables if an older schema is detected. */
function upgradeLegacySchemaIfNeeded(db: AppDatabase): void {
  if (!tableExists(db, 'weeks')) return;
  const cols = columnNames(db, 'weeks');
  const needsRebuild = !cols.has('status') || !tableExists(db, 'session_sets');
  if (!needsRebuild) {
    // readiness may still be old blob-only
    if (tableExists(db, 'readiness')) {
      const rcols = columnNames(db, 'readiness');
      if (!rcols.has('score')) {
        rebuildFromBlobs(db);
        return;
      }
      if (!rcols.has('id')) {
        db.exec(`
          CREATE TABLE readiness_new (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            week_id TEXT,
            day_key TEXT,
            sleep_hours REAL,
            sleep_quality REAL,
            steps REAL,
            soreness REAL,
            energy REAL,
            stress REAL,
            motivation REAL,
            mood REAL,
            hydration REAL,
            meal_protein REAL,
            pain_flag INTEGER DEFAULT 0,
            resting_heart_rate REAL,
            notes TEXT DEFAULT '',
            score INTEGER NOT NULL,
            band TEXT NOT NULL,
            recommendation TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO readiness_new (id, date, week_id, day_key, sleep_hours, sleep_quality, steps, soreness, energy, stress, motivation, mood, hydration, meal_protein, pain_flag, resting_heart_rate, notes, score, band, recommendation, data, created_at, updated_at)
          SELECT date, date, 'legacy_' || date, 'legacy_' || date, sleep_hours, sleep_quality, null, soreness, energy, stress, motivation, mood, hydration, meal_protein, pain_flag, resting_heart_rate, notes, score, band, recommendation, data, created_at, updated_at FROM readiness;
          DROP TABLE readiness;
          ALTER TABLE readiness_new RENAME TO readiness;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_readiness_week_day ON readiness(week_id, day_key);
        `);
      }
      
      // Ensure steps column is added for databases that were already partially migrated
      if (!columnNames(db, 'readiness').has('steps')) {
        db.exec('ALTER TABLE readiness ADD COLUMN steps REAL;');
      }
    }
    // Add new measurement columns if missing
    if (tableExists(db, 'measurements')) {
      const mcols = columnNames(db, 'measurements');
      for (const column of ['bmr','body_fat','muscle_mass','water_percentage']) {
        if (!mcols.has(column)) db.exec(`ALTER TABLE measurements ADD COLUMN ${column} REAL`);
      }
    }
    if (tableExists(db, 'profiles')) {
      const pcols = columnNames(db, 'profiles');
      if (!pcols.has('height')) {
        db.exec('ALTER TABLE profiles ADD COLUMN height REAL;');
      }
    }
    return;
  }
  rebuildFromBlobs(db);
}

function rebuildFromBlobs(db: AppDatabase): void {
  console.log('[migrate] Upgrading database schema from v1 blob store…');
  const dump = {
    meta: {} as Record<string, string>,
    weeks: [] as Week[],
    sessions: [] as Session[],
    readiness: [] as Readiness[],
    targets: [] as Target[],
    measurements: [] as Measurement[],
    settings: null as AppSettings | null,
  };

  try {
    for (const row of db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]) {
      dump.meta[row.key] = row.value;
    }
  } catch { /* */ }

  try {
    for (const row of db.prepare('SELECT data FROM weeks').all() as { data: string }[]) {
      dump.weeks.push(JSON.parse(row.data));
    }
  } catch { /* */ }

  try {
    for (const row of db.prepare('SELECT data FROM sessions').all() as { data: string }[]) {
      dump.sessions.push(JSON.parse(row.data));
    }
  } catch { /* */ }

  try {
    for (const row of db.prepare('SELECT data FROM readiness').all() as { data: string }[]) {
      dump.readiness.push(JSON.parse(row.data));
    }
  } catch { /* */ }

  try {
    for (const row of db.prepare('SELECT data FROM targets').all() as { data: string }[]) {
      dump.targets.push(JSON.parse(row.data));
    }
  } catch { /* */ }

  try {
    for (const row of db.prepare('SELECT data FROM measurements').all() as { data: string }[]) {
      dump.measurements.push(JSON.parse(row.data));
    }
  } catch { /* */ }

  try {
    const s = db.prepare('SELECT data FROM settings WHERE id = 1').get() as { data: string } | undefined;
    if (s) dump.settings = JSON.parse(s.data);
  } catch { /* */ }

  db.exec(`
    DROP TABLE IF EXISTS session_sets;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS readiness;
    DROP TABLE IF EXISTS targets;
    DROP TABLE IF EXISTS measurements;
    DROP TABLE IF EXISTS weeks;
    DROP TABLE IF EXISTS coach_history;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS profiles;
    DROP TABLE IF EXISTS schema_migrations;
    DROP TABLE IF EXISTS habits;
    DROP TABLE IF EXISTS habit_logs;
    DROP TABLE IF EXISTS cardio_sessions;
    DROP TABLE IF EXISTS goal_check_ins;
    DROP TABLE IF EXISTS weekly_reviews;
  `);
  // keep settings + meta if possible
  try {
    db.exec('DELETE FROM meta WHERE key = "v2Migrated"');
  } catch { /* */ }

  // recreate via migrate body — call tables creation inline
  db.exec(`
    CREATE TABLE IF NOT EXISTS weeks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, week_number INTEGER, active INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active', start_date TEXT DEFAULT '', notes TEXT DEFAULT '',
      data TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, week_id TEXT, day_key TEXT, day_title TEXT DEFAULT '',
      athlete_name TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'finished', sleep REAL, soreness REAL,
      notes TEXT DEFAULT '', readiness_json TEXT, completed_by_library INTEGER DEFAULT 0,
      data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS session_sets (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, exercise_name TEXT NOT NULL,
      exercise_target TEXT DEFAULT 'Other', exercise_status TEXT DEFAULT 'completed',
      set_index INTEGER NOT NULL, weight REAL, reps REAL, rpe REAL, rir REAL, journal TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS readiness (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, week_id TEXT, day_key TEXT, sleep_hours REAL, sleep_quality REAL, steps REAL, soreness REAL, energy REAL, stress REAL,
      motivation REAL, mood REAL, hydration REAL, meal_protein REAL, pain_flag INTEGER DEFAULT 0,
      resting_heart_rate REAL, notes TEXT DEFAULT '', score INTEGER NOT NULL, band TEXT NOT NULL,
      recommendation TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT '', current_value TEXT DEFAULT '',
      target_value TEXT DEFAULT '', unit TEXT DEFAULT '', data TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS measurements (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, weight REAL, waist REAL, chest REAL, arms REAL, neck REAL,
      bmr REAL, body_fat REAL, muscle_mass REAL, water_percentage REAL,
      notes TEXT DEFAULT '', data TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habits (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS habit_logs (id TEXT PRIMARY KEY, date TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cardio_sessions (id TEXT PRIMARY KEY, date TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS goal_check_ins (id TEXT PRIMARY KEY, date TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS weekly_reviews (id TEXT PRIMARY KEY, week_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
  `);



  importLegacyBundle(db, {
    meta: { activeWeekId: dump.meta.activeWeekId },
    weeks: dump.weeks,
    sessions: dump.sessions,
    readiness: dump.readiness,
    targets: dump.targets,
    measurements: dump.measurements,
  });

  if (dump.settings) {
    db.prepare(
      'INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at',
    ).run(JSON.stringify(dump.settings, null, 2), new Date().toISOString());
  }
}

function ensureStarterWeek(db: AppDatabase): void {
  const count = db.prepare('SELECT COUNT(*) as c FROM weeks').get() as { c: number };
  if (count.c === 0) {
    const week = starterWeek();
    db.prepare(
      `INSERT INTO weeks (id, name, week_number, active, status, start_date, notes, data, updated_at)
       VALUES (?, ?, ?, 1, 'active', ?, ?, ?, ?)`,
    ).run(
      week.id,
      week.name,
      Number(week.weekNumber) || null,
      week.startDate || '',
      week.notes || '',
      JSON.stringify(week),
      new Date().toISOString(),
    );
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run('activeWeekId', week.id);
  } else {
    const active = db.prepare("SELECT value FROM meta WHERE key = 'activeWeekId'").get() as
      | { value: string }
      | undefined;
    if (!active) {
      const first = db.prepare('SELECT id FROM weeks ORDER BY COALESCE(week_number, 999), name LIMIT 1').get() as {
        id: string;
      };
      db.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ).run('activeWeekId', first.id);
      db.prepare('UPDATE weeks SET active = CASE WHEN id = ? THEN 1 ELSE 0 END').run(first.id);
    }
  }
}

function migrateLegacyIfNeeded(db: AppDatabase): void {
  const flag = db.prepare("SELECT value FROM meta WHERE key = 'v2Migrated'").get();
  if (flag) return;

  const setCount = db.prepare('SELECT COUNT(*) as c FROM session_sets').get() as { c: number };
  const sessions = db.prepare('SELECT id, data FROM sessions').all() as { id: string; data: string }[];
  if (setCount.c === 0 && sessions.length) {
    const insertSet = db.prepare(
      `INSERT INTO session_sets (id, session_id, exercise_name, exercise_target, exercise_status, set_index, weight, reps, rpe, rir, journal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of sessions) {
      try {
        const s = JSON.parse(row.data) as Session;
        for (const log of s.logs || []) {
          if (log.status === 'skipped' || !log.sets?.length) {
            insertSet.run(
              id('set'),
              row.id,
              log.name,
              log.target || 'Other',
              log.status || 'skipped',
              0,
              null,
              null,
              null,
              null,
              log.journal || '',
            );
            continue;
          }
          for (const set of log.sets) {
            insertSet.run(
              id('set'),
              row.id,
              log.name,
              log.target || 'Other',
              log.status || 'completed',
              Number(set.s) || 0,
              Number(set.w) || 0,
              Number(set.r) || 0,
              set.rpe != null && set.rpe !== '' ? Number(set.rpe) : null,
              set.rir != null && set.rir !== '' ? Number(set.rir) : null,
              log.journal || '',
            );
          }
        }
      } catch {
        /* skip */
      }
    }
  }

  if (fs.existsSync(LEGACY_JSON_DB)) {
    try {
      const raw = JSON.parse(fs.readFileSync(LEGACY_JSON_DB, 'utf8'));
      importLegacyBundle(db, raw);
    } catch {
      /* ignore */
    }
  }
  if (fs.existsSync(LEGACY_SETTINGS)) {
    try {
      const raw = JSON.parse(fs.readFileSync(LEGACY_SETTINGS, 'utf8'));
      const current = emptySettings();
      const merged: AppSettings = { ...current, ...raw };
      if (merged.appPassword) merged.appPassword = encryptSecret(decryptSecret(merged.appPassword));
      if (merged.aiApiKey) merged.aiApiKey = encryptSecret(decryptSecret(merged.aiApiKey));
      db.prepare(
        'INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at',
      ).run(JSON.stringify(merged, null, 2), new Date().toISOString());
    } catch {
      /* ignore */
    }
  }

  const settingsRow = db.prepare('SELECT data FROM settings WHERE id = 1').get() as
    | { data: string }
    | undefined;
  if (settingsRow) {
    const s = { ...emptySettings(), ...JSON.parse(settingsRow.data) } as AppSettings;
    let changed = false;
    if (s.appPassword && !s.appPassword.startsWith('enc:v1:')) {
      s.appPassword = encryptSecret(s.appPassword);
      changed = true;
    }
    if (s.aiApiKey && !s.aiApiKey.startsWith('enc:v1:')) {
      s.aiApiKey = encryptSecret(s.aiApiKey);
      changed = true;
    }
    if (changed) {
      db.prepare('UPDATE settings SET data = ?, updated_at = ? WHERE id = 1').run(
        JSON.stringify(s, null, 2),
        new Date().toISOString(),
      );
    }
  }

  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('v2Migrated', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(new Date().toISOString());
}

function importLegacyBundle(db: AppDatabase, raw: Record<string, unknown>): void {
  const weeks = (raw.weeks as Week[]) || [];
  const sessions = (raw.sessions as Session[]) || [];
  const readiness = (raw.readiness as Readiness[]) || [];
  const targets = (raw.targets as Target[]) || [];
  const measurements = (raw.measurements as Measurement[]) || [];

  const hasWeek = db.prepare('SELECT id FROM weeks WHERE id = ?');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, name, week_number, active, status, start_date, notes, data, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
  );
  for (const week of weeks) {
    if (!week?.id || hasWeek.get(week.id)) continue;
    insertWeek.run(
      week.id,
      week.name,
      Number(week.weekNumber) || null,
      week.active ? 1 : 0,
      week.startDate || '',
      week.notes || '',
      JSON.stringify(week),
      new Date().toISOString(),
    );
  }

  const hasSession = db.prepare('SELECT id FROM sessions WHERE id = ?');
  const insertSession = db.prepare(
    `INSERT INTO sessions (id, date, week_id, day_key, day_title, athlete_name, status, sleep, soreness, notes, readiness_json, completed_by_library, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const s of sessions) {
    if (!s?.id || hasSession.get(s.id)) continue;
    insertSession.run(
      s.id,
      s.date || '',
      s.weekId || '',
      s.dayKey || '',
      s.dayTitle || '',
      s.name || '',
      s.status || 'finished',
      s.sleep ?? null,
      s.soreness ?? null,
      s.notes || '',
      s.readiness ? JSON.stringify(s.readiness) : null,
      s.completedByLibrary ? 1 : 0,
      JSON.stringify(s),
      s.createdAt || new Date().toISOString(),
      s.updatedAt || null,
    );
  }

  const hasReady = db.prepare('SELECT id FROM readiness WHERE id = ?');
  const insertReady = db.prepare(
    `INSERT INTO readiness (id, week_id, day_key, date, sleep_hours, sleep_quality, soreness, energy, stress, motivation, mood, hydration, meal_protein, pain_flag, resting_heart_rate, notes, score, band, recommendation, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of readiness) {
    if (!r?.date || hasReady.get(r.id || r.date)) continue;
    insertReady.run(
      r.id || r.date,
      r.weekId || ('legacy_' + r.date),
      r.dayKey || ('legacy_' + r.date),
      r.date,
      r.sleepHours,
      r.sleepQuality,
      r.soreness,
      r.energy,
      r.stress,
      r.motivation,
      r.mood,
      r.hydration,
      r.mealProtein,
      r.painFlag ? 1 : 0,
      r.restingHeartRate === '' ? null : r.restingHeartRate,
      r.notes || '',
      r.score || 0,
      r.band || 'Ready',
      r.recommendation || '',
      JSON.stringify(r),
      r.createdAt || new Date().toISOString(),
      r.updatedAt || new Date().toISOString(),
    );
  }

  const hasTarget = db.prepare('SELECT id FROM targets WHERE id = ?');
  for (const t of targets) {
    if (!t?.id || hasTarget.get(t.id)) continue;
    db.prepare(
      `INSERT INTO targets (id, name, type, current_value, target_value, unit, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      t.id,
      t.name,
      t.type || '',
      String(t.current ?? ''),
      String(t.target ?? ''),
      t.unit || '',
      JSON.stringify(t),
      t.createdAt || new Date().toISOString(),
    );
  }

  const hasMeas = db.prepare('SELECT id FROM measurements WHERE id = ?');
  for (const m of measurements) {
    if (!m?.id || hasMeas.get(m.id)) continue;
    db.prepare(
      `INSERT INTO measurements (id, date, weight, waist, chest, arms, notes, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      m.id,
      m.date || '',
      m.weight ?? null,
      m.waist ?? null,
      m.chest ?? null,
      m.arms ?? null,
      m.notes || '',
      JSON.stringify(m),
      m.createdAt || new Date().toISOString(),
    );
  }

  if (raw.meta && typeof raw.meta === 'object' && (raw.meta as { activeWeekId?: string }).activeWeekId) {
    const activeWeekId = (raw.meta as { activeWeekId: string }).activeWeekId;
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run('activeWeekId', activeWeekId);
  }
}
