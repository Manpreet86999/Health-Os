import type { AppDb, TrainingConfig } from './types.js';
import { careRecords } from './care-sync.js';

/** Records that may leave a device. Settings and credentials are intentionally excluded. */
export const SYNC_ENTITY_TYPES = [
  'week', 'librarySplit', 'session', 'readiness', 'target', 'measurement', 'habit', 'habitLog', 'cardio',
  'goalCheckIn', 'weeklyReview', 'exercise', 'program', 'painLog', 'scheduledWorkout',
  'profile', 'workspaceState', 'trainingConfig', 'skinProfile', 'skinProduct', 'skinRoutine', 'skinLog', 'skinCareData', 'healthReading',
  'sharedPreferences', 'encryptedVault', 'workoutDraft', 'reportJob', 'medicalReport', 'medicalFollowUp', 'doctorQuestion',
  'careSettings', 'careGoal', 'careTask', 'careEvent', 'careCheckIn', 'careReview', 'carePlanVersion',
  'carePhoto', 'conversation', 'automationState', 'personalPhoto',
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const SYNC_PROTOCOL_VERSION = 2 as const;

export interface SharedPreferences {
  uxPreferences?: import('./ux.js').UxPreferences;
  version: 1;
  units: 'kg' | 'lb';
  weeklyGoal: number;
  restSeconds: number;
  aiProvider: string;
  aiModel: string;
  aiApiKey?: string;
  openRouterApiKey?: string;
  nvidiaNimApiKey?: string;
  tavilyApiKey?: string;
  braveSearchApiKey?: string;
  gender?: 'male' | 'female';
  theme?: string;
  reportRecipients: string[];
  backupSchedule: 'daily' | 'weekly' | 'monthly';
  updatedAt: string;
}

/** Ciphertext only. Supabase and the sync engine never receive the vault key. */
export interface EncryptedVaultEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  wrapIv: string;
  wrappedKey: string;
  dataIv: string;
  ciphertext: string;
  updatedAt: string;
}

export interface SyncOperation {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  operationId: string;
  expectedChangeVersion: number | null;
  record: SyncRecord;
}

export interface SyncAcknowledgement {
  operationId: string;
  status: 'applied' | 'duplicate' | 'conflict';
  changeVersion: number;
  record?: SyncRecord;
}

export interface SyncDeltaPage {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  records: Array<SyncRecord & { changeVersion: number }>;
  cursor: number;
  hasMore: boolean;
}

export interface SyncMetrics {
  requests: number;
  uploaded: number;
  downloaded: number;
  transferredBytes: number;
  queueSize: number;
  failures: number;
}

export interface SyncRecord<T = unknown> {
  id: string;
  entityType: SyncEntityType;
  payload: T;
  updatedAt: string;
  revision: number;
  deviceId: string;
  deletedAt?: string;
  /** Platform metadata is optional while legacy records are migrated. */
  workspace?: string;
  payloadVersion?: number;
  createdAt?: string;
}

export interface SyncConflict<T = unknown> {
  key: string;
  local: SyncRecord<T>;
  remote: SyncRecord<T>;
  reason: 'concurrent-edit' | 'delete-vs-edit';
}

export type SyncResolution<T = unknown> =
  | { kind: 'use-local'; record: SyncRecord<T> }
  | { kind: 'use-remote'; record: SyncRecord<T> }
  | { kind: 'conflict'; conflict: SyncConflict<T> };

export function syncKey(record: Pick<SyncRecord, 'entityType' | 'id'>): string {
  return `${record.entityType}:${record.id}`;
}

/**
 * Only auto-resolve records when one side is a direct descendant of the other.
 * Pending local changes against a different remote revision always require consent.
 */
export function resolveSyncRecord<T>(
  local: SyncRecord<T> | undefined,
  remote: SyncRecord<T> | undefined,
  localPending: boolean,
): SyncResolution<T> | undefined {
  if (!local && !remote) return undefined;
  if (!local) return { kind: 'use-remote', record: remote! };
  if (!remote) return { kind: 'use-local', record: local };
  if (local.revision === remote.revision && local.updatedAt === remote.updatedAt && local.deviceId === remote.deviceId) {
    return { kind: 'use-local', record: local };
  }
  const deleteVsEdit = Boolean(local.deletedAt) !== Boolean(remote.deletedAt);
  if (localPending) {
    return { kind: 'conflict', conflict: { key: syncKey(local), local, remote, reason: deleteVsEdit ? 'delete-vs-edit' : 'concurrent-edit' } };
  }
  return remote.revision > local.revision || remote.updatedAt > local.updatedAt
    ? { kind: 'use-remote', record: remote }
    : { kind: 'use-local', record: local };
}

