import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Miniflare,convertV4MiniflareOptions } from 'miniflare';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const origin='https://mcp.test',app='http://localhost:10000';
test('hosted OAuth, account isolation, bridge execution, approvals and revocation',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'health-os-test',modules:true,scriptPath:'output/hosted-mcp-build/index.js',compatibilityDate:'2026-10-11',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],kvNamespaces:['OAUTH_KV'],durableObjects:{ACCOUNTS:{className:'HealthAccount',useSQLite:true}},bindings:{APP_ORIGINS:app+',https://localhost'},outboundService:async(req:any)=>{
   const url=new URL(req.url);
   if(url.hostname!=='lphlihwyrcqgmdiwlvuq.supabase.co')throw new Error('Unexpected network request');
   if(url.pathname==='/auth/v1/token'){const body=await req.json();return Response.json({access_token:'owner-session',refresh_token:'test-refresh',expires_in:3600,user:{id:owner,email:'owner@example.test'}},{status:body.password==='test-password'?200:401});}
   const token=req.headers.get('Authorization');if(!['Bearer owner-session','Bearer other-session'].includes(token))return Response.json({error:'invalid'},{status:401});
   return Response.json({id:token==='Bearer owner-session'?owner:other,email:'owner@example.test'});
 }}]}));
 const control=async(path:string,body:unknown={},token='owner-session')=>mf.dispatchFetch(origin+'/control/'+path,{method:'POST',headers:{Origin:app,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 let ws:any;const clients:Client[]=[];
 try{
  await t.test('anonymous discovery exposes OAuth metadata but no health tools',async()=>{
   const r=await mf.dispatchFetch(origin+'/mcp');assert.equal(r.status,401);assert.match(r.headers.get('WWW-Authenticate')||'',/resource_metadata/);
   const meta=await (await mf.dispatchFetch(origin+'/.well-known/oauth-authorization-server')).json() as any;assert.equal(meta.authorization_endpoint,origin+'/authorize');assert.ok(meta.code_challenge_methods_supported.includes('S256'));
   assert.equal((await mf.dispatchFetch(origin+'/internal/grant',{method:'POST'})).status,404);
   const native=await mf.dispatchFetch(origin+'/control/status',{method:'OPTIONS',headers:{Origin:'https://localhost','Access-Control-Request-Method':'POST'}});assert.equal(native.status,204);assert.equal(native.headers.get('Access-Control-Allow-Origin'),'https://localhost');
   const unauthenticatedNative=await mf.dispatchFetch(origin+'/control/status',{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json'},body:'{}'});assert.notEqual(unauthenticatedNative.status,200);
   assert.equal((await mf.dispatchFetch(origin+'/control/status',{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
  });
  await control('settings',{enabled:true,writeEnabled:true});
  const registered=await mf.dispatchFetch(origin+'/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Test ChatGPT',redirect_uris:['https://chatgpt.test/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
  assert.equal(registered.status,201);const registration=await registered.json() as any;
  const verifier='test-verifier-0123456789012345678901234567890123456789',challenge=createHash('sha256').update(verifier).digest('base64url');
  const query=new URLSearchParams({response_type:'code',client_id:registration.client_id,redirect_uri:'https://chatgpt.test/callback',scope:'health.read body.write sleep.write',state:'client-state',code_challenge:challenge,code_challenge_method:'S256',resource:origin+'/mcp'});
  const consent=await mf.dispatchFetch(origin+'/authorize?'+query),html=await consent.text();assert.equal(consent.status,200);
  const handle=html.match(/name="handle" value="([^"]+)"/)?.[1];assert.ok(handle);
  const cookies=consent.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const form=new URLSearchParams({handle:handle!,email:'owner@example.test',password:'test-password',decision:'approve'});for(const scope of ['health.read','body.write','sleep.write'])form.append('scope',scope);
  await t.test('consent cannot be approved from a foreign origin',async()=>assert.equal((await mf.dispatchFetch(origin+'/authorize',{method:'POST',headers:{Origin:'https://evil.test',Cookie:cookies},body:form.toString()})).status,403));
  const approved=await mf.dispatchFetch(origin+'/authorize',{method:'POST',redirect:'manual',headers:{Origin:origin,Cookie:cookies,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
  assert.equal(approved.status,302,await approved.text());const redirect=new URL(approved.headers.get('Location')!);assert.equal(redirect.searchParams.get('state'),'client-state');
  const tokenForm=new URLSearchParams({grant_type:'authorization_code',client_id:registration.client_id,code:redirect.searchParams.get('code')!,redirect_uri:'https://chatgpt.test/callback',code_verifier:verifier,resource:origin+'/mcp'});
  const tokenResponse=await mf.dispatchFetch(origin+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:tokenForm.toString()});const token=await tokenResponse.json() as any;assert.equal(tokenResponse.status,200,JSON.stringify(token));assert.ok(token.refresh_token);
  const ticketResponse=await mf.dispatchFetch(origin+'/bridge/ticket',{method:'POST',headers:{Origin:app,Authorization:'Bearer owner-session','Content-Type':'application/json'},body:'{}'});const ticket=await ticketResponse.json() as any;assert.equal(ticketResponse.status,200,JSON.stringify(ticket));
  await t.test('bridge tickets are bound to their account',async()=>assert.equal((await mf.dispatchFetch(origin+`/bridge/ws?user=${other}&ticket=${ticket.ticket}`,{headers:{Upgrade:'websocket',Origin:app}})).status,403));
  const upgraded=await mf.dispatchFetch(origin+`/bridge/ws?user=${owner}&ticket=${ticket.ticket}`,{headers:{Upgrade:'websocket',Origin:app}});assert.equal(upgraded.status,101);ws=upgraded.webSocket!;ws.accept();
  let executions=0;const jobs=new Map<string,any>();const errors:any[]=[];
  ws.addEventListener('message',(event:any)=>{if(event.data==='pong')return;const msg=JSON.parse(event.data);if(msg.type==='job'){jobs.set(msg.job.id,msg.job);ws.send(JSON.stringify({type:'authorize',id:msg.job.id}));}if(msg.type==='authorized'&&msg.success){executions++;const job=jobs.get(msg.id);ws.send(JSON.stringify({type:'complete',id:msg.id,result:{success:true,actionReceiptId:job.receiptId,data:job.action==='health.get_current_state'?{summary:'Fixture health summary'}:{saved:true}}}));}if(msg.type==='error')errors.push(msg);});
  ws.send('ready');
  const client=new Client({name:'hosted-test',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{fetch:((url:any,init:any)=>mf.dispatchFetch(String(url),init)) as any,requestInit:{headers:{Authorization:'Bearer '+token.access_token}}}));
  await t.test('OAuth scopes filter tools and a read reaches the app bridge',async()=>{const inventory=await client.listTools();assert.ok(inventory.tools.some(tool=>tool.name==='health.get_current_state'));assert.ok(!inventory.tools.some(tool=>tool.name==='medical.get_recent_symptoms'));const result=await client.callTool({name:'health.get_current_state',arguments:{}});assert.equal((result.structuredContent as any).data.summary,'Fixture health summary');});
  await t.test('legacy MCP clients use the same OAuth bridge and scoped tools',async()=>{const legacy=new Client({name:'legacy-test',version:'1'});clients.push(legacy);await legacy.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{fetch:((url:any,init:any)=>mf.dispatchFetch(String(url),init)) as any,requestInit:{headers:{Authorization:'Bearer '+token.access_token}}}));assert.equal((await legacy.callTool({name:'health.get_current_state',arguments:{}})).isError,false);});
  await t.test('write retries execute once and key conflicts do not mutate',async()=>{const before=executions,input={weight:80,idempotencyKey:'hosted-weight-key'};const first=await client.callTool({name:'body.log_weight',arguments:input}),second=await client.callTool({name:'body.log_weight',arguments:input});assert.deepEqual(first.structuredContent,second.structuredContent);assert.equal(executions,before+1);const conflict=await client.callTool({name:'body.log_weight',arguments:{...input,weight:81}});assert.equal(conflict.isError,true);assert.equal(executions,before+1);});
  await t.test('lasting changes wait for owner approval and isolate other accounts',async()=>{const before=executions;const pending=await client.callTool({name:'sleep.set_target',arguments:{hours:8,idempotencyKey:'hosted-sleep-key'}});const id=(pending.structuredContent as any).pendingActionId;assert.ok(id);assert.equal(executions,before);assert.equal((await control('approve',{id,approved:true},'other-session')).status,403);assert.equal((await control('approve',{id,approved:true})).status,200);await new Promise(r=>setTimeout(r,150));const result=await client.callTool({name:'sleep.set_target',arguments:{hours:8,idempotencyKey:'hosted-sleep-key'}});assert.equal((result.structuredContent as any).success,true);assert.equal(executions,before+1);});
  await t.test('malformed WebSocket messages are rejected without closing the bridge',async()=>{ws.send('{invalid');await new Promise(r=>setTimeout(r,100));assert.ok(errors.length);assert.equal(ws.readyState,1);});
  await t.test('revoked client cannot discover or execute tools',async()=>{const status=await (await control('status')).json() as any;const id=status.clients[0].id;assert.equal((await control('revoke',{id},'other-session')).status,200);assert.equal((await mf.dispatchFetch(origin+'/mcp',{headers:{Authorization:'Bearer '+token.access_token}})).status,405);await control('revoke',{id});assert.equal((await mf.dispatchFetch(origin+'/mcp',{headers:{Authorization:'Bearer '+token.access_token}})).status,403);});
  await t.test('authorization code is single-use',async()=>assert.equal((await mf.dispatchFetch(origin+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:tokenForm.toString()})).status,400));
 }finally{for(const client of clients)await client.close().catch(()=>{});ws?.close();await mf.dispose();}
});
