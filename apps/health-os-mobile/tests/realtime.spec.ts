import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';
const transport=ts.transpileModule(fs.readFileSync('src/client/lib/supabase-realtime.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function start(page:any, opened=true){
 await page.goto('/manifest.webmanifest');await page.clock.install();
 await page.evaluate(async({transport,opened})=>{
  const w=window as any;w.sockets=[];w.changes=0;w.token='initial';
  class Socket {
   static OPEN=1;static CONNECTING=0;readyState=opened?1:0;sent:any[]=[];onopen:any;onclose:any;onmessage:any;
   constructor(public url:string){w.sockets.push(this);if(opened)queueMicrotask(()=>this.onopen?.());}
   send(raw:string){this.sent.push(JSON.parse(raw));}
   close(){this.readyState=3;this.onclose?.();}
   reply(event:string,payload:any={},ref?:string){this.onmessage?.({data:JSON.stringify({event,payload,ref})});}
  }
  w.WebSocket=Socket;
  const runtime=await import(URL.createObjectURL(new Blob([transport],{type:'text/javascript'})));
  w.stop=runtime.subscribeToCloudChanges({url:'https://example.supabase.co',publishableKey:'public-test'},'old','owner-one',()=>w.changes++,['body_os_records'],async()=>w.token);
 },{transport,opened});
}
test('realtime is owner scoped, debounces changes and replaces an unresponsive socket with fresh credentials',async({page})=>{
 await start(page);
 const join=await page.evaluate(()=>(window as any).sockets[0].sent[0]);
 expect(join.payload.access_token).toBe('initial');expect(join.payload.config.postgres_changes[0].filter).toBe('user_id=eq.owner-one');
 await page.evaluate(()=>{const w=window as any,s=w.sockets[0];s.reply('phx_reply',{status:'ok'},s.sent[0].ref);s.reply('postgres_changes');s.reply('postgres_changes');});
 await page.clock.runFor(450);expect(await page.evaluate(()=>(window as any).changes)).toBe(1);
 await page.evaluate(()=>{(window as any).token='renewed';});
 await page.clock.runFor(51000);
 await expect.poll(()=>page.evaluate(()=>(window as any).sockets.length)).toBeGreaterThan(1);
 expect(await page.evaluate(()=>(window as any).sockets.at(-1).sent[0].payload.access_token)).toBe('renewed');
 await page.evaluate(()=>(window as any).stop());
});
test('stalled joins reconnect, missed messages trigger a durable refresh, Android resume rejoins and cleanup stops all work',async({page})=>{
 await start(page,false);await page.clock.runFor(16500);
 expect(await page.evaluate(()=>(window as any).sockets.length)).toBeGreaterThan(1);
 await page.clock.runFor(14000);expect(await page.evaluate(()=>(window as any).changes)).toBeGreaterThan(0);
 const count=await page.evaluate(()=>(window as any).sockets.length);
 await page.evaluate(()=>window.dispatchEvent(new Event('health-os-resume')));
 await expect.poll(()=>page.evaluate(()=>(window as any).sockets.length)).toBeGreaterThan(count);
 await page.clock.runFor(500);
 const stopped=await page.evaluate(()=>{const w=window as any;w.stop();return {sockets:w.sockets.length,changes:w.changes};});
 await page.clock.runFor(90000);await page.evaluate(()=>window.dispatchEvent(new Event('health-os-resume')));
 expect(await page.evaluate(()=>({sockets:(window as any).sockets.length,changes:(window as any).changes}))).toEqual(stopped);
});
