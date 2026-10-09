import test from 'node:test';
import assert from 'node:assert/strict';
import { chatCompletion } from './ai/client.js';
import { runSkinAsk } from './ai/engine.js';
import { emptySkinState } from '../shared/skin.js';
import { OPENROUTER_FREE_CHAT_FALLBACKS } from '../shared/ai/models.js';

test('reasoning-only length response retries with a larger output budget', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'thinking' } }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: '{"name":"Serum"}' } }],
    }), { status: 200 });
  };
  try {
    const result = await chatCompletion({
      provider: 'openrouter', apiKey: 'test', model: 'deepseek/deepseek-v4.1-flash',
      useFallback: false, maxTokens: 500, reasoningEffort: 'low',
      responseFormat: { type: 'json_object' },
      messages: [{ role: 'user', content: 'Identify product' }],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(requests.map(request => request.max_tokens), [500, 4096]);
    assert.deepEqual(requests[0].reasoning, { effort: 'low' });
    assert.deepEqual(requests[0].response_format, { type: 'json_object' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a stopped empty model answer reports the finish reason', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: null } }],
  }), { status: 200 });
  try {
    const result = await chatCompletion({
      provider: 'nvidia', apiKey: 'test', model: 'test-model',
      useFallback: false, messages: [{ role: 'user', content: 'Identify product' }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /finish reason: stop/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('blank router responses retry once without displaying or replaying internal reasoning',async()=>{
  const original=globalThis.fetch,requests:any[]=[];
  globalThis.fetch=async(_input,init)=>{requests.push(JSON.parse(String(init?.body)));return Response.json(requests.length===1?{model:'reasoner:free',choices:[{finish_reason:'stop',message:{content:' ',reasoning:'private model reasoning'}}]}:{model:'working:free',choices:[{finish_reason:'stop',message:{content:'Actual answer'}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',model:'openrouter/free',maxTokens:450,messages:[{role:'user',content:'Test question'}]});assert.ok(result.ok);if(result.ok){assert.equal(result.content,'Actual answer');assert.equal(result.model,'working:free');}assert.equal(requests.length,2);assert.equal(requests[1].max_tokens,2048);assert.deepEqual(requests[1].messages,requests[0].messages);assert.doesNotMatch(JSON.stringify(requests),/private model reasoning/);}finally{globalThis.fetch=original;}
});

test('the shared client reads text content parts and excludes reasoning parts',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:[{type:'reasoning',text:'hidden'},{type:'text',text:'Useful'},{type:'output_text',text:'answer'}]}}]});
  try{const result=await chatCompletion({provider:'nvidia',apiKey:'fixture',messages:[{role:'user',content:'Hello'}]});assert.ok(result.ok);if(result.ok)assert.equal(result.content,'Useful\nanswer');}finally{globalThis.fetch=original;}
});

test('reasoning can exhaust two small budgets before a visible answer succeeds',async()=>{
  const original=globalThis.fetch,budgets:number[]=[];globalThis.fetch=async(_input,init)=>{budgets.push(JSON.parse(String(init?.body)).max_tokens);return Response.json({choices:[{finish_reason:budgets.length<3?'length':'stop',message:{content:budgets.length<3?null:'Visible answer'}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',maxTokens:500,useFallback:false,messages:[{role:'user',content:'Hello'}]});assert.ok(result.ok);assert.deepEqual(budgets,[500,4096,8192]);}finally{globalThis.fetch=original;}
});

test('authentication failures are not retried and reflected credentials are redacted',async()=>{
  const original=globalThis.fetch,key='sk-secret-fixture-12345678';let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:{message:`Invalid API key: ${key}; Bearer ${key}`}},{status:401});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:key,messages:[{role:'user',content:'Hello'}]});assert.equal(result.ok,false);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),new RegExp(key));if(!result.ok)assert.match(result.error,/API key/);}finally{globalThis.fetch=original;}
});

test('an explicit provider refusal is terminal rather than treated as a transient blank',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{finish_reason:'content_filter',message:{content:null,refusal:'Declined'}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',model:'another-model',messages:[{role:'user',content:'Hello'}]});assert.equal(result.ok,false);assert.equal(calls,1);if(!result.ok)assert.match(result.error,/declined/);}finally{globalThis.fetch=original;}
});

test('an upstream temporary failure retries once and permanent blank replies are bounded',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return calls===1?Response.json({error:{message:'Temporarily unavailable'}},{status:502}):Response.json({choices:[{finish_reason:'stop',message:{content:'Recovered'}}]});};
  try{let result=await chatCompletion({provider:'openrouter',apiKey:'fixture',useFallback:false,messages:[{role:'user',content:'Hello'}]});assert.ok(result.ok);assert.equal(calls,2);calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:null}}]});};result=await chatCompletion({provider:'openrouter',apiKey:'fixture',useFallback:false,messages:[{role:'user',content:'Hello'}]});assert.equal(result.ok,false);assert.equal(calls,2);if(!result.ok)assert.match(result.error,/Please try again/);}finally{globalThis.fetch=original;}
});

