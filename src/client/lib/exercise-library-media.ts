import type { CloudWorkspace } from './cloud-api';
import { invokeCloud } from './cloud-session';
import { catalogExercise, matchCachedExercise, selectExerciseMedia } from '../../shared/global-exercises';
import { youtubeVideoId } from '../../shared/youtube';
import { canonical } from '../../shared/cloud';
import type { Exercise } from '../../shared/types';

type Input = { name: string; exerciseId?: string; youtubeUrl?: string; action?: 'resolve' | 'contribute'; fetchMissing?: boolean; [key: string]: unknown };
async function resolveShared(ws: CloudWorkspace, input: Input): Promise<{ exercise: Exercise; errors: string[] }> {
  const local = ws.db().exercises.find(e => e.id === input.exerciseId);
  const previous = selectExerciseMedia(local?.media || [], 'tutorial');
  const seed = previous?.url || local?.tutorialLink;
  const result = await invokeCloud('body-os-exercise-library', { ...input, youtubeUrl: input.youtubeUrl || (youtubeVideoId(seed) ? seed : undefined), action: input.action || 'resolve' });
  const exercise = catalogExercise(result.exercise, [], result.media || []);
  ws.catalog.set(exercise.id, exercise);
  const personal = ws.get('exercise', exercise.id)?.payload || {};
  // Only personal organization metadata stays owner-scoped; shared media is authoritative.
  const payload = { ...personal, ...(input.meta && typeof input.meta === 'object' ? { meta: input.meta } : {}), id: exercise.id, source: 'supabase', name: exercise.name, media: exercise.media, tutorialLink: exercise.tutorialLink };
  if (canonical(personal) !== canonical(payload)) await ws.save('exercise', payload, exercise.id);
  return { exercise, errors: result.errors || [] };
}
export async function ensureLibraryExercise(ws: CloudWorkspace, input: Input): Promise<Exercise> {
  const match = matchCachedExercise(input, ws.db().exercises);
  if (match) return match;
  return (await resolveShared(ws, { ...input, fetchMissing: false })).exercise;
}
export async function ensureLibraryMedia(ws: CloudWorkspace, input: Input) {
  return resolveShared(ws, input);
}
