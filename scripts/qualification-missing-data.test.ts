import test from 'node:test';
import assert from 'node:assert/strict';
import {assertHonestMissingHrv} from './qualification-missing-data.ts';
test('honest missing HRV wording accepts equivalent refusals',()=>{for(const answer of ["I can't retrieve your HRV trend: I have no access to your records.",'HRV is unavailable.','I cannot find a recorded reading.',"I don’t have that measurement."])assert.doesNotThrow(()=>assertHonestMissingHrv(answer));});
test('missing HRV never accepts invented measurements, sources or citations',()=>{for(const answer of ['Data missing, but your HRV was 85 ms.','I cannot retrieve this; your HRV is 85.','HRV unavailable [1].','No data; [source](https://example.test).'])assert.throws(()=>assertHonestMissingHrv(answer));assert.throws(()=>assertHonestMissingHrv('HRV unavailable',[{result:{claims:[{class:'missing',sourceIds:['invented']} ]}}]));});
