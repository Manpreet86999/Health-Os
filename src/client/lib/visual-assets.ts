import type { Exercise, PlannedExercise } from '../../shared/types';

export type VisualEntity = 'workout' | 'exercise' | 'food' | 'meal' | 'recipe' | 'product' | 'routine' | 'body' | 'sleep' | 'recovery' | 'report' | 'insight';
export interface VisualContext {
  entityType: VisualEntity; entityId?: string; name?: string; tags?: string[]; muscleGroup?: string;
  category?: string; userImage?: string; storedImage?: string; thumbnailUrl?: string;
  remoteImage?: string; imageAssetKey?: string; fallbackAsset?: string;
}
export interface VisualCandidate { src: string; srcSet?: string; kind: 'photo' | 'illustration'; origin: 'user' | 'entity' | 'provider' | 'curated' | 'fallback'; description: string; }
export interface ResolvedVisual { candidates: VisualCandidate[]; icon: 'Train' | 'Eat' | 'Care' | 'Body' | 'Sleep' | 'Recover' | 'Report' | 'Insights'; category: string; }

/** Presentation-only catalogue. Photography is context, never a source of metric truth. */
const curated: Record<string, {description:string; photo?:boolean}> = {
  'train-lower':{description:'Lower body training · barbell squat',photo:true},
  'train-push':{description:'Upper push training · bench press',photo:true},
  'train-pull':{description:'Pull training · rowing',photo:true},
  'train-cardio':{description:'Cardio training · treadmill',photo:true},
  'train-full':{description:'Strength training equipment'},
  'food-oats':{description:'Oatmeal category photo',photo:true},
  'food-roti':{description:'Roti category photo',photo:true},
  'food-meal':{description:'Meal category illustration'},
  'care-product':{description:'Care product illustration'},
  'care-am':{description:'Morning routine illustration'},
  'care-pm':{description:'Evening routine illustration'},
  body:{description:'Body measurement illustration'},
  report:{description:'Document illustration'},
};
const icon: Record<VisualEntity,ResolvedVisual['icon']> = {workout:'Train',exercise:'Train',food:'Eat',meal:'Eat',recipe:'Eat',product:'Care',routine:'Care',body:'Body',sleep:'Sleep',recovery:'Recover',report:'Report',insight:'Insights'};

export function safeVisualUrl(value:unknown):string|undefined {
  if(typeof value!=='string')return;
  const url=value.trim();
  if(/^\/(?!\/)[^\s\\]*$/.test(url)||/^blob:https?:\/\//.test(url)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url))return url;
  try { const parsed=new URL(url);if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password)return parsed.href; } catch { /* category fallback */ }
}

function categoryFor(c:VisualContext):string {
  const text=[c.name,c.category,c.muscleGroup,...c.tags||[]].join(' ').toLowerCase().replace(/[_-]/g,' ');
  if(c.entityType==='workout'||c.entityType==='exercise') {
    if(c.entityType==='workout') {
      const declared=[c.name,c.category].join(' ').toLowerCase().replace(/[_-]/g,' ');
      if(/full body|total body/.test(declared))return 'train-full';
      if(/cardio|run|cycle|treadmill|swim|walk/.test(declared))return 'train-cardio';
      if(/lower|leg/.test(declared))return 'train-lower';
      if(/pull/.test(declared))return 'train-pull';
      if(/push/.test(declared))return 'train-push';
    }
    if(/cardio|run|cycle|treadmill|swim|walk/.test(text))return 'train-cardio';
    if(/full body|total body/.test(text))return 'train-full';
    if(/lower|leg|quad|hamstring|glute|squat|deadlift|lunge|calf/.test(text))return 'train-lower';
    if(/pull|row|back|lat|bicep|curl/.test(text))return 'train-pull';
    if(/push|press|chest|shoulder|tricep/.test(text))return 'train-push';
    return 'train-full';
  }
  if(['meal','food','recipe'].includes(c.entityType)) {
    if(/oat|porridge/.test(text))return 'food-oats';
    if(/chapati|roti|flatbread/.test(text))return 'food-roti';
    return 'food-meal';
  }
  if(c.entityType==='product')return 'care-product';
  if(c.entityType==='routine')return /evening|night|pm/.test(text)?'care-pm':'care-am';
  return c.entityType;
}

