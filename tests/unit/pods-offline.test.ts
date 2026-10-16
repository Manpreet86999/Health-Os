import test from 'node:test';
import assert from 'node:assert/strict';
import {podCheckinMayReplay} from '../../src/client/lib/pods-offline';
const members=[{user_id:'me',membership_period_id:'period-one'},{user_id:'friend',membership_period_id:'period-one'}],goals=[{id:'goal',membership_period_id:'period-one',archived_at:null}];
test('queued own check-ins replay only for the same authorized pair, current period and live goal',()=>{
 assert.equal(podCheckinMayReplay('me',['friend','me'],'period-one','goal',members,goals),true);
 assert.equal(podCheckinMayReplay('me',['friend','me'],'period-one','goal',[members[0],{user_id:'other',membership_period_id:'period-one'}],goals),false);
 assert.equal(podCheckinMayReplay('me',['friend','me'],'period-one','goal',members.map(m=>({...m,membership_period_id:'period-two'})),goals),false);
 assert.equal(podCheckinMayReplay('me',['friend','me'],'period-one','goal',members,[]),false);
 assert.equal(podCheckinMayReplay('me',['friend','me'],'period-one','goal',members,[{...goals[0],archived_at:'now'}]),false);
 assert.equal(podCheckinMayReplay('stranger',['friend','me'],'period-one','goal',members,goals),false);
});
