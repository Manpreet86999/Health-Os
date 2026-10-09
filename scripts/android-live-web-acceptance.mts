import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { pullCloudDelta, pushCloudBatch } from '../src/shared/cloud.ts';
import {readBiologicalCloud} from '../src/client/lib/biology-cloud.ts';

// Uses the actual Web transport implementation, with disposable accounts only.
const root = 'C:/Users/Manpr/.codex/local-secrets';
const fixtures = JSON.parse(await readFile(`${root}/healthos-native-acceptance.json`, 'utf8'));
const fixture = fixtures[0];
assert(fixture.email.startsWith('native-acceptance-') && fixture.email.endsWith('@example.invalid'));
const config = {url:'https://lphlihwyrcqgmdiwlvuq.supabase.co',publishableKey:'sb_publishable_T9xPf3Q60Q1aTilqiLvOww_d0Wnwx49'};
const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.email,password:fixture.password})});
assert(response.ok, `Fixture auth failed ${response.status}`);
const auth = await response.json();
assert.equal(auth.user.id, fixture.id);
const session = {uid:auth.user.id,accessToken:auth.access_token};
const markerPath = `${root}/healthos-native-web-roundtrip.json`;
if (process.argv[2] === 'daily') {
  const rows=await readBiologicalCloud({...session,config} as any);
  const water=rows.filter(({payload:p})=>p.type==='water' && !p.deletedAt && p.value===250 && p.title!=='Acceptance fixture water');
  assert(water.length>=1,'Actual Web biological transport must read the water entry saved through Android UI');
  console.log('PASS: actual Web biological transport reads the reviewed 250 mL Android UI entry.');
} else if (process.argv[2] === 'seed') {
  const id = `native-web-acceptance-${randomUUID()}`;
  const now = new Date().toISOString();
  const record = {id,entityType:'cardio' as const,payload:{id,date:now.slice(0,10),activity:'Disposable Web to Android acceptance',durationMinutes:11,createdAt:now},createdAt:now,updatedAt:now,revision:1,deviceId:'web-acceptance',workspace:'training',payloadVersion:1};
  const ack = await pushCloudBatch(config,session,[{protocolVersion:2,operationId:randomUUID(),expectedChangeVersion:null,record}]);
  assert.equal(ack[0].status,'applied');
  await writeFile(markerPath,JSON.stringify({id}),{encoding:'utf8',mode:0o600});
  console.log(`Web transport seeded disposable record: ${id}`);
} else {
  const marker = JSON.parse(await readFile(markerPath,'utf8'));
  let cursor=0; let found:any;
  while (true) { const page = await pullCloudDelta(config,session,cursor); found = page.records.find(r=>r.id===marker.id)||found; cursor=page.cursor;if(!page.hasMore)break; }
  assert(found,'Web must read the Android-updated record');
  assert.equal(found.payload.durationMinutes,14,'Android change must propagate back to actual Web transport');
  const record = {...found,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:found.revision+1};
  const ack = await pushCloudBatch(config,session,[{protocolVersion:2,operationId:randomUUID(),expectedChangeVersion:found.changeVersion,record}]);
  assert.equal(ack[0].status,'applied');
  console.log('PASS: actual Web transport → native Android repository → actual Web transport, then Web tombstone.');
}
