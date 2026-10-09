import { getDb } from '../db/connection.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { DEFAULT_SUPABASE_CONFIG } from '../../shared/supabase-project.js';
import { normalizeExerciseName, safeMediaUrl, type CatalogExercise, type ExerciseMedia } from '../../shared/global-exercises.js';

type Keys={youtubeApiKey?:string};
let weeklyEnrichmentRunning=false;
/** Opt-in weekly developer job, using the existing backend scheduler. */
export async function checkExerciseMediaEnrichmentSchedule():Promise<void> {
  if(process.env.BODY_OS_EXERCISE_MEDIA_WEEKLY!=='1' || weeklyEnrichmentRunning || !process.env.SUPABASE_SERVICE_ROLE_KEY)return;
  const status=mediaIntegrationStatus();
  if(!status.youtubeConfigured)return;
  const row=getDb().prepare('SELECT value FROM meta WHERE key=?').get('exerciseMediaLastEnrichmentAt') as {value:string}|undefined;
  if(row && Date.now()-Date.parse(row.value)<7*86400000)return;
  weeklyEnrichmentRunning=true;
  try {
    await enrichPendingExerciseMedia();
    getDb().prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('exerciseMediaLastEnrichmentAt',new Date().toISOString());
  } finally {weeklyEnrichmentRunning=false;}
}
export function saveMediaIntegrationKeys(keys:Keys):void {
  getDb().exec('CREATE TABLE IF NOT EXISTS exercise_integration_secrets(name TEXT PRIMARY KEY,value TEXT NOT NULL)');
  for(const name of ['youtubeApiKey'] as const) if(keys[name]!==undefined) getDb().prepare('INSERT INTO exercise_integration_secrets(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name,encryptSecret(keys[name] || ''));
}
export function mediaIntegrationKeys():Keys {
  saveMediaIntegrationKeys({});
  getDb().prepare('DELETE FROM exercise_integration_secrets WHERE name=?').run('giphyApiKey');
  const values=getDb().prepare("SELECT name,value FROM exercise_integration_secrets WHERE name='youtubeApiKey'").all() as {name:string;value:string}[];
  return Object.fromEntries(values.map(v=>[v.name,decryptSecret(v.value)]));
}
export function mediaIntegrationStatus() {
  const keys=mediaIntegrationKeys();
  return {youtubeConfigured:Boolean(keys.youtubeApiKey || process.env.YOUTUBE_API_KEY),globalWritesConfigured:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)};
}
/** Strict title matching is deliberate. Uncertain candidates remain in the developer queue. */
export function relevantMediaTitle(name:string,title:string):boolean {
  const tokens=normalizeExerciseName(title).split(' ');
  return normalizeExerciseName(name).split(' ').every(word=>tokens.includes(word));
}
export async function discoverExerciseMedia(exercise:CatalogExercise,kind:'animation'|'tutorial',keys:Keys,request=fetch):Promise<Partial<ExerciseMedia> | undefined> {
  if(kind==='tutorial' && keys.youtubeApiKey) {
    const params=new URLSearchParams({key:keys.youtubeApiKey,part:'snippet',type:'video',videoEmbeddable:'true',maxResults:'10',q:`${exercise.name} exercise technique`});
    const response=await request(`https://www.googleapis.com/youtube/v3/search?${params}`,{signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Tutorial provider unavailable');
    const data=await response.json() as any;
    const candidate=data.items?.find((item:any)=>relevantMediaTitle(exercise.name,item.snippet?.title || '') && /^[a-zA-Z0-9_-]{11}$/.test(item.id?.videoId || ''));
    if(candidate) {
      const video=candidate.id.videoId;
      return {provider:'youtube',provider_asset_id:video,url:`https://www.youtube.com/watch?v=${video}`,embed_url:`https://www.youtube.com/embed/${video}`,thumbnail_url:safeMediaUrl(candidate.snippet?.thumbnails?.medium?.url),metadata:{title:candidate.snippet.title,channel_id:candidate.snippet.channelId,selected_at:new Date().toISOString()}};
    }
  }
  return undefined;
}

/** Invoked separately from imports; credentials and provider failures cannot affect saving. */
export async function enrichPendingExerciseMedia(request=fetch):Promise<{processed:number;selected:number}> {
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!service) throw new Error('Configure the server Supabase service role key for developer media enrichment');
  const stored=mediaIntegrationKeys();
  const keys={youtubeApiKey:stored.youtubeApiKey || process.env.YOUTUBE_API_KEY};
  const rest=async(path:string,method='GET',body?:unknown)=>{
    const response=await request(`${DEFAULT_SUPABASE_CONFIG.url}/rest/v1/${path}`,{method,headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error(`Catalog operation failed (${response.status})`);
    return response.json() as Promise<any[]>;
  };
  const pending=await rest('body_os_exercise_media_requests?status=eq.pending&order=created_at.asc&limit=100');
  let selected=0,processed=0;
  for(const item of pending) {
    if(!item.exercise_id) continue;
    const [exercise]=await rest(`body_os_exercises?id=eq.${encodeURIComponent(item.exercise_id)}&catalog_status=neq.disabled`);
    if(!exercise) continue;
    if (item.media_type === 'animation' || item.media_type === 'image') continue;
    const kinds=['tutorial'];
    const ids:string[]=[];
    let failed=false;
    let review=false;
    for(const kind of kinds as ('animation'|'tutorial')[]) {
      const existing=await rest(`body_os_exercise_media?exercise_id=eq.${item.exercise_id}&media_type=eq.${kind}&is_primary=eq.true&status=in.(usable,verified,inherited)`);
      const usable=existing.find(m=>(safeMediaUrl(m.url)||safeMediaUrl(m.embed_url)) && (item.reason!=='broken_media' || Date.parse(m.updated_at)>Date.parse(item.created_at)));
      if(usable) {ids.push(usable.id);continue;}
      const candidates=await rest(`body_os_exercise_media?exercise_id=eq.${item.exercise_id}&media_type=eq.${kind}&status=eq.needs_review&limit=1`);
      if(candidates.length) {review=true;continue;}
      try {
        const candidate=await discoverExerciseMedia(exercise,kind,keys,request);
        if(!candidate) continue;
        // Automatic discovery is a review candidate. A developer verifies correctness before publishing.
        // No irrelevant search result is persisted; only the selected strict-title candidate is retained.
        const [saved]=await rest('body_os_exercise_media','POST',{...candidate,exercise_id:item.exercise_id,media_type:kind,status:'needs_review',is_primary:false,match_method:'exact_title_tokens',match_confidence:null});
        if(saved) {selected++;review=true;}
      } catch {failed=true;}
    }
    await rest(`body_os_exercise_media_requests?id=eq.${item.id}`,'PATCH',ids.length===kinds.length?{status:'resolved',resolved_at:new Date().toISOString(),resolved_media_id:ids.length===1?ids[0]:null}:{status:review?'in_progress':'pending',attempt_count:item.attempt_count+1,last_error:failed?'Provider unavailable':null,...(!review?{reason:'provider_no_result'}:{})});
    processed++;
  }
  return {processed,selected};
}
