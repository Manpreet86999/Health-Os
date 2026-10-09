/**
 * Cross-edition contracts with no Node or browser dependencies.
 * Canonical type definitions live in `types.ts`; domain-specific
 * extensions and backup utilities live here.
 */
export type GoalSource = 'manual' | 'body' | 'strength' | 'consistency';

// Re-export canonical types to avoid drift between domain.ts and types.ts.
export type {
  GoalCheckIn,
  HabitLog,
  CardioSession,
  WeeklyReview,
} from './types.js';

/** Extended habit definition with optional UI color. */
export interface HabitDefinition {
  id: string;
  name: string;
  target: number;
  unit: string;
  color?: string;
  active: boolean;
  createdAt: string;
}

export interface BackupEnvelope<T> {
  format: 'workout-os-backup';
  version: number;
  exportedAt: string;
  data: T;
}

export function createBackupEnvelope<T>(data: T, version = 5): BackupEnvelope<T> {
  return { format: 'workout-os-backup', version, exportedAt: new Date().toISOString(), data };
}

export function unwrapBackup<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { format?: unknown; data?: unknown; weeks?: unknown; sessions?: unknown };
  if (candidate.format === 'workout-os-backup' && candidate.data && typeof candidate.data === 'object') return candidate.data as T;
  if (Array.isArray(candidate.weeks) && Array.isArray(candidate.sessions)) return candidate as T;
  return null;
}
