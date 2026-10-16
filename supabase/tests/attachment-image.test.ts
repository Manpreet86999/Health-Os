import {modelEndpointsFixture} from './model-fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {observeAttachmentImage} from '../functions/body-os-ai/attachment-image.ts';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMlUAAAAASUVORK5CYII=';
const ledger={reserve:async()=>{},settle:async()=>{}};
test('text-only Qwen cannot silently route vision to a historical model or send images to the provider',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(input)=>{if(String(input).endsWith('/endpoints'))return Response.json(modelEndpointsFixture(new URL(String(input)).pathname.slice('/api/v1/models/'.length,-'/endpoints'.length)));calls++;throw Error('Unexpected provider request');};
  await assert.rejects(observeAttachmentImage({consent:true,attachment:{name:'image.png',dataUrl:image},context:'private health context'}, {},ledger,'SERVER-ONLY-KEY'),/unavailable|configured/i);
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('central vision requires consent and validates real image signature before any provider request',async()=>{const original=globalThis.fetch;let calls=0;try{globalThis.fetch=async()=>{calls++;throw new Error('Unexpected provider request');};await assert.rejects(observeAttachmentImage({attachment:{name:'image.png',dataUrl:image}}, {},ledger,'test'),/consent/);await assert.rejects(observeAttachmentImage({consent:true,attachment:{name:'image.png',dataUrl:'data:image/png;base64,aGVsbG8='}}, {},ledger,'test'),/declared format/);assert.equal(calls,0);}finally{globalThis.fetch=original;}});
