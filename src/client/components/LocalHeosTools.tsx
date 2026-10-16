import {useEffect,useRef,useState} from 'react';
import {useBiologicalData} from '../lib/use-biological-data';
import {useCloudAccount} from '../state/CloudAccountContext';
import {useHeosExecutor} from '../lib/use-heos-executor';
import {actionDefinitions,retainedActionIds,isRetainedMcpAction,mcpVersion,type ActionId} from '../../shared/mcp-contracts';
const reads=Object.entries(actionDefinitions).filter(([id,d])=>isRetainedMcpAction(id)&&d.risk==='R0'&&d.schema.safeParse({}).success).map(([id])=>id as ActionId);
const logs={water:{action:'nutrition.log_water',label:'Water (mL)'},sleep:{action:'sleep.log_session',label:'Sleep (hours)'},weight:{action:'body.log_weight',label:'Weight (kg)'},soreness:{action:'recovery.log_soreness',label:'Soreness (0–10)'}} as const;
export function LocalHeosTools(){
 const cloud=useCloudAccount(),{app,stored}=useBiologicalData(),executor=useHeosExecutor();
 const scope=`${cloud.savedConfig?.url}|${cloud.user?.id}`,scopeRef=useRef(scope);scopeRef.current=scope;
 const [action,setAction]=useState<ActionId>('health.get_today'),[kind,setKind]=useState<keyof typeof logs>('water'),[amount,setAmount]=useState(''),[area,setArea]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<any>(),[error,setError]=useState('');
 const worker=useRef<Worker|undefined>(undefined),request=useRef(''),retry=useRef<{body:string;key:string}|undefined>(undefined);
 useEffect(()=>{const instance=new Worker(new URL('../lib/mcp-local-worker.ts',import.meta.url),{type:'module'});worker.current=instance;instance.onmessage=e=>{if(e.data.id!==request.current||scopeRef.current!==scope)return;setResult(e.data.result);setBusy(false);};instance.onerror=()=>{setError('The local read could not finish. Your saved data is intact.');setBusy(false);};return()=>{request.current='';instance.terminate();};},[scope]);
 function read(){if(!app.db||!cloud.user||busy)return;setError('');setResult(undefined);setBusy(true);const id=crypto.randomUUID();request.current=id;worker.current?.postMessage({id,action,input:{},data:{scope,userId:cloud.user.id,db:app.db,skin:app.skin,records:stored.filter(r=>r.userId===cloud.user!.id),activeWorkout:app.readWorkout()}});}
 async function log(){if(!cloud.user||busy)return;const owner=scope;setBusy(true);setError('');try{
  const value=Number(amount);if(!amount||!Number.isFinite(value))throw new Error('Enter the amount you measured or reported.');
  const input=kind==='water'?{amount:value,unit:'mL'}:kind==='sleep'?{hours:value}:kind==='weight'?{weight:value,unit:'kg'}:{severity:value,area:area.trim()};
  const definition=logs[kind],body=JSON.stringify([definition.action,input]);if(retry.current?.body!==body)retry.current={body,key:crypto.randomUUID()};const key=retry.current.key;
  const response=await executor.executeMcp(definition.action,{...input,idempotencyKey:key},key,{userId:cloud.user.id,idempotencyKey:key,explicitlyRequested:true,approved:false});
  if(scopeRef.current!==owner)return;setResult(response);if((response as any).success){retry.current=undefined;setAmount('');}
 }catch(e){if(scopeRef.current===owner)setError((e as Error).message);}finally{if(scopeRef.current===owner)setBusy(false);}}
 return <section className="health-panel local-heos-tools stack" aria-label="On-device HEOS tools"><h3>HEOS {mcpVersion} · on this device</h3><p className="subtle">Read saved context and log your own observations offline. Pending records use normal account sync when connected. Remote AI clients require internet.</p>
 <label>Read saved context<select className="input" value={action} onChange={e=>setAction(e.target.value as ActionId)}>{reads.map(id=><option key={id} value={id}>{id.replaceAll('_',' ').replace('.',' · ')}</option>)}</select></label><button className="btn btn-soft" disabled={busy||!app.db} onClick={read}>Read on device</button>
 <details><summary>Log an observation</summary><label>Observation<select className="input" value={kind} onChange={e=>{setKind(e.target.value as keyof typeof logs);setAmount('');}}>{Object.entries(logs).map(([key,def])=><option value={key} key={key}>{def.label}</option>)}</select></label><label>{logs[kind].label}<input className="input" type="number" step="any" value={amount} onChange={e=>setAmount(e.target.value)}/></label>{kind==='soreness'&&<label>Muscle area<input className="input" value={area} onChange={e=>setArea(e.target.value)}/></label>}<button className="btn btn-hot" disabled={busy||!amount} onClick={()=>void log()}>Save observation on device</button></details>
 {busy&&<p role="status">Reading or saving…</p>}{error&&<p role="alert">{error}</p>}{result&&<div role="status"><strong>{result.success?'Completed on this device':'Review needed'}</strong><pre className="local-heos-result">{JSON.stringify(result.data||result.error||result.summary,null,2)}</pre></div>}</section>;
}
