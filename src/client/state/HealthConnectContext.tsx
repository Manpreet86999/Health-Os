import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { androidLayout as ANDROID_APP } from '../lib/android-layout';
import { healthConnectChanges,type HealthSnapshot } from '../lib/health-connect-records';
import { useBiology } from './BiologyContext';
import { useCloudAccount } from './CloudAccountContext';
import { useApp } from './AppContext';

interface NativeStatus { available:boolean; sdkStatus:number; permissions:string[]; requestedPermissions?:string[]; backgroundAvailable:boolean; backgroundGranted?:boolean;retryAfter?:number }
const native=<T,>(method:string,options:Record<string,unknown>={}):Promise<T>=>{
 const cap=(window as any).Capacitor;
 return typeof cap?.nativePromise==='function'?cap.nativePromise('HealthConnect',method,options):Promise.reject(new Error('Health Connect requires the updated Android APK.'));
};
const empty:NativeStatus={available:false,sdkStatus:0,permissions:[],backgroundAvailable:false};
interface State {status:NativeStatus;enabled:boolean;busy:boolean;lastSync:string;error:string;count:number;connect:(background?:boolean)=>Promise<void>;sync:()=>Promise<void>;disconnect:()=>Promise<void>;settings:()=>Promise<void>}
const Context=createContext<State>({status:empty,enabled:false,busy:false,lastSync:'',error:'',count:0,connect:async()=>{},sync:async()=>{},disconnect:async()=>{},settings:async()=>{}});
export const useHealthConnect=()=>useContext(Context);
export function HealthConnectProvider({children}:{children:ReactNode}){
 const cloud=useCloudAccount(),bio=useBiology(),app=useApp();
 const scope=`${cloud.savedConfig?.url||'local'}|${cloud.user?.id||'guest'}`,key=`health-connect-enabled:${scope}`;
 const [status,setStatus]=useState(empty),[enabled,setEnabled]=useState(()=>localStorage.getItem(key)==='yes'),[busy,setBusy]=useState(false),[lastSync,setLastSync]=useState(''),[error,setError]=useState(''),[count,setCount]=useState(0);
 const current=useRef({bio,scope,enabled,unlocked:app.unlocked}),active=useRef(true),running=useRef(false),owner=useRef(''),needsHistory=useRef(Date.now()-Date.parse(localStorage.getItem(`${key}:history-read`)||'')>86400000||!localStorage.getItem(`${key}:history-read`)),generation=useRef(0),lastRequest=useRef(0);
 current.current={bio,scope,enabled,unlocked:app.unlocked};
 const valid=()=>active.current&&current.current.scope===scope;
 async function ownerId(){if(!owner.current){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope));owner.current=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}return owner.current;}
 async function apply(snapshot:HealthSnapshot){
  if(!valid()||!current.current.unlocked||!current.current.enabled)return;
  const rows=await current.current.bio.readRecords();if(!valid()||!current.current.enabled)return;
  const changes=healthConnectChanges(snapshot,rows);
  for(let i=0;i<changes.writes.length;i+=100){if(!valid()||!current.current.enabled)return;await current.current.bio.saveMany(changes.writes.slice(i,i+100));}
  for(const row of changes.removals){if(!valid()||!current.current.enabled)return;await current.current.bio.remove({...row,metadata:{...row.metadata,healthConnectRemoved:true}});}
  if(valid()){setLastSync(snapshot.syncedAt);localStorage.setItem(`${key}:last-read`,snapshot.syncedAt);setCount(snapshot.values.length);setError(snapshot.errors.length?`Some readings could not refresh: ${snapshot.errors.join(', ')}. Retry sync.`:'');}
 }
 async function refresh(){
  if(!ANDROID_APP||!current.current.bio.ready||!current.current.unlocked||!valid()||running.current)return;
  if(Date.now()-lastRequest.current<30000||document.visibilityState!=='visible')return;
  lastRequest.current=Date.now();
  const ticket=generation.current,stillCurrent=()=>valid()&&ticket===generation.current;
  running.current=true;setBusy(true);
  try{
   const state=await native<NativeStatus>('status');if(!stillCurrent())return;setStatus(state);
   if(!current.current.enabled||!state.available)return;
   if(state.retryAfter&&state.retryAfter>Date.now()){setError('Health Connect is temporarily limiting reads. Saved readings remain available; sync will retry automatically.');return;}
   if(!state.permissions.some(p=>p.startsWith('android.permission.health.READ_')&&!p.endsWith('IN_BACKGROUND'))){setError('Health Connect access is off. Tap Connect to review permissions.');return;}
   const id=await ownerId();if(!stillCurrent())return;
   await native('configure',{owner:id});if(!stillCurrent())return;
   const cached=await native<Partial<HealthSnapshot>>('cached',{owner:id});if(!stillCurrent())return;
   if(cached.values&&cached.syncedAt&&cached.permissions?.every(p=>state.permissions.includes(p))&&cached.syncedAt>(localStorage.getItem(`${key}:last-read`)||''))await apply(cached as HealthSnapshot);
   if(!stillCurrent())return;
   const data=await native<HealthSnapshot>('read',{days:needsHistory.current?28:2});if(!stillCurrent())return;
   await apply(data);if(needsHistory.current&&!data.errors.length)localStorage.setItem(`${key}:history-read`,data.syncedAt);needsHistory.current=Boolean(data.errors.length);
  }catch(e){if(valid()&&(e as {code?:string}).code!=='READ_PAUSED'&&document.visibilityState==='visible')setError((e as Error).message);}finally{running.current=false;if(valid())setBusy(false);}
 }
 async function connect(background=false){
  if(running.current)return;setBusy(true);setError('');
  try{const result=await native<NativeStatus>('connect',{background});if(!valid())return;setStatus(result);
   const granted=result.permissions.some(p=>p.startsWith('android.permission.health.READ_')&&!p.endsWith('IN_BACKGROUND'));
   if(granted){localStorage.setItem(key,'yes');current.current.enabled=true;setEnabled(true);needsHistory.current=true;lastRequest.current=0;}
   else setError('No health categories were allowed. Your existing records remain available.');
  }catch(e){if(valid())setError((e as Error).message);}finally{if(valid())setBusy(false);}
  if(current.current.enabled)await refresh();
 }
 async function disconnect(){generation.current++;setBusy(true);current.current.enabled=false;try{await native('disconnect');localStorage.removeItem(key);setEnabled(false);setStatus(await native('status'));setLastSync('');setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{
  active.current=true;
  if(!ANDROID_APP||!bio.ready||!app.unlocked)return;
  void refresh();
  const resume=()=>{if(document.visibilityState==='visible')void refresh();};
  window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  const timer=setInterval(resume,60000);
  return()=>{active.current=false;clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[scope,bio.ready,app.unlocked,enabled]);
 useEffect(()=>()=>{active.current=false;generation.current++;if(ANDROID_APP&&owner.current)void native('pause',{owner:owner.current}).catch(()=>{});},[]);
 return <Context.Provider value={{status,enabled,busy,lastSync,error,count,connect,sync:async()=>{needsHistory.current=true;lastRequest.current=0;await refresh();},disconnect,settings:async()=>{try{await native('openSettings');}catch(e){setError((e as Error).message);}}}}>{children}</Context.Provider>;
}
