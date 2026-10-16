import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudRunControl} from '../functions/body-os-ai/cloud-control.ts';
import {createAgentRun} from '../../src/shared/intelligence/run-contracts.ts';
import {agentRequestSchema} from '../../src/shared/intelligence/agent-contracts.ts';
const owner='11111111-1111-4111-8111-111111111111';
function run(domains:string[]=['goals']){return createAgentRun(agentRequestSchema.parse({requestId:'owned-goal',phase:'route',question:'Review goal consistency',power:'general',mode:'plan',policy:{mode:'auto',domains,recordIds:[],date:'2026-10-14',research:'off'},conversation:[],toolResults:[],memories:[],attachments:[]}),owner,'workspace');}
async function harness(domains:string[],check:(f:{control:(body:Record<string,unknown>)=>Promise<unknown>;saved:()=>ReturnType<typeof run>;calls:()=>string[]})=>Promise<void>){
 const original=globalThis.fetch,deno=(globalThis as any).Deno;let saved=run(domains),enabled=false;const calls:string[]=[];
 (globalThis as any).Deno={env:{get:(key:string)=>key==='HEALTH_OS_CLOUD_DELEGATION_ENABLED'?'true':key==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-service-only':undefined}};
 globalThis.fetch=async(input,init)=>{const path=new URL(String(input)).pathname,body=init?.body?JSON.parse(String(init.body)):{};calls.push(path);
  if(path.endsWith('/health_agent_run'))return Response.json([{state:saved}]);
  if(path.endsWith('/generate_link'))return Response.json({id:owner,hashed_token:'synthetic-independent-token'});
  if(path.endsWith('/verify'))return Response.json({user:{id:owner},access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',expires_in:3600});
  if(path.endsWith('/health_cloud_grant_save')){enabled=true;return new Response(null,{status:204});}
  if(path.endsWith('/health_agent_run_save')){assert.equal(body.p_expected_version,saved.version);saved=body.p_state;return Response.json(saved);}
  if(path.endsWith('/health_cloud_grant_status')){if(body.p_disable)enabled=false;return Response.json({enabled,expiresAt:null,lastRunAt:null,lastError:'none'});}
  throw Error('Unexpected control request: '+path);
 };
 try{await check({control:body=>cloudRunControl({...body,expectedOwnerId:owner},{id:owner,email:'synthetic@example.invalid',email_confirmed_at:'2026-10-01'},'https://synthetic.invalid',{apikey:'synthetic-public',Authorization:'Bearer synthetic-owner'}),saved:()=>saved,calls:()=>calls});}finally{globalThis.fetch=original;(globalThis as any).Deno=deno;}
}
test('cloud control persists explicit permissions and revoke also disables connected-worker continuation',async()=>{
 await harness(['goals'],async f=>{const status=await f.control({operation:'enable',runId:'owned-goal',consent:true,backgroundPolicy:{enabled:true,allowReads:true,allowWrites:false,medicalConsent:false,permittedDomains:['goals'],maxSpendUsd:.5}});assert.equal(f.saved().backgroundPolicy?.maxSpendUsd,.5);assert.equal(f.saved().allowBackgroundReads,true);assert.doesNotMatch(JSON.stringify(status),/synthetic-access|synthetic-refresh|synthetic-service/);await f.control({operation:'disable',runId:'owned-goal'});assert.equal(f.saved().backgroundPolicy?.enabled,false);assert.equal(f.saved().allowBackgroundReads,false);});
});
test('Medical run and weekly monitoring cannot inherit ordinary cloud consent',async()=>{
 for(const monitoring of [false,true])await harness(monitoring?['goals']:['medical'],async f=>{await assert.rejects(f.control({operation:'enable',runId:'owned-goal',consent:true,backgroundPolicy:{enabled:true,allowReads:true,allowWrites:false,medicalConsent:false,permittedDomains:['medical','goals']},...(monitoring?{monitoring:{enabled:true,cadence:'weekly',domains:['goals','medical'],timeZone:'Asia/Kolkata'}}:{})}),/Medical|separately approved/);assert.equal(f.calls().some(p=>p.endsWith('/generate_link')),false);});
});
