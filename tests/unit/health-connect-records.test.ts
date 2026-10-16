import test from 'node:test';
import assert from 'node:assert/strict';
import {healthConnectChanges,type HealthSnapshot} from '../../src/client/lib/health-connect-records';
import {bioSchema,type BioRecord} from '../../src/shared/biology';
const stamp='2026-10-12T10:00:00Z';
function snapshot(values:HealthSnapshot['values']=[]):HealthSnapshot{return {values,coverage:['Steps'],errors:[],from:'2026-10-12T00:00:00Z',to:stamp,syncedAt:stamp,zone:'Asia/Kolkata',permissions:[]};}
const point=(value=1234)=>({metric:'Steps',value,unit:'steps',timestamp:stamp,origin:'Health Connect',sourceId:'steps:2026-10-12',metadata:{day:'2026-10-12'}});
function stored(input:ReturnType<typeof healthConnectChanges>['writes'][number]):BioRecord{return bioSchema.parse({...input,userId:'test',deviceId:'device',createdAt:stamp,updatedAt:stamp,revision:1,syncState:'saved'});}
test('revised daily step totals replace one daily record and identical aggregates produce no writes',()=>{
 const first=healthConnectChanges(snapshot([point()]),[]);assert.equal(first.writes.length,1);
 const old=stored(first.writes[0]);assert.equal(healthConnectChanges(snapshot([point()]),[old]).writes.length,0);
 assert.equal(healthConnectChanges(snapshot([point()]),[{...old,metadata:Object.fromEntries(Object.entries(old.metadata).reverse())}]).writes.length,0);
 const later={...point(),timestamp:'2026-10-12T10:01:00Z'};assert.equal(healthConnectChanges(snapshot([later]),[old]).writes.length,0);
 const revised=healthConnectChanges(snapshot([point(1500)]),[old]);assert.equal(revised.writes.length,1);assert.equal(revised.writes[0].id,old.id);assert.equal(revised.writes[0].value,1500);
});
test('empty data remains missing and removes only previously imported records in successful coverage',()=>{
 assert.equal(healthConnectChanges(snapshot(),[]).writes.length,0);
 const old=stored(healthConnectChanges(snapshot([point()]),[]).writes[0]);
 assert.equal(healthConnectChanges(snapshot(),[old]).removals.length,1);
 assert.equal(healthConnectChanges({...snapshot(),coverage:[],errors:['Steps']},[old]).removals.length,0);
 assert.equal(healthConnectChanges(snapshot(),[{...old,metadata:{metric:'Steps'},source:'Manual'}]).removals.length,0);
 assert.equal(healthConnectChanges(snapshot(),[{...old,timestamp:'2026-10-11T10:00:00Z'}]).removals.length,0);
});
test('unit mismatches and invalid step totals fail before import; explicit user deletion stays deleted',()=>{
 assert.throws(()=>healthConnectChanges(snapshot([{...point(),unit:'miles'}]),[]));
 assert.throws(()=>healthConnectChanges(snapshot([point(-1)]),[]));
 assert.throws(()=>healthConnectChanges(snapshot([point(1.5)]),[]));
 const old=stored(healthConnectChanges(snapshot([point()]),[]).writes[0]);
 assert.equal(healthConnectChanges(snapshot([point(1500)]),[{...old,deletedAt:stamp}]).writes.length,0);
 assert.equal(healthConnectChanges(snapshot([point(1500)]),[{...old,deletedAt:stamp,metadata:{...old.metadata,healthConnectRemoved:true}}]).writes.length,1);
});

