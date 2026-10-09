import { test, expect } from '@playwright/test';
import { setup, owner, base } from '../../../tests/web/cloud-fixture';
import { nativeFixture } from './native-fixture';
for (const savedCursor of [0,123]) {
test(`Android shows today readiness before historical sync finishes, saved cursor ${savedCursor}`,async({page})=>{
 const cloud=await setup(page);await nativeFixture(page);
 cloud.records.splice(0,cloud.records.length,...cloud.records.filter(row=>row.entity_type!=='readiness'));
 const stamp=new Date().toISOString();
 cloud.biological.push({record_id:'recent-check',revision:1,change_version:900,payload:{id:'recent-check',userId:owner,type:'checkIn',domain:'Recover',name:'Daily readiness check-in',unit:'',timestamp:stamp,createdAt:stamp,updatedAt:stamp,deviceId:'synthetic-other-device',source:'Health OS daily check-in',quality:'manual',syncState:'saved',revision:1,metadata:{sleepHours:8,sleepQuality:8,energy:8,soreness:2,stress:2,motivation:8,mood:8,painFlag:false,steps:4000,confirmed:true}}});
 let historyRequested=false;
 await page.route(`${base}/rest/v1/rpc/health_os_pull_biological_delta`,()=>{historyRequested=true;});
 await page.goto('/manifest.webmanifest');
 await page.evaluate(async cursor=>{
  const req=indexedDB.open('health-os-biology-lphlihwyrcqgmdiwlvuq.supabase.co-11111111-1111-4111-8111-111111111111',4);
  req.onupgradeneeded=()=>{for(const store of ['records','outbox','bases','conflicts','cursors'])if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store,{keyPath:'id'});};
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('cursors','readwrite');tx.objectStore('cursors').put({id:'biological',version:cursor});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 },savedCursor);
 await page.goto('/#Today');await expect(page.locator('.os-content')).toBeVisible();
 await expect.poll(()=>historyRequested).toBe(true);
 await expect(page.getByText('Check-in needed',{exact:true})).toHaveCount(0);
 const cached=await page.evaluate(async()=>{
  const request=indexedDB.open(`health-os-biology-${new URL('https://lphlihwyrcqgmdiwlvuq.supabase.co').hostname}-11111111-1111-4111-8111-111111111111`);
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const row=await new Promise<any>((resolve,reject)=>{const req=db.transaction('records').objectStore('records').get('recent-check');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const cursor=await new Promise<any>((resolve,reject)=>{const req=db.transaction('cursors').objectStore('cursors').get('biological');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  db.close();return {energy:row?.metadata.energy,cursor:cursor?.version||0};
 });
 expect(cached).toEqual({energy:8,cursor:savedCursor});
 await page.screenshot({path:'outputs/apk-refinement/screenshots/recent-readiness-before-history.png'});
});
}
