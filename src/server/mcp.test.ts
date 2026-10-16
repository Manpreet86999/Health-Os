import test from 'node:test';
import assert from 'node:assert/strict';
import { Broker } from './mcp/broker.js';
import { buildServer } from './mcp/server.js';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { actionDefinitions, retainedActionIds, resources,mcpVersion } from '../shared/mcp-contracts.js';

function fixture(){const b=new Broker(':memory:');b.setControls('owner',true,true);const c=b.register('owner',{name:'Test',scopes:['body.write','body.read','sleep.write','health.read'],writeEnabled:true});return {b,c,p:b.authenticate(c.token)};}
test('environment policy cannot be overridden by account controls',()=>{
 for(const policy of [{enabled:false,writeEnabled:true},{enabled:true,writeEnabled:false}]){const b=new Broker(':memory:',policy);try{b.setControls('owner',true,true);const c=b.register('owner',{name:'Test',scopes:['body.write'],writeEnabled:true});if(!policy.enabled)assert.throws(()=>b.authenticate(c.token),/disabled/);else assert.throws(()=>b.revalidate(b.authenticate(c.token),'body.log_weight'),/Write/);}finally{b.close();}}
});
test('completed health reads leave no cached health payload in the broker',async()=>{
 const {b,p}=fixture();try{const result=b.call(p,'body.get_weight_trend',{}),[job]=b.poll('owner');b.complete('owner',job.id,{success:true,data:{privateHealthValue:80}});assert.equal((await result).data.privateHealthValue,80);assert.equal((b.db.prepare('SELECT count(*) AS n FROM requests').get() as any).n,0);assert.ok(!JSON.stringify(b.status('owner').audit).includes('privateHealthValue'));}finally{b.close();}
});
test('MCP defaults disabled, tokens expire, and pairing never grants administration or medical writes',()=>{
 const b=new Broker(':memory:');try{const c=b.register('owner',{name:'Test',scopes:['body.read']});assert.throws(()=>b.authenticate(c.token),/disabled/);assert.throws(()=>b.register('owner',{name:'Test',scopes:['admin.mcp']}));assert.throws(()=>b.register('owner',{name:'Test',scopes:['medical.write']}));b.setControls('owner',true,false);b.db.prepare('UPDATE clients SET expires_at=0').run();assert.throws(()=>b.authenticate(c.token));assert.throws(()=>b.authenticate('invalid'));}finally{b.close();}
});
test('strict schemas reject unknown fields, impossible dates, nonfinite values and missing write keys',()=>{
 assert.equal(actionDefinitions['body.log_weight'].schema.safeParse({weight:80,idempotencyKey:'weight-001',userId:'other'}).success,false);
 assert.equal(actionDefinitions['body.log_weight'].schema.safeParse({weight:80,idempotencyKey:'weight-001',date:'2026-02-30'}).success,false);
 assert.equal(actionDefinitions['body.log_weight'].schema.safeParse({weight:Infinity,idempotencyKey:'weight-001'}).success,false);
 assert.equal(actionDefinitions['body.log_weight'].schema.safeParse({weight:80}).success,false);
});
test('scopes, global write switch, client revocation and cross-owner control boundaries are enforced',()=>{
 const {b,c,p}=fixture();try{assert.throws(()=>b.revalidate(p,'nutrition.get_today'),/scope/);b.setControls('owner',true,false);assert.throws(()=>b.revalidate(p,'body.log_weight'),/Write/);b.revoke('stranger',c.id);assert.doesNotThrow(()=>b.authenticate(c.token));b.revoke('owner',c.id);assert.throws(()=>b.authenticate(c.token));assert.throws(()=>b.revalidate(p,'body.get_weight_trend'));}finally{b.close();}
});
test('concurrent retries create one request and return the original result; mismatched keys conflict',async()=>{
 const {b,p}=fixture();try{const input={weight:80.2,idempotencyKey:'weight-test-001'},first=b.call(p,'body.log_weight',input),retry=b.call(p,'body.log_weight',input),[job]=b.poll('owner');assert.ok(job);assert.equal(b.poll('owner').length,0);assert.equal(b.poll('stranger').length,0);b.complete('owner',job.id,{success:true,actionReceiptId:job.receiptId});assert.deepEqual(await first,await retry);assert.deepEqual(await b.call(p,'body.log_weight',input),await first);assert.equal((b.db.prepare('SELECT count(*) AS n FROM requests').get() as any).n,1);await assert.rejects(b.call(p,'body.log_weight',{...input,weight:81}),/different parameters/);}finally{b.close();}
});
test('R2 and R3 always require approval; external clients cannot approve; expired and rejected changes do not execute',async()=>{
 const {b,p}=fixture();try{assert.equal(b.requiresConfirmation('R0'),false);assert.equal(b.requiresConfirmation('R1'),false);assert.equal(b.requiresConfirmation('R2'),true);assert.equal(b.requiresConfirmation('R3'),true);const r=await b.call(p,'sleep.set_target',{hours:8.5,idempotencyKey:'sleep-key-001'});assert.ok(r.pendingActionId);assert.deepEqual(b.poll('owner'),[]);assert.throws(()=>b.approve('stranger',r.pendingActionId,true));b.approve('owner',r.pendingActionId,false);assert.deepEqual(b.poll('owner'),[]);await assert.rejects(b.call(p,'sleep.set_target',{hours:8.5,idempotencyKey:'sleep-key-001'}),/rejected/);const next=await b.call(p,'sleep.set_target',{hours:9,idempotencyKey:'sleep-key-002'});b.db.prepare('UPDATE requests SET expires_at=0 WHERE id=?').run(next.pendingActionId);assert.throws(()=>b.approve('owner',next.pendingActionId,true),/fresh proposal/);}finally{b.close();}
});
test('permissions are rechecked after confirmation and before browser execution',async()=>{
 const {b,c,p}=fixture();try{const result=await b.call(p,'sleep.set_target',{hours:8,idempotencyKey:'approval-key-001'});b.approve('owner',result.pendingActionId,true);const [job]=b.poll('owner');b.revoke('owner',c.id);assert.throws(()=>b.authorize('owner',job.id),/revoked/);}finally{b.close();}
});
test('audit excludes food text, token credentials, and arbitrary input data',async()=>{
 const {b,p}=fixture();try{await b.call(p,'sleep.set_target',{hours:8,idempotencyKey:'private-key-001'});const audit=JSON.stringify(b.status('owner').audit);assert.ok(!audit.includes('private-key'));assert.ok(!audit.includes('token'));assert.match(audit,/pending/);}finally{b.close();}
});
test('Undo cannot target another client’s receipt or act without the original write scope',async()=>{
 const {b,p}=fixture();try{const first=b.call(p,'body.log_weight',{weight:80,idempotencyKey:'undo-weight-key'}),[job]=b.poll('owner');b.complete('owner',job.id,{success:true,actionReceiptId:job.receiptId,undoable:true});await first;
 const c=b.register('owner',{name:'Other',scopes:['health.read','body.write'],writeEnabled:true});await assert.rejects(b.call(b.authenticate(c.token),'health.undo_action',{receiptId:job.receiptId,idempotencyKey:'undo-other-key'}),/this client/);
 b.db.prepare('UPDATE clients SET scopes=? WHERE id=?').run(JSON.stringify(['health.read']),p.clientId);await assert.rejects(b.call(p,'health.undo_action',{receiptId:job.receiptId,idempotencyKey:'undo-own-key'}),/scope/);
 }finally{b.close();}
});
test('real MCP v2 modern HTTP client discovers scoped tools/resources and executes structured reads',async()=>{
 const handler=createMcpHandler(()=>buildServer(async()=>({success:true,data:{weight:80}}),['body.read']));
 const client=new Client({name:'health-os-integration',version:'1.0.0'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 const transport=new StreamableHTTPClientTransport(new URL('http://test.local/mcp'),{fetch:async(url,init)=>handler.fetch(new Request(url,init))});
 try{await client.connect(transport);const list=await client.listTools();assert.deepEqual(new Set(list.tools.map(t=>t.name)),new Set(Object.entries(actionDefinitions).filter(([,d])=>d.scope==='body.read').map(([name])=>name)));const result=await client.callTool({name:'body.get_weight_trend',arguments:{}});assert.deepEqual(result.structuredContent,{success:true,data:{weight:80}});assert.equal((await client.listResources()).resources.length,1);assert.equal(client.getProtocolEra(),'modern');}finally{await client.close();await handler.close();}
});
test('tool inventory contains no arbitrary execution or medical treatment surface',()=>{
 for(const id of Object.keys(actionDefinitions))assert.ok(!/sql|shell|execute_code|diagnose|prescribe|dose|delete_any/.test(id));
 for(const id of Object.values(resources))assert.equal(actionDefinitions[id].risk,'R0');
});
test('full expanded inventory has discoverable strict schemas and offline capabilities stay permission-filtered',async()=>{
 const allowed=[...new Set(Object.values(actionDefinitions).map(d=>d.scope))],handler=createMcpHandler(()=>buildServer(async()=>{throw new Error('app offline');},allowed));
 const client=new Client({name:'expanded-catalog',version:'3'}),transport=new StreamableHTTPClientTransport(new URL('http://test.local/mcp'),{fetch:async(url,init)=>handler.fetch(new Request(url,init))});
 try{await client.connect(transport);const tools=await client.listTools();assert.equal(tools.tools.length,retainedActionIds().length);assert.ok(tools.tools.some(t=>t.name==='goals.update'));assert.ok(tools.tools.some(t=>t.name==='training.finish_workout'));assert.ok(tools.tools.every(t=>t.inputSchema.type==='object'));const capabilities=await client.callTool({name:'health.get_capabilities',arguments:{}});assert.equal((capabilities.structuredContent as any).data.version,mcpVersion);assert.equal((capabilities.structuredContent as any).data.availableToolCount,tools.tools.length);}finally{await client.close();await handler.close();}
 const scoped=createMcpHandler(()=>buildServer(async()=>{throw new Error('app offline');},['health.read'])),limited=new Client({name:'limited',version:'3'});
 try{await limited.connect(new StreamableHTTPClientTransport(new URL('http://test.local/mcp'),{fetch:async(url,init)=>scoped.fetch(new Request(url,init))}));const data=(await limited.callTool({name:'health.get_capabilities',arguments:{}})).structuredContent as any;assert.ok(data.data.tools.every((t:any)=>t.scope==='health.read'));assert.ok(!JSON.stringify(data).includes('medical.get_recent_symptoms'));}finally{await limited.close();await scoped.close();}
});
test('new goal permissions and approval are enforced by the hosted broker',async()=>{
 const b=new Broker(':memory:');try{b.setControls('owner',true,true);const reader=b.register('owner',{name:'Reader',scopes:['goals.read'],writeEnabled:true});await assert.rejects(b.call(b.authenticate(reader.token),'goals.create',{idempotencyKey:'goals-denied',name:'Goal',metric:'Custom',target:5}),/scope/);
 const writer=b.register('owner',{name:'Writer',scopes:['goals.write'],writeEnabled:true}),p=b.authenticate(writer.token),input={idempotencyKey:'goals-allowed',name:'Goal',metric:'Custom',target:5},pending=await b.call(p,'goals.create',input);assert.ok(pending.pendingActionId);assert.equal(b.poll('owner').length,0);b.approve('owner',pending.pendingActionId,true);const [job]=b.poll('owner');assert.equal(job.action,'goals.create');b.complete('owner',job.id,{success:true,actionReceiptId:job.receiptId});assert.equal((await b.call(p,'goals.create',input)).success,true);}finally{b.close();}
});
