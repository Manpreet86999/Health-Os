import type { Database } from './supabase-database.js';
import type { Exercise } from './types.js';
import type { SupabaseProjectConfig } from './supabase-project.js';

export type CatalogExercise = Database['public']['Tables']['body_os_exercises']['Row'];
export type CatalogAlias = Database['public']['Tables']['body_os_exercise_aliases']['Row'];
export type ExerciseMedia = Database['public']['Tables']['body_os_exercise_media']['Row'];
export interface CatalogSnapshot {
  lastFullSyncAt?: string;
  syncedAt: string;
  full: boolean;
  exercises: CatalogExercise[];
  aliases: CatalogAlias[];
  media: ExerciseMedia[];
}
export interface ExerciseInput {
  aliases?:string[];
  defaultCue?:string;
  defaultRestSec?:number;
  defaultTempo?:string;
  trackingMode?:string;
  workoutSplit?:string;
  name: string;
  exerciseId?: string;
  equipment?: string | string[];
  muscles?: string[];
  bodyPart?: string;
  movementPattern?: string;
  familyId?: string;
}
export interface ExerciseResolution {
  status: 'matched' | 'created';
  exerciseId: string;
  exercise: CatalogExercise;
  matchMethod: string;
  confidence: number;
}
export const normalizeExerciseName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Exact identity only. Unapproved/ambiguous aliases never select an exercise. */
export function matchCachedExercise(input: ExerciseInput, exercises: Exercise[]): Exercise | undefined {
  if (input.exerciseId) {
    const direct = exercises.find(e => e.id === input.exerciseId && e.source === 'supabase');
    if (direct) return direct;
  }
  const compatible = exercises.filter(e => e.source === 'supabase' &&
    (!input.equipment || !e.equipment || normalizeExerciseName(e.equipment) === normalizeExerciseName(Array.isArray(input.equipment) ? input.equipment.join(' ') : input.equipment)) &&
    (!input.movementPattern || !e.movementPattern || input.movementPattern === e.movementPattern));
  const n = normalizeExerciseName(input.name);
  const exact = compatible.filter(e => normalizeExerciseName(e.name) === n);
  if (exact.length === 1) return exact[0];
  const aliases = compatible.filter(e => e.approvedAliases?.some(a => normalizeExerciseName(a) === n));
  return aliases.length === 1 ? aliases[0] : undefined;
}

/** URL protocols are checked even for trusted catalog rows. */
export function safeMediaUrl(value?: string | null): string | undefined {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function selectExerciseMedia(media: ExerciseMedia[], kind: string): ExerciseMedia | undefined {
  return media.filter(m => m.media_type === kind && m.is_primary && ['verified','usable','inherited','fallback'].includes(m.status) && (safeMediaUrl(m.url) || safeMediaUrl(m.embed_url)))
    .sort((a,b) => ['verified','usable','inherited','fallback'].indexOf(a.status) - ['verified','usable','inherited','fallback'].indexOf(b.status))[0];
}

export function catalogExercise(row: CatalogExercise, aliases: CatalogAlias[], media: ExerciseMedia[]): Exercise {
  const payload = row.source_payload as Record<string, unknown> | null;
  const ownAliases = aliases.filter(a => a.exercise_id === row.id);
  const ownMedia = media.filter(m => m.exercise_id === row.id);
  return {
    id: row.id, name: row.name, source: 'supabase', aliases: ownAliases.map(a => a.alias),
    approvedAliases: ownAliases.filter(a => a.auto_match_allowed).map(a => a.alias),
    muscles: row.muscles, equipment: row.equipment.join(' '), movementPattern: row.movement_pattern || '',
    substitutions: Array.isArray(payload?.substitutions)?payload.substitutions.filter((s):s is string=>typeof s==='string'):[], bodyPart: row.body_part || undefined, familyId: row.family_id || undefined,
    trackingMode: payload?.trackingMode === 'time' || payload?.trackingMode === 'reps' ? payload.trackingMode : 'weight_reps',
    defaultCue: typeof payload?.defaultCue === 'string' ? payload.defaultCue : undefined,
    defaultRestSec: typeof payload?.defaultRestSec === 'number' ? payload.defaultRestSec : undefined,
    defaultTempo: typeof payload?.defaultTempo === 'string' ? payload.defaultTempo : undefined,
    workoutSplit:typeof payload?.workoutSplit === 'string'?payload.workoutSplit:undefined,
    tutorialLink: safeMediaUrl(selectExerciseMedia(ownMedia,'tutorial')?.url), media: ownMedia,
    legacyId: typeof payload?.legacyId === 'string' ? payload.legacyId : undefined,
  };
}

export class ExerciseCatalogRepository {
  constructor(private config: SupabaseProjectConfig, private accessToken: string, private request = fetch) {}
  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request(`${this.config.url.replace(/\/$/,'')}${path}`, {
      method: 'POST', headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Exercise catalog unavailable (${res.status})`);
    return res.json() as Promise<T>;
  }
  sync(since?: string): Promise<CatalogSnapshot> { return this.post('/rest/v1/rpc/body_os_catalog_delta', { since: since || null }); }
  ensureExercise(input: ExerciseInput): Promise<ExerciseResolution> { return this.post('/functions/v1/body-os-exercise-resolver', input); }
  reportBrokenMedia(exerciseId:string,mediaId:string):Promise<{ok:true}> {return this.post('/functions/v1/body-os-exercise-resolver',{action:'report_broken_media',exerciseId,mediaId});}
}
