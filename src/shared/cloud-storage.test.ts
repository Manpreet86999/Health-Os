import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadPhoto,photoUrls} from '../client/lib/cloud-storage.js';
const session:any={uid:'owner',accessToken:'user-jwt',config:{url:'https://cloud.test',publishableKey:'public-key'}};
test('photos use immutable owner paths and signed private URLs',async()=>{
  const original=globalThis.fetch;let uploaded='';
  try{globalThis.fetch=async(input,init)=>{
    const url=String(input);if(url.startsWith('data:'))return original(input,init);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer user-jwt');
    if(url.includes('/object/sign/')){const paths=JSON.parse(String(init?.body)).paths;assert.ok(paths.every((path:string)=>path.startsWith('owner/')));return Response.json(paths.map((path:string)=>({path,signedURL:`/object/sign/health-os-private/${path}?token=short-lived`})));}
    assert.match(url,/\/storage\/v1\/object\/health-os-private\/owner\/[a-f0-9]{64}$/);assert.equal(new Headers(init?.headers).get('x-upsert'),'false');uploaded=url;return Response.json({Key:'uploaded'});
  };const asset=await uploadPhoto(session,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6XN8AAAAASUVORK5CYII=');assert.equal(asset.sha256.length,64);assert.ok(uploaded.endsWith(asset.sha256));const photos=await photoUrls(session,[{id:'photo',preview:asset}]);assert.match(photos[0].dataUrl,/^https:\/\/cloud.test\/storage\/v1\/object\/sign\/health-os-private\/owner\//);assert.equal(photos[0].unavailable,false);
  }finally{globalThis.fetch=original;}
});
