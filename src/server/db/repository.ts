import { publishSourceEvent } from '../services/automation-store.js';
import { HEALTH_OS_SENDER_EMAIL, HEALTH_OS_SENDER_NAME, SQLITE_FILE, isHealthOsEmailConfigured } from '../config.js';
import { mergeDailyReadiness } from '../../shared/readiness.js';
import type { BioRecord } from '../../shared/biology.js';
import { emptySettings, defaultProfile } from '../../shared/defaults.js';
import { APP_VERSION } from '../../shared/version.js';
import { GITHUB_UPDATES_REPO, GITHUB_UPDATES_ENABLED } from '../../shared/update-repo.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import { id } from '../lib/ids.js';
import type {
  AppDb,
  AppSettings,
  CardioSession,
  Exercise,
  GoalCheckIn,
  Habit,
  HabitLog,
  Measurement,
  PainLog,
  Profile,
  Program,
  PublicSettings,
  Readiness,
  ScheduledWorkout,
  Session,
  Target,
  TrainingConfig,
  Week,
  WeeklyReview,
} from '../../shared/types.js';
import { getDb, withTransaction } from './connection.js';
import { catalogExercise, type CatalogSnapshot } from '../../shared/global-exercises.js';
import { starterWeek } from './seed.js';
import type { WorkoutRepository } from '../../shared/repository.js';
import { defaultTrainingConfig } from '../../shared/training.js';
import {
  defaultSkinRoutines,
  emptySkinProfile,
  emptySkinState,
  emptyCareData,
  type CareData,
  type CarePhoto,
  type SkinLog,
  type SkinProduct,
  type SkinProfile,
  type SkinRoutine,
  type SkinState,
} from '../../shared/skin.js';

function normalizeWeek(week: Partial<Week> & { name?: string; days?: Week['days'] }): Week | null {
  if (!week || !week.name || !Array.isArray(week.days)) return null;
  const clean: Week = {
    id: week.id || id('week'),
    name: String(week.name || '').trim(),
    weekNumber: week.weekNumber ?? '',
    startDate: week.startDate || '',
    notes: week.notes || '',
    active: Boolean(week.active),
    status: week.status || 'active',
    missionObjective: week.missionObjective,
    programId: week.programId,
    phase: week.phase,
    mode: week.mode === 'flexible' ? 'flexible' : 'planned',
    flexibleStartDate: week.flexibleStartDate,
    flexibleEndDate: week.flexibleEndDate,
    flexibleFirstDayKey: week.flexibleFirstDayKey,
    dayStates: week.dayStates,
    days: week.days.map((day, i) => ({
      key: day.key || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] || `Day ${i + 1}`,
      type: day.type || '',
      title: day.title || '',
      subtitle: day.subtitle || '',
      muscles: Array.isArray(day.muscles) ? day.muscles : [],
      scheduledDate: day.scheduledDate,
      exercises: Array.isArray(day.exercises)
        ? day.exercises.map((ex) => ({
            name: ex.name || 'New Exercise',
            target: ex.target || 'Other',
            vol: ex.vol || '3 x 8-12',
            cue: ex.cue || '',
            exerciseId: ex.exerciseId,
            familyId: ex.familyId,
            supersetGroup: ex.supersetGroup,
            percent1rm: ex.percent1rm,
            rirTarget: ex.rirTarget,
            rpeTarget: ex.rpeTarget,
            tempo: ex.tempo,
            restSec: ex.restSec,
            notes: ex.notes,
            trackingMode: ex.trackingMode,
          }))
        : [],
    })),
  };
  return clean.name ? clean : null;
}

/** Applies a PATCH-like week update without allowing metadata-only saves to erase days. */
export function mergeWeekUpdate(existing: Week, patch: Partial<Week>): Week {
  return {
    ...existing,
    ...patch,
    id: existing.id,
    days: patch.days === undefined ? existing.days : patch.days,
  };
}

export function getActiveWeekId(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key = 'activeWeekId'").get() as
    | { value: string }
    | undefined;
  if (row?.value) return row.value;
  const first = db.prepare('SELECT id FROM weeks LIMIT 1').get() as { id: string } | undefined;
  return first?.id || starterWeek().id;
}

export function setActiveWeekId(weekId: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).run('activeWeekId', weekId);
  db.prepare('UPDATE weeks SET active = CASE WHEN id = ? THEN 1 ELSE 0 END').run(weekId);
}

export function getProfile(): Profile {
  const row = getDb().prepare('SELECT display_name, units, height, created_at FROM profiles WHERE id = 1').get() as
    | { display_name: string; units: string; height: number; created_at: string }
    | undefined;
  if (!row) return defaultProfile();
  return {
    displayName: row.display_name || '',
    units: row.units === 'lb' ? 'lb' : 'kg',
    height: row.height,
    createdAt: row.created_at,
  };
}

