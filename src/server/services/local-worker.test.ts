import test from 'node:test';
import assert from 'node:assert/strict';
import { executeJob } from '../worker/handlers.js';
import { WorkerCloud } from '../worker/cloud.js';
import { workerOperation, type WorkerJob } from '../../shared/worker-jobs.js';
import { labSchema } from '../../shared/medical.js';
import { processNextJob } from '../worker/runtime.js';
import { personalMcpServer } from '../worker/mcp-server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const owner='11111111-1111-4111-8111-111111111111';
const job=(operation:WorkerJob['operation'],input:any={},user_id=owner):WorkerJob=>({id:'test',user_id,operation,input,status:'running',result:null,error:null,attempts:1,created_at:new Date().toISOString()});
const report={id:'report',title:'Synthetic CBC',status:'reviewed',category:'laboratory',revision:1,createdAt:'2026-09-30T10:00:00Z',collectedAt:'2026-09-30T10:00:00Z',laboratory:'Synthetic lab',narrative:'',warnings:[],original:{name:'synthetic.txt',mime:'text/plain',sha256:'a',size:1},results:[labSchema.parse({id:'hb',name:'Hemoglobin',value:14,unit:'g/dL',collectedAt:'2026-09-30T10:00:00Z'})]};
test('worker rejects another account before accessing data',async()=>{
  const cloud={owner,request:()=>{throw new Error('Should not fetch');}} as unknown as WorkerCloud;
  await assert.rejects(()=>executeJob(job('medical.units',{reportId:'report'},'other'),cloud),/another account/);
  assert.throws(()=>workerOperation('exec'),/Unsupported/);
});
test('worker standards operate on the owner report fetched from Supabase',async()=>{
  const paths:string[]=[];
  const cloud={owner,request:async(path:string)=>{paths.push(path);return [{payload:report,revision:1}];}} as unknown as WorkerCloud;
  const units=await executeJob(job('medical.units',{reportId:'report'}),cloud);assert.equal(units.units[0].validation.status,'valid');
  const outcome=await executeJob(job('medical.fhir',{reportId:'report'}),cloud);assert.equal(outcome.resourceType,'OperationOutcome');assert.ok(!outcome.issue.some((r:any)=>['error','fatal'].includes(r.severity)));
  const cql=await executeJob(job('medical.cql',{reportId:'report'}),cloud);assert.equal(cql.library,'HealthOSRecordInventory');assert.ok(paths.every(p=>p.includes(`user_id=eq.${owner}`)));
});
test('draft FHIR/CQL and arbitrary import paths cannot be executed',async()=>{
  const cloud={owner,request:async()=>[{payload:{...report,status:'draft'}}]} as unknown as WorkerCloud;
  await assert.rejects(()=>executeJob(job('medical.cql',{reportId:'report'}),cloud),/Review/);
  await assert.rejects(()=>executeJob(job('medical.extract',{reportId:'report'}),cloud));
});
test('worker cloud requests authenticate and scope the training snapshot without bulk health readings',async()=>{
  const original=globalThis.fetch;const paths:string[]=[];
  globalThis.fetch=(async(input:any,init:any)=>{paths.push(String(input));assert.equal(init.headers.Authorization,'Bearer token');return Response.json([]);}) as typeof fetch;
  try{const cloud=new WorkerCloud({uid:owner,email:'test@example.com',accessToken:'token',refreshToken:'refresh',expiresAt:Date.now()+3600000,config:{url:'https://example.supabase.co',publishableKey:'public'}},()=>{});assert.deepEqual(await cloud.trainingSnapshot(),[]);assert.match(paths[0],/entity_type=in\.\(session,profile,exercise\)/);assert.ok(paths[0].includes(`user_id=eq.${owner}`));}finally{globalThis.fetch=original;}
});
test('queue processor returns results with the claimed lease and preserves failed job state',async()=>{
  const calls:any[]=[];let fails=false;
  const cloud={owner,rpc:async(name:string,input:any)=>{calls.push({name,input});return name==='health_os_claim_job'?[{...job('research.statistics',{values:[1,2,3]}),lease_token:'lease'}]:true;}} as unknown as WorkerCloud;
  const execute=async()=>{if(fails)throw new Error('Missing dependency.');return {mean:2};};
  assert.deepEqual(await processNextJob(cloud,'worker',['research.statistics'],execute),{operation:'research.statistics',accepted:true,failed:false});assert.equal(calls[1].input.p_lease,'lease');assert.deepEqual(calls[1].input.p_result,{mean:2});
  fails=true;await processNextJob(cloud,'worker',['research.statistics'],execute);assert.equal(calls[3].input.p_error,'Missing dependency.');assert.equal(calls[3].input.p_result,null);
});
test('personal MCP tools use Supabase owner filters and validated arguments',async()=>{
  const paths:string[]=[];const cloud={owner,request:async(p:string)=>{paths.push(p);return [];}} as unknown as WorkerCloud;
  const server=personalMcpServer(cloud),client=new Client({name:'synthetic-worker-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  try{await server.connect(a);await client.connect(b);const tools=await client.listTools();assert.equal(tools.tools.length,4);const result=await client.callTool({name:'health_os_workouts',arguments:{limit:5}});assert.ok(!result.isError);assert.match(paths[0],/limit=5/);assert.ok(paths[0].includes(`user_id=eq.${owner}`));const invalid=await client.callTool({name:'health_os_workouts',arguments:{limit:99999}});assert.equal(invalid.isError,true);assert.equal(paths.length,1);}finally{await client.close();await server.close();}
});
