import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyReports} from '../functions/_shared/daily-report-service';
import {prepareReportEmailImages} from '../../src/shared/report-email';
test('daily snapshot excludes late and unconfirmed intake, uses week goals, and retries the same saved report',async()=>{
 let snapshot:any=null,calls=0;
 const goals={calories:2400,protein:150,carbs:280,fat:80,fibre:30,water:3000};
 const base={timestamp:'2026-01-01T08:00:00+05:30',createdAt:'2026-01-01T08:00:00+05:30',updatedAt:'2026-01-01T08:00:00+05:30',quality:'manual',source:'manual'};
 const biological=[{...base,id:'meal',type:'meal',metadata:{calories:500,protein:30,carbs:60,fat:15,fibre:8}},{...base,id:'draft',type:'meal',metadata:{requiresConfirmation:true,calories:1000,protein:100,carbs:200,fat:30,fibre:30}},{...base,id:'late',type:'meal',timestamp:'2026-01-01T23:30:00+05:30',updatedAt:'2026-01-01T23:30:00+05:30',metadata:{calories:2000,protein:200,carbs:300,fat:40,fibre:40}},{...base,id:'water',type:'water',value:1500,unit:'mL',metadata:{}},{...base,id:'steps',type:'vital',name:'Steps',value:8420,unit:'steps',metadata:{metric:'Steps'}}];
 biological.unshift({...base,id:'earlier-steps',type:'vital',name:'Steps',value:7000,unit:'steps',timestamp:'2026-01-01T07:00:00+05:30',metadata:{metric:'Steps'}});
 const db=async(path:string,init?:RequestInit)=>{if(path.startsWith('health_os_biological_records')){assert.match(path,/payload->>timestamp.gte.2025-12-31/);assert.match(path,/payload->>timestamp.lt.2026-01-02/);assert.match(path,/payload->metadata->>metric.eq.Steps/);assert.match(path,/nutritionTarget,sourcePriority/);return biological.map(payload=>({payload}));}if(init?.method==='POST'){snapshot=JSON.parse(String(init.body));return null;}return snapshot?[snapshot]:[];};
 const records=async(_owner:string,type:string)=>type==='week'?[{payload:{id:'week',name:'January week',startDate:'2026-01-01',nutritionGoals:goals}}]:type==='profile'?[{payload:{units:'kg',height:175}}]:[];
 const service=dailyReports(db,records,async()=>({}),async data=>{calls++;assert.equal(data.nutrition.calories,500);assert.equal(data.nutrition.water,1500);assert.equal(data.readiness?.steps,8420);assert.deepEqual(data.goals,goals);return {...data,analysis:'No workout was logged.',recommendations:[{title:'Review your saved plan',body:'Keep the record complete.',basis:'Recorded intake only.'}]};});
 const first=await service.generate('owner','2026-01-01');assert.ok(first.html.includes('Your body, in perspective'));
 const mail=prepareReportEmailImages(first.html);assert.doesNotMatch(mail.html,/data:image/);assert.ok(mail.attachments.length>0);
 const second=await service.generate('owner','2026-01-01');assert.equal(second.html,first.html);assert.equal(calls,1);
});