test('a blank final answer after a tool call does not execute the tool again',async()=>{
  const original=globalThis.fetch;let calls=0,executions=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{finish_reason:calls===1?'tool_calls':'stop',message:calls===1?{content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'read_fixture',arguments:'{}'}}]}:{content:calls===2?null:'Final answer'}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',tools:[{type:'function',function:{name:'read_fixture',parameters:{type:'object',properties:{}}}}],executeTool:async()=>{executions++;return {value:1};},messages:[{role:'user',content:'Read fixture'}]});assert.ok(result.ok);assert.equal(calls,3);assert.equal(executions,1);}finally{globalThis.fetch=original;}
});

test('Care retries a JSON response with an empty explanation instead of displaying empty JSON',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:calls===1?'':'Please describe your goals and products.',proposal:null})}}]});};
  try{const result=await runSkinAsk(emptySkinState(),{aiProvider:'openrouter',aiApiKey:'fixture'} as any,'Build a care plan');assert.ok(result.ok);assert.equal(result.answer,'Please describe your goals and products.');assert.equal(calls,2);assert.equal(result.proposal,undefined);}finally{globalThis.fetch=original;}
});

test('truncated visible JSON is retried rather than returned as a successful reply',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{finish_reason:calls===1?'length':'stop',message:{content:calls===1?'{"answer":"unfinished':'{"answer":"Complete answer"}'}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',maxTokens:500,useFallback:false,messages:[{role:'user',content:'Answer in JSON'}]});assert.ok(result.ok);if(result.ok)assert.equal(JSON.parse(result.content).answer,'Complete answer');assert.equal(calls,2);}finally{globalThis.fetch=original;}
});

test('a free-router moderation response falls back to a free chat model',async()=>{
  const original=globalThis.fetch,models:string[]=[];
  globalThis.fetch=async(_input,init)=>{models.push(JSON.parse(String(init?.body)).model);return Response.json(models.length===1?{model:'nvidia/nemotron-3.5-content-safety:free',choices:[{finish_reason:'stop',message:{content:'safe'}}]}:{model:models.at(-1),choices:[{finish_reason:'stop',message:{content:'A useful coach answer'}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',messages:[{role:'user',content:'Explain the planner'}]});assert.ok(result.ok);if(result.ok){assert.equal(result.content,'A useful coach answer');assert.equal(result.model,OPENROUTER_FREE_CHAT_FALLBACKS[0]);}assert.deepEqual(models,['openrouter/free',OPENROUTER_FREE_CHAT_FALLBACKS[0]]);}finally{globalThis.fetch=original;}
});

test('fallback after blank tool completion preserves tool results and never re-executes the tool',async()=>{
  const original=globalThis.fetch;let calls=0,executions=0;const requests:any[]=[];
  globalThis.fetch=async(_input,init)=>{const request=JSON.parse(String(init?.body));requests.push(request);calls++;return Response.json({choices:[{finish_reason:calls===1?'tool_calls':'stop',message:calls===1?{content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'read_fixture',arguments:'{}'}}]}:{content:request.model==='openrouter/free'?null:'Recovered answer'}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',tools:[{type:'function',function:{name:'read_fixture',parameters:{type:'object',properties:{}}}}],executeTool:async()=>{executions++;return {value:1};},messages:[{role:'user',content:'Read fixture'}]});assert.ok(result.ok);assert.equal(executions,1);assert.equal(calls,4);assert.equal(requests[3].model,OPENROUTER_FREE_CHAT_FALLBACKS[0]);assert.deepEqual(requests[3].messages,requests[2].messages);}finally{globalThis.fetch=original;}
});

test('exhausting the free fallback chain never requests a paid model',async()=>{
  const original=globalThis.fetch,models:string[]=[],budgets:number[]=[];globalThis.fetch=async(_input,init)=>{const request=JSON.parse(String(init?.body));models.push(request.model);budgets.push(request.max_tokens);return Response.json({choices:[{finish_reason:'stop',message:{content:null}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',maxTokens:450,messages:[{role:'user',content:'Hello'}]});assert.equal(result.ok,false);assert.deepEqual(models,['openrouter/free','openrouter/free',...OPENROUTER_FREE_CHAT_FALLBACKS]);assert.deepEqual(budgets,[450,2048,2048,2048]);}finally{globalThis.fetch=original;}
});

test('DeepSeek V4 Flash keeps its model ID and uses a supported reasoning effort',async()=>{
  const original=globalThis.fetch;let request:any;
  globalThis.fetch=async(_input,init)=>{request=JSON.parse(String(init?.body));return Response.json({model:request.model,choices:[{finish_reason:'stop',message:{content:'DeepSeek answer'}}]});};
  try{const result=await chatCompletion({provider:'openrouter',apiKey:'fixture',model:'deepseek/deepseek-v4-flash',reasoningEffort:'low',responseFormat:{type:'json_object'},maxTokens:8192,messages:[{role:'user',content:'Explain the planner'}]});assert.ok(result.ok);if(result.ok)assert.equal(result.model,'deepseek/deepseek-v4-flash');assert.deepEqual(request.reasoning,{effort:'high'});assert.deepEqual(request.response_format,{type:'json_object'});assert.equal(request.max_tokens,8192);}finally{globalThis.fetch=original;}
});
