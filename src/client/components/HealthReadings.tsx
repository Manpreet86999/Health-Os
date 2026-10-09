import { useApp } from '../state/AppContext';
import { useEffect, useState } from 'react';
import { summarizeHealth } from '../../shared/health';
import { localDateKey } from '../../shared/evidence';

export function HealthReadings({ activeDate, onApply }: { activeDate: string; onApply: (values: Record<string, string>) => Promise<boolean> }) {
  const { db } = useApp();
  const allReadings = db?.healthReadings || [];
  const today = localDateKey();
  // The device-local event timestamp is authoritative. Older imports may
  // carry a UTC date label, which must not move Tuesday's data to Wednesday.
  const readings = activeDate ? allReadings.filter((reading) => localDateKey(new Date(reading.endTime)) === activeDate)
    .map((reading) => ({ ...reading, date: activeDate })) : [];
  const latestDate = readings.length ? activeDate : '';
  const values = latestDate ? summarizeHealth(readings,latestDate) : [];
  const isToday = latestDate === today;
  const newestImport = values.map((value) => value.importedAt).sort().at(-1) || '';
  const appliedKey = `body-os-health-readiness-applied:${latestDate}:${newestImport}`;
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  useEffect(() => { setApplied(localStorage.getItem(appliedKey) === '1'); }, [appliedKey]);
  // This is an inbox for new readings, not a permanent dashboard widget.
  // Keep it visible until the athlete explicitly uses it; a prior readiness
  // save must never hide a new reading before it can be reviewed.
  if (!activeDate || !readings.length || !isToday || applied) return null;
  const readinessValues = Object.fromEntries(values.flatMap((value) => {
    if (value.value == null) return [];
    if (value.kind === 'Steps') return [['steps', String(Math.round(value.value))]];
    if (value.kind === 'SleepSession') return [['sleepHours', String(Math.round(value.value * 10) / 10)]];
    if (value.kind === 'RestingHeartRate') return [['restingHeartRate', String(Math.round(value.value))]];
    return [];
  }));
  return <section className="dash-health-strip" aria-label="Latest health readings">
    <div className="dash-health-copy"><strong>New health data</strong><span className="subtle">Apply it to today’s readiness, then this reminder disappears.</span></div>
    <div className="dash-health-values">
      {values.map(v => <div className="dash-health-value" key={`${v.kind}:${v.source}`} title={`${v.source} · imported ${new Date(v.importedAt).toLocaleString()}`}><strong>{v.value == null ? '—' : `${Math.round(v.value * 10) / 10} ${v.unit}`}</strong><span>{v.kind}</span></div>)}
    </div>
    <button type="button" className="btn btn-soft btn-sm" disabled={applying} onClick={() => void (async () => { setApplying(true); try { if (await onApply(readinessValues)) { localStorage.setItem(appliedKey, '1'); setApplied(true); } } finally { setApplying(false); } })()}>{applying ? 'Updating…' : 'Use in readiness'}</button>
  </section>;
}
