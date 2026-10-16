import {test,expect} from '@playwright/test';
import {setup} from './cloud-fixture';
import {setupFriendPods} from './friend-pods-fixture';
test('Today contains only the requested sections and global tools',async({page})=>{
 await setup(page);await page.goto('/#Today');
 await expect(page.locator('.android-today')).toBeVisible();
 await expect(page.locator('.android-today>section')).toHaveCount(5);
 expect(await page.locator('.android-today>section').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')))).toEqual(['Readiness','Next Action','Timeline','Recent Activities','Your Pods']);
 expect(await page.locator('.android-topbar nav button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')))).toEqual(['Quick Log','Universal Search','Open profile settings','Global Calendar']);
 const colors=await page.locator('.android-metrics button svg').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color));expect(new Set(colors).size).toBe(4);
 await expect(page.locator('.android-steps-box')).toContainText('Steps');
 await expect(page.locator('.android-today img')).toHaveCount(0);
 await expect(page.locator('.ux-mobile-nav,.os-navigation')).toHaveCount(0);
 await expect(page.locator('.android-bottom-nav button')).toHaveCount(14);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'output/android-011/today-dark.png',fullPage:true});
});

test('HEOS 3.1 on-device reads and observation logs work offline',async({page})=>{
 await setup(page);await page.goto('/#Settings');await page.getByRole('tab',{name:'HEOS MCP',exact:true}).click();
 const tools=page.getByRole('region',{name:'On-device HEOS tools'});await expect(tools).toBeVisible();await expect(tools).toContainText('3.1.0');
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});window.dispatchEvent(new Event('offline'));});
 await tools.getByRole('button',{name:'Read on device',exact:true}).click();await expect(tools).toContainText('Completed on this device');
 await tools.getByText('Log an observation',{exact:true}).click();await tools.getByRole('combobox',{name:'Observation',exact:true}).selectOption('water');await tools.getByRole('spinbutton',{name:'Water (mL)',exact:true}).fill('500');
 await tools.getByRole('button',{name:'Save observation on device',exact:true}).click();await expect(tools.getByRole('spinbutton',{name:'Water (mL)',exact:true})).toHaveValue('');
 const count=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('health-os-biology-lphlihwyrcqgmdiwlvuq.supabase.co-11111111-1111-4111-8111-111111111111');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return new Promise<number>(resolve=>{const request=db.transaction('records').objectStore('records').getAll();request.onsuccess=()=>{resolve(request.result.filter((row:any)=>row.type==='water'&&row.value===500).length);db.close();};});});
 expect(count).toBe(1);
});

test('Pods saves offline check-ins across reload and sends the desired state once on reconnect',async({page})=>{
 const fixture=await setupFriendPods(page,2,'connected');
 await page.addInitScript(()=>{Object.defineProperty(navigator,'onLine',{get:()=>sessionStorage.getItem('pods-offline-test')!=='yes',configurable:true});});
 await page.goto('/#Today/Pods');await expect(page.getByRole('button',{name:'Mark today · Gym',exact:true})).toBeVisible();
 await page.evaluate(()=>{sessionStorage.setItem('pods-offline-test','yes');window.dispatchEvent(new Event('offline'));});
 await page.getByRole('button',{name:'Mark today · Gym',exact:true}).click();await expect(page.locator('.pod-offline-status')).toContainText('1 check-in');await expect(page.getByRole('button',{name:'Undo today · Gym',exact:true})).toBeVisible();
 expect(fixture.writes.filter(row=>row.action==='complete')).toHaveLength(0);
 await page.reload();await expect(page.getByRole('button',{name:'Undo today · Gym',exact:true})).toBeVisible();await expect(page.locator('.pod-offline-status')).toContainText('1 check-in');
 await page.evaluate(()=>{sessionStorage.removeItem('pods-offline-test');window.dispatchEvent(new Event('online'));});
 await expect.poll(()=>fixture.writes.filter(row=>row.action==='complete').length).toBe(1);await expect(page.locator('.pod-offline-status')).toHaveCount(0);
});

