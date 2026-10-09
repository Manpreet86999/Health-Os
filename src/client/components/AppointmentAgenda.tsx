import { useAppointments } from '../lib/use-appointments';
import { useApp } from '../state/AppContext';
import { shiftDay } from '../../shared/biological-intelligence';
import { zonedDateTime } from '../../shared/appointments';
export function AppointmentAgenda({ date, compact = false, week = false }: { date?: string; compact?: boolean; week?: boolean }) {
  const query = useAppointments(), app = useApp();
  const start=date&&week?shiftDay(date,-((new Date(`${date}T12:00:00`).getDay()+6)%7)):date, end=start&&week?shiftDay(start,6):date;
  const appointments = (query.data?.appointments || []).filter(item => item.status === 'scheduled' && (!date || zonedDateTime(item.scheduledAt, item.timezone).slice(0, 10) >= start! && zonedDateTime(item.scheduledAt, item.timezone).slice(0, 10) <= end!)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const followups = (query.data?.followups || []).filter(item => !['completed', 'cancelled'].includes(item.status) && item.dueAt && (item.status !== 'snoozed' || !item.snoozedUntil || item.snoozedUntil <= new Date().toISOString()) && (!date || new Date(item.dueAt).toLocaleDateString('en-CA') <= end!));
  if(query.error)return <section className="health-panel" role="status"><p>Health actions are temporarily unavailable.</p><button className="btn btn-soft" onClick={()=>void query.refetch()}>Retry health actions</button></section>;
  if (!appointments.length && !followups.length) return null;
  return <section className="health-panel ux-appointment-agenda" aria-label="Health appointments and follow-ups"><h2>Health actions</h2>
    {appointments.slice(0, compact ? 2 : 20).map(item => <button key={item.id} className="ux-agenda-row" onClick={() => { app.setPage('Health', `Appointment:${item.id}`); }}><span><strong>{item.title}</strong><small>{new Date(item.scheduledAt).toLocaleString(undefined, { timeZone: item.timezone, dateStyle: 'medium', timeStyle: 'short' })} · {item.clinician || 'Appointment'} · {item.timezone}</small></span><span>Prepare →</span></button>)}
    {followups.slice(0, compact ? 2 : 30).map(item => <button key={item.id} className="ux-agenda-row" onClick={() => app.setPage('Health', 'Follow-ups')}><span><strong>{item.title}</strong><small>{item.dueAt && new Date(item.dueAt).toLocaleDateString()} · {item.dueAt! < new Date().toISOString() ? 'Overdue' : item.status}</small></span><span>Review →</span></button>)}
  </section>;
}
