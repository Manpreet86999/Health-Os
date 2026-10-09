import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cloudFetch } from '../lib/cloud-api';
import { useBiologicalData } from '../lib/use-biological-data';
import { useCloudAccount } from './CloudAccountContext';
import { useBiology } from './BiologyContext';
import { resolveInbox } from '../../shared/automation-inbox';
import { automationPreferences, emptyAutomationState, type AutomationState, type AutomationPreferences, type Dataset } from '../../shared/automation-model';
import { api } from '../lib/api';
import { fingerprint } from '../../shared/automation-model';
import { dateOf } from '../../shared/biology';
import { effectiveCare } from '../../shared/automation-care';

const store=async()=>({
  get:async(_store:string,key:string)=>{if(key.endsWith(':photo-dates'))return undefined;const response=await cloudFetch('/api/automations/state');if(!response.ok)throw new Error('Could not load cloud automations.');return (await response.json()).state;},
  put:async(_store:string,state:unknown,key:string)=>{if(key.endsWith(':photo-dates'))return;const response=await cloudFetch('/api/automations/state',{method:'POST',body:JSON.stringify({state})});if(!response.ok)throw new Error((await response.json()).error||'Could not save cloud automations.');}
});
const createWorker=()=>new Worker(new URL('../lib/automation-worker.ts',import.meta.url),{type:'module'});
const calculateDeferred=(workerRef:{current:Worker|null},data:Dataset,state:AutomationState,reconcile?:{rebuild:boolean})=>new Promise<AutomationState>((resolve,reject)=>{
  const worker=workerRef.current??(workerRef.current=createWorker());
  const discard=()=>{worker.terminate();if(workerRef.current===worker)workerRef.current=null;};
  const timer=setTimeout(()=>{discard();reject(new Error('Background calculation timed out; source records are saved.'));},60000);
  worker.onmessage=(event:MessageEvent<{state?:AutomationState;error?:string}>)=>{clearTimeout(timer);worker.onmessage=null;worker.onerror=null;event.data.state?resolve(event.data.state):reject(new Error(event.data.error));};
  worker.onerror=event=>{clearTimeout(timer);discard();reject(new Error(event.message||'Background calculation failed.'));};
  try{worker.postMessage({data,state,reconcile});}catch(error){clearTimeout(timer);discard();reject(error);}
});
interface AutomationContextValue {state:AutomationState;ready:boolean;error:string;preferences:AutomationPreferences;rebuild:()=>Promise<void>;retry:()=>Promise<void>;resolve:(id:string,resolution:string,snooze?:number)=>Promise<void>;request:<T>(path:string,body:Record<string,unknown>,sourceIds?:string[])=>Promise<T>;cancelJob:(id:string)=>Promise<void>;setPreference:(key:keyof AutomationPreferences,value:boolean|number)=>Promise<void>;}
const Context=createContext<AutomationContextValue|null>(null);
export function useAutomations(){const value=useContext(Context);if(!value)throw new Error('Automation provider is missing');return value;}
export function AutomationProvider({children}:{children:ReactNode}){
  const workerRef=useRef<Worker|null>(null);
  // Reuse the loaded worker: no module download/startup for every save, including offline saves.
  useEffect(()=>{workerRef.current=createWorker();return()=>{workerRef.current?.terminate();workerRef.current=null;};},[]);
  const drainDeferred=(data:Dataset,state:AutomationState,reconcile?:{rebuild:boolean})=>calculateDeferred(workerRef,data,state,reconcile);
  const {app,records}=useBiologicalData(),bio=useBiology(),cloud=useCloudAccount();
  const scope=cloud.user?`${new URL(cloud.savedConfig!.url).hostname}:${cloud.user.id}`:'local-user';
  const activeScope=useRef(scope);activeScope.current=scope;
  const [photoDates,setPhotoDates]=useState<{id:string;date:string}[]>([]);
  const [state,setState]=useState(emptyAutomationState),[ready,setReady]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(0);
  const taskWaiters=useRef(new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}[]>()),controllers=useRef(new Map<string,AbortController>());
  const stateRef=useRef(state),chain=useRef(Promise.resolve());
  const prefs=useMemo(()=>automationPreferences(bio.records),[bio.records]);
  const data=useMemo<Dataset|null>(()=>app.db?{db:app.db,photoDates,skin:effectiveCare(app.skin,bio.records),records:[...records,...bio.records.filter(r=>r.deletedAt||r.metadata.requiresConfirmation===true&&r.metadata.confirmed!==true)],userId:scope}:null,[app.db,app.skin,records,bio.records,scope,photoDates]);
  const dataRef=useRef(data);dataRef.current=data;
  const persist=async(next:AutomationState,target=scope)=>{await (await store()).put('state',next,target);if(activeScope.current===target){stateRef.current=next;setState(next);}};
  const enqueue=(fn:()=>Promise<void>)=>{const result=chain.current.catch(()=>{}).then(fn);chain.current=result.catch(e=>{if(activeScope.current===scope)setError((e as Error).message);});return result;};
  const rebuild=()=>enqueue(async()=>{if(!dataRef.current||activeScope.current!==scope)return;await persist(await drainDeferred(dataRef.current,stateRef.current,{rebuild:true}));setError('');});
  const retry=()=>enqueue(async()=>{if(!dataRef.current)return;const next=structuredClone(stateRef.current);for(const j of Object.values(next.jobs))if(j.status==='failed'){j.status='pending';j.attempts=0;j.nextAttemptAt=new Date().toISOString();}await persist(await drainDeferred(dataRef.current,next));});
  const resolve=(id:string,resolution:string,snooze?:number)=>enqueue(async()=>{const next=structuredClone(stateRef.current);resolveInbox(next,id,resolution,new Date(),snooze);await persist(next);});
  const sourceRevision=(ids:string[])=>fingerprint(ids.map(id=>dataRef.current?.records.find(r=>r.id===id)||dataRef.current?.photoDates?.find(p=>p.id===id)||dataRef.current?.db.sessions.find(s=>s.id===id)||null));
  const cancelJob=(id:string)=>enqueue(async()=>{const next=structuredClone(stateRef.current),job=next.jobs[id];if(!job)return;job.status='cancelled';if(job.command?.body.photo)delete job.command.body.photo;controllers.current.get(id)?.abort();await persist(next);for(const w of taskWaiters.current.get(id)||[])w.reject(new Error('Analysis cancelled.'));taskWaiters.current.delete(id);});
  const request=async<T,>(path:string,body:Record<string,unknown>,sourceIds:string[]=[]):Promise<T>=>{
    if(body.consent!==true||!['/api/biology/estimate-meal','/api/biology/parse-capture','/api/biology/coach','/api/skin/photos/observe'].includes(path))throw new Error('Explicit approval is required for this analysis.');
    const revision=sourceRevision(sourceIds),id=`request:${scope}:${fingerprint({path,body,revision,provider:app.settings?.aiProvider,model:app.settings?.aiModel})}`;
    const existing=stateRef.current.jobs[id];if(existing?.status==='completed')return existing.result as T;
    return new Promise<T>((resolve,reject)=>{taskWaiters.current.set(id,[...(taskWaiters.current.get(id)||[]),{resolve:value=>resolve(value as T),reject}]);void enqueue(async()=>{const next=structuredClone(stateRef.current);if(!next.jobs[id]||['failed','cancelled'].includes(next.jobs[id].status)){
      const now=new Date().toISOString(),eventId=`analysis:${id}`;if(!next.events.some(e=>e.id===eventId))next.events.push({id:eventId,type:'analysis.requested',userId:scope,occurredAt:now,createdAt:now,schemaVersion:1,source:{kind:'user'},payload:{date:dateOf(now),recordType:'approved-analysis'}});
      next.jobs[id]={id,key:path.includes('coach')?'AI Coach interpretation':path.includes('photos')?'AI photo interpretation':path.includes('parse-capture')?'AI capture interpretation':'AI food interpretation',eventId,status:'pending',attempts:0,nextAttemptAt:now,command:{path,body,sourceIds,sourceRevision:revision}};
    }await persist(next);}).catch(reject);});
  };
  useEffect(()=>{
    if(!ready||!navigator.onLine)return;
    const timer=setTimeout(()=>{for(const candidate of Object.values(stateRef.current.jobs).filter(j=>j.command&&j.status==='pending'&&Date.parse(j.nextAttemptAt)<=Date.now())){
      if(controllers.current.has(candidate.id))continue;
      const controller=new AbortController();controllers.current.set(candidate.id,controller);
      void (async()=>{
        try{
          if(sourceRevision(candidate.command!.sourceIds)!==candidate.command!.sourceRevision){await cancelJob(candidate.id);return;}
          await enqueue(async()=>{const next=structuredClone(stateRef.current),job=next.jobs[candidate.id];if(!job||job.status!=='pending')return;job.status='running';job.attempts++;await persist(next);});
          if(activeScope.current!==scope||stateRef.current.jobs[candidate.id]?.status!=='running')return;
          const response=await api<unknown>(candidate.command!.path,{method:'POST',body:JSON.stringify(candidate.command!.body),signal:controller.signal});
          if(sourceRevision(candidate.command!.sourceIds)!==candidate.command!.sourceRevision){await cancelJob(candidate.id);return;}
          await enqueue(async()=>{if(activeScope.current!==scope)return;const next=structuredClone(stateRef.current),job=next.jobs[candidate.id];if(!job||job.status==='cancelled')return;job.result=response;job.status='completed';job.error=undefined;if(job.command?.body.photo)delete job.command.body.photo;const now=new Date().toISOString();next.runs[`${job.eventId}:${job.key}:v1`]={id:`${job.eventId}:${job.key}:v1`,eventId:job.eventId,automationKey:job.key,version:1,status:'completed',startedAt:candidate.nextAttemptAt,completedAt:now,outputRefs:[job.id]};next.derived[job.id]={id:job.id,kind:'aiDraft',date:dateOf(now),value:response,eventId:job.eventId,automationKey:job.key,version:1,updatedAt:now,evidence:{ids:job.command?.sourceIds||[],explanation:'Only an explicitly approved request was sent. AI interpretation remains an editable draft.',quality:'low'}};await persist(next);for(const w of taskWaiters.current.get(job.id)||[])w.resolve(response);taskWaiters.current.delete(job.id);});
        }catch(e){
          if(activeScope.current!==scope)return;
          await enqueue(async()=>{const next=structuredClone(stateRef.current),job=next.jobs[candidate.id];if(!job||job.status==='cancelled')return;job.error=(e as Error).message;job.status=job.attempts>=3?'failed':'pending';job.nextAttemptAt=new Date(Date.now()+Math.min(60000,1000*2**job.attempts)).toISOString();await persist(next);if(job.status==='failed'){for(const w of taskWaiters.current.get(job.id)||[])w.reject(new Error(job.error));taskWaiters.current.delete(job.id);}});
        }finally{controllers.current.delete(candidate.id);}
      })();
    }},Math.max(0,Math.min(60000,...Object.values(state.jobs).filter(j=>j.command&&j.status==='pending').map(j=>Date.parse(j.nextAttemptAt)-Date.now()))));
    return()=>{clearTimeout(timer);};
  },[ready,state.jobs,clock,scope]);
  const setPreference=async(key:keyof AutomationPreferences,value:boolean|number)=>{await bio.save({id:'health-os-automation-settings',type:'nudgePreference',domain:'Today',name:'Health OS automation preferences',metadata:{...prefs,[key]:value}});};
  useEffect(()=>{
    for(const controller of controllers.current.values())controller.abort();controllers.current.clear();for(const waiters of taskWaiters.current.values())for(const w of waiters)w.reject(new Error('Analysis stopped after switching accounts.'));taskWaiters.current.clear();setPhotoDates([]);
    setReady(false);setState(emptyAutomationState());stateRef.current=emptyAutomationState();let cancelled=false;
    void enqueue(async()=>{const saved=await (await store()).get('state',scope);if(cancelled||activeScope.current!==scope)return;stateRef.current=saved||emptyAutomationState();for(const job of Object.values(stateRef.current.jobs))if(job.command&&job.status==='running'){job.status='pending';job.nextAttemptAt=new Date().toISOString();}setState(stateRef.current);setReady(true);});
    return()=>{cancelled=true;};
  },[scope]);
  useEffect(()=>{
    if(!ready||!bio.ready||!data)return;
    let cancelled=false;
    const timer=setTimeout(()=>{void enqueue(async()=>{
      if(cancelled||activeScope.current!==scope||!dataRef.current)return;
      // Reconciliation scans source history too; run the entire calculation off-thread.
      // The worker receives a cloned snapshot and the command queue prevents lost updates.
      const next=await drainDeferred(dataRef.current,stateRef.current,{rebuild:false});
      if(activeScope.current!==scope)return;
      await persist(next);setError('');
    });},75);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[data,ready,bio.ready,clock,scope]);
  useEffect(()=>{let cancelled=false;void (async()=>{const db=await store(),key=`${scope}:photo-dates`;const cached=await db.get('state',key);if(!cancelled&&cached)setPhotoDates(cached);try{const photos=await app.api.listCarePhotos();const dates=photos.map(p=>({id:p.id,date:p.date}));if(!cancelled){setPhotoDates(dates);await db.put('state',dates,key);}}catch{}})();return()=>{cancelled=true;};},[scope,clock,app.api]);
  useEffect(()=>{const timer=setInterval(()=>setClock(v=>v+1),60000);const online=()=>setClock(v=>v+1);window.addEventListener('online',online);window.addEventListener('focus',online);window.addEventListener('health-os-source-changed',online);return()=>{clearInterval(timer);window.removeEventListener('online',online);window.removeEventListener('focus',online);window.removeEventListener('health-os-source-changed',online);};},[]);
  // Draft events are audited without treating typed suggestions as performed sets.
  const draftSignature=app.tracker?`${app.tracker.id}:${app.tracker.logs.length}`:'';
  useEffect(()=>{if(!ready||!app.tracker)return;const draft=app.tracker,now=new Date().toISOString();void enqueue(async()=>{if(activeScope.current!==scope)return;const next=structuredClone(stateRef.current),id=`draft:${draftSignature}`;if(next.events.some(e=>e.id===id))return;next.events.push({id,type:draft.logs.length?'workout.set_logged':'workout.started',userId:scope,occurredAt:now,createdAt:now,schemaVersion:1,source:{kind:'user',recordId:draft.id},payload:{date:draft.date,revision:String(draft.logs.length)}});await persist(next);});},[draftSignature,ready,scope]);
  return <Context.Provider value={{state,ready,error,preferences:prefs,rebuild,retry,resolve,setPreference,request,cancelJob}}>{children}</Context.Provider>;
}
export function useDerived<T>(id:string){const {state}=useAutomations();return state.derived[id]?.value as T|undefined;}
export const todayDerived=(state:AutomationState,kind:string)=>Object.values(state.derived).filter(d=>d.kind===kind&&d.date===dateOf(new Date().toISOString()));
