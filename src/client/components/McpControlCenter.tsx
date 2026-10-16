import {SettingsToggle} from './SettingsToggle';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useCloudAccount } from '../state/CloudAccountContext';
import { useBiologicalData } from '../lib/use-biological-data';
import {useHeosExecutor} from '../lib/use-heos-executor';
import { HostedBridge } from '../lib/mcp-hosted-bridge';
import { adaptWorkoutExercises } from '../../shared/workout-adaptation';
import { fingerprint } from '../../shared/automation-model';
import {actionDefinitions,retainedActionIds,isRetainedMcpAction,mcpVersion,type ActionId} from '../../shared/mcp-contracts';
import {cloudSupports,executionClass} from '../../shared/mcp-execution';
import {androidLayout} from '../lib/android-layout';
import {LocalHeosTools} from './LocalHeosTools';
type Control={controls:{enabled:number;write_enabled:number};clients:any[];pending:any[];audit:any[];executors?:{type:string;online:boolean;version:string}[];executionAudit?:any[];cloudSupportedTools?:number;deviceRequiredTools?:number;timeZone?:string};
const Context=createContext<{status:Control|null;error:string;endpoint:string;online:boolean;request:(path:string,body?:unknown)=>Promise<any>;refresh:()=>Promise<void>}>(null!);
export function McpProvider({children}:{children:ReactNode}){
  const cloud=useCloudAccount(),state=useBiologicalData(),executor=useHeosExecutor();
  const [status,setStatus]=useState<Control|null>(null),[error,setError]=useState(''),[endpoint,setEndpoint]=useState(''),[online,setOnline]=useState(false);
  const [network,setNetwork]=useState(navigator.onLine);
  useEffect(()=>{const changed=()=>setNetwork(navigator.onLine);window.addEventListener('online',changed);window.addEventListener('offline',changed);return()=>{window.removeEventListener('online',changed);window.removeEventListener('offline',changed);};},[]);
  const current=useRef({cloud,state,executor});current.current={cloud,state,executor};
  const liveBridge=useRef<HostedBridge|undefined>(undefined);
  useEffect(()=>{let alive=true;fetch('/mcp-config.json',{cache:'no-cache'}).then(r=>r.json()).then(config=>{
    if(!config.url)return;const url=new URL(config.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Invalid hosted MCP configuration.');if(alive)setEndpoint(url.origin);
  }).catch(()=>{if(alive)setError('Hosted MCP configuration could not be loaded.');});return()=>{alive=false;};},[]);
  const request=async(path:string,body:unknown={})=>{
    if(!navigator.onLine)throw new Error('Remote MCP reconnects online. On-device tools remain available.');
    if(!endpoint)throw new Error('Hosted MCP is awaiting deployment.');
    const session=await current.current.cloud.getSession(),res=await fetch(`${endpoint}/${path.startsWith('bridge/')?path:'control/'+path}`,{method:'POST',headers:{Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)}),result=await res.json();
    if(!res.ok||result.error)throw new Error(result.error?.message||'Health OS connection failed.');return result;
  };
  const refresh=async()=>{const owner=current.current.cloud.user?.id;try{const result=await request('status');if(owner!==current.current.cloud.user?.id)return;const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(result.timeZone&&result.timeZone!==zone)await request('preferences',{timeZone:zone});setStatus({...result,timeZone:zone});setError('');}catch(e){if(owner===current.current.cloud.user?.id)setError((e as Error).message);}};
  useEffect(()=>{setStatus(null);setOnline(false);if(cloud.user&&endpoint&&network)void refresh();},[cloud.user?.id,endpoint,network]);
  useEffect(()=>{
    if(!network||!cloud.user||!endpoint||!status?.controls.enabled||!state.bio.ready||!state.app.unlocked||!state.app.db)return;
    const owner=cloud.user.id;let stopped=false,bridge:HostedBridge|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    const connect=async()=>{
      if(stopped||current.current.cloud.user?.id!==owner)return;
      try{await navigator.locks.request(`health-os-hosted-mcp-${owner}`,{ifAvailable:true},async lock=>{
        if(!lock||stopped)return;
        const ticket=await request('bridge/ticket');if(stopped)return;
        if(ticket.userId!==owner)throw new Error('Account changed.');
        const url=new URL(endpoint+'/bridge/ws');url.protocol='wss:';url.searchParams.set('user',owner);url.searchParams.set('ticket',ticket.ticket);
        bridge=new HostedBridge(new WebSocket(url),async job=>{
          if(stopped||current.current.cloud.user?.id!==owner)throw new Error('Account changed.');
          return current.current.executor.executeMcp(job.action,job.input,job.receiptId,{userId:owner,idempotencyKey:job.receiptId,explicitlyRequested:true,approved:true});
        },data=>{if(!stopped){setStatus(data);setError('');}},connected=>{if(!stopped)setOnline(connected);},()=>({executorId:localStorage.getItem('health-os-device-id')||'web',type:androidLayout?'android':'web',version:mcpVersion,capabilities:retainedActionIds() as ActionId[],unsyncedChanges:current.current.state.bio.records.some(r=>r.syncState==='pending')||!!current.current.state.app.readWorkout(),activeWorkoutId:current.current.state.app.readWorkout()?.id||null}));
        liveBridge.current=bridge;
        await bridge.closed;
      });}catch(e){if(!stopped)setError((e as Error).message);}
      if(!stopped)timer=setTimeout(()=>void connect(),5000);
    };
    void connect();return()=>{stopped=true;if(timer)clearTimeout(timer);bridge?.close();liveBridge.current=undefined;setOnline(false);};
  },[cloud.user?.id,endpoint,status?.controls.enabled,state.bio.ready,state.app.unlocked,!!state.app.db,network]);
  useEffect(()=>{const timer=setTimeout(()=>liveBridge.current?.updateExecutor(),150);return()=>clearTimeout(timer);},[state.bio.records,state.app.tracker]);
  return <Context.Provider value={{status,error,endpoint,online,request,refresh}}>{children}</Context.Provider>;
}
export function McpControlCenter(){
  const {status,error,endpoint,online,request,refresh}=useContext(Context),{app}=useBiologicalData(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const act=async(path:string,body:unknown)=>{setBusy(true);setMessage('');try{await request(path,body);await refresh();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
  const enabled=!!status?.controls.enabled,writes=!!status?.controls.write_enabled;
  const approvalPreview=(p:any)=>{if(p.action!=='training.apply_adaptation_plan')return null;const input=JSON.parse(p.input),draft=app.readWorkout();if(!draft||fingerprint(draft)!==input.stateToken)return <p role="alert">Workout changed. Reject this plan and request a new preview.</p>;return <div><p>Current workout only. Your saved program stays intact.</p>{adaptWorkoutExercises(draft.exercises).map((e,i)=><p key={i}>{e.name}: {draft.exercises[i].vol} → {e.vol}; RIR {draft.exercises[i].rirTarget||2} → {e.rirTarget}</p>)}</div>;};
  const cloudOnline=!!status?.executors?.find(e=>e.type==='cloud')?.online;
  return <div className="stack" style={{gap:20}}><h2>HEOS MCP</h2><p>Version {mcpVersion} · {retainedActionIds().length} capabilities for nutrition, training, sleep, recovery, body, goals, habits and reports.</p><LocalHeosTools/><p>Authorized cloud reads and supported logs work while your apps are closed. Keep a compatible device open for local workouts, drafts and approvals.</p>
    <div className="stack" aria-label="MCP executors"><strong>Remote MCP · {status?'Connected':'Checking connection'}</strong><span>Cloud Executor · {cloudOnline?'Online':'Reconnect a client to authorize cloud access'}</span><span>Web Bridge · {online?'Online':'Offline'}</span><span>Android Bridge · {androidLayout&&online?'Online · 3.1':status?.executors?.some(e=>e.type==='android'&&e.online)?'Online':'Offline'}</span><small>{status?.cloudSupportedTools??retainedActionIds().filter(id=>cloudSupports(id as ActionId)).length} cloud-supported tools · {status?.deviceRequiredTools??retainedActionIds().filter(id=>executionClass(id as ActionId)==='DEVICE_REQUIRED').length} device-required tools</small></div>
    <div className="stack"><strong>{!endpoint?'Hosted connection awaiting deployment':online?'Health OS connected':enabled?'Connecting Health OS…':'MCP access is off'}</strong>
    {endpoint?<><label className="stack">HEOS MCP URL<input className="input" readOnly value={endpoint+'/mcp'}/></label><button className="btn btn-soft" onClick={()=>void navigator.clipboard.writeText(endpoint+'/mcp').then(()=>setMessage('MCP URL copied.'))}>Copy MCP URL</button><p>In ChatGPT, add a custom MCP connection using this URL, choose OAuth, and sign in to Health OS. Review the access you grant.</p></>:<p>Your hosting setup is being completed. No tunnel, API key or terminal is required to use the hosted connection.</p>}
    {error&&<p role="status">{error}</p>}<button className="btn btn-soft" disabled={!endpoint||busy} onClick={()=>void refresh()}>Check connection</button></div>
    <SettingsToggle label="Enable MCP read access" description="Let authorized clients read the data you grant them." disabled={!status||busy} checked={enabled} onChange={checked=>void act('settings',{enabled:checked,writeEnabled:writes})}/>
    <SettingsToggle label="Allow writes granted to connected clients" description="Changes still follow your client permissions and approvals." disabled={!status||busy} checked={writes} onChange={checked=>void act('settings',{enabled,writeEnabled:checked})}/>
    <button className="btn btn-soft" disabled={!status||busy} onClick={()=>void act('settings',{enabled:false,writeEnabled:false})}>Disable all MCP access</button>
    <hr/><h3>Connected clients</h3><p>Reconnect existing clients once and choose cloud access to use synchronized data while apps are closed. Your selected scopes and write switch still apply.</p>{status?.clients.length?status.clients.map(c=><div className="stack" key={c.id}><strong>{c.name} · {c.enabled&&c.expires_at>Date.now()?'Enabled':'Revoked or expired'}</strong><small>{JSON.parse(c.scopes).join(', ')} · writes {c.write_enabled?'allowed':'disabled'} · cloud {c.cloud_authorized?'authorized':'not authorized'}</small><button className="btn btn-soft" disabled={busy||!c.enabled} onClick={()=>void act('revoke',{id:c.id})}>Revoke</button></div>):<p>Connect from ChatGPT to add a client.</p>}
    <hr/><h3>Pending approvals</h3>{status?.pending.length?status.pending.map(p=><div className="stack" key={p.id}><strong>{p.action}</strong><p>Client: {status.clients.find(c=>c.id===p.client_id)?.name||'Connected client'}</p>{approvalPreview(p)}<pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(JSON.parse(p.input),null,2)}</pre><small>Expires {new Date(p.expires_at).toLocaleTimeString()}</small><div className="row"><button className="btn btn-hot" disabled={busy} onClick={()=>void act('approve',{id:p.id,approved:true})}>Approve & apply</button><button className="btn btn-soft" disabled={busy} onClick={()=>void act('approve',{id:p.id,approved:false})}>Reject</button></div></div>):<p>No changes waiting for approval.</p>}
    <hr/><h3>Recent actions</h3>{status?.audit.map((a,i)=><p key={i}>{a.action} · {a.status} · {status.clients.find(c=>c.id===a.client_id)?.name||'You'} · {new Date(a.at).toLocaleString()}</p>)}<p className="subtle">Changes use your normal Health OS records and receipts. You can revoke a client or disable MCP at any time.</p>{message&&<p role="alert">{message}</p>}
    {!!status?.executionAudit?.length&&<details><summary>Executor activity</summary>{status.executionAudit.map(a=><p key={a.request_id}>{a.action} · {a.executor} · {a.status} · {a.latency_ms??0} ms · {a.approval_state}</p>)}</details>}
  </div>;
}

