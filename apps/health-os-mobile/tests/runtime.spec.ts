import { test, expect } from '@playwright/test';

async function harness(page: any) {
  await page.route('**/*', (route: any) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/manifest.webmanifest');
  await page.evaluate(() => { document.body.innerHTML = '<input aria-label="Test input">'; });
}

test('a failed or hanging optional listener does not block native sharing and external links', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const runtime = await import('/health-os-native.js');
    const shared: string[] = [], links: string[] = [];
    const broken = { addListener: () => Promise.reject(new Error('Listener unavailable')) };
    const start = performance.now();
    const pending = runtime.initializeAndroid({ isAndroid: () => true,
      app: broken, keyboard: { addListener: () => new Promise(() => {}) },
      notifications: { ...broken, createChannel: async () => {} },
      statusBar: { setStyle: async () => {}, setBackgroundColor: async () => {}, setOverlaysWebView: async () => {} },
      browser: { open: async ({url}: any) => { links.push(url); } },
      shareBlob: async (blob: Blob) => { shared.push(await blob.text()); },
    });
    const url = URL.createObjectURL(new Blob(['retained export bytes']));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'report.json'; anchor.click();
    URL.revokeObjectURL(url);
    window.open('https://example.com/research');
    await pending;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { shared, links, elapsed: performance.now() - start };
  });
  expect(result.shared).toEqual(['retained export bytes']);
  expect(result.links).toEqual(['https://example.com/research']);
  expect(result.elapsed).toBeLessThan(2500);
});

test('Android permission and reminder delivery use the native plugin and respect denial', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const runtime = await import('/health-os-native.js');
    let allowed = false, requests = 0;
    const schedules: any[] = [];
    const listener = { addListener: async () => ({remove: async () => {}}) };
    await runtime.initializeAndroid({ isAndroid: () => true, app: listener, keyboard: listener,
      notifications: {...listener, createChannel: async () => {}, checkPermissions: async () => ({display: allowed ? 'granted' : 'denied'}),
        requestPermissions: async () => { requests++; allowed = true; return {display: 'granted'}; },
        schedule: async (options: any) => { schedules.push(options); }},
      statusBar: {setStyle: async () => {}, setBackgroundColor: async () => {}, setOverlaysWebView: async () => {}},
      browser: {}, shareBlob: async () => {},
    });
    const denied = await runtime.deliverReminder('event-1', true, () => {});
    const permission = await runtime.requestNotificationPermission(true);
    const accepted = await runtime.deliverReminder('event-1', true, () => {});
    allowed = false;
    const revoked = await runtime.deliverReminder('event-2', true, () => {});
    return {denied,permission,accepted,revoked,requests,schedules,id:runtime.reminderId('event-1')};
  });
  expect(result).toMatchObject({denied:false,permission:'granted',accepted:true,revoked:false,requests:1});
  expect(result.schedules).toHaveLength(1);
  expect(result.schedules[0].notifications[0]).toMatchObject({id:result.id,title:'Health OS',body:'A gentle reminder is ready in your timeline.',extra:{hash:'#Timeline'}});
  expect(result.id).not.toBe(71001);
});

test('a rejected notification schedule is surfaced to the caller instead of claiming acceptance', async ({ page }) => {
  await harness(page);
  const rejected = await page.evaluate(async () => {
    const runtime = await import('/health-os-native.js');
    const listener = {addListener: async () => ({remove:async()=>{}})};
    await runtime.initializeAndroid({isAndroid:()=>true,app:listener,keyboard:listener,
      notifications:{...listener,createChannel:async()=>{},checkPermissions:async()=>({display:'granted'}),schedule:async()=>{throw new Error('Schedule rejected');}},
      statusBar:{setStyle:async()=>{},setBackgroundColor:async()=>{},setOverlaysWebView:async()=>{}},browser:{},shareBlob:async()=>{}});
    try {await runtime.deliverReminder('event',true,()=>{});return false;}catch{return true;}
  });
  expect(rejected).toBe(true);
});

test('Android Back dismisses the overlay and keyboard before navigation and system bars follow theme', async ({page}) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const runtime = await import('/health-os-native.js');
    const callbacks: Record<string, Function> = {}, styles: string[] = [];
    let escapes=0, hidden=0, minimized=0;
    const listener={addListener:async(name:string,callback:Function)=>{callbacks[name]=callback;return {remove:async()=>{}};}};
    document.addEventListener('keydown',event=>{if(event.key==='Escape')escapes++;});
    await runtime.initializeAndroid({isAndroid:()=>true,app:{...listener,minimizeApp:async()=>{minimized++;}},
      keyboard:{...listener,hide:async()=>{hidden++;throw new Error('Already hidden');}},
      notifications:{...listener,createChannel:async()=>{}},statusBar:{setStyle:async({style}:any)=>{styles.push(style);},setBackgroundColor:async()=>{},setOverlaysWebView:async()=>{}},browser:{},shareBlob:async()=>{}});
    document.body.dataset.uxOverlayOpen='true';callbacks.backButton({canGoBack:false});delete document.body.dataset.uxOverlayOpen;
    document.querySelector('input')!.focus();callbacks.backButton({canGoBack:false});
    location.hash='#Settings';callbacks.backButton({canGoBack:false});
    document.body.classList.add('dark');await new Promise(resolve=>setTimeout(resolve,20));
    const hash=location.hash;callbacks.backButton({canGoBack:false});await new Promise(resolve=>setTimeout(resolve,20));
    return {escapes,hidden,minimized,hash,styles};
  });
  expect(result).toMatchObject({escapes:1,hidden:1,minimized:1,hash:'#Today'});
  expect(result.styles).toEqual(['DARK','LIGHT']);
});


test('Android Back closes the shared welcome tour before minimizing the app', async ({page}) => {
  await harness(page);
  const result=await page.evaluate(async()=>{
    await import('/health-os-release.js');
    const runtime=await import('/health-os-native.js');
    const callbacks:Record<string,Function>={};let minimized=0;
    const listener={addListener:async(name:string,callback:Function)=>{callbacks[name]=callback;return {remove:async()=>{}};}};
    await runtime.initializeAndroid({isAndroid:()=>true,app:{...listener,minimizeApp:async()=>{minimized++;}},keyboard:listener,notifications:{...listener,createChannel:async()=>{}},statusBar:{setStyle:async()=>{},setBackgroundColor:async()=>{},setOverlaysWebView:async()=>{}},browser:{},shareBlob:async()=>{}});
    const wasOpen=!!document.querySelector('dialog.hos-release[open]');
    callbacks.backButton({canGoBack:false});
    return {wasOpen,stillOpen:!!document.querySelector('dialog.hos-release[open]'),minimized};
  });
  expect(result).toEqual({wasOpen:true,stillOpen:false,minimized:0});
});
