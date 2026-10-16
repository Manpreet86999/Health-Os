import test from 'node:test';
import assert from 'node:assert/strict';
import {productionModelStack} from '../functions/body-os-ai/model-stack.ts';
import {PRIMARY_MODEL} from '../../src/shared/intelligence/production-models.ts';

test('catalog routing prefers measured availability while retaining schema and price gates',async()=>{
 const original=globalThis.fetch;
 const endpoint={status:0,pricing:{prompt:'0.0000002',completion:'0.0000008'},supported_parameters:['response_format','structured_outputs'],max_completion_tokens:16000};
 globalThis.fetch=async()=>Response.json({data:{id:PRIMARY_MODEL,architecture:{input_modalities:['text']},endpoints:[
  {...endpoint,tag:'unknown',provider_name:'Unknown'},
  {...endpoint,tag:'unhealthy',provider_name:'Unhealthy',uptime_last_5m:40,uptime_last_30m:50},
  {...endpoint,tag:'healthy',provider_name:'Healthy',uptime_last_5m:100,uptime_last_30m:100},
  {...endpoint,tag:'expensive',provider_name:'Expensive',uptime_last_5m:100,pricing:{prompt:'1',completion:'1'}},
  {...endpoint,tag:'no-schema',provider_name:'No schema',uptime_last_5m:100,supported_parameters:[]}
 ]}});
 try {const stack=await productionModelStack();assert.deepEqual(stack.general_reasoner?.providerTags,['healthy','unhealthy','unknown']);assert.equal(stack.general_reasoner?.model,PRIMARY_MODEL);}
 finally {globalThis.fetch=original;}
});
