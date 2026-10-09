import test from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).Deno = { env: { get: (name: string) => ({ SUPABASE_URL: 'https://cloud.test', SUPABASE_ANON_KEY: 'public-key', YOUTUBE_API_KEY: 'app-youtube' }[name]) }, serve() {} };
const { handler } = await import('../functions/body-os-ai/index.ts');
const request = (body: unknown, token = true) => new Request('https://cloud.test/functions/v1/body-os-ai', { method: 'POST', headers: token ? { authorization: 'Bearer user-token' } : {}, body: JSON.stringify(body) });

test('cloud AI requires authentication before reading any records', async () => {
  assert.equal((await handler(request({ action: '/ai/test' }, false))).status, 401);
});
test('cloud AI rejects invalid sessions and anonymous users', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({}, { status: 401 });
    assert.equal((await handler(request({ action: '/ai/test' }))).status, 401);
    globalThis.fetch = async () => Response.json({ id: 'owner', is_anonymous: true });
    assert.equal((await handler(request({ action: '/ai/test' }))).status, 401);
  } finally { globalThis.fetch = original; }
});
test('cloud AI reads owner records and excludes saved credentials from provider prompts', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'owner' });
      if (url.includes('/body_os_records')) {
        assert.equal(new URL(url).searchParams.get('user_id'), 'eq.owner');
        assert.equal((init?.headers as any).Authorization, 'Bearer user-token');
        return Response.json([{ entity_type: 'sharedPreferences', record_id: 'shared-preferences', payload: { openRouterApiKey: 'private-provider-key', aiProvider: 'openrouter' } }]);
      }
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal((init?.headers as any).Authorization, 'Bearer private-provider-key');
      assert.ok(!String(init?.body).includes('private-provider-key'));
      return Response.json({ choices: [{ message: { content: 'Connection works.' } }] });
    };
    const result = await handler(request({ action: '/ai/test' }));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).ok, true);
  } finally { globalThis.fetch = original; }
});


test('coach health context is bounded, owner-scoped, and never presented as daily totals',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input));
      if(url.pathname==='/auth/v1/user')return Response.json({id:'owner'});
      if(url.pathname.includes('/body_os_records')){
        assert.equal(url.searchParams.get('user_id'),'eq.owner');
        if(url.searchParams.get('entity_type')==='eq.healthReading'){
          assert.equal(url.searchParams.get('limit'),'120');return Response.json([{payload:{date:'2026-10-07',kind:'Steps',value:100,unit:'steps',source:'watch'}}]);
        }
        return Response.json([{entity_type:'sharedPreferences',record_id:'shared-preferences',payload:{openRouterApiKey:'private-provider-key'}}]);
      }
      const body=JSON.parse(String(init?.body));const prompt=JSON.parse(body.messages[1].content);
      assert.equal(prompt.context.health.readings[0].source,'watch');assert.match(prompt.context.health.scope,/not complete daily totals/);assert.ok(!String(init?.body).includes('private-provider-key'));
      return Response.json({choices:[{message:{content:'Only a partial health sample is available.'}}]});
    };
    assert.equal((await handler(request({action:'/ai/coach'}))).status,200);
  }finally{globalThis.fetch=original;}
});

test('photo descriptions require explicit consent before any provider request',async()=>{
  const original=globalThis.fetch;let providerCalls=0;
  try{
    globalThis.fetch=async input=>{const url=String(input);if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner'});if(url.includes('/body_os_records'))return Response.json([]);providerCalls++;throw new Error('Unexpected provider request');};
    const response=await handler(request({action:'/skin/photos/observe',id:'photo',consent:false}));assert.equal(response.status,400);assert.equal(providerCalls,0);
  }finally{globalThis.fetch=original;}
});

test('YouTube returns one relevant movement guide and skips unrelated results', async () => {
  const original = globalThis.fetch;
  let matching = true;
  try {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'owner' });
      if (url.includes('/body_os_records')) return Response.json([{ entity_type: 'sharedPreferences', record_id: 'shared-preferences', payload: { youtubeApiKey: 'saved-youtube' } }]);
      const params = new URL(url).searchParams;
      assert.equal(params.get('key'), 'app-youtube');
      assert.equal(params.get('order'), 'relevance');
      assert.equal(params.get('maxResults'), '10');
      assert.equal(params.get('videoEmbeddable'), 'true');
      return Response.json({ items: [
        { id: { videoId: 'wrong123456' }, snippet: { title: 'Incline Bench Press tutorial' } },
        ...(matching ? [{ id: { videoId: 'right123456' }, snippet: { title: 'Bench Press proper form tutorial', channelTitle: 'Training' } }] : [])
      ] });
    };
    const result = await handler(request({ action: '/media/youtube', exercise: 'Bench Press' }));
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.videos.length, 1);
    assert.equal(data.videos[0].id, 'right123456');
    matching = false;
    assert.deepEqual((await (await handler(request({ action: '/media/youtube', exercise: 'Bench Press' }))).json()).videos, []);
  } finally { globalThis.fetch = original; }
});

test('shared media configuration needs authentication and never exposes the YouTube secret', async () => {
  const original = globalThis.fetch;
  let reads = 0;
  try {
    globalThis.fetch = async input => {
      if (String(input).endsWith('/auth/v1/user')) return Response.json({ id: 'another-user' });
      reads++;
      throw new Error('Media config must not read personal records');
    };
    assert.equal((await handler(request({ action: '/media/config' }, false))).status, 401);
    const response = await handler(request({ action: '/media/config' }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data, { youtubeConfigured: true });
    assert.ok(!JSON.stringify(data).includes('app-youtube'));
    assert.equal(reads, 0);
  } finally { globalThis.fetch = original; }
});

test('missing project keys return an administrator message without falling back to personal keys', async () => {
  const original = globalThis.fetch;
  const originalGet = (globalThis as any).Deno.env.get;
  try {
    (globalThis as any).Deno.env.get = (name: string) => ['YOUTUBE_API_KEY'].includes(name) ? undefined : originalGet(name);
    globalThis.fetch = async input => {
      assert.ok(String(input).endsWith('/auth/v1/user'));
      return Response.json({ id: 'owner' });
    };
    const response = await handler(request({ action: '/media/youtube', exercise: 'Squat', youtubeApiKey: 'personal-key' }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /app administrator/);
    const config = await (await handler(request({ action: '/media/config' }))).json();
    assert.deepEqual(config, { youtubeConfigured: false });
  } finally { globalThis.fetch = original; (globalThis as any).Deno.env.get = originalGet; }
});
