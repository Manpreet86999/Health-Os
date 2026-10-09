import { test, expect } from '@playwright/test';
import { setup, base, owner } from './cloud-fixture';
for(const viewport of ['desktop','narrow'])test(`${viewport} Pods management uses authenticated explicit goal actions and confirms disconnect`,async({page})=>{
  if(viewport==='narrow')await page.setViewportSize({width:390,height:844});
  await setup(page);const podId='22222222-2222-4222-8222-222222222222',goalId='33333333-3333-4333-8333-333333333333';
  const pods:any[]=[],members:any[]=[],goals:any[]=[],completions:any[]=[],writes:any[]=[];
  await page.route(`${base}/rest/v1/**`,async route=>{
    const request=route.request(),url=new URL(request.url());if(!url.pathname.includes('health_os_pod'))return route.fallback();
    expect(request.headers().authorization).toBe('Bearer test-access-token');
    if(url.pathname.endsWith('/rpc/health_os_pod_action')){
      const input=request.postDataJSON();writes.push(input);expect(Object.keys(input).every(key=>['action','pod','args'].includes(key))).toBe(true);
      if(input.action==='create'){pods.push({id:podId,name:input.args.name,owner_id:owner});members.push({pod_id:podId,user_id:owner,joined_at:new Date().toISOString()});return route.fulfill({json:{id:podId,name:input.args.name}});}
      if(input.action==='invite')return route.fulfill({json:{code:'A'.repeat(32),expiresAt:new Date(Date.now()+48*3600000).toISOString()}});
      if(input.action==='goal')goals.push({id:goalId,pod_id:podId,name:input.args.name,target_per_week:input.args.targetPerWeek});
      if(input.action==='complete'){const existing=completions.find(row=>row.goal_id===goalId&&row.day===input.args.day);const row={pod_id:podId,goal_id:goalId,user_id:owner,day:input.args.day,completed:input.args.completed};if(existing)Object.assign(existing,row);else completions.push(row);}
      if(input.action==='leave'){pods.splice(0);members.splice(0);goals.splice(0);completions.splice(0);}
      return route.fulfill({json:{ok:true}});
    }
    const data=url.pathname.endsWith('health_os_pods')?pods:url.pathname.endsWith('health_os_pod_members')?members:url.pathname.endsWith('health_os_pod_goals')?goals:completions;
    return route.fulfill({json:data});
  });
  await page.goto('/#Today/Pods');await expect(page.getByRole('heading',{name:'A little accountability, together.'})).toBeVisible({timeout:20000});await expect(page.getByText('No Pods yet. Create one or accept a friend’s invitation.')).toBeVisible();
  await page.screenshot({path:`output/pods-polish/${viewport}-empty.png`,fullPage:true});
  await page.evaluate(()=>document.body.classList.remove('dark'));
  await page.screenshot({path:`output/pods-polish/${viewport}-empty-light.png`,fullPage:true});
  await page.evaluate(()=>document.body.classList.add('dark'));
  await page.getByRole('button',{name:'I have an invitation',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Invitation code',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Start a Pod',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Pod name',exact:true})).toBeFocused();
  await page.getByRole('textbox',{name:'Pod name',exact:true}).fill('Training partners');await page.getByRole('button',{name:'Create Pod',exact:true}).click();await expect(page.getByRole('heading',{name:'Training partners',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Generate invitation',exact:true}).click();await expect(page.locator('code')).toHaveText('A'.repeat(32));
  await page.getByRole('button',{name:'Revoke invitations',exact:true}).click();await expect(page.locator('code')).toHaveCount(0);
  await page.getByRole('textbox',{name:'Shared goal',exact:true}).fill('A little movement');await page.getByRole('button',{name:'Add goal',exact:true}).click();await expect(page.getByRole('heading',{name:'A little movement · 3 days/week',exact:true})).toBeVisible();
  const day=new Date().toLocaleDateString(undefined,{weekday:'short',day:'numeric'});
  await page.getByRole('button',{name:new RegExp(day.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();await expect.poll(()=>completions.some(row=>row.completed)).toBe(true);await expect(page.getByText('You · 1 / 3 days', {exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`output/pods-polish/${viewport}-active.png`,fullPage:true});
  await page.getByRole('button',{name:'Delete Pod & disconnect',exact:true}).click();expect(writes.filter(row=>row.action==='leave')).toHaveLength(0);
  await page.getByRole('dialog',{name:'Disconnect Pod'}).getByRole('button',{name:'Delete Pod',exact:true}).click();await expect.poll(()=>writes.filter(row=>row.action==='leave').length).toBe(1);await expect(page.getByText('No Pods yet. Create one or accept a friend’s invitation.')).toBeVisible();
});
test('Pods does not claim empty membership when its backend is unavailable',async({page})=>{
  await setup(page);await page.route(`${base}/rest/v1/health_os_pods?*`,route=>route.fulfill({status:403,json:{message:'Membership denied'}}));
  await page.goto('/#Today/Pods');await expect(page.getByRole('heading',{name:'Pods could not connect',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Create Pod',exact:true})).toBeDisabled();await expect(page.getByText('No Pods yet. Create one or accept a friend’s invitation.')).toHaveCount(0);
});