export function saveProfile(profile: Partial<Profile>): Profile {
  const current = getProfile();
  const next: Profile = {
    displayName: String(profile.displayName || current.displayName || '').trim(),
    units: profile.units === 'lb' ? 'lb' : 'kg',
    height: profile.height ?? current.height,
    createdAt: current.createdAt || new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO profiles (id, display_name, units, height, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, units=excluded.units, height=excluded.height, updated_at=excluded.updated_at`,
    )
    .run(next.displayName, next.units, next.height ?? null, next.createdAt, new Date().toISOString());
  return next;
}

export function getSettings(): AppSettings {
  const row = getDb().prepare('SELECT data FROM settings WHERE id = 1').get() as { data: string } | undefined;
  const raw = { ...emptySettings(), ...(row ? JSON.parse(row.data) : {}) } as AppSettings;
  // Settings backups can move between Windows user profiles or machines. A machine-local
  // encryption key cannot read those old integration secrets, but that must never stop
  // workouts and records from loading. Treat only the unreadable secret as disconnected.
  const readSecret = (value: string | undefined, label: string) => {
    try {
      return decryptSecret(value || '');
    } catch {
      console.warn(`[settings] ${label} could not be decrypted and needs to be connected again.`);
      return '';
    }
  };
  return {
    ...raw,
    appPassword: readSecret(raw.appPassword, 'Email app password'),
    aiApiKey: readSecret(raw.aiApiKey, 'AI API key'),
    openRouterApiKey: readSecret(raw.openRouterApiKey, 'OpenRouter API key'),
    nvidiaNimApiKey: readSecret(raw.nvidiaNimApiKey, 'NVIDIA API key'),
    braveSearchApiKey: readSecret(raw.braveSearchApiKey, 'Brave Search API key'),
    tavilyApiKey: readSecret(raw.tavilyApiKey, 'Tavily API key'),
    googleClientSecret: readSecret(raw.googleClientSecret, 'Google OAuth secret'),
    googleRefreshToken: readSecret(raw.googleRefreshToken, 'Google Fit connection'),
    gdriveRefreshToken: readSecret(raw.gdriveRefreshToken, 'Google Drive connection'),
    recipients: Array.isArray(raw.recipients) ? raw.recipients : [],
  };
}

export function saveSettings(partial: Partial<AppSettings> & { appPassword?: string; aiApiKey?: string; braveSearchApiKey?: string; tavilyApiKey?: string }): AppSettings {
  const old = getSettings();
  const next: AppSettings = {
    ...old,
    ...partial,
    senderName: HEALTH_OS_SENDER_NAME,
    senderEmail: HEALTH_OS_SENDER_EMAIL,
    recipients: partial.recipients ?? old.recipients,
    streakStartDate: partial.streakStartDate ?? old.streakStartDate ?? '',
    aiProvider: partial.aiProvider ?? old.aiProvider,
    aiModel: partial.aiModel ?? old.aiModel,
    pinHash: partial.pinHash ?? old.pinHash,
    secretsSalt: partial.secretsSalt ?? old.secretsSalt,
    gender: partial.gender ?? old.gender,
    // User mail credentials are retired. The product sender is configured server-side.
    appPassword: '',
    aiApiKey:
      partial.aiApiKey !== undefined && partial.aiApiKey !== '' ? partial.aiApiKey : old.aiApiKey,
    openRouterApiKey: partial.openRouterApiKey !== undefined && partial.openRouterApiKey !== '' ? partial.openRouterApiKey : old.openRouterApiKey,
    nvidiaNimApiKey: partial.nvidiaNimApiKey !== undefined && partial.nvidiaNimApiKey !== '' ? partial.nvidiaNimApiKey : old.nvidiaNimApiKey,
    braveSearchApiKey:
      partial.braveSearchApiKey !== undefined && partial.braveSearchApiKey !== '' ? partial.braveSearchApiKey : old.braveSearchApiKey,
    tavilyApiKey: partial.tavilyApiKey !== undefined && partial.tavilyApiKey !== '' ? partial.tavilyApiKey : old.tavilyApiKey,
    tavilySearchCount: partial.tavilySearchCount ?? old.tavilySearchCount ?? 0,
    tavilySearchMonth: partial.tavilySearchMonth ?? old.tavilySearchMonth ?? '',
    googleClientId: partial.googleClientId !== undefined ? partial.googleClientId : old.googleClientId,
    googleClientSecret: partial.googleClientSecret !== undefined ? partial.googleClientSecret : old.googleClientSecret,
    googleRefreshToken: partial.googleRefreshToken !== undefined ? partial.googleRefreshToken : old.googleRefreshToken,
    isActivated: partial.isActivated ?? old.isActivated,
    productKeyHash: partial.productKeyHash ?? old.productKeyHash,
    hasSeenFeatureGuide: partial.hasSeenFeatureGuide ?? old.hasSeenFeatureGuide,
    githubUpdatesRepo:
      partial.githubUpdatesRepo !== undefined ? String(partial.githubUpdatesRepo || '').trim() : old.githubUpdatesRepo,
    autoCheckUpdates:
      partial.autoCheckUpdates !== undefined ? Boolean(partial.autoCheckUpdates) : old.autoCheckUpdates !== false,
    weeklyGoal: partial.weeklyGoal !== undefined ? Math.max(1, Math.min(14, Number(partial.weeklyGoal) || 4)) : old.weeklyGoal || 4,
    restSeconds: partial.restSeconds !== undefined ? Math.max(0, Math.min(600, Number(partial.restSeconds) || 0)) : old.restSeconds ?? 90,
  };
  const stored = {
    ...next,
    appPassword: next.appPassword ? encryptSecret(next.appPassword) : '',
    aiApiKey: next.aiApiKey ? encryptSecret(next.aiApiKey) : '',
    openRouterApiKey: next.openRouterApiKey ? encryptSecret(next.openRouterApiKey) : '',
    nvidiaNimApiKey: next.nvidiaNimApiKey ? encryptSecret(next.nvidiaNimApiKey) : '',
    braveSearchApiKey: next.braveSearchApiKey ? encryptSecret(next.braveSearchApiKey) : '',
    tavilyApiKey: next.tavilyApiKey ? encryptSecret(next.tavilyApiKey) : '',
    googleClientSecret: next.googleClientSecret ? encryptSecret(next.googleClientSecret) : '',
    googleRefreshToken: next.googleRefreshToken ? encryptSecret(next.googleRefreshToken) : '',
    gdriveRefreshToken: next.gdriveRefreshToken ? encryptSecret(next.gdriveRefreshToken) : '',
  };
  getDb()
    .prepare(
      `INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
    )
    .run(JSON.stringify(stored, null, 2), new Date().toISOString());
  return next;
}

/** Remove legacy per-user SMTP credentials when an existing installation starts. */
export function retireLegacyEmailCredentials(): void {
  const current = getSettings();
  if (current.appPassword || current.senderEmail !== HEALTH_OS_SENDER_EMAIL || current.senderName !== HEALTH_OS_SENDER_NAME) {
    saveSettings({});
  }
}

export function publicSettings(): PublicSettings {
  const s = getSettings();
  const p = getProfile();
  return {
    senderName: HEALTH_OS_SENDER_NAME,
    userEmail: s.userEmail || '',
    senderEmail: HEALTH_OS_SENDER_EMAIL,
    recipients: Array.isArray(s.recipients) ? s.recipients : [],
    hasAppPassword: false,
    hasEmailDelivery: isHealthOsEmailConfigured(),
    streakStartDate: s.streakStartDate || '',
    aiProvider: s.aiProvider || '',
    aiModel: s.aiModel || '',
    hasAiApiKey: Boolean(s.aiApiKey),
    hasOpenRouterApiKey: Boolean(s.openRouterApiKey),
    hasNvidiaNimApiKey: Boolean(s.nvidiaNimApiKey),
    hasPin: Boolean(s.pinHash),
    profileName: p.displayName,
    units: p.units,
    height: p.height,
    hasTelegramBot: Boolean(s.telegramBotToken && s.telegramChatId),
    telegramMiniAppUrl: s.telegramMiniAppUrl || '',
    reportSchedule: s.reportSchedule || 'Sunday 20:00',
    hasBraveSearchApiKey: Boolean(s.braveSearchApiKey),
    hasTavilyApiKey: Boolean(s.tavilyApiKey),
    tavilySearchCount: s.tavilySearchCount || 0,
    tavilySearchMonth: s.tavilySearchMonth || '',
    gender: s.gender || 'male',
    hasGoogleFit: Boolean(s.googleRefreshToken),
    isActivated: s.isActivated,
    hasSeenFeatureGuide: s.hasSeenFeatureGuide,
    githubUpdatesRepo: GITHUB_UPDATES_REPO,
    autoCheckUpdates: GITHUB_UPDATES_ENABLED && s.autoCheckUpdates !== false,
    appVersion: APP_VERSION,
    hasGdrive: s.gdriveEnabled,
    hasGoogleOAuthConfig: Boolean(s.googleClientId && s.googleClientSecret),
    gdriveSchedule: s.gdriveSchedule,
    gdriveLastBackup: s.gdriveLastBackup,
    gdriveLastBackupSize: s.gdriveLastBackupSize,
    weeklyGoal: s.weeklyGoal || 4,
    restSeconds: s.restSeconds ?? 90,
  };
}

export function listWeeks(): Week[] {
  const activeId = getActiveWeekId();
  const rows = getDb()
    .prepare('SELECT data FROM weeks ORDER BY COALESCE(week_number, 999), name')
    .all() as { data: string }[];
  return rows.map((r) => {
    const w = JSON.parse(r.data) as Week;
    w.active = w.id === activeId;
    return w;
  });
}

export function getWeek(weekId: string): Week | null {
  const row = getDb().prepare('SELECT data FROM weeks WHERE id = ?').get(weekId) as
    | { data: string }
    | undefined;
  if (!row) return null;
  const w = JSON.parse(row.data) as Week;
  w.active = w.id === getActiveWeekId();
  return w;
}

export function upsertWeek(weekInput: Partial<Week>, makeActive = false): Week {
  const week = normalizeWeek(weekInput);
  if (!week) throw new Error('Week needs name and days.');
  const db = getDb();
  const activeId = makeActive ? week.id : getActiveWeekId();
  db.prepare(
    `INSERT INTO weeks (id, name, week_number, active, status, start_date, notes, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, week_number=excluded.week_number, active=excluded.active,
       status=excluded.status, start_date=excluded.start_date, notes=excluded.notes,
       data=excluded.data, updated_at=excluded.updated_at`,
  ).run(
    week.id,
    week.name,
    Number(week.weekNumber) || null,
    week.id === activeId ? 1 : 0,
    week.status || 'active',
    week.startDate || '',
    week.notes || '',
    JSON.stringify(week),
    new Date().toISOString(),
  );
  if (makeActive) setActiveWeekId(week.id);
  return getWeek(week.id)!;
}

export function deleteWeek(weekId: string): void {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM weeks').get() as { c: number };
  if (count.c <= 1) throw new Error('Cannot delete the final remaining week.');
  const exists = db.prepare('SELECT id FROM weeks WHERE id = ?').get(weekId);
  if (!exists) throw new Error('Week not found.');

  withTransaction(() => {
    db.prepare('DELETE FROM sessions WHERE week_id = ?').run(weekId);
    db.prepare('DELETE FROM weeks WHERE id = ?').run(weekId);
    if (getActiveWeekId() === weekId) {
      const next = db.prepare('SELECT id FROM weeks LIMIT 1').get() as { id: string };
      setActiveWeekId(next.id);
    }
  });
}

export function listSessions(): Session[] {
  const rows = getDb()
    .prepare('SELECT data FROM sessions ORDER BY created_at')
    .all() as { data: string }[];
  const allReadiness = listReadiness();
  return rows.map((r) => {
    const s = JSON.parse(r.data) as Session;
    if (s.status === 'completed' || !s.status) s.status = 'finished';
    if (!s.readiness || !s.readiness.score) {
      const match = allReadiness.find((rd) =>
        (s.weekId && s.dayKey && rd.weekId === s.weekId && rd.dayKey === s.dayKey) ||
        (s.date && rd.date === s.date)
      );
      if (match) s.readiness = match;
    }
    return s;
  });
}

export function getSession(sessionId: string): Session | null {
  const row = getDb().prepare('SELECT data FROM sessions WHERE id = ?').get(sessionId) as
    | { data: string }
    | undefined;
  if (!row) return null;
  const s = JSON.parse(row.data) as Session;
  if (s.status === 'completed' || !s.status) s.status = 'finished';
  if (!s.readiness || !s.readiness.score) {
    const allReadiness = listReadiness();
    const match = allReadiness.find((rd) =>
      (s.weekId && s.dayKey && rd.weekId === s.weekId && rd.dayKey === s.dayKey) ||
      (s.date && rd.date === s.date)
    );
    if (match) s.readiness = match;
  }
  return s;
}

export function findDuplicateSession(
  weekId: string,
  dayKey: string,
  ignoreId = '',
): Session | undefined {
  return listSessions().find(
    (s) =>
      s.id !== ignoreId &&
      (s.status === 'finished' || s.status === 'completed') &&
      s.weekId === weekId &&
      s.dayKey === dayKey,
  );
}

export function saveSession(session: Session): Session {
  const normalizedStatus = (session.status === 'completed' || !session.status) ? 'finished' : session.status;
  const normalizedSession: Session = { ...session, status: normalizedStatus };
  if (!normalizedSession.readiness || !normalizedSession.readiness.score) {
    try {
      const allReadiness = listReadiness();
      const match = allReadiness.find((rd) =>
        (normalizedSession.weekId && normalizedSession.dayKey && rd.weekId === normalizedSession.weekId && rd.dayKey === normalizedSession.dayKey) ||
        (normalizedSession.date && rd.date === normalizedSession.date)
      );
      if (match) normalizedSession.readiness = match;
    } catch {}
  }
  const db = getDb();
  withTransaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, date, week_id, day_key, day_title, athlete_name, status, sleep, soreness, notes, readiness_json, completed_by_library, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         date=excluded.date, week_id=excluded.week_id, day_key=excluded.day_key, day_title=excluded.day_title,
         athlete_name=excluded.athlete_name, status=excluded.status, sleep=excluded.sleep, soreness=excluded.soreness,
         notes=excluded.notes, readiness_json=excluded.readiness_json, completed_by_library=excluded.completed_by_library,
         data=excluded.data, updated_at=excluded.updated_at`,
    ).run(
      normalizedSession.id,
      normalizedSession.date || '',
      normalizedSession.weekId || '',
      normalizedSession.dayKey || '',
      normalizedSession.dayTitle || '',
      normalizedSession.name || '',
      normalizedStatus,
      normalizedSession.sleep === '' ? null : normalizedSession.sleep,
      normalizedSession.soreness === '' ? null : normalizedSession.soreness,
      normalizedSession.notes || '',
      normalizedSession.readiness ? JSON.stringify(normalizedSession.readiness) : null,
      normalizedSession.completedByLibrary ? 1 : 0,
      JSON.stringify(normalizedSession),
      normalizedSession.createdAt || new Date().toISOString(),
      normalizedSession.updatedAt || new Date().toISOString(),
    );

    db.prepare('DELETE FROM session_sets WHERE session_id = ?').run(session.id);
    const insertSet = db.prepare(
      `INSERT INTO session_sets (id, session_id, exercise_name, exercise_target, exercise_status, set_index, weight, reps, rpe, rir, journal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const log of session.logs || []) {
      if (log.status === 'skipped' || !log.sets?.length) {
        insertSet.run(
          id('set'),
          session.id,
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
          session.id,
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
  });
  publishSourceEvent(normalizedStatus==='finished'?'workout.completed':'workout.updated',session.id,session.date,session);
  return session;
}

export function deleteSession(sessionId: string): void {
  const previous=getSession(sessionId);
  const db = getDb();
  withTransaction(() => {
    db.prepare('DELETE FROM session_sets WHERE session_id = ?').run(sessionId);
    const info = db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    if (info.changes === 0) throw new Error('Record not found.');
  });
  publishSourceEvent('workout.deleted',sessionId,previous?.date||'',{deleted:true,previous});
}

export function resetDataKeepSettings(): void {
  const db = getDb();
  withTransaction(() => {
    const tables = ['sessions', 'session_sets', 'habits', 'habit_logs', 'measurements', 'readiness', 'targets', 'goals', 'weekly_reviews', 'queue'];
    for (const t of tables) {
      try { db.prepare(`DELETE FROM ${t}`).run(); } catch (e) {}
    }
    const active = getActiveWeekId();
    try {
      db.prepare('DELETE FROM weeks WHERE id != ?').run(active);
    } catch (e) {}
  });
}

export function hardResetWipeEverything(): void {
  const db = getDb();
  withTransaction(() => {
    const tables = ['sessions', 'session_sets', 'habits', 'habit_logs', 'measurements', 'readiness', 'targets', 'goals', 'weekly_reviews', 'queue', 'weeks', 'profiles', 'settings', 'meta'];
    for (const t of tables) {
      try { db.prepare(`DELETE FROM ${t}`).run(); } catch (e) {}
    }
  });
}

export function listReadiness(): Readiness[] {
  return (getDb().prepare('SELECT id, week_id, day_key, data FROM readiness ORDER BY date DESC').all() as { id: string; week_id: string; day_key: string; data: string }[]).map(
    (r) => {
      const item = JSON.parse(r.data) as Readiness;
      if (!item.id) item.id = r.id;
      if (!item.weekId) item.weekId = r.week_id;
      if (!item.dayKey) item.dayKey = r.day_key;
      return item;
    }
  );
}

export function saveReadiness(item: Readiness): Readiness {
  if (!item.date) item.date = new Date().toISOString().slice(0, 10);
  item.id = item.date;
  if (!item.weekId) item.weekId = 'daily';
  if (!item.dayKey) item.dayKey = item.date;
  const db = getDb();
  db.prepare('DELETE FROM readiness WHERE id = ? OR date = ? OR (week_id = ? AND day_key = ?)').run(
    item.id,
    item.date,
    item.weekId,
    item.dayKey,
  );
  db.prepare(
    `INSERT INTO readiness (id, week_id, day_key, date, sleep_hours, sleep_quality, steps, soreness, energy, stress, motivation, mood, hydration, meal_protein, pain_flag, resting_heart_rate, notes, score, band, recommendation, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.weekId,
    item.dayKey,
    item.date,
    item.sleepHours ?? null,
    item.sleepQuality ?? null,
    item.steps ?? null,
    item.soreness ?? null,
    item.energy ?? null,
    item.stress ?? null,
    item.motivation ?? null,
    item.mood ?? null,
    item.hydration ?? null,
    item.mealProtein ?? null,
    item.painFlag ? 1 : 0,
    item.restingHeartRate === '' || item.restingHeartRate == null ? null : item.restingHeartRate,
    item.notes || '',
    item.score ?? 0,
    item.band ?? 'moderate',
    item.recommendation ?? '',
    JSON.stringify(item),
    item.createdAt || new Date().toISOString(),
    item.updatedAt || new Date().toISOString(),
  );

  try {
    const matchedSessions = getDb()
      .prepare('SELECT id, data FROM sessions WHERE date = ? OR (week_id = ? AND day_key = ?)')
      .all(item.date, item.weekId, item.dayKey) as { id: string; data: string }[];
    for (const ms of matchedSessions) {
      const sess = JSON.parse(ms.data) as Session;
      if (!sess.readiness || !sess.readiness.score) {
        sess.readiness = item;
        getDb()
          .prepare('UPDATE sessions SET readiness_json = ?, data = ? WHERE id = ?')
          .run(JSON.stringify(item), JSON.stringify(sess), sess.id);
      }
    }
  } catch {}

  publishSourceEvent('readiness.checkin_completed',item.id,item.date,item);
  return item;
}

export function listTargets(): Target[] {
  return (getDb().prepare('SELECT data FROM targets ORDER BY created_at').all() as { data: string }[]).map(
    (r) => JSON.parse(r.data) as Target,
  );
}

export function saveTarget(item: Target): Target {
  getDb()
    .prepare(
      `INSERT INTO targets (id, name, type, current_value, target_value, unit, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, current_value=excluded.current_value,
         target_value=excluded.target_value, unit=excluded.unit, data=excluded.data`,
    )
    .run(
      item.id,
      item.name,
      item.type || '',
      String(item.current ?? ''),
      String(item.target ?? ''),
      item.unit || '',
      JSON.stringify(item),
      item.createdAt || new Date().toISOString(),
    );
  publishSourceEvent('goal.updated',item.id,new Date().toISOString().slice(0,10),item);
  return item;
}

export function deleteTarget(targetId: string): void {
  getDb().prepare('DELETE FROM targets WHERE id = ?').run(targetId);
}

export function listMeasurements(): Measurement[] {
  return (
    getDb().prepare('SELECT data FROM measurements ORDER BY date, created_at').all() as { data: string }[]
  ).map((r) => JSON.parse(r.data) as Measurement);
}

export function saveMeasurement(item: Measurement): Measurement {
  getDb()
    .prepare(
      `INSERT INTO measurements (id, date, weight, waist, chest, arms, neck, bmr, body_fat, muscle_mass, water_percentage, notes, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET date=excluded.date, weight=excluded.weight, waist=excluded.waist,
         chest=excluded.chest, arms=excluded.arms, neck=excluded.neck, bmr=excluded.bmr, body_fat=excluded.body_fat, 
         muscle_mass=excluded.muscle_mass, water_percentage=excluded.water_percentage, 
         notes=excluded.notes, data=excluded.data`,
    )
    .run(
      item.id,
      item.date || '',
      item.weight ?? null,
      item.waist ?? null,
      item.chest ?? null,
      item.arms ?? null,
      item.neck ?? null,
      item.bmr ?? null,
      item.bodyFat ?? null,
      item.muscleMass ?? null,
      item.waterPercentage ?? null,
      item.notes || '',
      JSON.stringify(item),
      item.createdAt || new Date().toISOString(),
    );
  publishSourceEvent('measurement.logged',item.id,item.date,item);
  return item;
}

export function deleteMeasurement(measurementId: string): void {
  getDb().prepare('DELETE FROM measurements WHERE id = ?').run(measurementId);
}

export function deleteHabit(habitId: string): void {
  const db = getDb();
  const logs = listHabitLogs().filter((l) => l.habitId === habitId);
  for (const l of logs) {
    db.prepare('DELETE FROM habit_logs WHERE id = ?').run(l.id);
  }
  db.prepare('DELETE FROM habits WHERE id = ?').run(habitId);
}

export function deleteCardioSession(cardioId: string): void {
  getDb().prepare('DELETE FROM cardio_sessions WHERE id = ?').run(cardioId);
}

export function loadAppDb(): AppDb {
  const activeWeekId = getActiveWeekId();
  const hasBiology = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='biological_records'").get();
  const biological: BioRecord[] = hasBiology ? (getDb().prepare('SELECT data FROM biological_records').all() as {data:string}[]).map(row => JSON.parse(decryptSecret(row.data))) : [];
  getDb().exec('CREATE TABLE IF NOT EXISTS health_readings(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
  return {
    healthReadings: (getDb().prepare('SELECT data FROM health_readings').all() as {data:string}[]).map(r => JSON.parse(r.data)),
    meta: {
      version: 6,
      createdAt: new Date().toISOString(),
      activeWeekId,
      storage: 'sqlite-relational',
      sqliteFile: SQLITE_FILE,
    },
    weeks: listWeeks(),
    sessions: listSessions(),
    readiness: mergeDailyReadiness(listReadiness(), biological),
    targets: listTargets(),
    measurements: listMeasurements(),
    goalCheckIns: listGoalCheckIns(),
    habits: listHabits(),
    habitLogs: listHabitLogs(),
    cardio: listCardioSessions(),
    weeklyReviews: listWeeklyReviews(),
    notes: [],
    profile: getProfile(),
    exercises: listExercises(),
    librarySplits: listLibrarySplits(),
    programs: listPrograms(),
    painLogs: listPainLogs(),
    scheduledWorkouts: listScheduledWorkouts(),
    trainingConfig: getTrainingConfig(),
    skin: loadSkinState(),
  };
}

export function restoreBackup(payload: Partial<AppDb>): void {
  if (!payload.weeks || !payload.sessions) throw new Error('Invalid backup.');
  const db = getDb();
  withTransaction(() => {
  withTransaction(() => {
    db.prepare('DELETE FROM session_sets').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM readiness').run();
    db.prepare('DELETE FROM targets').run();
    db.prepare('DELETE FROM measurements').run();
    db.prepare('DELETE FROM weeks').run();
    db.exec('CREATE TABLE IF NOT EXISTS health_readings(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
    db.prepare('DELETE FROM health_readings').run();
    for (const [field, table] of Object.entries({habits:'habits',habitLogs:'habit_logs',cardio:'cardio_sessions',goalCheckIns:'goal_check_ins',weeklyReviews:'weekly_reviews',exercises:'exercise_library',programs:'programs',painLogs:'pain_logs',scheduledWorkouts:'scheduled_workouts'})) {
      if (Array.isArray((payload as Record<string,unknown>)[field])) db.prepare(`DELETE FROM ${table}`).run();
    }
  });

  for (const week of payload.weeks || []) {
    const w = normalizeWeek(week);
    if (!w) continue;
    db.prepare(
      `INSERT INTO weeks (id, name, week_number, active, status, start_date, notes, data, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    ).run(
      w.id,
      w.name,
      Number(w.weekNumber) || null,
      w.status || 'active',
      w.startDate || '',
      w.notes || '',
      JSON.stringify(w),
      new Date().toISOString(),
    );
  }
  for (const s of payload.sessions || []) saveSession(s as Session);
  for (const r of payload.readiness || []) saveReadiness(r as Readiness);
  for (const t of payload.targets || []) saveTarget(t as Target);
  for (const m of payload.measurements || []) saveMeasurement(m as Measurement);
  for (const c of payload.goalCheckIns || []) saveGoalCheckIn(c as GoalCheckIn);
  for (const h of payload.habits || []) saveHabit(h as Habit);
  for (const hl of payload.habitLogs || []) saveHabitLog(hl as HabitLog);
  for (const cs of payload.cardio || []) saveCardioSession(cs as CardioSession);
  for (const wr of payload.weeklyReviews || []) saveWeeklyReview(wr as WeeklyReview);
  for (const ex of payload.exercises || []) saveExercise(ex as Exercise);
  for (const p of payload.programs || []) saveProgram(p as Program);
  for (const pl of payload.painLogs || []) savePainLog(pl as PainLog);
  for (const sw of payload.scheduledWorkouts || []) saveScheduledWorkout(sw as ScheduledWorkout);
  for (const reading of payload.healthReadings || []) db.prepare('INSERT INTO health_readings(id,data) VALUES(?,?)').run(reading.id,JSON.stringify(reading));
  if (payload.trainingConfig) saveTrainingConfig(payload.trainingConfig);
  if (payload.skin) restoreSkinState(payload.skin);

  const active =
    payload.meta?.activeWeekId ||
    (payload.weeks?.[0] as Week | undefined)?.id ||
    starterWeek().id;
  setActiveWeekId(active);
  if (payload.profile) saveProfile(payload.profile);
  });
}

export function logEvent(type: string, payload: unknown): void {
  getDb()
    .prepare('INSERT INTO events (id, type, payload, created_at) VALUES (?, ?, ?, ?)')
    .run(id('evt'), type, JSON.stringify(payload), new Date().toISOString());
}

export function lastExercisePerformance(exerciseName: string): {
  weight: number;
  reps: number;
  date: string;
} | null {
  const row = getDb()
    .prepare(
      `SELECT ss.weight, ss.reps, s.date
       FROM session_sets ss
       JOIN sessions s ON s.id = ss.session_id
       WHERE ss.exercise_name = ? AND ss.exercise_status != 'skipped' AND ss.set_index > 0
       ORDER BY s.date DESC, ss.set_index DESC
       LIMIT 1`,
    )
    .get(exerciseName) as { weight: number; reps: number; date: string } | undefined;
  return row || null;
}

export function listHabits(): Habit[] {
  return (getDb().prepare('SELECT data FROM habits ORDER BY created_at').all() as { data: string }[]).map(r => JSON.parse(r.data));
}

export function saveHabit(item: Habit): Habit {
  getDb().prepare(`INSERT INTO habits (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(item.id, JSON.stringify(item), item.createdAt || new Date().toISOString());
  publishSourceEvent('habit.updated',item.id,new Date().toISOString().slice(0,10),item);
  return item;
}

export function listHabitLogs(): HabitLog[] {
  return (getDb().prepare('SELECT data FROM habit_logs ORDER BY date, created_at').all() as { data: string }[]).map(r => JSON.parse(r.data));
}

export function saveHabitLog(item: HabitLog): HabitLog {
  saveIndexedRecord('habit_logs','date',item.date,item);
  publishSourceEvent('habit.progressed',item.id,item.date,item);
  return item;
}

export function listCardioSessions(): CardioSession[] {
  return (getDb().prepare('SELECT data FROM cardio_sessions ORDER BY date DESC').all() as { data: string }[]).map(r => JSON.parse(r.data));
}

export function saveCardioSession(item: CardioSession): CardioSession {
  saveIndexedRecord('cardio_sessions','date',item.date,item);
  publishSourceEvent('cardio.logged',item.id,item.date,item);
  return item;
}

export function listGoalCheckIns(): GoalCheckIn[] {
  return (getDb().prepare('SELECT data FROM goal_check_ins ORDER BY date DESC').all() as { data: string }[]).map(r => JSON.parse(r.data));
}

export function saveGoalCheckIn(item: GoalCheckIn): GoalCheckIn {
  saveIndexedRecord('goal_check_ins','date',item.date,item);
  // Keep target.current in sync with latest check-in value
  const targets = listTargets();
  const t = targets.find((x) => x.id === item.goalId);
  if (t) {
    const latest=listGoalCheckIns().filter(c=>c.goalId===item.goalId).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0];
    const lower=String(t.type).includes('loss')||t.type==='body-fat';
    const reached=Number(t.target)>0&&(lower?latest.value>0&&latest.value<=Number(t.target):latest.value>=Number(t.target));
    saveTarget({...t,current:latest.value,status:reached?'completed':'active'});
  }
  publishSourceEvent('goal.updated',item.id,item.date,item);
  return item;
}

export function listWeeklyReviews(): WeeklyReview[] {
  return (getDb().prepare('SELECT data FROM weekly_reviews ORDER BY week_id DESC').all() as { data: string }[]).map(r => JSON.parse(r.data));
}

export function saveWeeklyReview(item: WeeklyReview): WeeklyReview {
  saveIndexedRecord('weekly_reviews','week_id',item.weekStart,item);
  return item;
}

function ensureJsonTable(table: string): void {
  try {
    getDb().exec(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    );
  } catch {
    /* exists */
  }
}

export function listExercises(): Exercise[] {
  ensureJsonTable('exercise_library');
  const rows = getDb().prepare('SELECT data FROM exercise_library ORDER BY created_at').all() as {
    data: string;
  }[];
  const local = rows.map((r) => JSON.parse(r.data) as Exercise);
  getDb().exec('CREATE TABLE IF NOT EXISTS global_exercise_cache (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  const cached = getDb().prepare('SELECT data FROM global_exercise_cache WHERE id=1').get() as {data:string} | undefined;
  const snapshot: CatalogSnapshot | undefined = cached ? JSON.parse(cached.data) : undefined;
  const global = (snapshot?.exercises || []).filter(e => e.catalog_status !== 'disabled').map(row => {
    const exercise = catalogExercise(row,snapshot!.aliases,snapshot!.media);
    const personal = local.find(e => e.id === row.id) || local.find(e => e.id === exercise.legacyId);
    return {...exercise,meta:personal?.meta};
  });
  // Legacy built-ins remain on disk for rollback; they are no longer a catalog source.
  const custom = local.filter(e => !e.id.startsWith('builtin-') && e.source !== 'supabase' && !snapshot?.exercises.some(g => g.id === e.id));
  return [...global,...custom.map(e => ({...e,source:'custom' as const}))];
}

export function saveExercise(item: Exercise): Exercise {
  ensureJsonTable('exercise_library');
  // Global fields are read-only. Persist only personal organization metadata.
  getDb().exec('CREATE TABLE IF NOT EXISTS global_exercise_cache (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  const cached = getDb().prepare('SELECT data FROM global_exercise_cache WHERE id=1').get() as {data:string} | undefined;
  const global = item.source === 'supabase' || (cached && (JSON.parse(cached.data) as CatalogSnapshot).exercises.some(e => e.id === item.id));
  const stored = global ? {id:item.id,source:'supabase',meta:item.meta} : {...item,source:'custom'};
  getDb()
    .prepare(
      `INSERT INTO exercise_library (id, data, created_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    )
    .run(item.id, JSON.stringify(stored), new Date().toISOString());
  return item;
}

export function deleteExercise(exerciseId: string): void {
  ensureJsonTable('exercise_library');
  const global=listExercises().find(e=>e.id===exerciseId && e.source==='supabase');
  if(global){saveExercise({...global,meta:{...global.meta,archived:true,updatedAt:new Date().toISOString()}});return;}
  getDb().prepare('DELETE FROM exercise_library WHERE id = ?').run(exerciseId);
}

/** Keep indexed dates in sync with JSON; support old tables that lack date columns. */
function saveIndexedRecord(table:'habit_logs'|'cardio_sessions'|'goal_check_ins'|'weekly_reviews'|'pain_logs'|'scheduled_workouts',column:'date'|'week_id',value:string,item:{id:string;createdAt?:string}) {
  ensureJsonTable(table);
  const columns=getDb().prepare(`PRAGMA table_info(${table})`).all() as {name:string}[];
  if(!columns.some(c=>c.name===column)) {
    getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    const key=column==='date'?'date':'weekStart';
    getDb().exec(`UPDATE ${table} SET ${column}=COALESCE(json_extract(data,'$.${key}'),'') WHERE json_valid(data)`);
  }
  getDb().prepare(`INSERT INTO ${table}(id,${column},data,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET ${column}=excluded.${column},data=excluded.data`).run(item.id,value||'',JSON.stringify(item),item.createdAt||new Date().toISOString());
}

export function listLibrarySplits(): Week[] {
  return (getDb().prepare('SELECT data FROM library_splits ORDER BY created_at, id').all() as { data: string }[]).map((row) => JSON.parse(row.data) as Week);
}

export function saveLibrarySplit(item: Partial<Week>): Week {
  const split = normalizeWeek(item);
  if (!split) throw new Error('Split needs a name and days.');
  getDb().prepare(
    'INSERT INTO library_splits (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
  ).run(split.id, JSON.stringify({ ...split, active: false, status: 'library' }), new Date().toISOString());
  return split;
}

export function deleteLibrarySplit(splitId: string): void {
  getDb().prepare('DELETE FROM library_splits WHERE id = ?').run(splitId);
}

export function listPrograms(): Program[] {
  ensureJsonTable('programs');
  return (
    getDb().prepare('SELECT data FROM programs ORDER BY created_at DESC').all() as { data: string }[]
  ).map((r) => JSON.parse(r.data) as Program);
}

export function saveProgram(item: Program): Program {
  ensureJsonTable('programs');
  getDb()
    .prepare(
      `INSERT INTO programs (id, data, created_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    )
    .run(item.id, JSON.stringify(item), item.createdAt || new Date().toISOString());
  return item;
}

export function deleteProgram(programId: string): void {
  ensureJsonTable('programs');
  getDb().prepare('DELETE FROM programs WHERE id = ?').run(programId);
}

export function listPainLogs(): PainLog[] {
  ensureJsonTable('pain_logs');
  return (
    getDb().prepare('SELECT data FROM pain_logs ORDER BY date DESC').all() as { data: string }[]
  ).map((r) => JSON.parse(r.data) as PainLog);
}

export function savePainLog(item: PainLog): PainLog {
  saveIndexedRecord('pain_logs','date',item.date,item);
  publishSourceEvent('pain.reported',item.id,item.date,item);
  return item;
}

export function deletePainLog(painId: string): void {
  ensureJsonTable('pain_logs');
  getDb().prepare('DELETE FROM pain_logs WHERE id = ?').run(painId);
}

export function listScheduledWorkouts(): ScheduledWorkout[] {
  ensureJsonTable('scheduled_workouts');
  return (
    getDb().prepare('SELECT data FROM scheduled_workouts ORDER BY date').all() as { data: string }[]
  ).map((r) => JSON.parse(r.data) as ScheduledWorkout);
}

export function saveScheduledWorkout(item: ScheduledWorkout): ScheduledWorkout {
  saveIndexedRecord('scheduled_workouts','date',item.date,item);
  return item;
}

export function deleteScheduledWorkout(id_: string): void {
  ensureJsonTable('scheduled_workouts');
  getDb().prepare('DELETE FROM scheduled_workouts WHERE id = ?').run(id_);
}

function ensureTrainingConfigTable(): void {
  try {
    getDb().exec(
      `CREATE TABLE IF NOT EXISTS training_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    );
  } catch {
    /* */
  }
}

export function getTrainingConfig(): TrainingConfig {
  ensureTrainingConfigTable();
  const row = getDb().prepare('SELECT data FROM training_config WHERE id = 1').get() as
    | { data: string }
    | undefined;
  if (!row) {
    const cfg = defaultTrainingConfig();
    getDb()
      .prepare(
        `INSERT INTO training_config (id, data, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(JSON.stringify(cfg), new Date().toISOString());
    return cfg;
  }
  return { ...defaultTrainingConfig(), ...JSON.parse(row.data) } as TrainingConfig;
}

export function saveTrainingConfig(cfg: Partial<TrainingConfig>): TrainingConfig {
  ensureTrainingConfigTable();
  const current = getTrainingConfig();
  const next = {
    ...current,
    ...cfg,
    volumeLandmarks: cfg.volumeLandmarks ?? current.volumeLandmarks,
    exerciseFamilies: cfg.exerciseFamilies
      ? { ...current.exerciseFamilies, ...cfg.exerciseFamilies }
      : current.exerciseFamilies,
    reminders: cfg.reminders ? { ...current.reminders, ...cfg.reminders } : current.reminders,
    libraryCollections: cfg.libraryCollections ?? current.libraryCollections,
  };
  getDb()
    .prepare(
      `INSERT INTO training_config (id, data, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
    )
    .run(JSON.stringify(next), new Date().toISOString());
  return next;
}

function ensureSkinTables(): void {
  const db = getDb();
  db.exec(`
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
  `);
}

export function getSkinProfile(): SkinProfile {
  ensureSkinTables();
  const row = getDb().prepare('SELECT data FROM skin_profile WHERE id = 1').get() as { data: string } | undefined;
  if (!row) {
    const initial = emptySkinProfile();
    getDb().prepare('INSERT INTO skin_profile(id,data,updated_at) VALUES(1,?,?)').run(JSON.stringify(initial),initial.updatedAt);
    return initial;
  }
  try {
    return { ...emptySkinProfile(), ...JSON.parse(row.data) } as SkinProfile;
  } catch {
    return emptySkinProfile();
  }
}

export function saveSkinProfile(partial: Partial<SkinProfile>): SkinProfile {
  ensureSkinTables();
  const next: SkinProfile = {
    ...getSkinProfile(),
    ...partial,
    concerns: Array.isArray(partial.concerns) ? partial.concerns.map(String) : getSkinProfile().concerns,
    sensitivities: Array.isArray(partial.sensitivities) ? partial.sensitivities.map(String) : getSkinProfile().sensitivities,
    goals: Array.isArray(partial.goals) ? partial.goals.map(String) : getSkinProfile().goals,
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO skin_profile (id, data, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
    )
    .run(JSON.stringify(next), next.updatedAt);
  return next;
}

export function listSkinProducts(): SkinProduct[] {
  ensureSkinTables();
  return (
    getDb().prepare('SELECT data FROM skin_products ORDER BY created_at DESC').all() as { data: string }[]
  ).map((r) => {
    const product = JSON.parse(r.data) as SkinProduct & { status?: string };
    // Earlier product imports used "available". It has the same meaning as
    // the current "active" status, so keep those products usable in routines.
    return { ...product, status: normalizeSkinProductStatus(product.status) };
  });
}

export function saveSkinProduct(item: SkinProduct): SkinProduct {
  ensureSkinTables();
  const next: SkinProduct = {
    ...item,
    id: item.id || id('skinprod'),
    name: String(item.name || '').trim() || 'Untitled product',
    brand: String(item.brand || '').trim(),
    category: item.category || 'other',
    actives: Array.isArray(item.actives) ? item.actives.map(String).filter(Boolean) : [],
    usedIn: Array.isArray(item.usedIn) ? item.usedIn.filter((s) => s === 'am' || s === 'pm') : [],
    status: normalizeSkinProductStatus(item.status),
    openedAt: item.openedAt || '',
    expiresAt: item.expiresAt || '',
    notes: item.notes || '',
    sourceUrl: item.sourceUrl || '',
    sourceExcerpt: item.sourceExcerpt || '',
    researchedAt: item.researchedAt || '',
    pros: Array.isArray(item.pros) ? item.pros.map(String).filter(Boolean) : [],
    cons: Array.isArray(item.cons) ? item.cons.map(String).filter(Boolean) : [],
    useCase: String(item.useCase || '').trim(),
    bestFor: Array.isArray(item.bestFor) ? item.bestFor.map(String).filter(Boolean) : [],
    createdAt: item.createdAt || new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO skin_products (id, data, created_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    )
    .run(next.id, JSON.stringify(next), next.createdAt);
  return next;
}

function normalizeSkinProductStatus(status: unknown): SkinProduct['status'] {
  switch (String(status || '').trim().toLowerCase()) {
    case 'paused':
      return 'paused';
    case 'finished':
      return 'finished';
    case 'wishlist':
      return 'wishlist';
    case 'available':
    case 'active':
    default:
      return 'active';
  }
}

export function deleteSkinProduct(productId: string): void {
  ensureSkinTables();
  getDb().prepare('DELETE FROM skin_products WHERE id = ?').run(productId);
}

export function importSkinProducts(raw: unknown): { imported: number; skipped: number; errors: string[] } {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { products?: unknown })?.products)
      ? ((raw as { products: unknown[] }).products)
      : [];
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  const existing = listSkinProducts();
  for (const item of list) {
    const row = (item || {}) as Record<string, unknown>;
    const name = String(row.name || '').trim();
    if (!name) {
      skipped += 1;
      errors.push('Skipped a row with no name');
      continue;
    }
    const dup = existing.find((p) => p.name.toLowerCase() === name.toLowerCase() && String(p.brand || '').toLowerCase() === String(row.brand || '').trim().toLowerCase());
    if (dup) {
      skipped += 1;
      continue;
    }
    try {
      const saved = saveSkinProduct({
        id: id('skinprod'),
        name,
        brand: String(row.brand || '').trim(),
        category: (row.category as SkinProduct['category']) || 'other',
        actives: Array.isArray(row.actives) ? row.actives.map(String).filter(Boolean) : String(row.actives || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        usedIn: Array.isArray(row.usedIn) ? row.usedIn.filter((s) => s === 'am' || s === 'pm') : [],
        status: (row.status as SkinProduct['status']) || 'active',
        openedAt: String(row.openedAt || ''),
        expiresAt: String(row.expiresAt || ''),
        notes: String(row.notes || ''),
        pros: Array.isArray(row.pros) ? row.pros.map(String).filter(Boolean) : String(row.pros || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        cons: Array.isArray(row.cons) ? row.cons.map(String).filter(Boolean) : String(row.cons || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        useCase: String(row.useCase || ''),
        bestFor: Array.isArray(row.bestFor) ? row.bestFor.map(String).filter(Boolean) : String(row.bestFor || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        createdAt: new Date().toISOString(),
      });
      existing.push(saved);
      imported += 1;
    } catch (e) {
      skipped += 1;
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  return { imported, skipped, errors };
}

export function listSkinRoutines(): SkinRoutine[] {
  ensureSkinTables();
  const rows = getDb().prepare('SELECT data FROM skin_routines ORDER BY slot').all() as { data: string }[];
  if (!rows.length) {
    const seeded = defaultSkinRoutines();
    return seeded.map(r => saveSkinRoutine(r));
  }
  return rows.map((r) => JSON.parse(r.data) as SkinRoutine);
}

export function saveSkinRoutine(item: SkinRoutine): SkinRoutine {
  ensureSkinTables();
  const next: SkinRoutine = {
    id: item.id || id('skinrt'),
    slot: item.slot === 'pm' ? 'pm' : 'am',
    name: String(item.name || (item.slot === 'pm' ? 'PM routine' : 'AM routine')),
    steps: Array.isArray(item.steps)
      ? item.steps.map((s, i) => ({
          id: s.id || id('skinstep'),
          productId: s.productId || '',
          label: String(s.label || `Step ${i + 1}`),
          waitMin: Number(s.waitMin) || 0,
          notes: s.notes || '',
          paused: Boolean(s.paused),
        }))
      : [],
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO skin_routines (id, slot, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET slot=excluded.slot, data=excluded.data, updated_at=excluded.updated_at`,
    )
    .run(next.id, next.slot, JSON.stringify(next), next.updatedAt);
  return next;
}

export function listSkinLogs(): SkinLog[] {
  ensureSkinTables();
  return (
    getDb().prepare('SELECT data FROM skin_logs ORDER BY date DESC').all() as { data: string }[]
  ).map((r) => JSON.parse(r.data) as SkinLog);
}

export function saveSkinLog(item: SkinLog): SkinLog {
  ensureSkinTables();
  const date = String(item.date || new Date().toISOString().slice(0, 10));
  const existing = listSkinLogs().find((l) => l.date === date);
  const next: SkinLog = {
    id: item.id || existing?.id || id('skinlog'),
    date,
    barrier: Number.isFinite(Number(item.barrier)) && item.barrier !== null ? Number(item.barrier) : (existing?.barrier ?? null),
    hydration: Number.isFinite(Number(item.hydration)) && item.hydration !== null ? Number(item.hydration) : (existing?.hydration ?? null),
    oiliness: Number.isFinite(Number(item.oiliness)) && item.oiliness !== null ? Number(item.oiliness) : (existing?.oiliness ?? null),
    irritation: Number.isFinite(Number(item.irritation)) && item.irritation !== null ? Number(item.irritation) : (existing?.irritation ?? null),
    concerns: Array.isArray(item.concerns) ? item.concerns.map(String) : [],
    notes: item.notes || '',
    routineDone: {
      am: Boolean(item.routineDone?.am),
      pm: Boolean(item.routineDone?.pm),
    },
    createdAt: item.createdAt || existing?.createdAt || new Date().toISOString(),
    aiComment: item.aiComment ?? existing?.aiComment,
    aiAdjustments: Array.isArray(item.aiAdjustments) ? item.aiAdjustments.map(String) : existing?.aiAdjustments,
  };
  getDb()
    .prepare(
      `INSERT INTO skin_logs (id, date, data, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET date=excluded.date, data=excluded.data`,
    )
    .run(next.id, next.date, JSON.stringify(next), next.createdAt);
  return next;
}

export function deleteSkinLog(logId: string): void {
  ensureSkinTables();
  getDb().prepare('DELETE FROM skin_logs WHERE id = ?').run(logId);
}

export function getCareData(): CareData {
  ensureSkinTables();
  const row = getDb().prepare('SELECT data FROM care_data WHERE id = 1').get() as { data: string } | undefined;
  if (!row) return emptyCareData();
  try {
    const saved = JSON.parse(row.data) as Partial<CareData>;
    const base = emptyCareData();
    return { ...base, ...saved, commitment: { ...base.commitment, ...saved.commitment }, goals: saved.goals || [], tasks: saved.tasks || [], events: saved.events || [], checkIns: saved.checkIns || [], planHistory: saved.planHistory || [], reviews: saved.reviews || [] };
  } catch { return emptyCareData(); }
}

export function saveCareData(item: CareData): CareData {
  ensureSkinTables();
  const next = { ...item, version: 1 as const, revision: getCareData().revision + 1, updatedAt: new Date().toISOString() };
  getDb().prepare(`INSERT INTO care_data (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`).run(JSON.stringify(next), next.updatedAt);
  publishSourceEvent('care.updated','care',next.updatedAt.slice(0,10),next);
  return next;
}

/** Cloud replay preserves the remote revision/timestamp so it does not create a sync echo. */
export function replaceCareDataFromSync(item: CareData): CareData {
  ensureSkinTables();
  const next={...emptyCareData(),...item,version:1 as const,commitment:{...emptyCareData().commitment,...item.commitment}};
  getDb().prepare(`INSERT INTO care_data (id,data,updated_at) VALUES (1,?,?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`).run(JSON.stringify(next),next.updatedAt);
  return next;
}

/** Photos stay in this device's database; they are omitted from backup and cloud records. */
export function listCarePhotos(): CarePhoto[] {
  ensureSkinTables();
  return (getDb().prepare('SELECT data FROM care_photos ORDER BY created_at DESC').all() as {data:string}[]).map(row => JSON.parse(row.data) as CarePhoto);
}
export function saveCarePhoto(photo: CarePhoto): CarePhoto {
  ensureSkinTables();
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo.dataUrl) || photo.dataUrl.length > 250000) throw new Error('Choose a JPEG, PNG, or WebP image under 180 KB after compression.');
  if (!listCarePhotos().some(existing => existing.id === photo.id) && listCarePhotos().length >= 100) throw new Error('This device already has 100 care photos. Delete old photos before adding more.');
  const next:CarePhoto = { ...photo, id:photo.id || id('carephoto'), createdAt:photo.createdAt || new Date().toISOString(), note:String(photo.note||'').slice(0,500), aiObservation:photo.aiObservation ? String(photo.aiObservation).slice(0,1000) : undefined };
  getDb().prepare('INSERT INTO care_photos(id,data,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(next.id,JSON.stringify(next),next.createdAt);
  publishSourceEvent('measurement.photo_logged',next.id,next.date,{id:next.id,date:next.date});
  return next;
}
export function deleteCarePhoto(photoId:string):void { ensureSkinTables(); getDb().prepare('DELETE FROM care_photos WHERE id=?').run(photoId); }

export function loadSkinState(): SkinState {
  return {
    profile: getSkinProfile(),
    products: listSkinProducts(),
    routines: listSkinRoutines(),
    logs: listSkinLogs(),
    care: getCareData(),
  };
}

export function restoreSkinState(skin: Partial<SkinState>): void {
  ensureSkinTables();
  const db = getDb();
  db.prepare('DELETE FROM skin_products').run();
  db.prepare('DELETE FROM skin_routines').run();
  db.prepare('DELETE FROM skin_logs').run();
  if (skin.profile) saveSkinProfile(skin.profile);
  for (const p of skin.products || []) saveSkinProduct(p);
  for (const r of skin.routines || emptySkinState().routines) saveSkinRoutine(r);
  for (const l of skin.logs || []) saveSkinLog(l);
  saveCareData(skin.care || emptyCareData());
}

export const repository: WorkoutRepository = {
  getActiveWeekId, setActiveWeekId, getProfile, saveProfile, getSettings, saveSettings, publicSettings,
  listWeeks, getWeek, upsertWeek, deleteWeek, listSessions, getSession, saveSession, deleteSession,
  listReadiness, saveReadiness, listTargets, saveTarget, deleteTarget, listGoalCheckIns, saveGoalCheckIn,
  listMeasurements, saveMeasurement, deleteMeasurement, listHabits, saveHabit, deleteHabit, listHabitLogs, saveHabitLog,
  listCardioSessions, saveCardioSession, deleteCardioSession, listWeeklyReviews, saveWeeklyReview, loadAppDb, restoreBackup,
  lastExercisePerformance,
};

export { normalizeWeek };
