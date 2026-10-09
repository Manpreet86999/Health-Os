import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverExerciseMedia,relevantMediaTitle,enrichPendingExerciseMedia } from './exercise-media-enrichment.js';
import type { CatalogExercise } from '../../shared/global-exercises.js';
const exercise={id:'test',name:'Dumbbell Curl'} as CatalogExercise;
test('media discovery rejects equipment/movement differences and calls no provider without credentials',async()=>{
 assert.equal(relevantMediaTitle('Dumbbell Curl','Barbell Curl tutorial'),false);
 assert.equal(relevantMediaTitle('Nordic Curl','Drag Curl tutorial'),false);
 assert.equal(relevantMediaTitle('Dumbbell Curl','How to do a Dumbbell Curl'),true);
 let calls=0;
 const request:typeof fetch=async()=>{calls++;return new Response('{}');};
 assert.equal(await discoverExerciseMedia(exercise,'animation',{},request),undefined);
 assert.equal(await discoverExerciseMedia(exercise,'tutorial',{},request),undefined);
 assert.equal(calls,0);
});
test('removed animation discovery never contacts a provider',async()=>{
 const result=await discoverExerciseMedia(exercise,'animation',{},async()=>{throw new Error('Must not fetch');});
 assert.equal(result,undefined);
});

test('YouTube search stores watch/embed/thumbnail identity and provider failure is recoverable',async()=>{
 const request:typeof fetch=async()=>new Response(JSON.stringify({items:[{id:{videoId:'abcdefghijk'},snippet:{title:'Dumbbell Curl tutorial',channelId:'channel',thumbnails:{medium:{url:'https://example.com/thumb.jpg'}}}}]}));
 const result=await discoverExerciseMedia(exercise,'tutorial',{youtubeApiKey:'private'},request);
 assert.equal(result?.embed_url,'https://www.youtube.com/embed/abcdefghijk');
 await assert.rejects(discoverExerciseMedia(exercise,'tutorial',{youtubeApiKey:'private'},async()=>new Response('',{status:503})),/provider unavailable/);
});
test('stored primary animation and tutorial skip every external provider call',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';
 const calls:string[]=[];let resolved=false;
 const request:typeof fetch=async(url,options)=>{
   const path=String(url);calls.push(path);
   if(path.includes('body_os_exercise_media_requests') && options?.method==='PATCH'){resolved=JSON.parse(String(options.body)).status==='resolved';return new Response('[]');}
   if(path.includes('body_os_exercise_media_requests'))return new Response(JSON.stringify([{id:'request',exercise_id:'test',media_type:'both',attempt_count:0}]));
   if(path.includes('body_os_exercises'))return new Response(JSON.stringify([exercise]));
   if(path.includes('body_os_exercise_media'))return new Response(JSON.stringify([{id:'stored',url:'https://example.com/stored',updated_at:'2026-09-01T00:00:00Z'}]));
   throw new Error('External provider must not be called');
 };
 try{assert.equal((await enrichPendingExerciseMedia(request)).selected,0);assert.equal(resolved,true);assert.equal(calls.some(url=>url.includes('api.giphy.com') || url.includes('googleapis.com')),false);}finally{if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;}
});
