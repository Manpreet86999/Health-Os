import { PersonalBaselines, TrendInterpretation } from '../components/PersonalEvidence';
import { EvidenceScatter, MiniSparkline } from '../components/VisualMetrics';
import { useAutomations } from '../state/AutomationContext';
import { MedicalActionCenter } from '../components/MedicalActionCenter';
import { AutomaticInsights, CachedBaselines } from '../components/AutomaticReview';
import { useMemo, useState } from 'react';
import { useBiologicalData } from '../lib/use-biological-data';
import { SignalChart } from '../components/SignalChart';
import { baseline, dateOf } from '../../shared/biology';
import { anomalySignals, correlations, daySeries } from '../../shared/biological-intelligence';
import { downloadArtifact } from '../lib/health-os-export';

export function InsightsWorkspace({panel,domain=''}:{panel:string;domain?:string}){
  type SignalKey=Exclude<keyof ReturnType<typeof daySeries>[number],'date'>;
  const {state}=useAutomations();
  const {app,records}=useBiologicalData(),date=dateOf(new Date().toISOString()),[days,setDays]=useState(30),[metric,setMetric]=useState<SignalKey>(({Nutrition:'Calories',Recovery:'Readiness',Sleep:'Sleep',Body:'Weight',Care:'Care severity'} as Record<string,SignalKey>)[domain]||'Sleep');
  const series=useMemo(()=>panel==='Trends'?daySeries(records,app.db!,app.skin,date,days):[],[panel,records,app.db,app.skin,date,days]);
  const cachedPairs=state.derived[`correlations:${days}`]?.value as ReturnType<typeof correlations>|undefined;
  const pairs=useMemo(()=>panel==='Correlations'?cachedPairs||correlations(records,app.db!,app.skin,date,days):[],[panel,cachedPairs,records,app.db,app.skin,date,days]);
  const signals=useMemo(()=>panel==='Anomalies'?anomalySignals(records,date):[],[panel,records,date]),metrics=['HRV','Resting HR','Steps','Weight'];
  const labels:Record<string,{title:string;description:string}>={Trends:{title:'A little perspective over time.',description:'Pick a signal and a window. Missing days stay missing.'},Correlations:{title:'See what moves together.',description:'Paired days can suggest questions to explore. Associations do not establish cause.'},'Personal Baselines':{title:'Your history is the reference.',description:'Compare your preferred daily readings with your previous 28 days.'},Anomalies:{title:'Make room for a closer look.',description:'Changes outside your recent personal ranges are observations to review.'}};
  const domainMetrics:Record<string,string[]>={Nutrition:['Calories','Protein','Carbohydrates'],Recovery:['Readiness','Energy','Stress'],Sleep:['Sleep'],Body:['Weight'],Care:['Care severity','Humidity']};
  const assessed=useMemo(()=>panel==='Anomalies'&&[...new Set(records.filter(r=>r.type==='vital').map(r=>String(r.metadata.metric)))].some(m=>{const b=baseline(records,m,date);return !!b.current&&b.samples>=14;}),[panel,records,date]);
  const signalUnits=({Sleep:'h',Weight:'kg',Calories:'kcal',Protein:'g',Carbohydrates:'g',Readiness:'/100',Energy:'/10',Stress:'/10','Care severity':'/10',HRV:'ms','Resting HR':'bpm',Steps:'steps',Humidity:'%'} as Record<string,string>);const signalUnit=signalUnits[metric]||'';
  const copy=labels[panel]||labels.Trends;
  return <div className="flow-workspace stack"><header className="bio-page-head"><p className="bio-eyebrow">INSIGHTS / {panel.toUpperCase()}</p><h1>{domain?`${domain} trends`:panel==='Personal Baselines'?'Personal baselines':panel}</h1><p className="subtle">{copy.description}</p></header>
    {panel==='Trends'&&<AutomaticInsights/>}{panel==='Personal Baselines'&&<><PersonalBaselines/><details className="glass card"><summary>All cached baselines</summary><CachedBaselines/></details></>}
    {['Trends','Personal Baselines'].includes(panel)&&!domain&&<details className="glass card"><summary>Reviewed laboratory trends</summary><MedicalActionCenter view="trends"/></details>}
    {panel==='Correlations'&&!domain&&<details className="glass card"><summary>Local prospective study · enrollment & evidence</summary><MedicalActionCenter view="research"/></details>}
    {['Trends','Correlations'].includes(panel)&&<div className="flow-choices" aria-label="Analysis window">{[7,30,90,365].map(n=><button key={n} aria-pressed={days===n} className={days===n?'active':''} onClick={()=>setDays(n)}>{n===365?'1Y':`${n}D`}</button>)}</div>}
    {panel==='Trends'&&<section className="glass card stack"><div className="flow-section-title"><label>Signal<select className="input" value={metric} onChange={e=>setMetric(e.target.value as SignalKey)}>{Object.keys(series[0]||{}).filter(k=>k!=='date'&&(!domain||!domainMetrics[domain]||domainMetrics[domain].includes(k))).map(k=><option key={k}>{k}</option>)}</select></label><button className="btn btn-soft" onClick={()=>downloadArtifact('health-os-trend.json',JSON.stringify({metric,days,records:series.map(s=>({date:s.date,value:s[metric]}))},null,2),'application/json')}>Export evidence</button></div><TrendInterpretation points={series.map(s=>({date:s.date,value:s[metric]??null}))} unit={signalUnit}/><SignalChart label={metric} unit={signalUnit} points={series.map(s=>({date:s.date,value:s[metric]??null}))}/></section>}
    {panel==='Correlations'&&<div className="baseline-list">{pairs.map(p=><article key={`${p.x}-${p.y}`} className="glass card stack">
      <div className="flow-section-title"><h3>{p.x} ↔ {p.y}</h3><strong className="correlation-value">{p.r===null?'—':p.r.toFixed(2)}</strong></div>
      <EvidenceScatter pairs={p.pairs} xLabel={`${p.x} (${signalUnits[p.x]||'unit unavailable'})`} yLabel={`${p.y} (${signalUnits[p.y]||'unit unavailable'})`} label={`${p.x} versus ${p.y}`}/>
      <p className="subtle">{p.samples} matched days · {p.confidence}</p>
      <details className="flow-details"><summary>See paired observations</summary>{p.pairs.map((d,i)=><div className="bio-contributor" key={`${d.date}-${i}`}><strong>{d.date}</strong><span>{d.x.toFixed(2)} / {d.y.toFixed(2)}</span></div>)}{!p.pairs.length&&<p className="subtle">Record both signals on the same days to build this comparison.</p>}</details>
    </article>)}</div>}
    {panel==='Personal Baselines'&&<details className="glass card"><summary>Compare current readings with the prior 28 days</summary><div className="baseline-list">{metrics.map(m=>{const b=baseline(records,m,date);return <article className="glass card stack" key={m}><div className="flow-section-title"><h3>{m}</h3><span className="chip">{b.samples} prior days</span></div><div className="journey-day-summary"><span><strong>{b.current?.value??'—'}</strong> today</span><span><strong>{b.average?.toFixed(1)??'—'}</strong> prior average</span></div><p className="subtle">{b.deviation===null?'Record more days to see your deviation.':`${b.deviation.toFixed(1)}% versus your prior 28-day average.`}</p></article>;})}</div></details>}
    {panel==='Anomalies'&&<>{signals.length?signals.map(s=><article className="glass card stack" key={s.metric}><h3>{s.metric}</h3><p>{s.current?.value} {s.current?.unit} today · {s.average?.toFixed(1)} prior average</p><p className="subtle">{s.samples} prior observed days · {s.deviation?.toFixed(1)}% deviation</p></article>):<section className="overview-note glass"><div><p className="bio-eyebrow">YOUR RECORDED SIGNALS</p><h2>{assessed?'No current flags to review.':'Not enough history to assess'}</h2><p>Flags require at least 14 prior daily samples and a reading outside two standard deviations of that history. A blank history cannot establish that a signal is within range.</p></div></section>}</>}
  </div>;
}
