import assert from 'node:assert/strict';
import {privateChecksum,privateObjectKey,type PrivateBlob} from './private-attachments.js';
import {downloadPrivateFile,uploadPrivateFile} from './private-file-cloud.js';

const config={url:'https://fixture.supabase.co',publishableKey:'synthetic-public-key'};
const session={uid:'11111111-1111-4111-8111-111111111111',accessToken:'synthetic-token'};
const bytes=new TextEncoder().encode('Synthetic original fixture');
const descriptor:PrivateBlob={version:1,sha256:await privateChecksum(bytes),size:bytes.length,mime:'text/plain'};
const previous=globalThis.fetch;
let requests:{url:string;options:RequestInit}[]=[];
const install=(respond:(options:RequestInit)=>Response)=>{
  requests=[];
  globalThis.fetch=async(input,options={})=>{requests.push({url:String(input),options});return respond(options);};
};
try {
  install(()=>new Response('{}',{status:201}));
  await uploadPrivateFile(config,session,descriptor,bytes);
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,`${config.url}/storage/v1/object/health-os-private/${session.uid}/${descriptor.sha256}`);
  assert.equal(requests[0].options.redirect,'error');
  assert.equal((requests[0].options.headers as Record<string,string>)['x-upsert'],'false');
  assert.equal((requests[0].options.headers as Record<string,string>).Authorization,'Bearer synthetic-token');
  await assert.rejects(uploadPrivateFile(config,session,{...descriptor,sha256:'a'.repeat(64)},bytes),/differs/);
  assert.equal(requests.length,1);
  install(options=>options.method==='POST'?new Response('{}',{status:409}):new Response(bytes));
  await uploadPrivateFile(config,session,descriptor,bytes);
  assert.equal(requests.length,2);
  assert.match(requests[1].url,/\/object\/authenticated\/health-os-private\//);
  assert.equal(requests[1].options.redirect,'error');
  install(()=>new Response(bytes));
  assert.deepEqual(await downloadPrivateFile(config,session,descriptor),bytes);
  install(()=>new Response(new Uint8Array(bytes.length).fill(1)));
  await assert.rejects(downloadPrivateFile(config,session,descriptor),/checksum/);
  install(()=>new Response(new Uint8Array(bytes.length+1)));
  await assert.rejects(downloadPrivateFile(config,session,descriptor),/exceeds/);
  install(()=>new Response(bytes.slice(1)));
  await assert.rejects(downloadPrivateFile(config,session,descriptor),/checksum/);
  install(()=>new Response(bytes,{headers:{'content-length':'100'}}));
  await assert.rejects(downloadPrivateFile(config,session,descriptor),/size/);
  install(()=>new Response(bytes));
  await assert.rejects(downloadPrivateFile({...config,url:'http://fixture.supabase.co'},session,descriptor),/secure/);
  await assert.rejects(downloadPrivateFile({...config,url:'https://fixture.supabase.co?secret=x'},session,descriptor),/secure/);
  assert.equal(requests.length,0);
  assert.throws(()=>privateObjectKey('../other',descriptor),/account/);
  assert.throws(()=>privateObjectKey(session.uid,{...descriptor,size:20_000_001}));
  console.log('PASS: private-file upload/download, owner path, auth headers, immutable replay, checksum/size bounds, insecure URL rejection and redirect refusal.');
} finally {globalThis.fetch=previous;}
