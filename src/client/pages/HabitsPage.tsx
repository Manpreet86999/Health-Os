import {useState} from 'react';
import {useBiologicalData} from '../lib/use-biological-data';
import {dateOf} from '../../shared/biology';
import {MetricRing} from '../components/VisualMetrics';
import {StatePanel} from '../components/DesignSystem';
export function HabitsPage(){
 const {bio,stored,selectedDate:date}=useBiologicalData(),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const habits=stored.filter(r=>r.type==='habit');
 const completion=(id:string)=>stored.find(r=>r.type==='habitDone'&&r.metadata.parentId===id&&dateOf(r.timestamp)===date);
 const done=habits.filter(h=>completion(h.id)?.metadata.completed!==false&&!!completion(h.id)).length;
 async function run(work:()=>Promise<unknown>){setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="flow-workspace stack"><header className="bio-page-head"><span className="hos-eyebrow">SMALL STEPS, EVERY DAY</span><h1>Habits</h1><p className="subtle">A routine that grows with you.</p></header><section className="hos-habit-hero"><div><span className="hos-eyebrow">{date}</span><h2>{habits.length?'Keep showing up.':'Start small. Make it yours.'}</h2><p>{habits.length?`${done} of ${habits.length} habits complete`:'Choose one thing you’d like to do a little more often.'}</p></div><MetricRing value={habits.length?done:null} max={habits.length||1} display={habits.length?`${done}/${habits.length}`:'—'} label="Complete" size={140}/></section>
 {habits.map(h=>{const entry=completion(h.id),checked=!!entry&&entry.metadata.completed!==false;return <label className="flow-toggle hos-habit-row" data-complete={checked} key={h.id}><input type="checkbox" checked={checked} disabled={busy} onChange={e=>{const completed=e.target.checked;void run(()=>bio.save({id:entry?.id||`habit-${h.id}-${date}`,type:'habitDone',domain:'Today',name:h.name,timestamp:new Date(`${date}T12:00:00`).toISOString(),metadata:{parentId:h.id,completed}}));}}/><span>{h.name}</span></label>;})}
 {!habits.length&&<StatePanel title="Your routine starts here" body="Add your first habit below, then check it off when you’re done."/>}
 <form className="glass card stack" onSubmit={e=>{e.preventDefault();void run(async()=>{await bio.save({type:'habit',domain:'Today',name:name.trim(),metadata:{}});setName('');});}}><h2>A new daily habit</h2><label>Habit<input className="input" required maxLength={200} value={name} placeholder="What would you like to make time for?" onChange={e=>setName(e.target.value)}/></label><button className="btn btn-hot" disabled={busy||!name.trim()}>Add habit</button></form>{error&&<p role="alert">{error}</p>}</div>;
}
