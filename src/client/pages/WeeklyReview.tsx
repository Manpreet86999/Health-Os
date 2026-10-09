import { useDraftState, useDraftFields } from '../lib/use-draft';
import { DraftFeedback } from '../components/DraftFeedback';
import { useState } from 'react';
import { useToast } from '../components/Toast';
import { useBiologicalData } from '../lib/use-biological-data';
import { useTimelineActions } from '../lib/use-timeline-actions';
import { dateOf } from '../../shared/biology';
import { shiftDay, summarizeRange } from '../../shared/biological-intelligence';

export function WeeklyReview(){
  const {app,records}=useBiologicalData(),actions=useTimelineActions(),toast=useToast();
  const [end,setEnd]=useState(dateOf(new Date().toISOString()));
  const draft=useDraftFields('weekly-review:'+end,()=>({id:crypto.randomUUID(),wins:'',blockers:'',adjustment:''}));
  const [wins,setWins]=draft.field('wins'),[blockers,setBlockers]=draft.field('blockers'),[adjustment,setAdjustment]=draft.field('adjustment');
  const from=shiftDay(end,-6),db=app.db!,summary=summarizeRange(records,db,app.skin,from,end);
  const fmt=(v:number|null,suffix='')=>v===null?'Not enough data':`${Number(v.toFixed(1))}${suffix}`;
  const habits=db.habitLogs.filter(r=>r.date>=from&&r.date<=end).length+records.filter(r=>r.type==='habitDone'&&dateOf(r.timestamp)>=from&&dateOf(r.timestamp)<=end).length;
  const items=[['Training',`${summary.workouts} workouts`],['Nutrition',`${fmt(summary.averageCalories,' kcal')} · ${fmt(summary.averageProtein,' g protein')}`],['Sleep & recovery',`${fmt(summary.averageSleep,' h')} · readiness ${fmt(summary.averageReadiness)}`],['Body',`Trend weight ${fmt(summary.weight.trend,' kg')}`],['Care adherence',fmt(summary.careAdherence,'%')],['Habits',`${habits} logged entries`],['Medication & supplement adherence',fmt(summary.supplementAdherence,'%')]];
  return <div className="flow-workspace stack"><header className="bio-page-head"><p className="bio-eyebrow">TODAY / WEEKLY REVIEW</p><h1>Weekly review</h1><p className="subtle">{from} to {end}. Reflect on the evidence and choose your next adjustment.</p><label>Week ending<input className="input" type="date" value={end} onChange={e=>e.target.value&&setEnd(e.target.value)}/></label></header>
    <div className="overview-destinations">{items.map(([label,value])=><article className="glass card" key={label}><h3>{label}</h3><p>{value}</p></article>)}</div>
    <form className="glass card stack" onSubmit={e=>{e.preventDefault();void actions.run('review',async()=>{await app.api.saveWeeklyReview({id:draft.value.id,weekStart:from,wins,blockers,adjustment});draft.setValue({id:crypto.randomUUID(),wins:'',blockers:'',adjustment:''});await draft.clear();await app.refresh();toast.push('Weekly review saved to account','ok');});}}>
      <DraftFeedback draft={draft}/><div className="form-field"><label htmlFor="weekly-wins">Wins</label><textarea id="weekly-wins" className="input" value={wins} onChange={e=>setWins(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="weekly-blockers">Blockers</label><textarea id="weekly-blockers" className="input" value={blockers} onChange={e=>setBlockers(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="weekly-adjustment">Next-week adjustments</label><textarea id="weekly-adjustment" className="input" value={adjustment} onChange={e=>setAdjustment(e.target.value)}/></div>
      <button className="btn btn-hot" disabled={!draft.ready||Boolean(actions.busy)}>Save review</button>{actions.error&&<p role="alert">{actions.error}</p>}
    </form>
    <section className="glass card stack"><h2>Review history</h2>{db.weeklyReviews.map(r=><article key={r.id}><h3>{r.weekStart}</h3><p>Wins: {r.wins}</p><p>Blockers: {r.blockers}</p><p>Adjustments: {r.adjustment}</p></article>)}</section>
  </div>;
}
