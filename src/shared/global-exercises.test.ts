import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercise, matchCachedExercise, normalizeExerciseName, safeMediaUrl, selectExerciseMedia, ExerciseCatalogRepository, type CatalogExercise, type ExerciseMedia } from './global-exercises.js';

const row:CatalogExercise={id:'00000000-0000-4000-8000-000000000001',name:'Barbell Bench Press',normalized_name:'barbell bench press',slug:'barbell-bench-press',equipment:['barbell'],muscles:['Chest'],movement_pattern:'horizontal_press',body_part:'Chest',family_id:'bench',catalog_status:'active',source_payload:{},created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};
const aliases=[{id:1,exercise_id:row.id,alias:'BB Bench Press',normalized_alias:'bb bench press',auto_match_allowed:true,created_at:row.created_at,updated_at:row.updated_at}];
const ex=catalogExercise(row,aliases,[]);
test('resolver matches canonical IDs, exact names, normalized names and approved aliases',()=>{
 for(const input of [{name:'ignored',exerciseId:row.id},{name:row.name},{name:' BARBELL--BENCH PRESS '},{name:'BB Bench Press'}]) assert.equal(matchCachedExercise(input,[ex])?.id,row.id);
 assert.equal(normalizeExerciseName('  BB---Bench Press '),'bb bench press');
});
test('resolver rejects materially different equipment, movement, weak fuzzy and ambiguous aliases',()=>{
 assert.equal(matchCachedExercise({name:row.name,equipment:'Dumbbell'},[ex]),undefined);
 assert.equal(matchCachedExercise({name:row.name,movementPattern:'vertical_press'},[ex]),undefined);
 assert.equal(matchCachedExercise({name:'Bench Curl'},[ex]),undefined);
 assert.equal(matchCachedExercise({name:'Nordic Curl'},[{...ex,name:'Drag Curl'}]),undefined);
 assert.equal(matchCachedExercise({name:'BB Bench Press'},[ex,{...ex,id:'other',name:'Other bench'}]),undefined);
 const unapproved=catalogExercise(row,[{...aliases[0],auto_match_allowed:false}],[]);
 assert.equal(matchCachedExercise({name:'BB Bench Press'},[unapproved]),undefined);
});
function media(kind:string,status='verified',url='https://example.com/demo.gif'):ExerciseMedia {
 return {id:kind,exercise_id:row.id,media_type:kind,status,url,embed_url:null,thumbnail_url:null,provider:'manual',provider_asset_id:null,source_url:null,is_primary:true,match_method:null,match_confidence:null,inherited_from_exercise_id:null,metadata:{},created_at:row.created_at,updated_at:row.updated_at};
}
test('media selects verified, inherited and image fallback without accepting broken links',()=>{
 assert.equal(selectExerciseMedia([media('animation','broken')],'animation'),undefined);
 assert.equal(selectExerciseMedia([media('animation','inherited')],'animation')?.status,'inherited');
 assert.equal(selectExerciseMedia([media('image')],'image')?.provider,'manual');
 for(const url of ['javascript:alert(1)','http://example.com/demo.gif','data:image/png;base64,test']) assert.equal(safeMediaUrl(url),undefined);
});
test('stored animation and tutorial require no provider fetch and developer updates change catalog media only',()=>{
 const workout={exerciseId:row.id,sets:3}; const before=JSON.stringify(workout);
 const first=catalogExercise(row,aliases,[media('animation'),media('tutorial','usable','https://www.youtube.com/watch?v=abcdefghijk')]);
 const second=catalogExercise(row,aliases,[media('animation','verified','https://example.com/new.gif')]);
 assert.equal(first.media?.length,2); assert.equal(second.media?.[0].url,'https://example.com/new.gif');
 assert.equal(JSON.stringify(workout),before);
});
test('catalog repository authenticates sync/ensure and uses a database watermark',async()=>{
 const calls:{url:string;body:any;headers:any}[]=[];
 const mock:typeof fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(String(options?.body)),headers:options?.headers});return new Response(JSON.stringify({syncedAt:row.updated_at,full:false,exercises:[row],aliases,media:[]}));};
 const repository=new ExerciseCatalogRepository({url:'https://project.supabase.co',publishableKey:'public'},'user-token',mock);
 await repository.sync(row.updated_at); await repository.ensureExercise({name:row.name});
 assert.equal(calls[0].body.since,row.updated_at); assert.equal(calls[0].headers.Authorization,'Bearer user-token');
 assert.match(calls[1].url,/functions\/v1\/body-os-exercise-resolver$/);
});
