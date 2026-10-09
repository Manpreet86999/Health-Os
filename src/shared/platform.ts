import type { SyncEntityType, SyncRecord } from './sync.js';

/**
 * Stable cross-workspace metadata. Payload schemas stay owned by their feature
 * modules, while every persisted record can be identified, migrated and synced
 * through this common envelope.
 */
export type PlatformWorkspace = 'training' | 'care' | 'core' | (string & {});

export interface OwnerRecord<T = unknown> extends SyncRecord<T> {
  workspace: PlatformWorkspace;
  payloadVersion: number;
  createdAt: string;
}

export interface MigrationLedgerEntry {
  id: string;
  ownerId: string;
  source: 'legacy-desktop' | 'legacy-browser' | 'mobile' | 'backup';
  sourceFingerprint: string;
  importedAt: string;
  recordCount: number;
  status: 'complete' | 'failed';
  error?: string;
}

export interface WorkspaceDefinition {
  id: PlatformWorkspace;
  label: string;
  home: string;
  entityTypes: readonly SyncEntityType[];
  optionalIntegrations: readonly ('ai' | 'drive' | 'health' | 'pc')[];
}

export const workspaceForEntity = (entityType: SyncEntityType): PlatformWorkspace =>
  entityType.startsWith('skin') ? 'care' : entityType === 'healthReading' ? 'core' : 'training';

export function toOwnerRecord<T>(record: SyncRecord<T>, createdAt = record.updatedAt): OwnerRecord<T> {
  return {...record,workspace:workspaceForEntity(record.entityType),payloadVersion:1,createdAt};
}
