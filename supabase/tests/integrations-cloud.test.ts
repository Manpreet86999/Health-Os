import test from 'node:test';
import assert from 'node:assert/strict';
(globalThis as any).Deno={env:{get:(name:string)=>({SUPABASE_URL:'https://cloud.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test-service'}[name])},serve(){}};
const {handler}=await import('../functions/body-os-integrations/index.ts');
const call=(body:unknown,token='owner-token')=>handler(new Request('https://cloud.test/functions/v1/body-os-integrations',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(body)}));

test('integration credentials stay encrypted and owner scoped; OAuth state is consumed once',async()=>{
  const original=globalThis.fetch;const rows=new Map<string,any>();let tokenExchanges=0;
  try {
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input));const authorization=new Headers(init?.headers).get('authorization');
      if(url.pathname==='/auth/v1/user')return Response.json({id:authorization==='Bearer other-token'?'other-owner':'owner'});
      if(url.hostname==='oauth2.googleapis.com'){tokenExchanges++;assert.equal(new URLSearchParams(String(init?.body)).get('redirect_uri'),'https://cloud.test/functions/v1/body-os-integrations/drive-callback');return Response.json({access_token:'private-access',refresh_token:'private-refresh',expires_in:3600});}
      assert.equal(url.pathname,'/rest/v1/body_os_cloud_integrations');assert.equal(authorization,'Bearer private-test-service');
      if(init?.method==='POST'){const row=JSON.parse(String(init.body));assert.ok(row.data.cipher);assert.ok(!String(init.body).includes('client-secret'));rows.set(`${row.user_id}:${row.provider}`,row);return new Response(null,{status:204});}
      const owner=url.searchParams.get('user_id')?.slice(3),provider=url.searchParams.get('provider')?.slice(3);const matches=[...rows.values()].filter(r=>(!owner||r.user_id===owner)&&r.provider===provider);
      if(init?.method==='DELETE')for(const row of matches)rows.delete(`${row.user_id}:${row.provider}`);
      return Response.json(matches);
    };
    let response=await call({action:'/integrations/config',googleClientId:'client.apps.googleusercontent.com',googleClientSecret:'client-secret'});assert.equal(response.status,200);
    response=await call({action:'/integrations/status'});const status=await response.json();assert.equal(status.hasGoogleClient,true);assert.equal(status.clientSecret,undefined);assert.equal(status.refreshToken,undefined);
    response=await call({action:'/integrations/status'},'other-token');assert.equal((await response.json()).hasGoogleClient,false);
    const {url}=await(await call({action:'/gdrive/auth-url'})).json();const consent=new URL(url);assert.equal(consent.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.appdata');assert.equal(consent.searchParams.get('code_challenge_method'),'S256');
    const callback=`https://cloud.test/functions/v1/body-os-integrations/drive-callback?${new URLSearchParams({state:consent.searchParams.get('state')!,code:'one-time-code'})}`;
    assert.equal((await handler(new Request(callback))).status,200);
    assert.equal((await handler(new Request(callback))).status,400);assert.equal(tokenExchanges,1);
    assert.equal((await(await call({action:'/integrations/status'})).json()).driveConnected,true);
    assert.equal((await(await call({action:'/integrations/status'},'other-token')).json()).driveConnected,false);
  }finally{globalThis.fetch=original;}
});
test('integration handlers reject unauthenticated access and arbitrary callback state',async()=>{
  assert.equal((await handler(new Request('https://cloud.test',{method:'POST',body:'{}'}))).status,401);
  assert.equal((await handler(new Request('https://cloud.test/functions/v1/body-os-integrations/drive-callback?state=bad'))).status,400);
});
