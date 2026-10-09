import test from 'node:test';
import assert from 'node:assert/strict';
const env:Record<string,string>={SUPABASE_URL:'https://cloud.test',SUPABASE_SERVICE_ROLE_KEY:'service',YOUTUBE_API_KEY:'private-youtube'};
(globalThis as any).Deno={env:{get:(key:string)=>env[key]},serve(){}};
const {handler}=await import('../functions/body-os-exercise-library/index.ts');
const id='22222222-2222-4222-8222-222222222222';
const exercise={id,name:'Bench Press'};
const saved={id:'media',exercise_id:id,url:'https://www.youtube.com/watch?v=abcdefghijk',media_type:'tutorial',is_primary:true,status:'usable'};
const request=(body:any,auth=true)=>new Request('https://cloud.test/library',{method:'POST',headers:auth?{authorization:'Bearer user'}:{},body:JSON.stringify({name:'Bench Press',...body})});
async function withFetch(mock:typeof fetch, run:()=>Promise<void>){const old=globalThis.fetch;globalThis.fetch=mock;try{await run();}finally{globalThis.fetch=old;}}
test('anonymous requests cannot access or mutate the library',async()=>{
 assert.equal((await handler(request({},false))).status,401);
 await withFetch(async()=>Response.json({id:'anon',is_anonymous:true}),async()=>assert.equal((await handler(request({}))).status,401));
});
test('shared video reuse requires no provider key or search and ignores caller actor',async()=>{
 const key=env.YOUTUBE_API_KEY;delete env.YOUTUBE_API_KEY;
 try {await withFetch(async(url,init)=>{
   const path=String(url);
   if(path.endsWith('/auth/v1/user'))return Response.json({id:'real-user'});
   if(path.includes('rpc/body_os_ensure_exercise')){const body=JSON.parse(String(init?.body));assert.equal(body.actor,'real-user');assert.equal(body.input.actor,undefined);return Response.json({exercise});}
   if(path.includes('body_os_exercise_media?'))return Response.json([saved]);
   throw new Error('Must reuse shared media without provider call');
 },async()=>{const response=await handler(request({actor:'forged'}));assert.equal(response.status,200);assert.deepEqual((await response.json()).media,[saved]);});}finally{env.YOUTUBE_API_KEY=key;}
});
test('contribution validates embedding, canonicalizes URLs, and requests explicit replacement',async()=>{
 await withFetch(async(url,init)=>{
   const path=String(url);
   if(path.endsWith('/auth/v1/user'))return Response.json({id:'real-user'});
   if(path.includes('rpc/body_os_ensure_exercise'))return Response.json({exercise});
   if(path.includes('body_os_exercise_media?'))return Response.json([saved]);
   if(path.includes('youtube/v3/videos?'))return Response.json({items:[{id:'lmnopqrstuv',status:{embeddable:true,privacyStatus:'public'},snippet:{title:'Bench Press form'}}]});
   if(path.includes('rpc/body_os_save_shared_tutorial')){const body=JSON.parse(String(init?.body));assert.equal(body.video,'lmnopqrstuv');assert.equal(body.actor,'real-user');assert.equal(body.replace_existing,true);assert.ok(!JSON.stringify(body).includes('private-youtube'));return Response.json({...saved,url:'https://www.youtube.com/watch?v=lmnopqrstuv'});}
   throw new Error('Unexpected '+path);
 },async()=>{const response=await handler(request({action:'contribute',youtubeUrl:'https://youtu.be/lmnopqrstuv'}));assert.equal(response.status,200);assert.match((await response.json()).media[0].url,/lmnopqrstuv/);});
});
test('hostile URLs are rejected before database writes',async()=>{
 await withFetch(async(url)=>{assert.ok(String(url).endsWith('/auth/v1/user'));return Response.json({id:'user'});},async()=>{
  for(const youtubeUrl of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=abcdefghijk','https://evil.test/embed/abcdefghijk'])assert.equal((await handler(request({action:'contribute',youtubeUrl}))).status,400);
 });
});
test('a provider outage returns the saved exercise and a retryable error',async()=>{
 await withFetch(async(url)=>{
  const path=String(url);
  if(path.endsWith('/auth/v1/user'))return Response.json({id:'user'});
  if(path.includes('rpc/body_os_ensure_exercise'))return Response.json({exercise});
  if(path.includes('body_os_exercise_media?'))return Response.json([]);
  if(path.includes('youtube/v3/search?'))return Response.json({}, {status:429});
  throw new Error('Must not publish a failed search');
 },async()=>{const response=await handler(request({}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.exercise.id,id);assert.equal(result.media.length,0);assert.ok(result.errors.length);});
});
test('shared exercise details exclude personal notes and credentials',async()=>{
 await withFetch(async(url,init)=>{
  const path=String(url), body=init?.body ? JSON.parse(String(init.body)) : undefined;
  if(path.endsWith('/auth/v1/user'))return Response.json({id:'user'});
  if(path.includes('rpc/body_os_ensure_exercise')){assert.equal(body.input.notes,undefined);assert.equal(body.input.youtubeApiKey,undefined);return Response.json({exercise:{...exercise,source_payload:{source:'catalog'}}});}
  if(path.includes('body_os_exercises?id=')){assert.deepEqual(body.source_payload,{source:'catalog',defaultCue:'Control the bar'});assert.deepEqual(body.equipment,['Barbell']);return Response.json([{...exercise,equipment:body.equipment,source_payload:body.source_payload}]);}
  if(path.includes('body_os_exercise_media?'))return Response.json([saved]);
  throw new Error('No provider call for an existing guide');
 },async()=>{const response=await handler(request({updateDetails:true,equipment:'Barbell',defaultCue:'Control the bar',notes:'private workout',youtubeApiKey:'private'}));assert.equal(response.status,200);assert.deepEqual((await response.json()).exercise.equipment,['Barbell']);});
});
test('missing exercise search publishes only the relevant video for future reuse',async()=>{
 await withFetch(async(url,init)=>{
  const path=String(url);
  if(path.endsWith('/auth/v1/user'))return Response.json({id:'user'});
  if(path.includes('rpc/body_os_ensure_exercise'))return Response.json({exercise,status:'created'});
  if(path.includes('body_os_exercise_media?'))return Response.json([]);
  if(path.includes('youtube/v3/search?'))return Response.json({items:[{id:{videoId:'abcdefghijk'},snippet:{title:'Incline Bench Press tutorial'}},{id:{videoId:'lmnopqrstuv'},snippet:{title:'Bench Press proper form tutorial'}}]});
  if(path.includes('rpc/body_os_save_shared_tutorial')){const body=JSON.parse(String(init?.body));assert.equal(body.video,'lmnopqrstuv');assert.equal(body.replace_existing,false);return Response.json({...saved,provider_asset_id:body.video});}
  throw new Error('Unexpected request');
 },async()=>{const response=await handler(request({}));assert.equal(response.status,200);assert.equal((await response.json()).media[0].provider_asset_id,'lmnopqrstuv');});
});