// Bounded cache stores only small URLs and mappings, never personal image bytes.
const cache=new Map<string,ResolvedVisual>();
export function resolveVisual(context:VisualContext):ResolvedVisual {
  const key=JSON.stringify(context),cached=cache.get(key);if(cached)return cached;
  const category=categoryFor(context),candidates:VisualCandidate[]=[];
  const add=(value:unknown,origin:VisualCandidate['origin'])=>{const src=safeVisualUrl(value);if(src&&!candidates.some(c=>c.src===src))candidates.push({src,origin,kind:'photo',description:context.name||context.entityType});};
  add(context.userImage,'user');add(context.thumbnailUrl||context.storedImage,'entity');add(context.storedImage,'entity');add(context.remoteImage,'provider');
  for(const asset of [context.imageAssetKey,category,context.fallbackAsset]) {
    if(!asset||!curated[asset])continue;
    const entry=curated[asset],src=`/assets/visuals/${asset}${entry.photo?'-640.webp':'.svg'}`;
    if(!candidates.some(c=>c.src===src))candidates.push({src,kind:entry.photo?'photo':'illustration',origin:entry.photo?'curated':'fallback',description:entry.description,...(entry.photo?{srcSet:`/assets/visuals/${asset}-160.webp 160w, ${src} 640w`}:{})});
  }
  const fallback=['workout','exercise'].includes(context.entityType)?'train-full':['food','meal','recipe'].includes(context.entityType)?'food-meal':null;
  if(fallback&&!candidates.some(c=>c.src.includes(fallback)))candidates.push({src:`/assets/visuals/${fallback}.svg`,kind:'illustration',origin:'fallback',description:curated[fallback].description});
  const result={candidates,icon:icon[context.entityType],category};
  if(!context.userImage?.startsWith('data:')){if(cache.size>=300)cache.delete(cache.keys().next().value!);cache.set(key,result);}
  return result;
}

export function exerciseVisual(exercise:Partial<Exercise>&{target?:string}):VisualContext {
  return {entityType:'exercise',entityId:exercise.id,name:exercise.name,muscleGroup:exercise.target||exercise.bodyPart,tags:[...exercise.muscles||[],exercise.movementPattern||'',exercise.workoutSplit||'']};
}

export function workoutVisual(workout:{name?:string;category?:string;muscles?:string[];exercises?:PlannedExercise[]},library:Exercise[]=[]):VisualContext {
  const exercises=workout.exercises||[];
  const main=exercises.map(e=>library.find(x=>x.id===e.exerciseId||x.name.toLowerCase()===e.name.toLowerCase())).find(e=>e&&resolveVisual(exerciseVisual(e)).candidates.some(c=>c.origin==='entity'));
  const specific=main?exerciseVisual(main):undefined;
  // Use workout semantics first; composition supplies context for unnamed sessions.
  return {...specific,entityType:'workout',name:workout.name,category:workout.category,tags:[...workout.muscles||[],...exercises.flatMap(e=>[e.target,e.name])],imageAssetKey:undefined};
}

export function recordVisual(record:{id:string;name:string;type:string;metadata:Record<string,unknown>}):VisualContext {
  const m=record.metadata;
  return {entityType:['food','recipe','meal'].includes(record.type)?record.type as VisualEntity:'meal',entityId:record.id,name:record.name,category:String(m.visualCategory||''),storedImage:safeVisualUrl(m.imageUrl||m.image),thumbnailUrl:safeVisualUrl(m.thumbnailUrl),remoteImage:safeVisualUrl(m.remoteImage),imageAssetKey:typeof m.imageAssetKey==='string'?m.imageAssetKey:undefined};
}
