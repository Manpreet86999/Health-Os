import {test,expect} from '@playwright/test';
import {setup,base,owner} from '../../../tests/web/cloud-fixture';
import {nativeFixture} from './native-fixture';
test.use({viewport:{width:360,height:744},hasTouch:true,isMobile:true});
async function swipe(page:any,x:number,y:number,endY:number){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(endY-y)*i/12}]});await page.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
test('Quick Capture handle expands and collapses while contents scroll independently',async({page})=>{
 await setup(page);await nativeFixture(page);await page.goto('/#Today');await expect(page.locator('.os-content')).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event('health-os-open-capture')));
 const drawer=page.locator('.health-capture-drawer'),handle=drawer.getByRole('button',{name:'Expand or collapse Quick Capture'});await expect(handle).toBeVisible();
 let rect=(await handle.boundingBox())!;await swipe(page,rect.x+rect.width/2,rect.y+rect.height/2,rect.y-150);
 await expect(drawer).toHaveAttribute('data-expanded','true');
 rect=(await handle.boundingBox())!;await swipe(page,rect.x+rect.width/2,rect.y+rect.height/2,rect.y+180);
 await expect(drawer).toHaveAttribute('data-expanded','false');
 const before=await drawer.evaluate(el=>el.scrollTop);const bounds=(await drawer.boundingBox())!;
 await swipe(page,bounds.x+bounds.width-12,bounds.y+bounds.height-80,bounds.y+65);
 await expect.poll(()=>drawer.evaluate(el=>el.scrollTop)).toBeGreaterThan(before);await expect(drawer).toBeVisible();
});
test('swipe up at the page bottom requests owner-scoped sync on multiple routes without reloading',async({page})=>{
 await setup(page);await nativeFixture(page);
 for(const route of ['Today','Eat']){
  await page.goto('/#'+route);await expect(page.locator('.os-content')).toBeVisible();
  // Hash navigation preserves the gesture throttle; allow the next intentional refresh.
  await page.waitForTimeout(4100);
  await page.evaluate(()=>{const w=window as any;w.requested=0;w.sentinel='kept';if(w.refreshListener)window.removeEventListener('health-os-sync-request',w.refreshListener);w.refreshListener=()=>w.requested++;window.addEventListener('health-os-sync-request',w.refreshListener);const surface=document.createElement('div');surface.id='gesture-test-surface';surface.style.cssText='position:fixed;left:0;top:100px;width:40px;height:400px;z-index:1000';document.body.append(surface);window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});});
  await expect.poll(()=>page.evaluate(()=>{const el=document.scrollingElement!;return el.scrollTop+el.clientHeight>=el.scrollHeight-3;})).toBe(true);
  await swipe(page,20,450,230);
  await expect.poll(()=>page.evaluate(()=>(window as any).requested)).toBe(1);
  expect(await page.evaluate(()=>(window as any).sentinel)).toBe('kept');await expect(page.locator('.hos-sync-indicator')).toContainText('Sync requested');
 }
});
test('history backfill yields after four pages instead of monopolizing sync',async({page})=>{
 await setup(page);await nativeFixture(page);const timestamps:number[]=[];const stamp=new Date().toISOString();
 await page.route(`${base}/rest/v1/rpc/health_os_pull_biological_delta`,async route=>{
  const cursor=route.request().postDataJSON().after_version;timestamps.push(Date.now());
  await route.fulfill({json:{protocolVersion:2,cursor:cursor+1,hasMore:cursor<5,records:[{change_version:cursor+1,revision:1,payload:{id:'history-'+cursor,userId:owner,type:'journal',domain:'Today',name:'Synthetic note',unit:'',timestamp:stamp,createdAt:stamp,updatedAt:stamp,deviceId:'test',source:'test',quality:'manual',syncState:'saved',revision:1,metadata:{}}}]}});
 });
 await page.goto('/#Today');await expect.poll(()=>timestamps.length).toBeGreaterThanOrEqual(6);
 expect(timestamps[4]-timestamps[3]).toBeGreaterThanOrEqual(1800);
 await expect(page.locator('.os-content')).toBeVisible();
});

