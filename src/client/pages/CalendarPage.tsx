import { useDraftState } from '../lib/use-draft';
import { DraftFeedback } from '../components/DraftFeedback';
import { Calendar } from '../components/DesignSystem';
import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { today } from '../lib/utils';

export function CalendarPage() {
  const app = useApp();
  const toast = useToast();
  const { db, setPage, setActiveDay, setManualDay, setTracker, settings } = app;
  const [monthOffset, setMonthOffset] = useState(0);
  const scheduleDraft=useDraftState('workout-schedule',()=>({id:crypto.randomUUID(),date:today(),title:'',weekId:'',dayKey:'',notes:''}));const {value:form,setValue:setForm}=scheduleDraft;

  if (!db || !settings) return null;

  const now = new Date();
  const base = new Date(now.getFullYear(),now.getMonth()+monthOffset,1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Mon-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const sessionByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of db.sessions) {
      if ((s.status !== 'finished' && s.status !== 'completed') || !s.date) continue;
      m.set(s.date, (m.get(s.date) || 0) + 1);
    }
    return m;
  }, [db.sessions]);

  const scheduled = db.scheduledWorkouts || [];

  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date, day: d });
  }

  async function addSchedule() {
    try {
      await app.api.saveSchedule({
        id: form.id,
        date: form.date,
        title: form.title || 'Workout',
        weekId: form.weekId || undefined,
        dayKey: form.dayKey || undefined,
        notes: form.notes,
        status: 'planned',
      });
      await app.refresh();
      scheduleDraft.setValue(current=>({...current,id:crypto.randomUUID()}));await scheduleDraft.clear();toast.push('Scheduled to account', 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  async function rescheduleMissed(weekId: string, dayKey: string, newDate: string) {
    try {
      await app.api.missedSession({
        action: 'reschedule',
        weekId,
        dayKey,
        newDate,
        title: `${dayKey} make-up`,
      });
      await app.refresh();
      toast.push('Rescheduled', 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  const week = db.weeks.find((w) => w.id === db.meta.activeWeekId) || db.weeks[0];

  return (
    <div className="fade page-shell">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Schedule</span>
          <h2 className="page-title">Calendar</h2>
          <p className="page-sub">Date-based schedule, missed-session reschedule, training map.</p>
        </div>

      </header>

      <section className="page-panel">
        <Calendar cursor={base} selected={form.date} onSelect={date=>setForm(f=>({...f,date}))} onMonth={date=>setMonthOffset((date.getFullYear()-now.getFullYear())*12+date.getMonth()-now.getMonth())} renderDay={date=>({recorded:sessionByDate.get(date)||0,scheduled:scheduled.filter(s=>s.date===date&&s.status!=='skipped').length})}/>
      </section>

      <div className="grid-2">
        <section className="page-panel stack">
          <div className="page-panel-head">
            <div>
              <span className="page-section-label">Plan ahead</span>
              <h3>Schedule workout</h3>
            </div>
          </div>
          <DraftFeedback draft={scheduleDraft}/><input className="input" type="date" aria-label="Scheduled date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input className="input" aria-label="Scheduled title" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select className="input" aria-label="Scheduled week" value={form.weekId} onChange={(e) => setForm({ ...form, weekId: e.target.value })}>
            <option value="">Link week (optional)</option>
            {db.weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select className="input" aria-label="Scheduled day" value={form.dayKey} onChange={(e) => setForm({ ...form, dayKey: e.target.value })}>
            <option value="">Day key (optional)</option>
            {(week?.days || []).map((d) => (
              <option key={d.key} value={d.key}>
                {d.key} · {d.title}
              </option>
            ))}
          </select>
          <input className="input" aria-label="Schedule notes" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button type="button" className="btn btn-hot" onClick={() => void addSchedule()}>
            Save schedule
          </button>
        </section>

        <section className="page-panel stack">
          <div className="page-panel-head">
            <div>
              <span className="page-section-label">Recovery protocol</span>
              <h3>Missed session protocol</h3>
            </div>
          </div>
          <p className="subtle" style={{ margin: 0 }}>
            Skip a day (counts for military order) or reschedule to a calendar date.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {(week?.days || []).map((d) => {
              const done = db.sessions.some(
                (s) => (s.status === 'finished' || s.status === 'completed') && (
                  (s.weekId === week.id && s.dayKey === d.key) ||
                  (d.scheduledDate ? s.date === d.scheduledDate : false)
                ),
              );
              if (done || d.type === 'rest') return null;
              return (
                <div key={d.key} className="page-panel" style={{ padding: 12, flex: '1 1 140px' }}>
                  <b>{d.key}</b>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    {d.title}
                  </div>
                  <button
                    type="button"
                    className="btn btn-soft btn-sm mt-2"
                    onClick={async () => {
                      try {
                        await app.api.missedSession({
                          action: 'skip',
                          weekId: week.id,
                          dayKey: d.key,
                          createEmptyRecord: true,
                          date: today(),
                        });
                        await app.refresh();
                        toast.push(`${d.key} marked skipped`, 'ok');
                      } catch (e) {
                        toast.push((e as Error).message, 'err');
                      }
                    }}
                  >
                    Skip day
                  </button>
                  <button
                    type="button"
                    className="btn btn-soft btn-sm mt-2"
                    onClick={() => void rescheduleMissed(week.id, d.key, form.date)}
                  >
                    → {form.date}
                  </button>
                </div>
              );
            })}
          </div>

          <h4 style={{ margin: '8px 0 0' }}>Upcoming scheduled</h4>
          <div className="page-list">
            {scheduled
              .filter((s) => s.date >= today())
              .slice(0, 12)
              .map((s) => (
                <div key={s.id} className="page-list-item">
                  <div>
                    <b>{s.date}</b> · {s.title}
                    <div className="subtle" style={{ fontSize: 12 }}>
                      {s.status} {s.dayKey || ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={async () => {
                      await app.api.deleteSchedule(s.id);
                      await app.refresh();
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            {!scheduled.length ? <div className="page-empty">No scheduled workouts yet.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
