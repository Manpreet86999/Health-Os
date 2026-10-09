import { useState } from 'react';
import { useAutomations } from '../state/AutomationContext';
import { Why } from './AutomationCenter';
import { downloadArtifact } from '../lib/health-os-export';
import { dateOf } from '../../shared/biology';

export function CachedReports(){
  const {state}=useAutomations(),today=dateOf(new Date().toISOString());
  const reports=Object.values(state.derived).filter(r=>r.kind==='report'&&r.date===today);
  if(!reports.length)return null;
  return <section className="glass card stack" aria-label="Automatic reports"><h2>Already prepared for you</h2><p className="subtle">These snapshots update in the background when your records change.</p>{reports.map(r=>{const report=r.value as {report_type:string;period_start:string;period_end:string;generated_at:string;data_snapshot:Record<string,unknown>;rendered_output:string};return <details className="flow-details" key={r.id}><summary>{report.report_type} · {report.period_start} to {report.period_end}</summary><p className="subtle">Prepared {new Date(report.generated_at).toLocaleString()}</p><pre className="automation-snapshot">{JSON.stringify(report.data_snapshot,null,2)}</pre><div className="row wrap"><button className="btn btn-soft" onClick={()=>downloadArtifact('health-os-automatic-report.json',JSON.stringify(report,null,2))}>Download snapshot</button><button className="btn btn-soft" onClick={()=>downloadArtifact('health-os-automatic-report.html',report.rendered_output,'text/html')}>Printable report</button></div><Why result={r}/></details>;})}</section>;
}
export function AutomaticInsights(){
  const {state}=useAutomations(),result=state.derived.insights;
  const rows=(result?.value||[]) as {id:string;text:string;category:string;sample_size:number;confidence:string;time_window:string;comparison?:{median:number;low:number;high:number;lowerCount:number;higherCount:number;r:number}}[];
  if(!rows.length)return null;
  return <section className="glass card stack" aria-label="Automatic insights"><h2>From your recent records</h2>{rows.map(r=><article key={r.id}><h3>{r.category}</h3><p>{r.text}</p><p className="subtle">{r.sample_size} observations · {r.time_window} · {r.confidence} confidence</p>{r.comparison&&<details><summary>Compare groups & methodology</summary><p>Protein ≥{r.comparison.median.toFixed(0)} g: energy {r.comparison.high.toFixed(1)}/10 ({r.comparison.higherCount} days).</p><p>Below {r.comparison.median.toFixed(0)} g: energy {r.comparison.low.toFixed(1)}/10 ({r.comparison.lowerCount} days).</p><p>At least 28 matched days and 10 days per group; direction must persist in both chronological halves. Correlation {r.comparison.r.toFixed(2)}. Group uncertainty intervals must be separated. Confounding, incomplete diaries and self-report can affect this observation. This does not establish causation.</p></details>}</article>)}<Why result={result}/></section>;
}
export function CachedBaselines(){
  const {state}=useAutomations(),[window,setWindow]=useState(28),[query,setQuery]=useState('');
  const all=Object.values(state.derived).filter(r=>r.kind==='baseline'&&(r.value as {window:number}).window===window);
  if(!all.length)return null;
  const rows=all.filter(r=>(r.value as {metric:string}).metric.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(a.value as {metric:string}).metric.localeCompare((b.value as {metric:string}).metric));
  const observed=rows.filter(r=>(r.value as {sample_count:number;value:number|null}).sample_count>0&&(r.value as {value:number|null}).value!==null);
  const missing=rows.filter(r=>!observed.includes(r));
  return <section className="glass card stack" aria-label="Automatic baselines"><h2>Personal baselines</h2><div className="flow-choices">{[7,14,28,90].map(n=><button key={n} aria-pressed={n===window} onClick={()=>setWindow(n)}>{n} days</button>)}</div><label className="form-field"><span>Find a baseline signal</span><input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search all metrics"/></label>{!rows.length&&<p className="subtle">No signals match this search.</p>}{rows.length>0&&!observed.length&&<p className="subtle">No observed baselines in this period. Your logged records build these comparisons.</p>}<div className="baseline-list">{observed.map(r=>{const b=r.value as {metric:string;value:number;dispersion:number|null;sample_count:number;quality:string};return <article className="automation-baseline" key={r.id}><h3>{b.metric}</h3><strong>{b.metric==='Sleep timing'?`${String(Math.floor(b.value/60)).padStart(2,'0')}:${String(Math.round(b.value)%60).padStart(2,'0')}`:Number(b.value.toFixed(1))}</strong><p className="subtle">{b.sample_count} observed days · {b.quality} confidence · dispersion {b.dispersion===null?'—':b.dispersion.toFixed(1)}</p><Why result={r}/></article>;})}</div>{missing.length>0&&<details><summary>{missing.length} signals without observations</summary><p className="subtle">{missing.map(r=>(r.value as {metric:string}).metric).join(' · ')}</p></details>}</section>;
}

export function AnalysisJobs(){
  const automation=useAutomations(),jobs=Object.values(automation.state.jobs).filter(j=>j.command&&['pending','running','failed'].includes(j.status));
  if(!jobs.length)return null;
  return <div className="stack" aria-label="Approved analysis queue">{jobs.slice(-3).map(j=><div key={j.id} className="automation-inbox-item"><strong>{j.key} · {j.status==='pending'?'Queued; resumes online':j.status}</strong>{j.error&&<p role="status">{j.error}</p>}<p className="subtle">The approved request is kept locally. Results remain drafts until you review them.</p><button className="btn btn-soft" onClick={()=>void automation.cancelJob(j.id)}>Cancel analysis</button></div>)}</div>;
}
