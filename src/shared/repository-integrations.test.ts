import test from 'node:test';
import assert from 'node:assert/strict';
import { intelligenceWorkflow, type CheckpointStore } from '../integrations/orchestration/langgraph-adapter.js';
import { executeIntelligenceAction } from '../intelligence/actions/registry.js';
import { diagnosticSpans, observe, safeAttributes } from '../integrations/telemetry/instrumentation.js';
import { foodCacheKey, normalizedFoodResponse } from '../integrations/food/open-food-facts-adapter.js';
import { encodeMonoWav } from '../integrations/speech/pcm-wav.js';
import { MemoryRepository } from '../integrations/memory/pgvector-repository.js';
import { exportMedicalFhir } from '../integrations/medical/fhir-mapper.js';
import { bioSchema, type BioRecord } from './biology.js';
import type { AgentProposal } from './agentic-intelligence.js';
import type { MedicalReport } from './medical.js';

const proposal=():AgentProposal=>({id:crypto.randomUUID(),tool:'create_mission',title:'Consistency',explanation:'Saved goal',payload:{type:'goal',domain:'Today',name:'Consistency',metadata:{objective:'Consistency'}},sourceIds:[],sourceFingerprint:'[]',status:'proposed'});
function durableStore(){let value:Awaited<ReturnType<CheckpointStore['load']>>;return {load:async()=>structuredClone(value),save:async(next:NonNullable<typeof value>)=>{value=structuredClone(next);}};}
test('checkpointed graph waits for approval, restores exact action after restart, and does not reason again',async()=>{
  const p=proposal(),store=durableStore();let reasons=0,actions=0;
  const hooks={reason:async()=>{reasons++;return {answer:'Review',specialist:'general' as const,evidence:[],proposal:p};},execute:async(actual:AgentProposal)=>{assert.deepEqual(actual,p);actions++;return 1;}};
  const first=await intelligenceWorkflow(store,hooks);assert.deepEqual((await first.start(p.id)).proposal,p);assert.equal(actions,0);
  const restored=await intelligenceWorkflow(store,hooks);await restored.resume(p.id,true);assert.equal(reasons,1);assert.equal(actions,1);
  await (await intelligenceWorkflow(store,hooks)).resume(p.id,true);assert.equal(actions,1);
});
test('declining a graph action never executes its registry',async()=>{
  const p=proposal(),store=durableStore();let executed=false;
  const hooks={reason:async()=>({answer:'Review',specialist:'general' as const,evidence:[],proposal:p}),execute:async()=>{executed=true;return 1;}};
  await (await intelligenceWorkflow(store,hooks)).start(p.id);await (await intelligenceWorkflow(store,hooks)).resume(p.id,false);assert.equal(executed,false);
});
test('committed action recovers after failed audit without duplicate writes or new approval set',async()=>{
  const p=proposal(),store=durableStore(),rows:BioRecord[]=[];let writes=0,audits=0;
  const services={read:async()=>rows,save:async(input:any)=>{writes++;const stamp=new Date().toISOString();rows.push(bioSchema.parse({...input,userId:'owner',revision:1,createdAt:stamp,updatedAt:stamp,timestamp:stamp,deviceId:'test',syncState:'saved',quality:'manual',unit:''}));},audit:async()=>{audits++;if(audits===1)throw new Error('Temporary audit failure');}};
  const hooks={reason:async()=>({answer:'Review',specialist:'general' as const,evidence:[],proposal:p}),execute:(p:AgentProposal)=>executeIntelligenceAction(p,services)};
  await (await intelligenceWorkflow(store,hooks)).start(p.id);
  await assert.rejects((await intelligenceWorkflow(store,hooks)).resume(p.id,true),/Temporary audit failure/);
  await (await intelligenceWorkflow(store,hooks)).resume(p.id,true);assert.equal(writes,1);assert.equal(audits,2);
});
test('telemetry contains timing and outcomes but rejects health content and secret error messages',async()=>{
  diagnosticSpans.reset();assert.deepEqual(safeAttributes({prompt:'private medical note',token:'secret',domain:'medical',count:3}),{domain:'medical',count:3});
  await assert.rejects(observe('model.reason',{prompt:'PRIVATE_LAB_TEXT'},async()=>{throw new Error('PRIVATE_TOKEN');}));
  const text=JSON.stringify(diagnosticSpans.getFinishedSpans().map(s=>({name:s.name,attributes:s.attributes,events:s.events,status:s.status})));assert.equal(text.includes('PRIVATE'),false);assert.equal(diagnosticSpans.getFinishedSpans().at(-1)?.name,'model.reason');
});
test('food normalizer versions isolate caches and preserve source revision without changing old snapshots',()=>{
  assert.match(foodCacheKey('123456',true),/^off-v2-normalizer-2:/);
  const raw={product:{code:'123456',product_name:'Saved food',rev:12,last_modified_t:1700000000,nutriments:{proteins_100g:5}}};
  const before=structuredClone(normalizedFoodResponse(raw,true));raw.product.nutriments.proteins_100g=20;const next=normalizedFoodResponse(raw,true);
  assert.equal(before[0]!.nutrition.protein,5);assert.equal(next[0]!.nutrition.protein,20);assert.equal(before[0]!.sourceRevision,'12');
});
test('PCM encoder clips safely and limits recordings to one minute',()=>{
  const buffer=encodeMonoWav(new Float32Array([-2,2,NaN]));const bytes=Buffer.from(buffer);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),16000);assert.equal(bytes.readInt16LE(44),-32768);assert.equal(bytes.readInt16LE(46),32767);assert.equal(bytes.readInt16LE(48),0);assert.throws(()=>encodeMonoWav(new Float32Array(960001)));
});
test('memory transport accepts explicit preferences and rejects unsupported clinical domains',async()=>{
  const calls:any[]=[];const memory=new MemoryRepository(async body=>{calls.push(body);return [];});
  await memory.remember({summary:'Prefers rice',domain:'nutri',sourceId:'user-authored',confidence:1});assert.equal(calls[0].action,'remember');
  await assert.rejects(memory.remember({summary:'Dose change',domain:'medical' as any,sourceId:'chat',confidence:1}));assert.equal(calls.length,1);
});
test('FHIR boundary preserves unknown source codes, units and private document provenance',()=>{
  const report={id:'report-1',title:'Imported',status:'reviewed',revision:1,collectedAt:'2026-10-11T06:00:00Z',createdAt:'2026-10-11T06:00:00Z',laboratory:'Lab',narrative:'',category:'laboratory',warnings:[],original:{name:'report.pdf',mime:'application/pdf',sha256:'a'.repeat(64),size:100},results:[{id:'r1',name:'Unknown test',value:7,unit:'original-unit',sourceUnitCode:'local-code',sourceUnitSystem:'urn:local:units',sourceCodes:[{system:'urn:local:tests',code:'CUSTOM-7'}],collectedAt:'2026-10-11T06:00:00Z',referenceText:'',sourceLine:'Source line',sourceFlag:'',laboratory:'Lab',method:'',specimen:''}]} as MedicalReport;
  const bundle=exportMedicalFhir(report,'patient-1'),observation=bundle.entry!.find(e=>e.resource?.resourceType==='Observation')!.resource as any;
  assert.equal(observation.code.coding[0].code,'CUSTOM-7');assert.equal(observation.valueQuantity.unit,'original-unit');assert.equal(observation.valueQuantity.code,'local-code');
  const doc=bundle.entry!.find(e=>e.resource?.resourceType==='DocumentReference')!.resource as any;assert.equal(doc.identifier[0].value,report.original.sha256);assert.equal(doc.content[0].attachment.url,undefined);
});
