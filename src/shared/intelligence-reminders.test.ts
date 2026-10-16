import test from 'node:test';
import assert from 'node:assert/strict';
import {bioSchema,type BioRecord} from './biology.js';
import {deliverDueIntelligenceReminders,intelligenceReminderAlerts} from './intelligence/reminders.js';
import {recordHash,type RecordService} from './intelligence/contracts.js';
function record(id:string,metadata:BioRecord['metadata'],owner='owner'):BioRecord{return bioSchema.parse({id,userId:owner,type:'journal',domain:'Today',name:'Review sleep',source:'test',timestamp:'2026-10-14T00:00:00Z',createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z',deviceId:'test',quality:'manual',syncState:'saved',revision:1,metadata});}
function fixture(success=true,owner='owner',undone=false){let rows=[record('reminder',{intelligenceReminder:true,status:'scheduled',date:'2026-10-14',time:'09:00',timeZone:'Asia/Kolkata',note:'Open recorded observations',agentRunId:'run'},owner),record('receipt',{mcpReceipt:true,action:'reminders.create',undone,result:JSON.stringify({success,changedRecords:[{id:'reminder'}]})},owner)];let commits=0;const service:RecordService={read:async()=>structuredClone(rows),commit:async(writes,_deletes,expectations)=>{for(const expected of expectations){const current=rows.find(r=>r.id===expected.id);assert.equal(current?.revision??null,expected.revision);if(current&&expected.fingerprint)assert.equal(recordHash(current),expected.fingerprint);}for(const write of writes){const old=rows.find(r=>r.id===write.id);rows=rows.filter(r=>r.id!==write.id);rows.push(bioSchema.parse({...record(write.id!,{},owner),...write,revision:(old?.revision||0)+1}));}commits++;}};return {service,rows:()=>rows,commits:()=>commits};}
test('an approved reminder is delivered at its local civil time exactly once across reloads',async()=>{
 const f=fixture();assert.deepEqual(await deliverDueIntelligenceReminders(f.service,'owner',new Date('2026-10-14T03:29:00Z')),[]);
 assert.equal((await deliverDueIntelligenceReminders(f.service,'owner',new Date('2026-10-14T03:30:00Z'))).length,1);
 assert.deepEqual(await deliverDueIntelligenceReminders(f.service,'owner',new Date('2026-10-15T03:30:00Z')),[]);
 assert.equal(f.commits(),1);assert.equal(intelligenceReminderAlerts(f.rows(),'owner').length,1);assert.equal(intelligenceReminderAlerts(f.rows(),'foreign').length,0);
});
test('failed, undone, foreign and unrelated-run approvals cannot deliver a reminder',async()=>{
 for(const f of [fixture(false),fixture(true,'foreign'),fixture(true,'owner',true)]){assert.deepEqual(await deliverDueIntelligenceReminders(f.service,'owner',new Date('2026-10-15T03:30:00Z')),[]);assert.equal(f.commits(),0);}
 const f=fixture();assert.deepEqual(await deliverDueIntelligenceReminders(f.service,'owner',new Date('2026-10-15T03:30:00Z'),'another-run'),[]);assert.equal(f.commits(),0);
});
