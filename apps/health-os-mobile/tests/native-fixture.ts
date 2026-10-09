import type { Page } from '@playwright/test';
export async function nativeFixture(page: Page) {
  await page.addInitScript(()=>{
    const target=window as any;
    target.androidBridge={};
    const methods:Record<string,string[]>={App:['addListener','removeListener','minimizeApp'],Browser:['open'],Keyboard:['addListener','removeListener','hide'],StatusBar:['setOverlaysWebView','setStyle','setBackgroundColor'],LocalNotifications:['addListener','removeListener','createChannel','checkPermissions','requestPermissions','schedule','cancel'],Filesystem:['writeFile'],Share:['share']};
    const calls:any[]=[];target.__nativeCalls=calls;
    target.Capacitor={
      PluginHeaders:Object.entries(methods).map(([name,items])=>({name,methods:items.map(method=>({name:method,rtype:method==='addListener'?'callback':'promise'}))})),
      nativePromise:async(plugin:string,method:string,options:any)=>{
        calls.push({plugin,method,options});
        if(method==='checkPermissions'||method==='requestPermissions')return {display:'granted'};
        if(method==='writeFile')return {uri:'file:///mock/cache/export.json'};
        return {};
      },
      nativeCallback:(plugin:string,method:string,options:any,callback:Function)=>{calls.push({plugin,method,options});return String(calls.length);},
    };
  });
}
