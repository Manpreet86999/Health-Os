import { useState } from 'react';
import { useBiologicalData } from '../lib/use-biological-data';
import { readiness } from '../../shared/biology';
import { today } from '../lib/utils';
export function RecoveryAdaptation() {
  const {app,records}=useBiologicalData(); const [choice,setChoice]=useState('');
  const [original] = useState(() => app.tracker?.exercises);
  if(!app.db||!app.tracker||app.tracker.logs.length||app.tracker.index!==0||choice==='original') return null;
  if(choice==='adapted') return <section className="glass card stack"><p role="status">Adapted prescription applied to this workout draft.</p><button className="btn btn-soft" onClick={()=>{if(original)app.setTracker({...app.tracker!,exercises:original});setChoice('original');}}>Restore original prescription</button></section>;
  const estimate=readiness(records,today());
  if(estimate.score===null||estimate.score>=60) return null;
  const proposed=app.tracker.exercises.map(e=>({...e,vol:e.vol.replace(/^(\d+)\s*[×x]/i,(_match,n)=>`${Math.max(1,Number(n)-1)} x`),rirTarget:Math.min(5,Number(e.rirTarget||2)+1)}));
  return <section className="glass card stack" aria-label="Recovery-aware training review"><p className="bio-eyebrow">REVIEW BEFORE YOUR FIRST SET</p><h3>Consider a lighter session</h3><p className="subtle">Estimated readiness {estimate.score}/100 · {estimate.confidence} confidence. {estimate.contributors.map(c=>`${c.label}: ${c.detail}`).join(' · ')}</p><p>Proposed: one fewer set for prescriptions with a leading set count, and one additional RIR. Your saved program stays intact.</p><details><summary>Compare prescriptions</summary>{app.tracker.exercises.map((e,i)=><p key={i}>{e.name}: {e.vol}, RIR {e.rirTarget||2} → {proposed[i].vol}, RIR {proposed[i].rirTarget}</p>)}</details><div className="row wrap"><button className="btn btn-soft" onClick={()=>setChoice('original')}>Use original</button><button className="btn btn-hot" disabled={choice==='adapted'} onClick={()=>{app.setTracker({...app.tracker!,exercises:proposed});setChoice('adapted');}}>Use adapted workout</button><button className="btn btn-soft" onClick={()=>setChoice('original')}>Customize in tracker</button></div>{choice==='adapted'&&<p role="status">Adapted prescription applied to this workout draft.</p>}</section>;
}
