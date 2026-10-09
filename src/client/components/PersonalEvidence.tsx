import { useMemo } from 'react';
import { useBiologicalData } from '../lib/use-biological-data';
import { useAutomations } from '../state/AutomationContext';
import { baselineQuality, baselineComparison, personalTrend } from '../../shared/personal-intelligence';
import { daySeries, shiftDay } from '../../shared/biological-intelligence';
import { SignalChart } from './SignalChart';

export function TrendInterpretation({points,unit}:{points:{date:string;value:number|null}[];unit:string}) {
  const trend=personalTrend(points);
  return <div className="web-trend-meaning"><strong>{trend.state==='insufficient data'?'More recorded days needed':`Recorded values are ${trend.state}`}</strong><span>{trend.samples} observed days · {trend.from}–{trend.to}</span>{trend.change!==null&&<span>Recent average {trend.change>=0?'+':''}{trend.change.toLocaleString(undefined,{maximumFractionDigits:1})} {unit} versus the earlier window</span>}</div>;
}
export function PersonalBaselines() {
  const {state}=useAutomations();
  const {app,records,selectedDate:date}=useBiologicalData();
  const currentSeries=useMemo(()=>daySeries(records.filter(row=>row.quality!=='estimated'&&(row.metadata.requiresConfirmation!==true||row.metadata.confirmed===true)),app.db!,app.skin,date,29),[records,app.db,app.skin,date]);
  const series=currentSeries.filter(row=>row.date<date);
  const definitions=[{key:'Sleep',unit:'h'},{key:'Resting HR',unit:'bpm'},{key:'HRV',unit:'ms'},{key:'Weight',unit:'kg'},{key:'Protein',unit:'g'},{key:'Calories',unit:'kcal'},{key:'Volume',unit:`${app.db!.profile.units} × reps`} ] as const;
  return <section className="web-baselines" aria-label="Personal baseline evidence"><header><h2>Your recent baseline</h2><p className="subtle">Prior 28 days · personal context, not a medical reference range</p></header><div className="web-evidence-grid">{definitions.map(({key,unit})=>{
    const points=series.map(row=>({date:row.date,value:row[key]})),quality=baselineQuality(points,shiftDay(date,-28),shiftDay(date,-1));
    const comparison=baselineComparison(currentSeries.map(row=>({date:row.date,value:row[key]})),date);
    return <article className="health-panel" key={key}><h3>{key}</h3><strong className="web-baseline-number">{quality.range?`${quality.range.low.toFixed(1)}–${quality.range.high.toFixed(1)}`:'Building your baseline'}{quality.range&&<small> {unit}</small>}</strong><p className="subtle">{quality.samples} observed days · {quality.confidence} confidence · {Math.round(quality.missingness*100)}% missing</p><p className="subtle">Today: {comparison.current===null?'Not recorded':`${comparison.current.toFixed(1)} ${unit}`}{comparison.deviation!==null?` · ${comparison.deviation>=0?'+':''}${comparison.deviation.toFixed(1)} ${unit} versus prior average`:''}</p><details><summary>Why this range?</summary><p>{quality.from}–{quality.to}. The middle 80% of preferred daily observations. At least 14 observed days and 50% coverage are required.</p><p>Missing days stay missing. A personal change does not establish medical abnormality.</p><SignalChart label={key} unit={unit} points={points} height={160}/></details></article>;
  })}</div><details><summary>More baseline signals</summary><p className="subtle">{Object.values(state.derived).filter(row=>row.kind==='baseline').length} cached baseline windows support shared automation.</p></details></section>;
}
