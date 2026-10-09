import { todayPriority } from '../../shared/personal-intelligence';
import { dateOf, readiness } from '../../shared/biology';
import { dueMedicationReminder, buildTimeline } from '../../shared/biological-intelligence';
import { useBiologicalData } from '../lib/use-biological-data';
import { useQuickLog } from './QuickLog';
import { MetricRing } from './VisualMetrics';
import { useMemo } from 'react';
import { buildHealthIntelligence } from '../../shared/health-intelligence';
import { useCloudAccount } from '../state/CloudAccountContext';

export function TodayAnswer({recovery=false,compact=false}:{recovery?:boolean;compact?:boolean}) {
  const {app,records,stored,selectedDate:date}=useBiologicalData(),quick=useQuickLog();
  const cloud=useCloudAccount();
  const intelligence=useMemo(()=>buildHealthIntelligence({db:app.db!,skin:app.skin,records:stored,userId:cloud.user?.id||'local-user',activeWorkout:recovery?undefined:app.tracker?.dayTitle},date),[app.db,app.skin,stored,cloud.user?.id,date,recovery,app.tracker?.dayTitle]);
  const ready=readiness(records,date);
  const events=buildTimeline(records,app.db!,app.skin,date);
  const planned=events.find(event=>event.type==='plannedWorkout');
  const weekday=new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'short'});
  const plan=app.db!.weeks.find(week=>week.id===app.db!.meta.activeWeekId)?.days.find(day=>day.key===weekday&&day.exercises.length>0&&day.type==='training');
  const recommendation=todayPriority({activeWorkout:recovery?undefined:app.tracker?.dayTitle,plannedWorkout:recovery?undefined:planned?.title||plan?.title,medicationReminder:recovery?undefined:dueMedicationReminder(events,date),readiness:ready.score,readinessCategory:ready.category,confidence:ready.confidence});
  const missing=ready.score===null;
  const candidate=recovery?intelligence.recommendations.find(item=>['personal-recovery','soreness'].includes(item.id)):intelligence.priority;
  const personal=candidate&&candidate.id!=='daily-plan'?candidate:null;
  const title=personal?.recommendation||(recovery&&!missing?(recommendation.kind==='recover'?'Make room to recover':'Keep your recovery steady'):recommendation.title);
  const action=personal?.action.label||(recovery?'Check in':recommendation.action);
  return <section className={`web-today-answer health-panel${compact?' web-today-answer-compact':''}`} aria-label={recovery?'Recovery recommendation':'Today recommendation'}>
    <div><p className="bio-eyebrow">{recovery?'HOW SHOULD I RECOVER TODAY?':'WHAT DOES YOUR BODY NEED TODAY?'}</p><span className="chip">{personal?'Personal context':recommendation.status}</span><h2>{title}</h2><p>{personal?.why[0]||(recovery&&!missing?'Review sleep, soreness and stress before changing your plan.':recommendation.description)}</p>
      <button className="btn btn-hot" onClick={()=>personal?app.setPage(personal.action.page,personal.action.panel):recovery||recommendation.destination==='checkIn'?quick.open('checkIn',stored.find(row=>row.type==='checkIn'&&dateOf(row.timestamp)===date),date):app.setPage(recommendation.destination)}>{action}</button>
      {personal&&<details><summary>Personal evidence</summary><p>{personal.confidence} confidence · {date}</p>{personal.why.map(reason=><p key={reason}>{reason}</p>)}{personal.supportingSignals.map(signal=><p key={signal.metric}>{signal.metric}: {signal.value??'Not recorded'} {signal.unit} · {signal.recordIds.length} source records</p>)}{personal.limitations.map(reason=><p key={reason}>{reason}</p>)}</details>}
      <details><summary>Why this?</summary><p>{date} · {ready.confidence} confidence · planning guidance</p>{ready.contributors.map(contributor=><p key={contributor.label}><strong>{contributor.label}</strong> · {contributor.detail}</p>)}{planned&&<p>Scheduled workout: {planned.title}</p>}<p>{ready.missing.length?`Missing: ${ready.missing.join(', ')}`:'All readiness inputs available.'} You choose whether to follow or edit your plan.</p></details>
    </div><MetricRing value={ready.score} label="Readiness" size={compact?104:152} tone="var(--recover)"/>
  </section>;
}
