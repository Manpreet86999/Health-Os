import { takeRecordSearch } from '../lib/search-handoff';
import { matchesSearch } from '../../shared/terminology';
import { useEffect } from 'react';
import { useAppointments } from '../lib/use-appointments';
import { lazy, Suspense, useRef, useState } from 'react';
import { BIO_DOMAINS, dateOf, type BioRecord } from '../../shared/biology';
import { viewManifest } from '../lib/os-navigation';
import { useBiologicalData } from '../lib/use-biological-data';
import { useDraftState } from '../lib/use-draft';
import { useQuickLog } from './QuickLog';
import { Modal } from './Modal';
import { StatePanel } from './DesignSystem';

const ExerciseDetail=lazy(()=>import('./ExerciseDetailModal').then(module=>({default:module.ExerciseDetailModal})));
export function SearchWorkspace() {
  const {app}=useBiologicalData();
  return (<RecordedSearchWorkspace/>);
}
function RecordedSearchWorkspace() {
  const {app,stored}=useBiologicalData(),quick=useQuickLog(),input=useRef<HTMLInputElement>(null),results=useRef<HTMLDivElement>(null);
  const draft=useDraftState('search:filters',{query:'',domain:'All'}),{query,domain}=draft.value;
  const health=useAppointments();
  useEffect(()=>{const pending=takeRecordSearch();if(pending!==undefined)draft.setValue(previous=>({...previous,query:pending,domain:'All'}));const update=(event:Event)=>{takeRecordSearch();draft.setValue(previous=>({...previous,domain:'All',query:String((event as CustomEvent).detail||'')}));};window.addEventListener('health-os-search-query',update);return()=>window.removeEventListener('health-os-search-query',update);},[draft.setValue]);
  const [selected,setSelected]=useState<BioRecord|null>(null),[exercise,setExercise]=useState<{id:string;name:string}|null>(null);
  const matches=(text:string)=>matchesSearch(query,text);
  const destinations=viewManifest.filter(view=>(domain==='All'||view.section===domain)&&matches(`${view.label} ${view.primary} ${view.section}`));
  const records=stored.filter(row=>(domain==='All'||row.domain===domain)&&matches(`${row.name} ${row.type} ${row.metadata.notes||''}`)).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,100);
  const exercises=domain==='All'||domain==='Train'?app.db!.exercises.filter(row=>matches(`${row.name} ${row.muscles.join(' ')}`)).slice(0,30):[];
  const legacy=[
    ...app.db!.sessions.map(row=>({id:'session:'+row.id,title:row.name||row.dayTitle,domain:'Train',detail:`${row.date} · Workout · ${row.logs.map(log=>log.name).join(', ')}`,open:()=>app.setPage('Records')})),
    ...app.db!.programs.map(row=>({id:'program:'+row.id,title:row.name,domain:'Train',detail:'Saved program',open:()=>app.setPage('Programs')})),
    ...app.db!.targets.map(row=>({id:'target:'+row.id,title:row.name,domain:'Today',detail:'Goal',open:()=>app.setPage('Targets')})),
    ...app.skin.products.map(row=>({id:'product:'+row.id,title:row.name,domain:'Care',detail:`${row.brand} · Care product`,open:()=>app.setPage('SkinProducts')})),
    ...(health.data?.appointments||[]).map(row=>({id:'appointment:'+row.id,title:row.title,domain:'Health',detail:`${row.clinician} · ${row.status} · Appointment`,open:()=>app.setPage('Health',`Appointment:${row.id}`)})),
    ...(health.data?.reports||[]).map(row=>({id:'report:'+row.id,title:row.title,domain:'Health',detail:`${row.collectedAt.slice(0,10)} · ${row.status} · Report`,open:()=>app.setPage('Health','Medical Intelligence')})),
  ].filter(row=>(domain==='All'||row.domain===domain)&&matches(`${row.title} ${row.detail}`)).slice(0,100);
  const set=(patch:Partial<typeof draft.value>)=>draft.setValue(previous=>({...previous,...patch}));
  return <section className="health-card stack"><header><p className="bio-eyebrow">SEARCH HEALTH OS</p><h1>Find a page or record</h1><p>Search destinations, your recorded history, and exercises.</p></header>
    <label className="form-field">Search<input ref={input} className="input bio-search" value={query} placeholder="Appointments, meals, symptoms, exercises…" onChange={event=>set({query:event.target.value})} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();results.current?.querySelector<HTMLButtonElement>('button')?.focus();}}}/></label>
    <label className="form-field">Domain<select className="input" value={domain} onChange={event=>set({domain:event.target.value})}>{['All',...BIO_DOMAINS,'Search','Sync','Settings','Profile'].map(name=><option key={name}>{name}</option>)}</select></label>
    {!query.trim()?<p>Try a destination such as “Appointments”, or a name from your history. Use the down arrow to explore results.</p>:<><p role="status">{destinations.length} destinations · {records.length+legacy.length} recorded entries · {exercises.length} exercises</p><div ref={results} className="stack" onKeyDown={event=>{const buttons=Array.from(results.current?.querySelectorAll<HTMLButtonElement>('button')||[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(event.key==='Escape')input.current?.focus();}}>
      {!!destinations.length&&<section aria-label="Destinations"><h2>Destinations</h2>{destinations.map(view=><button className="bio-search-result" key={view.identity} onClick={()=>app.setPage(view.page,view.panel)}><span>{view.section}</span><strong>{view.label}</strong><small>{view.primary}</small></button>)}</section>}
      {!!records.length&&<section aria-label="Recorded history"><h2>Recorded history</h2>{records.map(row=><button className="bio-search-result" key={row.id} onClick={()=>setSelected(row)}><span>{row.domain}</span><strong>{row.name}</strong><small>{dateOf(row.timestamp)} · {row.type}</small></button>)}</section>}
      {!!legacy.length&&<section aria-label="Workouts, goals and connected records"><h2>Workouts, goals & connected records</h2>{legacy.map(row=><button className="bio-search-result" key={row.id} onClick={row.open}><span>{row.domain}</span><strong>{row.title}</strong><small>{row.detail}</small></button>)}</section>}
      {!!exercises.length&&<section aria-label="Exercises"><h2>Exercises</h2>{exercises.map(row=><button className="bio-search-result" key={row.id} onClick={()=>setExercise(row)}><span>Train</span><strong>{row.name}</strong><small>{row.muscles.join(', ')}</small></button>)}</section>}
      {!destinations.length&&!records.length&&!legacy.length&&!exercises.length&&<StatePanel title="No matches yet" body="Try fewer words, a different spelling, or another domain." action={<button className="btn btn-soft" onClick={()=>{set({domain:'All'});input.current?.focus();}}>Search all domains</button>}/>}
    </div></>}
    {exercise&&<Suspense fallback={<p role="status">Loading exercise…</p>}><ExerciseDetail exerciseName={exercise.name} exerciseId={exercise.id} onClose={()=>setExercise(null)}/></Suspense>}
    <Modal open={!!selected} title={selected?.name||'Record'} onClose={()=>setSelected(null)}>{selected&&<div className="stack"><p>{new Date(selected.timestamp).toLocaleString()} · {selected.domain}</p><p>{selected.value===undefined?'Value not recorded':`${selected.value} ${selected.unit}`}</p><p>Source: {selected.source} · {selected.quality}</p><p>{String(selected.metadata.notes||'')}</p><details><summary>Complete recorded details</summary><pre className="bio-json">{JSON.stringify(selected.metadata,null,2)}</pre></details><button className="btn btn-hot" onClick={()=>{const row=selected;setSelected(null);quick.open(row.type,row,dateOf(row.timestamp));}}>Edit entry</button><button className="btn btn-soft" onClick={()=>setSelected(null)}>Back to results</button></div>}</Modal>
  </section>;
}
