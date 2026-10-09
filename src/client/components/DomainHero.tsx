import { MetricRing } from './VisualMetrics';
import type { ReactNode } from 'react';
import { OSIcon } from './OSIcon';
import type { Section } from '../lib/os-navigation';

export function DomainHero({section,kicker,title:fullTitle,description,primary,secondary,metric,stats=[]}:{section:Section;kicker:string;title:string;description:string;primary?:{label:string;action:()=>void};secondary?:{label:string;action:()=>void};metric?:{value:ReactNode;label:string;note?:string;progress?:number|null};stats?:{label:string;value:ReactNode}[]}){
  const title=(fullTitle);
  const progress=metric?.progress;
  return <header className="domain-hero"><div className="domain-hero-glow" aria-hidden="true"/><div className="domain-hero-content"><div className="domain-hero-chips"><span><OSIcon name={section} size={15}/>{section}</span><span>{new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}</span></div><p className="domain-hero-kicker">{kicker}</p><h1>{title}</h1><p className="domain-hero-description">{description}</p><div className="domain-hero-actions">{primary&&<button className="btn btn-hot" onClick={primary.action}>{primary.label}<span aria-hidden="true">↗</span></button>}{secondary&&<button className="btn btn-soft" onClick={secondary.action}>{secondary.label}</button>}</div></div>{metric&&<div className="domain-hero-metric">{progress != null ? <MetricRing value={progress} display={metric.value} label={metric.label} size={140} tone="var(--domain-color)"/> : <div className="stitch-summary-metric"><strong>{metric.value}</strong><span>{metric.label}</span></div>}{metric.note&&<p>{metric.note}</p>}</div>}{stats.length>0&&<div className="domain-hero-stats">{stats.map(s=><div key={s.label}><span>{s.label}</span><strong>{s.value}</strong></div>)}</div>}</header>;
}
