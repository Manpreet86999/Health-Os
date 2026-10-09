import test from 'node:test';
import assert from 'node:assert/strict';
import { tavilyExtract } from './tavily.js';

test('product extraction fetches only selected HTTPS source pages and caps page text', async () => {
  const original=globalThis.fetch;
  let request:RequestInit|undefined;
  globalThis.fetch=async (_url,options)=>{request=options;return new Response(JSON.stringify({results:[{url:'https://brand.example/product',raw_content:'x'.repeat(10000)},{url:'http://unsafe.example',raw_content:'ignore'}]}),{status:200});};
  try {
    const sources=await tavilyExtract({tavilyApiKey:'test'} as any,['https://brand.example/product','http://unsafe.example']);
    assert.equal(sources.length,1);
    assert.equal(sources[0].content.length,5000);
    assert.deepEqual(JSON.parse(String(request?.body)).urls,['https://brand.example/product']);
  } finally {globalThis.fetch=original;}
});
