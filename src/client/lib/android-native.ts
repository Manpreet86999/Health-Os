/** The existing APK supplies its Capacitor bridge and compiled plugins. */
export async function initializeNativeAndroid(){
  const cap=(window as any).Capacitor;
  if(typeof cap?.nativePromise!=='function')return;
  const register=(name:string)=>new Proxy({},{get:(_target,method:string)=>method==='addListener'?(event:string,callback:Function)=>Promise.resolve(cap.addListener(name,event,callback)):(options:unknown={})=>cap.nativePromise(name,method,options)} ) as any;
  const url='/health-os-native.js';
  const integration=await import(/* @vite-ignore */ url);
  const filesystem=register('Filesystem'),share=register('Share');
  await integration.initializeAndroid({isAndroid:()=>true,app:register('App'),statusBar:register('StatusBar'),notifications:register('LocalNotifications'),keyboard:register('Keyboard'),filesystem,share,browser:register('Browser'),shareBlob:async(blob:Blob,name:string)=>{
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
    const result=await filesystem.writeFile({path:`health-os-${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g,'_')}`,data,directory:'CACHE'});
    await share.share({title:name,files:[result.uri]});
  }});
}
export async function requestAndroidNotificationPermission(){
  const cap=(window as any).Capacitor;
  if(typeof cap?.nativePromise!=='function')return 'denied';
  const permission=await cap.nativePromise('LocalNotifications','requestPermissions',{});
  return permission.display==='granted'?'granted':'denied';
}
export async function deliverAndroidReminder(id:string){
  const cap=(window as any).Capacitor;
  if(typeof cap?.nativePromise!=='function')return false;
  const permission=await cap.nativePromise('LocalNotifications','checkPermissions',{});
  if(permission.display!=='granted')return false;
  const url='/health-os-native.js',integration=await import(/* @vite-ignore */ url);
  await cap.nativePromise('LocalNotifications','schedule',{notifications:[{id:integration.reminderId(id),title:'Health OS',body:'A gentle reminder is ready in Health OS.',channelId:'daily',extra:{hash:'#Today'}}]});
  return true;
}
export async function scheduleAndroidRest(deadline:number){
  const cap=(window as any).Capacitor;
  if(typeof cap?.nativePromise!=='function'||deadline<=Date.now())return;
  const permission=await cap.nativePromise('LocalNotifications','checkPermissions',{});
  if(permission.display!=='granted')return;
  await cap.nativePromise('LocalNotifications','schedule',{notifications:[{id:71001,title:'Health OS',body:'Rest complete. Your next set is ready.',channelId:'training',schedule:{at:new Date(deadline)},extra:{hash:'#Tracker'}}]});
}
export async function cancelAndroidRest(){
  const cap=(window as any).Capacitor;
  if(typeof cap?.nativePromise==='function')await cap.nativePromise('LocalNotifications','cancel',{notifications:[{id:71001}]});
}
