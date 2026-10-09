import { useMemo, useState } from 'react';
import { useBiologicalData } from '../lib/use-biological-data';
import { useQuickLog } from './QuickLog';
import { sleepDurationHours, dateOf } from '../../shared/biology';
import { shiftDay } from '../../shared/biological-intelligence';
import { SignalChart } from './SignalChart';
import { TrendInterpretation } from './PersonalEvidence';

export function SleepHistory() {
  const {records,selectedDate:date}=useBiologicalData(),quick=useQuickLog();
  const [days,setDays]=useState(30),[limit,setLimit]=useState(3);
  const history=useMemo(()=>{
    const selected=new Map<string,typeof records[number]>();
    for(const record of [...records].filter(row=>row.type==='sleep'&&!row.metadata.nap&&!row.deletedAt&&dateOf(row.timestamp)<=date).sort((a,b)=>a.timestamp.localeCompare(b.timestamp)))selected.set(dateOf(record.timestamp),record);
    return [...selected.values()].sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  },[records,date]);
  const value=(row:typeof records[number])=>sleepDurationHours(row);
  const byDate=new Map(history.map(row=>[dateOf(row.timestamp),row]));
  const points=Array.from({length:days},(_,index)=>{const day=shiftDay(date,index+1-days),row=byDate.get(day);return {date:day,value:row?value(row):null};});
  const groups=new Map<string,typeof records>();
  for(const row of history){const month=dateOf(row.timestamp).slice(0,7);groups.set(month,[...(groups.get(month)||[]),row]);}
  return <section className="glass card stack"><div className="flow-section-title"><h2>Sleep history</h2><div className="flow-choices" aria-label="Sleep trend window">{[7,30].map(window=><button key={window} aria-pressed={days===window} className={days===window?'active':''} onClick={()=>setDays(window)}>{window}D</button>)}</div></div>
    <TrendInterpretation points={points} unit="h"/><SignalChart label="Sleep history" unit="h" points={points}/>
    {!history.length&&<p>No recorded nights yet. Log sleep to begin your history.</p>}
    {[...groups].slice(0,limit).map(([month,rows])=><details key={month}><summary>{new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined,{month:'long',year:'numeric'})} · {rows.length} nights</summary>{rows.map(row=><button className="checkin-history" key={row.id} onClick={()=>quick.open('sleep',row.id.startsWith('legacy-')?undefined:row,dateOf(row.timestamp))}><strong>{dateOf(row.timestamp)}</strong><span>{value(row)?.toFixed(2)??'—'} h · {row.source}</span><span>Edit</span></button>)}</details>)}
    {groups.size>limit&&<button className="btn btn-soft" onClick={()=>setLimit(limit+3)}>Show earlier months</button>}
  </section>;
}
