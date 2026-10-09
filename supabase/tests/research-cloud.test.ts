import test from 'node:test';
import assert from 'node:assert/strict';
import {publicUrl,research} from '../functions/body-os-ai/research.ts';
test('source research rejects local URLs and never fetches user-selected hosts directly',async()=>{
  for(const input of ['http://example.com','https://127.0.0.1/a','https://localhost/a','https://10.0.0.1/a','https://host.internal/a','https://user:pass@example.com/a','https://example.com:8443/a','javascript:alert(1)'])assert.equal(publicUrl(input),null);
  assert.equal(publicUrl('https://manufacturer.com/product'),'https://manufacturer.com/product');
  await assert.rejects(()=>research('https://localhost/private',{tavilyApiKey:'secret'}),/public HTTPS/);
  const original=globalThis.fetch;
  try{globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://api.tavily.com/extract');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer secret');return Response.json({results:[{url:'https://manufacturer.com/product',raw_content:'Verified source excerpt'},{url:'javascript:alert(1)',raw_content:'invalid'}]});};const sources=await research('https://manufacturer.com/product',{tavilyApiKey:'secret'});assert.equal(sources.length,1);assert.equal(sources[0].excerpt,'Verified source excerpt');}finally{globalThis.fetch=original;}
});