test('Health Connect permissions, active sync, revised step totals and disconnect',async({page})=>{
 await setup(page);
 await page.addInitScript(()=>{
  const win=window as any;win.__hc={granted:false,total:8123,reads:0};
  const permission='android.permission.health.READ_STEPS';
  win.Capacitor={addListener:()=>({remove:()=>{}}),nativePromise:async(plugin:string,method:string)=>{
   if(plugin!=='HealthConnect')return {};
   const state=()=>({available:true,sdkStatus:3,permissions:win.__hc.granted?[permission]:[],requestedPermissions:[permission],backgroundAvailable:false});
   if(method==='connect'){win.__hc.granted=true;return state();}
   if(method==='status'||method==='configure')return state();
   if(method==='cached')return {};
   if(method==='disconnect'){win.__hc.granted=false;return state();}
   if(method==='read'){win.__hc.reads++;const stamp=new Date().toISOString(),day=new Date().toLocaleDateString('en-CA');return {values:[{metric:'Steps',value:win.__hc.total,unit:'steps',timestamp:stamp,origin:'Health Connect',sourceId:`steps:${day}`,metadata:{day}}],coverage:['Steps'],errors:[],from:new Date(new Date().setHours(0,0,0,0)).toISOString(),to:stamp,syncedAt:stamp,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,permissions:[permission]};}
   return {};
  }};
 });
 await page.goto('/#Today');await expect(page.locator('.android-steps-box')).toBeVisible();
 await page.locator('.android-steps-box').click();await expect(page.getByRole('region',{name:'Health Connect connection'})).toBeVisible();
 await page.getByRole('button',{name:'Connect Health Connect',exact:true}).click();
 await expect(page.locator('.health-connect-state')).toHaveText('Connected');
 await page.locator('[data-destination=Today]').click();await expect(page.locator('.android-steps-box strong')).toHaveText('8,123');
 await page.locator('.android-steps-box').click();await page.evaluate(()=>{(window as any).__hc.total=8500;});
 await page.getByRole('button',{name:'Sync now',exact:true}).click();
 await page.locator('[data-destination=Today]').click();await expect(page.locator('.android-steps-box strong')).toHaveText('8,500');
 await page.screenshot({path:'output/android-011/today-health-connect-steps.png',fullPage:true});
 await page.locator('.android-steps-box').click();await page.getByRole('button',{name:'Disconnect · keep imported history',exact:true}).click();
 await expect(page.locator('.health-connect-state')).toHaveText('Not connected');
 await page.locator('[data-destination=Today]').click();await expect(page.locator('.android-steps-box strong')).toHaveText('8,500');
});
test('global calendar synchronizes history without creating records',async({page})=>{
 const cloud=await setup(page);await page.goto('/#Today');await expect(page.locator('.android-today')).toBeVisible();
 const healthBefore=JSON.stringify(cloud.records.filter(row=>['readiness','session','scheduledWorkout'].includes(row.entity_type)));await page.getByRole('button',{name:'Global Calendar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'This Week Activity'})).toBeVisible();
 await page.getByRole('button',{name:'Previous week',exact:true}).click();
 await page.locator('.android-bottom-nav button[data-destination=Today]').click();
 await expect(page.locator('.android-readiness h1')).toContainText('Readiness ·');
 expect(JSON.stringify(cloud.records.filter(row=>['readiness','session','scheduledWorkout'].includes(row.entity_type)))).toBe(healthBefore);
});
test('scrollable destinations open real modules, retain back navigation and working top tools',async({page})=>{
 await setup(page);await page.goto('/#Today');await expect(page.locator('.android-today')).toBeVisible();
 const rail=page.locator('.android-bottom-nav');
 expect(await rail.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
 for(const name of ['Intelligence','Train','Eat','Recover','Health','Body','Care','Insights','Pods','Reports','Organization','Sync','Research']){
  await rail.locator(`button[data-destination="${name}"]`).click();
  await expect(rail.locator(`button[data-destination="${name}"]`)).toHaveAttribute('aria-current','page');
  await expect(page.locator('#health-main-content')).not.toContainText('Something went wrong');
 }
 await page.getByRole('button',{name:'Universal Search',exact:true}).click();await expect(page).toHaveURL(/Search/);
 await page.getByRole('button',{name:'Open profile settings',exact:true}).click();await expect(page.locator('.settings-workspace')).toBeVisible();
 await page.getByRole('button',{name:'Quick Log',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
});
test('v0.1.0 colors, smaller screens and Android browser history remain usable',async({page})=>{
 await setup(page);await page.goto('/#Today');await expect(page.locator('.android-today')).toBeVisible();
 expect(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--hos-primary').trim())).toBe('#b7ff39');
 await page.setViewportSize({width:320,height:740});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('[data-destination=Intelligence]').click();await page.locator('[data-destination=Pods]').click();
 await page.goBack();await expect(page.locator('[data-destination=Intelligence]')).toHaveAttribute('aria-current','page');
 await page.locator('[data-destination=Today]').click();
 await page.evaluate(()=>document.body.classList.remove('dark'));
 expect(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--hos-canvas').trim())).toBe('#fbfbfd');
 await page.screenshot({path:'output/android-011/today-light-320.png',fullPage:true});
});

test('Android module layouts and compact composer keep controls accessible',async({page})=>{
 await setup(page);await page.goto('/#Today');await expect(page.locator('.android-today')).toBeVisible();
 for(const name of ['Eat','Recover','Health','Body','Care']){
  await page.locator(`[data-destination="${name}"]`).click();
  const header=page.locator('.android-domain-header:visible');await expect(header).toBeVisible();
  expect((await header.boundingBox())!.height).toBeLessThan(330);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`output/android-011/${name.toLowerCase()}-compact.png`,fullPage:true});
 }
 await page.locator('[data-destination=Intelligence]').click();
 const composer=page.locator('.intel-composer');await expect(composer).toBeVisible();
 expect((await composer.boundingBox())!.height).toBeLessThan(125);
 await expect(page.getByRole('combobox',{name:'Power',exact:true})).not.toBeVisible();
 await page.getByLabel('Conversation options',{exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Power',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Mode',exact:true}).selectOption('plan');
 await page.getByLabel('Conversation options',{exact:true}).click();
 await expect(page.locator('.android-composer-options select[aria-label=Mode]')).toHaveValue('plan');
 await page.screenshot({path:'output/android-011/intelligence-compact.png',fullPage:true});
});

test('workout retains one card per set and separate rest steps',async({page})=>{
 const cloud=await setup(page);cloud.records.find(r=>r.entity_type==='week').payload.days.forEach((d:any)=>d.exercises[0].vol='2 x 5');
 await page.goto('/#Dashboard');await expect(page.locator('.android-train')).toBeVisible();
 await page.getByRole('button',{name:'Start workout',exact:true}).click();
 await expect(page.getByRole('region',{name:'Workout set cards',exact:true})).toBeVisible();
 await expect(page.getByRole('spinbutton',{name:'Set 1 load',exact:true})).toBeVisible();
 await expect(page.getByRole('spinbutton',{name:'Set 2 load',exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'5 kg',exact:true}).click();for(let i=0;i<4;i++)await page.getByRole('button',{name:'Increase Set 1 load',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Set 1 load',exact:true})).toHaveAttribute('aria-valuenow','20');
 await page.getByRole('button',{name:'Complete Set',exact:true}).click();
 await expect(page.getByRole('region',{name:'Rest between sets',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Skip rest · continue',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Set 2 load',exact:true})).toBeVisible();
 await expect(page.getByRole('spinbutton',{name:'Set 1 load',exact:true})).not.toBeVisible();
 await page.screenshot({path:'output/android-011/workout-set-two.png',fullPage:true});
});

test('large history responsiveness benchmark',async({page})=>{
 const cloud=await setup(page);const date=new Date().toISOString().slice(0,10);
 for(let i=0;i<2500;i++){
  const food=i<500,type=food?'food':i%2?'sleep':'meal',timestamp=new Date(Date.now()-(i%85)*86400000).toISOString(),id=`perf-${i}`;
  const payload={id,userId:'11111111-1111-4111-8111-111111111111',type,domain:food||type==='meal'?'Eat':'Recover',name:food?`Food ${i}`:type==='meal'?`Meal ${i%8}`:'Sleep',timestamp,createdAt:timestamp,updatedAt:timestamp,revision:1,source:'Performance fixture',unit:type==='sleep'?'hours':'',value:type==='sleep'?7.5:undefined,quality:'manual',deviceId:'test',syncState:'saved',metadata:food?{calories:100,protein:10,serving:100}:type==='meal'?{calories:300,protein:20,meal:'Dinner'}:{}};
  cloud.biological.push({record_id:id,revision:1,change_version:i+1,payload});
 }
 await page.addInitScript(()=>{(window as any).__longTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())(window as any).__longTasks.push(e.duration);}).observe({type:'longtask',buffered:true});});
 await page.goto('/#Today');await expect(page.locator('.android-today')).toBeVisible();
 await page.locator('[data-destination=Intelligence]').click();await expect(page.locator('#intel-question')).toBeVisible({timeout:60000});
 await page.locator('#intel-question').pressSequentially('How is my sleep today?',{delay:15});
 const timings:number[]=[];
 for(const name of ['Eat','Recover','Health','Body','Care','Today']){
  const duration=await page.evaluate(async name=>{const start=performance.now();(document.querySelector(`[data-destination="${name}"]`) as HTMLButtonElement).click();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return performance.now()-start;},name);
  timings.push(Math.round(duration));await expect(page.locator(`[data-destination="${name}"]`)).toHaveAttribute('aria-current','page');
 }
 const longTasks=await page.evaluate(()=>(window as any).__longTasks as number[]);
 const measured={navigationMs:timings,maxLongTaskMs:Math.round(Math.max(0,...longTasks)),longTaskCount:longTasks.length};console.log(JSON.stringify(measured));
 expect(Math.max(...timings)).toBeLessThan(600);expect(measured.maxLongTaskMs).toBeLessThan(700);
});

test('Android workout uses touch-only controls, three set cards, rest and verified save',async({page})=>{
 const cloud=await setup(page);cloud.records.find(r=>r.entity_type==='week').payload.days.forEach((d:any)=>d.exercises[0].vol='3 × 15');
 await page.goto('/#Dashboard');await page.getByRole('button',{name:'Start workout',exact:true}).click();
 await expect(page.locator('.android-workout-cards')).toBeVisible();await expect(page.locator('.stitch-session-plan')).toHaveCount(0);
 await expect(page.locator('.android-topbar')).not.toBeVisible();await expect(page.locator('.android-bottom-nav')).not.toBeVisible();
 await expect(page.locator('.flash-meta')).toContainText('1 / 3');
 const timer=page.getByLabel('Workout elapsed time');const initial=await timer.textContent();await expect(timer).not.toHaveText(initial!);
 for(let i=1;i<=3;i++){
  await expect(page.getByRole('spinbutton',{name:`Set ${i} reps`,exact:true})).toHaveAttribute('aria-valuenow','15');
  await page.getByRole('button',{name:`Increase Set ${i} load`,exact:true}).click();
  await page.getByRole('button',{name:`Set ${i} RPE 8`,exact:true}).click();await page.getByRole('button',{name:`Set ${i} RIR 2`,exact:true}).click();
  expect(await page.evaluate(()=>['INPUT','TEXTAREA'].includes(document.activeElement?.tagName||''))).toBe(false);
  if(i===1)await page.screenshot({path:'output/android-011/workout-card-enhanced.png',fullPage:true});
  await page.getByRole('button',{name:'Complete Set',exact:true}).click();await expect(page.getByRole('region',{name:'Rest between sets'})).toBeVisible();
  await page.getByRole('button',{name:'Skip rest · continue',exact:true}).click();
 }
 await expect(page.getByRole('heading',{name:'Exercise complete',exact:true})).toBeVisible();await page.getByRole('button',{name:'Save & next',exact:true}).click();
 await expect(page.locator('.android-workout-summary')).toBeVisible();
 const save=page.getByRole('button',{name:'Save & send AI report',exact:true});
 for(const dark of [false,true]){
  await page.evaluate(value=>document.body.classList.toggle('dark',value),dark);
  const contrast=await save.evaluate(button=>{
   const style=getComputedStyle(button),rgb=(color:string)=>color.match(/[\d.]+/g)!.slice(0,3).map(Number);
   const luminance=(color:string)=>rgb(color).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
   if(style.backgroundColor==='rgba(0, 0, 0, 0)')return 0;
   const bg=luminance(style.backgroundColor),fg=luminance(style.color);return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
 }
 await save.scrollIntoViewIfNeeded();await page.screenshot({path:'output/android-011/workout-review-save-report.png',fullPage:true});
 cloud.rejectSession(true);await save.click();await expect(page.getByText(/Supabase save failed/)).toBeVisible();
 await expect(save).toBeEnabled();expect(cloud.records.filter(r=>r.entity_type==='session')).toHaveLength(0);
 cloud.rejectSession(false);await save.click();
 await expect.poll(()=>cloud.records.filter(r=>r.entity_type==='session').length).toBe(1);
 const sets=cloud.records.find(r=>r.entity_type==='session').payload.logs[0].sets;expect(sets).toHaveLength(3);expect(sets.map((s:any)=>[Number(s.r),Number(s.rpe),Number(s.rir)])).toEqual([[15,8,2],[15,8,2],[15,8,2]]);
});

test('legacy 45-second draft repairs to three cards, preserves confirmed data and supports time/reps controls',async({page})=>{
 const cloud=await setup(page,true,true),day=cloud.records.find(r=>r.entity_type==='readiness').payload;
 const exercise={name:'Plank',target:'Core',vol:'45 seconds',cue:'Brace',trackingMode:'time'},key='bad-draft:0:Plank';
 const currentEntry={key,weights:Array(45).fill(''),reps:Array(45).fill(''),durations:Array(45).fill('45'),rpes:Array(45).fill(''),rirs:Array(45).fill(''),setTypes:Array(45).fill('work'),sides:Array(45).fill('both'),journal:'Preserve this note',trackingMode:'time',completedSets:[0],completedRecords:{0:{s:1,w:'',r:'45',durationSec:'45',trackingMode:'time',type:'work',side:'both'}}};
 cloud.add('workoutDraft','active-workout',{draft:{id:'bad-draft',weekId:'week-one',weekName:'Cloud strength',weekNumber:1,dayKey:day.dayKey,dayTitle:'Core',date:day.date,name:'Core',sleep:8,soreness:2,index:0,logs:[],exercises:[exercise],startedAt:new Date(Date.now()-65000).toISOString(),currentEntry}});
 await page.goto('/#Tracker');await expect(page.locator('.flash-meta')).toContainText('2 / 3');await expect(page.getByRole('spinbutton',{name:'Set 2 seconds',exact:true})).toHaveAttribute('aria-valuenow','45');
 await page.getByRole('button',{name:'Increase Set 2 seconds',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Set 2 seconds',exact:true})).toHaveAttribute('aria-valuenow','46');
 await page.getByRole('button',{name:'Decrease Set 2 seconds',exact:true}).click();await page.getByRole('button',{name:'Start set timer',exact:true}).click();
 await expect(page.getByRole('button',{name:/Stop & use time/})).toContainText('00:01',{timeout:5000});await page.getByRole('button',{name:/Stop & use time/}).click();
 await page.getByRole('button',{name:'Reps only',exact:true}).click();await page.getByRole('button',{name:'Increase Set 2 reps',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Set 2 reps',exact:true})).toHaveAttribute('aria-valuenow','1');
 await page.screenshot({path:'output/android-011/workout-reps-only.png',fullPage:true});
 await expect(page.locator('.aw-draft-status')).toContainText('Draft saved on this device');await page.reload();await expect(page.locator('.flash-meta')).toContainText('2 / 3');await expect(page.getByRole('spinbutton',{name:'Set 2 reps',exact:true})).toHaveAttribute('aria-valuenow','1');
 await page.getByRole('button',{name:'Seconds',exact:true}).click();await page.screenshot({path:'output/android-011/workout-time-card.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('workout options and advanced tools use focused panels and preserve added sets and notes',async({page})=>{
 await setup(page,true,true);await page.goto('/#Dashboard');await page.getByRole('button',{name:'Start workout',exact:true}).click();await expect(page.locator('.android-workout-cards')).toBeVisible();
 await page.getByRole('button',{name:'Workout options',exact:true}).click();const options=page.getByRole('dialog',{name:'Workout options',exact:true});await expect(options).toBeVisible();
 await expect(options.getByRole('button',{name:/Substitute/})).toBeVisible();await page.screenshot({path:'output/android-011/workout-options-panel.png'});
 await options.getByRole('button',{name:/Add a set/}).click();await expect(options).not.toBeVisible();await expect(page.locator('.flash-meta')).toContainText('2 / 2');
 await page.getByRole('button',{name:'Notes & advanced tools',exact:true}).click();const notes=page.getByRole('dialog',{name:'Notes & advanced tools',exact:true});await expect(notes).toBeVisible();
 await notes.getByLabel('Exercise notes',{exact:true}).fill('Synthetic form note');await expect(notes.getByRole('button',{name:'Technique cues',exact:true})).toBeVisible();
 await page.screenshot({path:'output/android-011/workout-notes-panel.png'});await notes.getByRole('button',{name:'Done',exact:true}).click();
 await expect(page.locator('.aw-draft-status')).toContainText('Draft saved on this device');await page.reload();await expect(page.locator('.flash-meta')).toContainText('1 / 2');
 await page.getByRole('button',{name:'Notes & advanced tools',exact:true}).click();await expect(page.getByLabel('Exercise notes',{exact:true})).toHaveValue('Synthetic form note');
});

test('Today report queue displays real pending jobs, opens Reports and disappears once sent',async({page})=>{
 const cloud=await setup(page);let jobs:any[]=[{report_id:'pending-one',created_at:new Date().toISOString(),attempts:0,status:'processing'},{report_id:'pending-two',created_at:new Date().toISOString(),attempts:2,status:'failed',last_error:'AI_PROVIDER_UNAVAILABLE'}];
 await page.route('**/functions/v1/body-os-email',route=>route.fulfill({json:{ok:true,jobs,sentTo:[]}}));
 await page.goto('/#Today');const queue=page.getByRole('region',{name:'Report Queue',exact:true});await expect(queue).toBeVisible();await expect(queue).toContainText('Generating / sending');await expect(queue).toContainText('Retry needed');await expect(page.locator('.arq-count')).toHaveText('2');
 await page.screenshot({path:'output/android-011/today-report-queue.png',fullPage:true});
 await queue.getByRole('button',{name:'View queue',exact:true}).click();await expect(page).toHaveURL(/Reports/);
 await page.locator('[data-destination=Today]').click();jobs=[];await page.getByRole('button',{name:'Refresh report queue',exact:true}).click();await expect(queue).not.toBeVisible();
 expect(cloud.records.filter(r=>r.entity_type==='session')).toHaveLength(0);
});

test('startup renders structured workout labels without a React object-child crash',async({page})=>{
 const cloud=await setup(page),date=cloud.records.find(r=>r.entity_type==='readiness').payload.date;
 cloud.add('scheduledWorkout','structured-schedule',{date,weekId:'week-one',dayKey:'Mon',status:'planned',title:{id:'legacy-workout',title:'Pull day'},notes:''});
 await page.goto('/#Today');
 await expect(page.locator('.android-today')).toBeVisible();
 await expect(page.getByRole('region',{name:'Next Action'})).toContainText('Pull day');
 await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
});

test('a fresh account with no training or health records can sign in and open Today',async({page})=>{
 const cloud=await setup(page,false);cloud.records.length=0;
 await page.goto('/#Today');
 await page.getByPlaceholder('Email address',{exact:true}).fill('cloud-test@example.com');
 await page.getByPlaceholder('Password (min 6 characters)',{exact:true}).fill('test-password');
 await page.getByRole('button',{name:'Sign in to Health OS',exact:true}).click();
 await expect(page.locator('.android-today')).toBeVisible();
 await expect(page.locator('.android-today')).toContainText('Check in');
 await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
 await page.locator('[data-destination=Train]').click();
 await expect(page.locator('#health-main-content')).not.toContainText('Something went wrong');
});

test('restored Library handles imported equipment objects instead of crashing after sign-in',async({page})=>{
 const cloud=await setup(page);
 cloud.add('exercise','legacy-equipment',{name:'Imported curl',muscles:['Biceps'],equipment:[{id:1,name:'Dumbbell'}],aliases:[],substitutions:[]});
 await page.addInitScript(()=>localStorage.setItem('body-os-last-workout-page','Library'));
 await page.goto('/');
 await expect(page.locator('#health-main-content')).toContainText('Imported curl');
 await expect(page.locator('#health-main-content')).toContainText('Dumbbell');
 await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
 expect(cloud.records.find(row=>row.entity_type==='exercise')!.payload.equipment).toEqual([{id:1,name:'Dumbbell'}]);
});

test('a failed view leaves navigation available and exposes readable error details',async({page})=>{
 const pods=await setupFriendPods(page,2,'connected');
 // An invalid historical display name fails inside Pods, after the app has signed in.
 pods.members[0].display_name={id:'old-label',name:'Old name'};
 await page.goto('/#Today/Pods');
 await expect(page.locator('.view-error')).toContainText('Today could not load');
 await expect(page.getByRole('button',{name:'Copy error details',exact:true})).toBeVisible();
 await page.getByText(/Error details · Health OS/).click();
 await expect(page.locator('.view-error pre')).toContainText('componentStack');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('[data-destination=Train]').click();
 await expect(page.locator('.android-train')).toBeVisible();
 await expect(page.locator('.view-error:visible')).toHaveCount(0);
});

test('an older cached source object does not crash Today after sign-in',async({page})=>{
 await setup(page,true,true);await page.goto('/#Today');await expect(page.locator('.android-today')).toBeVisible();
 await page.evaluate(async()=>{
  const name='health-os-biology-lphlihwyrcqgmdiwlvuq.supabase.co-11111111-1111-4111-8111-111111111111';
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const now=new Date().toISOString(),tx=db.transaction('records','readwrite');
  tx.objectStore('records').put({id:'legacy-sleep-source',userId:'11111111-1111-4111-8111-111111111111',type:'sleep',domain:'Recover',name:'Sleep',value:7,unit:'hours',timestamp:now,createdAt:now,updatedAt:now,revision:1,deviceId:'legacy-device',quality:'imported',syncState:'saved',metadata:{},source:{id:'watch',name:'Legacy watch'}});
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 });
 await page.reload();await expect(page.locator('.android-today')).toBeVisible();
 await expect(page.locator('.android-metrics [data-metric=Sleep]')).toContainText('Legacy watch');
 await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
});

test('Intelligence renders an active workout draft as a title and keeps its sets intact',async({page})=>{
 const cloud=await setup(page,true,true),ready=cloud.records.find(row=>row.entity_type==='readiness')!.payload;
 cloud.records.splice(cloud.records.findIndex(row=>row.entity_type==='readiness'),1);
 const sets=[{w:'40',r:'8',rpe:'7',rir:'3',type:'work'}];
 const draft={id:'active-intelligence-draft',weekId:'week-one',weekName:'Cloud strength',weekNumber:1,dayKey:ready.dayKey,dayTitle:'Draft pull day',date:ready.date,name:'Cloud Athlete',sleep:8,soreness:2,index:1,logs:[{name:'Bench Press',target:'Chest',status:'completed',sets}],exercises:[{name:'Bench Press',target:'Chest',vol:'1 x 8',cue:'Control'},{name:'Row',target:'Back',vol:'3 x 8',cue:'Control'}],plannedExercises:[],startedAt:new Date(Date.now()-120000).toISOString(),gymMode:true};
 cloud.add('workoutDraft','active-workout',{draft});
 await page.goto('/#Intelligence');
 await expect(page.locator('.intel-priority h3').filter({hasText:'Draft pull day'})).toBeVisible();
 await expect(page.locator('.view-error')).toHaveCount(0);
 await page.getByRole('button',{name:'Resume workout',exact:true}).first().click();
 await expect(page.locator('.android-workout-cards')).toBeVisible();
 expect(cloud.records.find(row=>row.entity_type==='workoutDraft')!.payload.draft.logs[0].sets).toEqual(sets);
 expect(cloud.records.filter(row=>row.entity_type==='session')).toHaveLength(0);
});
