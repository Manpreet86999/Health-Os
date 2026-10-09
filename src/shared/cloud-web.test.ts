import test from 'node:test';
import assert from 'node:assert/strict';
import { readCloud, writeCloud, CloudConflictError } from './cloud.js';
import { reportTemplate, prepareReportEmailImages } from './report-email.js';

const config = { url: 'https://example.supabase.co', publishableKey: 'public-test-key' };
const session = { uid: 'owner-one', accessToken: 'test-jwt' };
test('full cloud reads paginate past the PostgREST row cap with the same owner filter', async () => {
  const original = globalThis.fetch;
  const offsets: number[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('user_id'), 'eq.owner-one');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-jwt');
    const offset = Number(url.searchParams.get('offset')); offsets.push(offset);
    return Response.json(Array.from({ length: Math.min(500, 1001 - offset) }, (_, i) => ({ user_id: session.uid, entity_type: 'exercise', record_id: `exercise-${offset+i}`, payload: { name: `Exercise ${offset+i}` }, updated_at: '2026-10-07T00:00:00Z', revision: 1, device_id: 'cloud', cloud_updated_at: '2026-10-07T00:00:00Z', change_version: offset+i+1 })));
  };
  try { const records = await readCloud(config, session); assert.equal(records.length, 1001); assert.deepEqual(offsets, [0, 500, 1000]); assert.equal(records.at(-1)?.id, 'exercise-1000'); }
  finally { globalThis.fetch = original; }
});
test('delta-loaded records use a version check and surface edit conflicts as 409', async () => {
  const original = globalThis.fetch;
  const record = { id: 'care-photo', entityType: 'carePhoto' as const, payload: { note: 'Private progress' }, updatedAt: '2026-10-07T00:00:00Z', revision: 2, deviceId: 'web', changeVersion: 42 };
  globalThis.fetch = async input => { const url = new URL(String(input)); assert.equal(url.searchParams.get('change_version'), 'eq.42'); assert.equal(url.searchParams.get('user_id'), 'eq.owner-one'); return Response.json([]); };
  try { await assert.rejects(writeCloud(config, session, record, record), error => error instanceof CloudConflictError && error.status === 409); }
  finally { globalThis.fetch = original; }
});
test('startup cursor reads preserve all rows under a lower server cap and report progress',async()=>{
  const original=globalThis.fetch;const cursors:number[]=[];const progress:number[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.searchParams.get('user_id'),'eq.owner-one');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test-jwt');
    const after=Number(url.searchParams.get('change_version')!.slice(3));cursors.push(after);
    return Response.json(Array.from({length:Math.max(0,Math.min(250,1001-after))},(_,i)=>({user_id:session.uid,entity_type:'exercise',record_id:`exercise-${after+i}`,payload:{name:'Synthetic'},updated_at:'2026-10-07',revision:1,device_id:'test',cloud_updated_at:'2026-10-07',change_version:after+i+1})));
  };
  try{const records=await readCloud(config,session,{keyset:true,onProgress:count=>progress.push(count)});assert.equal(records.length,1001);assert.deepEqual(cursors,[0,250,500,750,1000,1001]);assert.equal(progress.at(-1),1001);}
  finally{globalThis.fetch=original;}
});
test('startup refuses a repeated cursor instead of spinning forever and honours cancellation',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json([{user_id:session.uid,entity_type:'exercise',record_id:'one',payload:{name:'Synthetic'},updated_at:'2026-10-07',revision:1,device_id:'test',cloud_updated_at:'2026-10-07',change_version:1}]);
  try{await assert.rejects(readCloud(config,session,{keyset:true}),/cursor did not advance/);const controller=new AbortController();controller.abort(new Error('Load cancelled'));await assert.rejects(readCloud(config,session,{keyset:true,signal:controller.signal}),/Load cancelled/);}
  finally{globalThis.fetch=original;}
});
test('email reports respect pounds, escape user text, and embed raster assets as CID attachments', () => {
  const { html, text } = reportTemplate('Workout report', [{ units: 'lb', dayTitle: '<script>alert(1)</script>', date: '2026-10-07', logs: [{ name: 'Bench', status: 'completed', sets: [{ s: 1, w: 135, r: 5 }] }] }]);
  assert.match(html, /135 lb/); assert.match(text, /675 lb volume/); assert.doesNotMatch(html, /<script>alert/);
  const email = prepareReportEmailImages(html);
  assert.ok(email.attachments.length > 0); assert.match(email.html, /cid:body-os-report-/); assert.doesNotMatch(email.html, /data:image\/png;base64/);
});
