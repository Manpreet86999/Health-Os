import test from 'node:test';
import assert from 'node:assert/strict';
import {sendAccountEmail,type EmailDependencies} from '../functions/_shared/email-service';
import {parseEmailRequest} from '../../src/shared/email-contract';
test('daily reports reject sending before the date cutoff before reading records or claiming delivery',async()=>{
 let called=false;
 const deps={report:async()=>{called=true;return[];},claim:async()=>{called=true;return'claimed';}} as unknown as EmailDependencies;
 await assert.rejects(sendAccountEmail({id:'owner',email:'test@example.com',email_confirmed_at:'yes'},{reportType:'daily',reportId:'2099-01-01'},deps),/23:00 IST/);
 assert.equal(called,false);
});
test('daily delivery generates saved HTML before SMTP, marks sent, and never uses caller email fields',async()=>{
 const order:string[]=[];
 const deps:EmailDependencies={report:async()=>[{date:'2026-01-01'}],preferences:async()=>({}),claim:async()=>{order.push('claim');return'claimed';},finish:async(_u,_k,status)=>{order.push(status);},generateDailyReport:async()=>{order.push('generate');return{html:'<p>Full report</p>',text:'Full report'};},send:async message=>{assert.equal(message.to,'owner@example.com');assert.match(message.html,/Full report/);order.push('smtp');},completeReport:async()=>{order.push('complete');},log:()=>{}};
 await sendAccountEmail({id:'owner',email:'owner@example.com',email_confirmed_at:'yes'},{reportType:'daily',reportId:'2026-01-01'},deps,true,'daily:2026-01-01:ai:1');
 assert.deepEqual(order,['claim','generate','smtp','sent','complete']);
 assert.throws(()=>parseEmailRequest({reportType:'daily',reportId:'2026-01-01',to:'foreign@example.com'}));
});
