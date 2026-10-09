import test from 'node:test';
import assert from 'node:assert/strict';
import { BiologicalCloudError, readBiologicalCloud, readRecentBiologicalCloud, readBiologicalDelta } from '../client/lib/biology-cloud.js';
import type { SupabaseAccountSession } from './supabase-auth.js';

const session = { uid: 'test-user', accessToken: 'synthetic-test-token', config: { url: 'https://example.invalid', publishableKey: 'synthetic-public-key' } } as SupabaseAccountSession;
const record = { id: 'synthetic-journal', userId: session.uid, domain: 'Today', type: 'journal', timestamp: '2026-10-03T12:00:00Z', name: 'Synthetic journal', source: 'manual', deviceId: 'test', createdAt: '2026-10-03T12:00:00Z', updatedAt: '2026-10-03T12:00:00Z', quality: 'manual', syncState: 'saved', revision: 3, metadata: {} };
async function withResponse(body: unknown, run: () => Promise<void>, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    if(init?.method==='POST') assert.equal(JSON.parse(String(init.body)).page_size, 250);
    return new Response(JSON.stringify(body), { status });
  };
  try { await run(); } finally { globalThis.fetch = original; }
}
test('delta cursor and row revision remain distinct, with a valid empty follow-up', async () => {
  await withResponse({ protocolVersion: 2, records: [{ payload: record, revision: 9, change_version: 42 }], cursor: 42, hasMore: false }, async () => {
    const page = await readBiologicalDelta(session, 20);
    assert.equal(page.cursor, 42); assert.equal(page.records[0].revision, 9); assert.equal(page.records[0].payload.revision, 3);
  });
  await withResponse({ protocolVersion: 2, records: [], cursor: 42, hasMore: false }, async () => { assert.deepEqual((await readBiologicalDelta(session, 42)).records, []); });
});
test('account changes and out-of-order pages are rejected', async () => {
  await withResponse({ protocolVersion: 2, records: [{ payload: { ...record, userId: 'another-user' }, revision: 1, change_version: 42 }], cursor: 42, hasMore: false }, async () => { await assert.rejects(readBiologicalDelta(session, 20), /account/); });
  await withResponse({ protocolVersion: 2, records: [{ payload: record, revision: 1, change_version: 19 }], cursor: 42, hasMore: false }, async () => { await assert.rejects(readBiologicalDelta(session, 20), /revision/); });
  await withResponse({ protocolVersion: 2, records: [], cursor: 20, hasMore: true }, async () => { await assert.rejects(readBiologicalDelta(session, 20), /cursor/); });
});
test('only a missing endpoint can opt into the legacy download fallback', async () => {
  for (const status of [404, 401, 403, 500]) await withResponse({}, async () => {
    await assert.rejects(readBiologicalDelta(session, 0), (error: unknown) => error instanceof BiologicalCloudError && error.status === status);
  }, status);
});
test('legacy downloads retain the same account and identity guards', async () => {
  await withResponse([{ record_id: record.id, payload: record, revision: 9 }], async () => { assert.equal((await readBiologicalCloud(session))[0].revision, 9); });
  await withResponse([{ record_id: record.id, payload: { ...record, userId: 'another-user' }, revision: 9 }], async () => { await assert.rejects(readBiologicalCloud(session), /account/); });
  await withResponse([{ record_id: 'wrong-id', payload: record, revision: 9 }], async () => { await assert.rejects(readBiologicalCloud(session), /identity/); });
});
test('recent activity and latest check-in remain owner scoped, deduplicated and validated',async()=>{
 const original=globalThis.fetch;const requests:URL[]=[];
 globalThis.fetch=async input=>{const url=new URL(String(input));requests.push(url);return Response.json([{record_id:record.id,payload:record,revision:3}]);};
 try{
  const rows=await readRecentBiologicalCloud(session);assert.equal(rows.length,1);
  assert.equal(requests.length,2);
  for(const url of requests){assert.equal(url.searchParams.get('user_id'),'eq.test-user');assert.equal(url.searchParams.get('order'),'change_version.desc');}
  assert.ok(requests.some(url=>url.searchParams.get('payload->>type')==='eq.checkIn'&&url.searchParams.get('limit')==='1'));
  globalThis.fetch=async()=>Response.json([{record_id:record.id,payload:{...record,userId:'other-user'},revision:3}]);
  await assert.rejects(readRecentBiologicalCloud(session),/account/);
 }finally{globalThis.fetch=original;}
});
