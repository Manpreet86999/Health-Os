import { useEffect, useState } from 'react';
import { workerStatus, workerJobs, workerJob, cancelWorkerJob, submitWorkerJob } from '../lib/local-worker';
import { downloadArtifact } from '../lib/health-os-export';
import type { WorkerJob } from '../../shared/worker-jobs';

export function LocalWorkerSettings(){
  const [workers,setWorkers]=useState<any[]>([]),[jobs,setJobs]=useState<WorkerJob[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){try{const [status,history]=await Promise.all([workerStatus(),workerJobs()]);setWorkers(status.workers);setJobs(history);setError('');}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>clearInterval(timer);},[]);
  async function act(work:()=>Promise<unknown>){setBusy(true);try{await work();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function download(metadata:WorkerJob){
    const job=await workerJob(metadata.id);
    if(job.result?.base64&&job.result?.mime){const binary=atob(job.result.base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:job.result.mime}));const a=document.createElement('a');a.href=url;a.download=job.result.name||'health-os-artifact';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    else downloadArtifact(`health-os-${job.operation}-${job.id}.json`,JSON.stringify(job.result,null,2));
  }
  return <section className="stack" aria-label="Local worker"><hr/><h3>Local worker</h3><p>Supabase stores your records. Your own computer performs advanced analysis, OCR and speech recognition. Each person signs their worker in with their own Health OS account.</p>
    <details><summary>Set up this computer</summary><p>In the Health OS project folder, run these commands in a terminal:</p><pre>npm install{'\n'}npm run worker:setup{'\n'}npm run worker:login{'\n'}npm run worker:start</pre><p>Sign in with the same Health OS account you use in this app. The login prompt hides your password. Keep the worker running for new analysis. Voice additionally requires <code>npm run voice:setup</code>, followed by a worker restart. The worker opens no inbound port.</p></details>
    <div role="status">{workers.some(w=>w.online)?'Your worker is online':'Your worker is offline · queued analysis waits for your computer'}</div>
    <p role="status">{workers.some(w=>w.online&&w.capabilities.voice?.available)?'Voice transcription is ready':workers.some(w=>w.online)?'Voice transcription needs setup on your online worker. Run npm run voice:setup on that computer, then restart the worker.':'Voice transcription needs your personal worker online. Sign in with this Health OS account and keep the worker running.'}</p>
    {workers.map(w=><details key={w.id}><summary>{w.name} · {w.online?'Online':'Offline'}</summary><p>Last seen: {new Date(w.updated_at).toLocaleString()}</p><pre className="bio-json">{JSON.stringify(w.capabilities,null,2)}</pre></details>)}
    <div className="row wrap"><button className="btn btn-soft" disabled={busy} onClick={()=>void refresh()}>Refresh worker status</button><button className="btn btn-soft" disabled={busy} onClick={()=>void act(()=>submitWorkerJob('research.statistics',{values:[1,2,3,4,5]}))}>Run synthetic connection check</button></div>
    {error&&<p role="alert">{error}</p>}
    <h4>Recent analysis jobs</h4>{jobs.length===0&&<p>No analysis jobs yet.</p>}
    {jobs.map(job=><article className="card stack" key={job.id}><strong>{job.operation} · {job.status}</strong><span className="subtle">{new Date(job.created_at).toLocaleString()} · attempt {job.attempts}</span>{job.error&&<p role="alert">{job.error}</p>}<div className="row wrap">{['queued','running'].includes(job.status)&&<button className="btn btn-soft" disabled={busy} onClick={()=>void act(()=>cancelWorkerJob(job.id))}>Cancel job</button>}{job.status==='completed'&&<button className="btn btn-soft" disabled={busy} onClick={()=>void act(()=>download(job))}>Download result</button>}</div></article>)}
    <p className="subtle">Completed job inputs are removed. Recent results are temporary; download results you want to keep. Cancelling prevents a result from being accepted, although processing already running may finish on the computer.</p>
  </section>;
}
