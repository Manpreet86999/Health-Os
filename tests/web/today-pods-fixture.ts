import {expect,type Page} from '@playwright/test';
import {setup,base,owner} from './cloud-fixture';
export async function verifyTodayPods(page:Page,native=false){
 await setup(page);if(native){const {nativeFixture}=await import('../../apps/health-os-mobile/tests/native-fixture');await nativeFixture(page);}
 const podId='22222222-2222-4222-8222-222222222222',goalId='33333333-3333-4333-8333-333333333333';
 const pods:any[]=[],members:any[]=[],goals:any[]=[],completions:any[]=[],writes:any[]=[];
 await page.route(`${base}/rest/v1/**`,async route=>{
  const req=route.request(),url=new URL(req.url());if(!url.pathname.includes('health_os_pod'))return route.fallback();expect(req.headers().authorization).toBe('Bearer test-access-token');
  if(url.pathname.endsWith('health_os_pod_action')){
   const input=req.postDataJSON();writes.push(input);
   if(input.action==='create'){pods.push({id:podId,name:input.args.name,owner_id:owner});members.push({pod_id:podId,user_id:owner,joined_at:new Date().toISOString()});return route.fulfill({json:{id:podId}});}
   if(input.action==='invite')return route.fulfill({json:{code:'A'.repeat(32),expiresAt:new Date(Date.now()+48*3600000).toISOString()}});
   if(input.action==='goal')goals.push({id:goalId,pod_id:podId,name:input.args.name,target_per_week:input.args.targetPerWeek});
   if(input.action==='complete')completions.push({pod_id:podId,goal_id:goalId,user_id:owner,day:input.args.day,completed:input.args.completed});
   if(input.action==='accept'){members.push({pod_id:podId,user_id:'44444444-4444-4444-8444-444444444444',joined_at:new Date().toISOString()});return route.fulfill({json:{id:podId}});}
   return route.fulfill({json:{ok:true}});
  }
  return route.fulfill({json:url.pathname.endsWith('health_os_pods')?pods:url.pathname.endsWith('health_os_pod_members')?members:url.pathname.endsWith('health_os_pod_goals')?goals:completions});
 });
 await page.goto('/#Today');const card=page.getByRole('region',{name:'Your Pods',exact:true});await expect(card).toBeVisible();await card.scrollIntoViewIfNeeded();await expect(card).toContainText('Ready to connect');
 await card.getByRole('button',{name:'Create a Pod',exact:true}).click();await card.getByRole('textbox',{name:'Pod name',exact:true}).fill('Training partners');await card.getByRole('button',{name:'Create connection',exact:true}).click();await expect(card.getByRole('heading',{name:'Training partners',exact:true})).toBeVisible();
 await card.getByRole('button',{name:'Invite to Pod',exact:true}).click();await expect(card.locator('code')).toHaveText('A'.repeat(32));
 await card.getByText('Add a shared goal',{exact:true}).click();await card.getByRole('textbox',{name:'Shared goal',exact:true}).fill('Daily movement');await card.getByRole('button',{name:'Add shared goal',exact:true}).click();await expect(card.getByText('Daily movement',{exact:true})).toBeVisible();
 await card.getByRole('button',{name:'Mark today · Daily movement',exact:true}).click();await expect(card).toContainText('1 / 3 days');
 await card.getByRole('button',{name:'Join a Pod',exact:true}).click();await card.getByRole('textbox',{name:'Pod invitation code',exact:true}).fill('B'.repeat(32));await card.getByRole('button',{name:'Review invitation',exact:true}).click();expect(writes.filter(row=>row.action==='accept')).toHaveLength(0);await expect(card).toContainText('Your private health records remain private.');await card.getByRole('button',{name:'Accept & join Pod',exact:true}).click();await expect(card).toContainText('2 / 2 connected');
 await expect(card.getByRole('button',{name:'Pod is full',exact:true})).toBeDisabled();expect(writes.every(row=>!JSON.stringify(row).includes('metadata'))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`outputs/release-v0.1.0/${native?'android':'web'}-today-pods.png`,fullPage:true});
}
