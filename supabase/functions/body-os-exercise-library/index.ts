import { bestExerciseReference } from '../../../src/shared/exercise-media-ranking.ts';
import { youtubeVideoId } from '../../../src/shared/youtube.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });
type Row = Record<string, any>;

export async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const base = Deno.env.get('SUPABASE_URL')!;
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return reply({ error: 'Sign in to contribute to the exercise library.' }, 401);
  try {
    const auth = await fetch(`${base}/auth/v1/user`, { headers: { apikey: secret, Authorization: authorization }, signal: AbortSignal.timeout(10000) });
    if (!auth.ok) return reply({ error: 'Sign in again to continue.' }, 401);
    const user = await auth.json();
    if (!user.id || user.is_anonymous) return reply({ error: 'A registered account is required.' }, 401);
    const text = await request.text();
    if (text.length > 16000) return reply({ error: 'Input too large.' }, 413);
    const input = JSON.parse(text);
    if (!['resolve', 'contribute'].includes(input.action || 'resolve')) return reply({ error: 'Unknown library action.' }, 400);
    if (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.length > 200) return reply({ error: 'Enter an exercise name (2–200 characters).' }, 400);
    const supplied = input.youtubeUrl !== undefined && input.youtubeUrl !== '';
    const suppliedId = supplied ? youtubeVideoId(input.youtubeUrl) : undefined;
    if (supplied && !suppliedId) return reply({ error: 'Enter a valid HTTPS YouTube video link.' }, 400);
    const rest = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${base}/rest/v1/${path}`, { method, headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('The shared exercise library is temporarily unavailable.');
      return response.json();
    };
    const fields = ['exerciseId', 'name', 'equipment', 'muscles', 'bodyPart', 'movementPattern', 'familyId', 'aliases', 'defaultCue', 'defaultRestSec', 'defaultTempo', 'trackingMode', 'workoutSplit', 'substitutions'];
    const clean: Row = Object.fromEntries(fields.filter(k => input[k] !== undefined).map(k => [k, input[k]]));
    for (const key of ['exerciseId', 'bodyPart', 'movementPattern', 'familyId', 'defaultCue', 'defaultTempo', 'trackingMode', 'workoutSplit']) {
      if (clean[key] !== undefined && (typeof clean[key] !== 'string' || clean[key].length > 2000)) return reply({ error: 'Invalid exercise details.' }, 400);
    }
    if (clean.defaultRestSec !== undefined && (!Number.isFinite(clean.defaultRestSec) || clean.defaultRestSec < 0 || clean.defaultRestSec > 3600)) return reply({ error: 'Invalid rest duration.' }, 400);
    if (typeof clean.equipment === 'string' && clean.equipment.length > 200) return reply({ error: 'Invalid equipment.' }, 400);
    for (const key of ['equipment', 'muscles', 'aliases', 'substitutions']) {
      if (clean[key] !== undefined && !(key === 'equipment' && typeof clean[key] === 'string') && (!Array.isArray(clean[key]) || clean[key].length > 20 || clean[key].some((v: unknown) => typeof v !== 'string' || v.length > 100))) return reply({ error: 'Invalid exercise details.' }, 400);
    }
    const resolution = await rest('rpc/body_os_ensure_exercise', 'POST', { input: clean, actor: user.id });
    let exercise = resolution.exercise;
    if (input.updateDetails === true) {
      const patch: Row = { updated_at: new Date().toISOString() };
      for (const [field, column] of [['muscles','muscles'],['bodyPart','body_part'],['movementPattern','movement_pattern']]) if (clean[field] !== undefined) patch[column] = clean[field];
      if (clean.equipment !== undefined) patch.equipment = Array.isArray(clean.equipment) ? clean.equipment : clean.equipment ? [clean.equipment] : [];
      const details = Object.fromEntries(['defaultCue','defaultRestSec','defaultTempo','trackingMode','workoutSplit','substitutions'].filter(k => clean[k] !== undefined).map(k => [k, clean[k]]));
      patch.source_payload = { ...exercise.source_payload, ...details };
      const updated = await rest(`body_os_exercises?id=eq.${exercise.id}`, 'PATCH', patch);
      exercise = updated[0] || exercise;
    }
    let media: Row[] = await rest(`body_os_exercise_media?exercise_id=eq.${exercise.id}&media_type=eq.tutorial&is_primary=eq.true&status=in.(usable,verified,inherited)&order=updated_at.desc`);
    const existing = media.find(m => youtubeVideoId(m.url) || youtubeVideoId(m.embed_url));
    // All readers use the same primary; ordinary opens never replace another user's contribution.
    if (existing && input.action !== 'contribute') return reply({ exercise, media: [existing], errors: [] });
    if (input.action === 'contribute' && !suppliedId) return reply({ error: 'Paste a YouTube video link to contribute.' }, 400);
    const apiKey = Deno.env.get('YOUTUBE_API_KEY')?.trim();
    const errors: string[] = [];
    let video: { id: string; title: string } | undefined;
    if (suppliedId) {
      if (!apiKey) return reply({ error: 'The app administrator needs to configure YouTube before links can be checked.' }, 503);
      const params = new URLSearchParams({ key: apiKey, part: 'snippet,status', id: suppliedId });
      const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return reply({ error: 'Could not verify the video. Try again later.' }, 502);
      const data = await response.json();
      const item = data.items?.find((v: Row) => v.id === suppliedId && v.status?.embeddable && v.status?.privacyStatus !== 'private');
      if (!item) return reply({ error: 'Choose a public YouTube video that allows embedding.' }, 400);
      video = { id: suppliedId, title: String(item.snippet?.title || exercise.name).slice(0, 300) };
    } else if (!existing && input.fetchMissing !== false) {
      if (!apiKey) errors.push('Automatic video search is temporarily unavailable. You can add a YouTube link when the connection is restored.');
      else {
        try {
          const params = new URLSearchParams({ key: apiKey, part: 'snippet', type: 'video', videoEmbeddable: 'true', safeSearch: 'strict', order: 'relevance', maxResults: '10', q: `${exercise.name} exercise proper form tutorial` });
          const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error('Video search is temporarily unavailable. Your exercise remains saved.');
          const data = await response.json();
          const candidates = (data.items || []).filter((v: Row) => /^[\w-]{11}$/.test(v.id?.videoId || '') && typeof v.snippet?.title === 'string').map((v: Row) => ({ id: v.id.videoId, title: v.snippet.title }));
          video = bestExerciseReference<{ id: string; title: string }>(exercise.name, candidates);
        } catch (error) { errors.push((error as Error).message); }
      }
    }
    if (video) {
      const saved = await rest('rpc/body_os_save_shared_tutorial', 'POST', { exercise: exercise.id, video: video.id, actor: user.id, title: video.title, replace_existing: input.action === 'contribute' });
      media = [saved];
    }
    return reply({ exercise, media: media.filter(m => youtubeVideoId(m.url) || youtubeVideoId(m.embed_url)), errors });
  } catch (error) { return reply({ error: error instanceof SyntaxError ? 'Invalid request.' : (error as Error).message || 'Exercise library unavailable.' }, error instanceof SyntaxError ? 400 : 503); }
}
Deno.serve(handler);
