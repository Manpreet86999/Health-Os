import { test,expect, type Page } from '@playwright/test';
import { setup,owner } from './cloud-fixture';
const service='https://mcp.test';
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function hosted(page:Page,jobs:any[]=[],enabled=true,authorize=true){
 let writes=true;const results:any[]=[];let connected=false;
 const clients=[{id:uid(30),name:'ChatGPT',scopes:'["health.read","body.write"]',write_enabled:1,enabled:1,expires_at:Date.now()+100000}];
 await page.route('**/mcp-config.json',route=>route.fulfill({json:{url:service}}));
 await page.route(service+'/**',async route=>{const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON();let result:any={success:true};if(path==='/control/status')result={controls:{enabled:+enabled,write_enabled:+writes},clients,pending:[],audit:[]};if(path==='/control/settings'){enabled=body.enabled;writes=body.writeEnabled;}if(path==='/control/revoke')clients[0].enabled=0;if(path==='/bridge/ticket')result={ticket:'fixture-ticket',userId:owner,expiresAt:Date.now()+600000};await route.fulfill({json:result});});
 await page.routeWebSocket('wss://mcp.test/bridge/ws**',ws=>{connected=true;let index=0;const next=()=>{if(index<jobs.length)ws.send(JSON.stringify({type:'job',job:jobs[index++]}));};ws.onMessage(message=>{const msg=JSON.parse(String(message));if(msg.type==='ready')next();if(msg.type==='authorize')ws.send(JSON.stringify({type:authorize?'authorized':'error',id:msg.id,success:authorize}));if(msg.type==='complete'){results.push(msg.result);next();}});});
 return {results,connected:()=>connected};
}
async function settings(page:Page){await page.goto('/#Settings');await page.reload();await page.getByRole('tab',{name:'HEOS MCP'}).click();}
test('hosted controls show the URL, enable, revoke and disable access',async({page})=>{
 await setup(page);await hosted(page,[],false);await settings(page);
 await expect(page.getByLabel('HEOS MCP URL')).toHaveValue(service+'/mcp');
 await page.getByLabel('Enable MCP read access').click();await expect(page.getByLabel('Enable MCP read access')).toBeChecked();
 await expect(page.getByText('Health OS connected')).toBeVisible();
 await page.getByRole('button',{name:'Revoke',exact:true}).click();await expect(page.getByText('ChatGPT · Revoked or expired')).toBeVisible();
 await page.getByRole('button',{name:'Disable all MCP access'}).click();await expect(page.getByLabel('Enable MCP read access')).not.toBeChecked();
 await expect(page.getByLabel('Server connection code')).toHaveCount(0);await page.screenshot({path:'output/hosted-mcp-controls.png',fullPage:true});
});
test('hosted bridge writes canonical weight and receipts once when a job is replayed',async({page})=>{
 const cloud=await setup(page);const receipt=uid(1),job={id:uid(2),action:'body.log_weight',receiptId:receipt,input:{weight:80.2,unit:'kg',idempotencyKey:'weight-e2e-key'}};
 const bridge=await hosted(page,[job,job]);await settings(page);await expect.poll(()=>bridge.results.length,{timeout:20000}).toBe(2);
 expect(bridge.results[0]).toEqual(bridge.results[1]);expect(bridge.results[0].success).toBe(true);
 await expect.poll(()=>cloud.biological.filter(r=>r.payload.id==='mcp-result-'+receipt).length).toBe(1);
 expect(cloud.biological.find(r=>r.payload.id==='mcp-result-'+receipt)?.payload.value).toBe(80.2);expect(cloud.biological.filter(r=>r.payload.id==='mcp-receipt-'+receipt)).toHaveLength(1);
});
test('a job denied by fresh server authorization cannot change a health record',async({page})=>{
 const cloud=await setup(page);const receipt=uid(3),bridge=await hosted(page,[{id:uid(4),action:'body.log_weight',receiptId:receipt,input:{weight:80.2,idempotencyKey:'denied-weight-key'}}],true,false);
 await settings(page);await expect.poll(()=>bridge.results.length,{timeout:20000}).toBe(1);expect(bridge.results[0].error).toBeTruthy();expect(cloud.biological.filter(r=>r.payload.id==='mcp-result-'+receipt)).toHaveLength(0);
});
test('hosted MCP starts the real planned workout and logs a set into Train',async({page})=>{
 await setup(page);const receipt=uid(5),jobs=[{id:uid(6),action:'training.start_workout',receiptId:receipt,input:{idempotencyKey:'start-workout-key'}},{id:uid(7),action:'training.log_set',receiptId:uid(8),input:{idempotencyKey:'bench-set-key',workoutId:'mcp-result-'+receipt,exercise:'Bench Press',weight:70,reps:8,unit:'kg',setNumber:1}}];
 const bridge=await hosted(page,jobs);await settings(page);await expect.poll(()=>bridge.results.length,{timeout:20000}).toBe(2);expect(bridge.results.every(r=>r.success)).toBe(true);
 await page.goto('/#Tracker');await expect(page.getByRole('heading',{name:'Your session'})).toBeVisible();await expect(page.getByText('Bench Press',{exact:true}).first()).toBeVisible();
 await expect.poll(()=>page.evaluate(async id=>{const open=indexedDB.open('health-os-ui-drafts',1);return new Promise<any>(resolve=>{open.onsuccess=()=>{const req=open.result.transaction('drafts').objectStore('drafts').getAll();req.onsuccess=()=>{const draft=req.result.find((r:any)=>r.value?.id==='mcp-result-'+id)?.value;resolve(draft?.currentEntry?.completedRecords?.[0]);open.result.close();};};});},receipt)).toMatchObject({w:70,r:8});
});
test('an undeployed app presents a clear status and leaves access controls disabled',async({page})=>{
 await setup(page);await page.route('**/mcp-config.json',route=>route.fulfill({json:{url:''}}));await settings(page);await expect(page.getByText('Hosted connection awaiting deployment')).toBeVisible();await expect(page.getByLabel('Enable MCP read access')).toBeDisabled();
});
test('expanded bridge logs hydration, sleep and measurements into the normal account records',async({page})=>{
 const cloud=await setup(page),jobs=[{id:uid(50),action:'nutrition.log_water',receiptId:uid(51),input:{amount:.5,unit:'L',idempotencyKey:'expanded-water-e2e'}},{id:uid(52),action:'sleep.log_session',receiptId:uid(53),input:{hours:7.5,quality:8,idempotencyKey:'expanded-sleep-e2e'}},{id:uid(54),action:'body.log_measurement',receiptId:uid(55),input:{metric:'Waist',value:30,unit:'in',idempotencyKey:'expanded-waist-e2e'}}];
 const bridge=await hosted(page,jobs);await settings(page);await expect.poll(()=>bridge.results.length,{timeout:20000}).toBe(3);expect(bridge.results.every(r=>r.success)).toBe(true);
 await expect.poll(()=>cloud.biological.some(r=>r.payload.type==='water'&&r.payload.value===500)).toBe(true);await expect.poll(()=>cloud.biological.some(r=>r.payload.type==='sleep'&&r.payload.value===7.5)).toBe(true);await expect.poll(()=>cloud.biological.some(r=>r.payload.type==='bodyMeasurement'&&r.payload.metadata.waist===76.2)).toBe(true);
});
test('expanded bridge completes and saves the workout into real session history without an email request',async({page})=>{
 const cloud=await setup(page),receipt=uid(60),workoutId='mcp-result-'+receipt,jobs=[{id:uid(61),action:'training.start_workout',receiptId:receipt,input:{idempotencyKey:'full-start-e2e'}},{id:uid(62),action:'training.log_set',receiptId:uid(63),input:{idempotencyKey:'full-set-e2e',workoutId,exercise:'Bench Press',setNumber:1,weight:70,reps:8,unit:'kg'}},{id:uid(64),action:'training.next_exercise',receiptId:uid(65),input:{idempotencyKey:'full-next-e2e',workoutId,exercise:'Bench Press'}},{id:uid(66),action:'training.finish_workout',receiptId:uid(67),input:{idempotencyKey:'full-finish-e2e',workoutId}}];
 const emailRequests:string[]=[];page.on('request',request=>{if(request.url().includes('/functions/v1/body-os-email'))emailRequests.push(request.url());});
 const bridge=await hosted(page,jobs);await settings(page);await expect.poll(()=>bridge.results.length,{timeout:25000}).toBe(4);expect(bridge.results.every(r=>r.success)).toBe(true);
 await expect.poll(()=>cloud.records.filter(r=>r.entity_type==='session'&&r.record_id===workoutId).length).toBe(1);const saved=cloud.records.find(r=>r.entity_type==='session'&&r.record_id===workoutId)!.payload;expect(saved.status).toBe('finished');expect(saved.logs[0].sets[0]).toMatchObject({w:70,r:8});expect(emailRequests).toHaveLength(0);
});
