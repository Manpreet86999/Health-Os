import type { CSSProperties, ReactNode } from 'react';
import { OSIcon, type OSIconName } from './OSIcon';
import { shiftDay } from '../../shared/biological-intelligence';

export function HealthOSSectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="hos-section-heading"><h2>{title}</h2>{action}</div>;
}
export function HealthOSMetricCard({ label, value, detail, icon, tone, onClick }: { label: string; value: ReactNode; detail: ReactNode; icon: OSIconName; tone: string; onClick: () => void }) {
  return <button className="hos-metric-card" style={{ '--metric-tone': tone } as CSSProperties} onClick={onClick}><span className="hos-metric-label"><OSIcon name={icon} size={19}/>{label}<OSIcon name="Forward" size={15}/></span><strong>{value}</strong><span className="hos-metric-detail">{detail}</span></button>;
}
export function HealthOSWeekStrip({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const selected = new Date(`${date}T12:00:00`), offset = (selected.getDay() + 6) % 7;
  const today = new Date().toLocaleDateString('en-CA');
  return <nav className="hos-week-strip" aria-label="Select a day">{Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(date, i - offset), parsed = new Date(`${day}T12:00:00`);
    return <button key={day} aria-label={parsed.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} aria-pressed={day === date} onClick={() => onChange(day)}><span>{parsed.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{parsed.getDate()}</strong><i data-today={day === today}/></button>;
  })}</nav>;
}
