import test from 'node:test';
import assert from 'node:assert/strict';
import { reportTemplate,prepareReportEmailImages } from './report-email.js';
const saved={dayTitle:'Posterior chain',date:'2026-10-07',durationMinutes:54,mode:'planned',readiness:{score:82,sleepHours:7,sleepQuality:8,steps:7600,restingHeartRate:58,hydration:750,hydrationUnit:'mL',mealProtein:90,painFlag:true,recommendation:'Use your saved plan.'},logs:[{name:'Deadlift',status:'completed',sets:[{w:37.5,r:10,rpe:8,rir:0,restSec:120,tempo:'3-1-1'}]},{name:'Plank',status:'completed',trackingMode:'time',sets:[{durationSec:45}]}]};
test('report exposes recorded indicators and preserves zero RIR and hydration units',()=>{
 const {html,text}=reportTemplate('Session',[saved]);
 for(const key of ['durationMinutes','mode','repetitions','timedWork','sleepQuality','steps','restingHeartRate','painFlag'])assert.ok(html.includes('data-indicator="'+key+'"'),key);
 assert.match(html,/750 mL/);assert.match(html,/90 g/);assert.match(html,/RIR 0/);assert.match(html,/Rest 120 sec/);assert.match(html,/Tempo 3-1-1/);assert.match(html,/45 sec/);assert.match(text,/RIR 0/);assert.match(text,/Duration: 54 min/);
 assert.match(html,/375 kg/); // Timed work does not inflate lifting volume.
});
test('unrecorded optional indicators and scores are not invented',()=>{
 const {html}=reportTemplate('Session',[{dayTitle:'No snapshot',logs:[]}]);
 for(const key of ['durationMinutes','steps','restingHeartRate','painFlag'])assert.ok(!html.includes('data-indicator="'+key+'"'));
 assert.match(html,/No readiness check-in/);assert.doesNotMatch(html,/Readiness score/);
});
test('glass report remains readable HTML with only resolvable inline image attachments',()=>{
 const report=reportTemplate('Session',[saved]);const {html,attachments}=prepareReportEmailImages(report.html);
 assert.doesNotMatch(html,/<script|cdn\.tailwind|data:image/);assert.match(html,/#f6f5f2/);assert.match(html,/background:#ffffff/);assert.match(html,/background:#202124/);
 const ids=[...html.matchAll(/src="cid:([^"]+)"/g)].map(match=>match[1]);
 assert.ok(ids.length>0);for(const id of ids)assert.ok(attachments.some(item=>item.cid===id));
 assert.ok(attachments.every(item=>item.content.startsWith('iVBOR')));
});
