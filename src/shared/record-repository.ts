import type { SyncRecord } from './sync.js';
import type { PlatformWorkspace } from './platform.js';

/**
 * Boundary used by every Health OS workspace. Implementations may use the
 * browser cache, Supabase, or the local desktop bridge, but records keep the
 * same owner-scoped envelope and conflict rules.
 */
export interface OwnerScopedRecordRepository {
  list(ownerId: string, workspace: PlatformWorkspace): Promise<SyncRecord[]>;
  get(ownerId: string, entityType: SyncRecord['entityType'], id: string): Promise<SyncRecord | null>;
  save(ownerId: string, record: SyncRecord): Promise<void>;
  archive(ownerId: string, record: SyncRecord): Promise<void>;
  subscribe(ownerId: string, workspaces: readonly PlatformWorkspace[], onChange: () => void): () => void;
}

export interface PortableBackup {
  format: 'body-os-portable-backup';
  version: 1;
  createdAt: string;
  source: { appVersion: string; kind: 'manual' | 'gdrive-auto' | 'safety' };
  records: SyncRecord[];
}
