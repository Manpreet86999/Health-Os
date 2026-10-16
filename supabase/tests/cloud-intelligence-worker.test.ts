import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentRun} from '../../src/shared/intelligence/run-contracts.ts';
import {agentRequestSchema} from '../../src/shared/intelligence/agent-contracts.ts';
(globalThis as any).Deno={env:{get:()=>undefined},serve:()=>{}};
const {cloudWorkerTick}=await import('../functions/health-os-intelligence-worker/index.ts');
const owner='11111111-1111-4111-8111-111111111111',lease='22222222-2222-4222-8222-222222222222';
function fixture(options:{revoked?:boolean;expired?:boolean;wrongOwner?:boolean}={}){
 let run=createAgentRun(agentRequestSchema.parse({requestId:'cloud-goal',phase:'route',question:'Explain general goal planning',power:'general',mode:'ask',policy:{mode:'none',domains:[],date:'2026-10-14',recordIds:[],research:'off'},conversation:[],toolResults:[],memories:[],attachments:[]}),owner,'workspace');run.allowBackgroundReads=true;
 const calls:{path:string;authorization:string;action?:string}[]=[];
 const fetcher:typeof fetch=async(url,init)=>{const path=new URL(String(url)).pathname,body=init?.body?JSON.parse(String(init.body)):{};calls.push({path,authorization:(init?.headers as any)?.Authorization||'',action:body.action});
  if(path.endsWith('/health_cloud_grant_claim'))return Response.json({ownerId:owner,runId:run.id,leaseId:lease,expiresAt:new Date(Date.now()+86400000).toISOString(),session:{accessToken:'synthetic-owner-access',refreshToken:'synthetic-owner-refresh',expiresAt:options.expired?1:Date.now()+3600000}});
  if(path.endsWith('/health_cloud_grant_checkpoint'))return Response.json(!options.revoked);
  if(path.endsWith('/token'))return Response.json({access_token:'synthetic-rotated-access',refresh_token:'synthetic-rotated-refresh',expires_in:3600,user:{id:options.wrongOwner?'33333333-3333-4333-8333-333333333333':owner}});
  if(path.endsWith('/user'))return Response.json({id:owner});
  if(body.action==='/ai/run-store'){if(body.operation==='get')return Response.json(run);assert.equal(body.expectedVersion,run.version);assert.equal(body.state.ownerId,owner);run=structuredClone(body.state);return Response.json(run);}
  if(body.action==='/ai/agent-step')return Response.json({result:body.phase==='route'?{intent:'explain',domains:[],taskType:'explain',complexity:1,requiresReasoning:true,requiresTools:false,requiresResearch:false,risk:'low'}:{responseType:'analysis',summary:'A goal can be divided into reviewable steps.',toolCalls:[],evidence:[],proposedActions:[],confidence:'high',needsEscalation:false},usage:[]});
  throw new Error('Unexpected test request');
 };return {fetcher,calls,run:()=>run};
}
test('managed worker completes a closed-app read-only goal using owner RLS headers and no health writes',async()=>{const f=fixture();assert.deepEqual(await cloudWorkerTick('https://cloud.test','synthetic-service-key',f.fetcher),{processed:true});assert.equal(f.run().status,'completed');assert.equal(f.run().executorLease,undefined);assert.equal(f.run().counters.actions,0);for(const call of f.calls.filter(c=>!c.path.includes('/rpc/health_cloud_')))assert.equal(call.authorization,'Bearer synthetic-owner-access');assert.equal(f.calls.some(c=>c.path.includes('commit_biological')),false);});
test('revoking a cloud grant stops subsequent owner reads and model calls',async()=>{const f=fixture({revoked:true});assert.equal((await cloudWorkerTick('https://cloud.test','synthetic-service-key',f.fetcher)).processed,false);assert.equal(f.calls.some(c=>c.action==='/ai/agent-step'||c.path.endsWith('/user')),false);assert.equal(f.run().status,'created');});
test('refresh rotation rejects a different owner before checkpointing or executing a goal',async()=>{const f=fixture({expired:true,wrongOwner:true});assert.deepEqual(await cloudWorkerTick('https://cloud.test','synthetic-service-key',f.fetcher),{processed:false,error:'auth_expired'});assert.equal(f.calls.some(c=>c.action),false);assert.equal(f.run().status,'created');});
test('rotated dedicated worker sessions are used only in owner requests and never returned',async()=>{const f=fixture({expired:true});const result=await cloudWorkerTick('https://cloud.test','synthetic-service-key',f.fetcher);assert.equal(result.processed,true);assert.equal(JSON.stringify(result).includes('synthetic-rotated'),false);assert.equal(f.calls.find(c=>c.path.endsWith('/user'))?.authorization,'Bearer synthetic-rotated-access');});
