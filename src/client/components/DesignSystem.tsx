import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { OSIcon } from './OSIcon';

export type DataState = 'empty' | 'no-data' | 'no-target' | 'not-configured' | 'insufficient' | 'loading' | 'error' | 'no-results' | 'assessed';
const stateTitles: Record<DataState, string> = {
  empty: 'Nothing here yet', 'no-data': 'No data yet', 'no-target': 'No target set',
  'not-configured': 'Not configured yet', insufficient: 'Not enough history',
  loading: 'Loading…', error: 'Couldn’t load this', 'no-results': 'No matching results', assessed: 'No flags in this window',
};

/** A settled missing state never looks like loading, a measured zero, or success. */
export function StatePanel({ state = 'empty', title, body, action }: { state?: DataState; title?: string; body: string; action?: ReactNode }) {
  return <div className="state-panel" data-state={state} role={state === 'error' ? 'alert' : state === 'loading' ? 'status' : undefined} aria-busy={state === 'loading' || undefined}>
    <span className="state-symbol" aria-hidden="true"><OSIcon name={state === 'error' ? 'Health' : 'Insights'} size={20}/></span>
    <div><h3>{title || stateTitles[state]}</h3><p>{body}</p>{action && <div className="state-action">{action}</div>}</div>
  </div>;
}

export function HealthCard({ title, children, action, className = '' }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`health-card ${className}`}>{title && <div className="flow-section-title"><h2>{title}</h2>{action}</div>}{children}</section>;
}

export function FormField({ label, unit, help, error, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; unit?: string; help?: string; error?: string }) {
  const id = useId();
  return <div className="form-field"><label htmlFor={input.id || id}>{label}{unit && <small>{unit}</small>}</label><input {...input} id={input.id || id} className={`input ${input.className || ''}`} aria-invalid={!!error || undefined} aria-describedby={help || error ? `${id}-help` : undefined}/>{(help || error) && <small id={`${id}-help`} className={error ? 'field-error' : ''}>{error || help}</small>}</div>;
}

export const calendarWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function Calendar({ cursor, selected, onSelect, onMonth, renderDay }: { cursor: Date; selected: string; onSelect: (date: string) => void; onMonth: (date: Date) => void; renderDay?: (date: string) => { recorded?: number; scheduled?: number; note?: string } }) {
  const y = cursor.getFullYear(), m = cursor.getMonth(), pad = (new Date(y,m,1).getDay()+6)%7, length = new Date(y,m+1,0).getDate();
  const today = new Date().toLocaleDateString('en-CA');
  return <section className="health-calendar"><div className="calendar-heading"><button className="btn btn-soft btn-sm" aria-label="Previous month" onClick={()=>onMonth(new Date(y,m-1,1))}>←</button><h2>{cursor.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><button className="btn btn-soft btn-sm" aria-label="Next month" onClick={()=>onMonth(new Date(y,m+1,1))}>→</button></div><div className="calendar-grid">{calendarWeekdays.map(d=><span className="calendar-weekday" key={d}>{d}</span>)}{Array.from({length:pad},(_,i)=><span key={`pad-${i}`}/>)}{Array.from({length},(_,i)=>{const date=`${y}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`, info=renderDay?.(date);return <button key={date} type="button" className={`calendar-date ${date===today?'is-today':''} ${date===selected?'is-selected':''}`} aria-label={`${date}${info?.recorded?`, ${info.recorded} recorded`:''}${info?.scheduled?`, ${info.scheduled} planned`:''}`} aria-pressed={selected===date} onClick={()=>onSelect(date)}><strong>{i+1}</strong><span className="calendar-markers"><i data-recorded={!!info?.recorded}/><i data-scheduled={!!info?.scheduled}/></span></button>;})}</div><div className="calendar-legend"><span>● Recorded</span><span>○ Planned</span><span>Unmarked · no record</span></div></section>;
}