function changedAt(value: object, fallback: string): string {
  const record = value as Record<string, unknown>;
  return String(record.updatedAt || record.createdAt || fallback);
}
function recordWorkspace(entityType: SyncEntityType): string {
  return entityType.startsWith('skin') ? 'care' : ['healthReading','sharedPreferences','encryptedVault','reportJob'].includes(entityType) ? 'core' : 'training';
}

function recordsFor<T extends { id?: string }>(
  entityType: SyncEntityType,
  values: T[],
  deviceId: string,
  fallback: string,
): SyncRecord<T>[] {
  return values.map((value, index) => {
    const createdAt=changedAt(value, fallback);
    return {id:String(value.id||`${entityType}-${index}`),entityType,payload:value,updatedAt:createdAt,createdAt,revision:1,deviceId,workspace:recordWorkspace(entityType),payloadVersion:1};
  });
}

/** Converts the existing desktop database into safe, credential-free sync records. */
export function syncRecordsFromDb(db: AppDb, deviceId: string): SyncRecord[] {
  const fallback = db.meta.createdAt || new Date(0).toISOString();
  return [
    ...recordsFor('healthReading', db.healthReadings || [], deviceId, fallback),
    ...recordsFor('skinProduct', db.skin?.products || [], deviceId, fallback),
    ...recordsFor('skinRoutine', db.skin?.routines || [], deviceId, fallback),
    ...recordsFor('skinLog', db.skin?.logs || [], deviceId, fallback),
    ...(db.skin?.care ? careRecords(db.skin.care,deviceId) : []),
    ...(db.skin ? [{ id: 'skin-profile', entityType: 'skinProfile' as const, payload: db.skin.profile, updatedAt: db.skin.profile.updatedAt, createdAt:db.skin.profile.updatedAt, workspace:'care',payloadVersion:1, revision: 1, deviceId }] : []),
    ...recordsFor('week', db.weeks, deviceId, fallback),
    ...recordsFor('librarySplit', db.librarySplits || [], deviceId, fallback),
    ...recordsFor('session', db.sessions, deviceId, fallback),
    ...recordsFor('readiness', (db.readiness || []).map((r) => ({ ...r, id: r.date || r.id })), deviceId, fallback),
    ...recordsFor('target', db.targets, deviceId, fallback),
    ...recordsFor('measurement', db.measurements, deviceId, fallback),
    ...recordsFor('habit', db.habits, deviceId, fallback),
    ...recordsFor('habitLog', db.habitLogs, deviceId, fallback),
    ...recordsFor('cardio', db.cardio, deviceId, fallback),
    ...recordsFor('goalCheckIn', db.goalCheckIns, deviceId, fallback),
    ...recordsFor('weeklyReview', db.weeklyReviews, deviceId, fallback),
    ...recordsFor('exercise', db.exercises.filter(e => !e.id.startsWith('builtin-')).map(e => e.source === 'supabase' ? {id:e.id,source:e.source,meta:e.meta} : e), deviceId, fallback),
    ...recordsFor('program', db.programs, deviceId, fallback),
    ...recordsFor('painLog', db.painLogs, deviceId, fallback),
    ...recordsFor('scheduledWorkout', db.scheduledWorkouts, deviceId, fallback),
    { id: 'workspace-state', entityType: 'workspaceState', payload: {activeWeekId:db.meta.activeWeekId}, updatedAt: new Date().toISOString(), createdAt: fallback, workspace:'training', payloadVersion:1, revision: 1, deviceId },
    { id: 'profile', entityType: 'profile', payload: db.profile, updatedAt: changedAt(db.profile, fallback),createdAt:changedAt(db.profile,fallback),workspace:'training',payloadVersion:1, revision: 1, deviceId },
    { id: 'training-config', entityType: 'trainingConfig', payload: db.trainingConfig as TrainingConfig, updatedAt: fallback,createdAt:fallback,workspace:'training',payloadVersion:1, revision: 1, deviceId },
  ];
}
