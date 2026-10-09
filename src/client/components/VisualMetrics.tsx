import { ChartDataTable } from './ChartDataTable';
import { memo, type CSSProperties, type ReactNode } from 'react';

export const MetricRing=memo(function MetricRing({value,max=100,label,display,unit='',size=112,tone='var(--accent)',children}:{value:number|null|undefined;max?:number;label:string;display?:ReactNode;unit?:string;size?:number;tone?:string;children?:ReactNode}) {
  const missing=value==null||!Number.isFinite(value)||!Number.isFinite(max)||max<=0,progress=missing?0:Math.max(0,Math.min(1,value/max));
  return <div className="metric-ring" data-state={missing?'missing':'measured'} style={{'--ring-size':`${size}px`,'--ring-tone':tone} as CSSProperties}>
    <svg viewBox="0 0 120 120" role="img" aria-label={missing?(display!==undefined&&display!=='—'&&['string','number'].includes(typeof display)?`${label}: ${display} ${unit}, no target set`:`${label}: no data`):`${label}: ${value} ${unit}${max!==100?`, target ${max} ${unit}`:' out of 100'}`}><circle className="metric-ring-track" cx="60" cy="60" r="51"/><circle className="metric-ring-value" cx="60" cy="60" r="51" pathLength="100" strokeDasharray={`${progress*100} 100`} transform="rotate(-90 60 60)"/></svg>
    <div className="metric-ring-caption"><strong>{display??(missing?'—':value)}{unit&&<small>{unit}</small>}</strong><span>{label}</span>{children}</div>
  </div>;
});

export interface SparkPoint {date:string;value:number|null|undefined;}
export const MiniSparkline=memo(function MiniSparkline({points,label,unit='',tone='var(--accent)',table=false}:{points:SparkPoint[];label:string;unit?:string;tone?:string;table?:boolean}) {
  const valid=points.filter(p=>p.value!=null&&Number.isFinite(p.value)),values=valid.map(p=>p.value!),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  const valuesTable=table?<ChartDataTable label={label} columns={['Date',unit?`Value (${unit})`:'Value']} rows={points.map(p=>[p.date,p.value])}/>:null;
  if(valid.length<2)return <><div className="mini-sparkline-empty">{valid.length?'More history needed':'No recorded trend'}</div>{valuesTable}</>;
  const summary=`${label}: ${valid.length} readings, ${valid[0].value} ${unit} on ${valid[0].date} to ${valid.at(-1)!.value} ${unit} on ${valid.at(-1)!.date}. Missing observations are gaps.`;
  let pen=false;const path=points.map((p,i)=>{if(p.value==null||!Number.isFinite(p.value)){pen=false;return '';}const command=pen?'L':'M';pen=true;return `${command}${4+i/Math.max(1,points.length-1)*192},${43-(p.value-min)/range*34}`;}).join(' ');
  return <><svg className="mini-sparkline" viewBox="0 0 200 50" role="img" aria-label={`${summary} ${points.map(p=>`${p.date}: ${p.value==null?'not recorded':p.value+' '+unit}`).join('; ')}`}><title>{summary}</title><path d={path} fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{points.map((p,i)=>p.value!=null&&Number.isFinite(p.value)?<circle key={`${p.date}-${i}`} cx={4+i/Math.max(1,points.length-1)*192} cy={43-(p.value-min)/range*34} r="2" fill={tone}/>:null)}</svg>{valuesTable}</>;
});

export function EvidenceScatter({pairs,label,xLabel,yLabel}:{pairs:{date:string;x:number;y:number}[];label:string;xLabel?:string;yLabel?:string}) {
  const valid=pairs.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(valid.length<2)return <div className="mini-sparkline-empty">Not enough paired observations</div>;
  const xs=valid.map(p=>p.x),ys=valid.map(p=>p.y),xmin=Math.min(...xs),ymin=Math.min(...ys),xrange=Math.max(...xs)-xmin||1,yrange=Math.max(...ys)-ymin||1;
  return <><svg className="evidence-scatter" viewBox="0 0 280 110" role="img" aria-label={`${label}: ${valid.length} paired observations. Horizontal range ${xmin} to ${Math.max(...xs)}; vertical range ${ymin} to ${Math.max(...ys)}. Values are available under paired observations.`}><path d="M20 10V88H265" fill="none" stroke="var(--border-default)"/>{valid.map((p,i)=><circle key={`${p.date}-${i}`} cx={25+(p.x-xmin)/xrange*235} cy={83-(p.y-ymin)/yrange*66} r="4" fill="var(--insights)" opacity=".8"><title>{p.date}: {p.x} / {p.y}</title></circle>)}<text x="20" y="105">{xmin.toFixed(1)}</text><text x="240" y="105">{Math.max(...xs).toFixed(1)}</text></svg><ChartDataTable label={label} columns={['Date',xLabel||label.split(' versus ')[0],yLabel||label.split(' versus ')[1]||'Paired value']} rows={valid.map(p=>[p.date,p.x,p.y])}/></>;
}

export function WhyDetails({children,label='Why?'}:{children:ReactNode;label?:string}) {return <details className="visual-why"><summary>{label}</summary><div>{children}</div></details>;}
