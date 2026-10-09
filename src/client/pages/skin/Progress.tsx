import { useDraftState, useDraftFields } from '../../lib/use-draft';
import { DraftFeedback } from '../../components/DraftFeedback';
import { useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../../state/AppContext';
import { useToast } from '../../components/Toast';
import { lastNDays, today } from '../../lib/utils';
import { SKIN_CONCERNS, logForDate, skinStatusScore } from '../../../shared/skin';

export function SkinProgress() {
  const app = useApp();
  const toast = useToast();
  const { skin, refreshSkin } = app;
  const date = today();
  const existing = logForDate(skin.logs, date);
  const draft=useDraftState('care-journal:'+date,() => ({
    barrier: existing?.barrier ?? 6,
    hydration: existing?.hydration ?? 6,
    oiliness: existing?.oiliness ?? 5,
    irritation: existing?.irritation ?? 2,
    concerns: existing?.concerns ?? [],
    notes: existing?.notes ?? '',
    am: existing?.routineDone.am ?? false,
    pm: existing?.routineDone.pm ?? false,
  }));
  const {value:form,setValue:setForm}=draft;
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ comment: string; adjustments: string[] } | null>(
    existing?.aiComment ? { comment: existing.aiComment, adjustments: existing.aiAdjustments || [] } : null,
  );

  const days = lastNDays(14);
  const byDate = useMemo(() => new Map(skin.logs.map((l) => [l.date, l])), [skin.logs]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await app.api.saveSkinLog({
        id: existing?.id,
        date,
        barrier: form.barrier,
        hydration: form.hydration,
        oiliness: form.oiliness,
        irritation: form.irritation,
        concerns: form.concerns,
        notes: form.notes,
        routineDone: { am: form.am, pm: form.pm },
      });
      await draft.clear();
      await refreshSkin();
      if (res.review) {
        setReview(res.review);
        toast.push(res.review.adjustments?.length ? 'Logged — coach adjusted the routine' : 'Logged — coach commented', 'ok');
      } else {
        toast.push('Skin log saved', 'ok');
      }
    } catch (err) {
      toast.push((err as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade page-shell skin-os">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Progress</span>
          <h1 className="page-title">Barrier journal</h1>
          <p className="page-sub">Daily scores, not selfies. Track barrier, hydration, oil, and irritation.</p>
        </div>
      </header>

      <form className="card stack" onSubmit={save}><DraftFeedback draft={draft}/>
        <p className="page-eyebrow" style={{ margin: 0 }}>
          Today · {date}
        </p>
        <div className="skin-sliders">
          <Slider label="Barrier" value={form.barrier} onChange={(v) => setForm((f) => ({ ...f, barrier: v }))} />
          <Slider label="Hydration" value={form.hydration} onChange={(v) => setForm((f) => ({ ...f, hydration: v }))} />
          <Slider label="Oiliness" value={form.oiliness} onChange={(v) => setForm((f) => ({ ...f, oiliness: v }))} />
          <Slider label="Irritation" value={form.irritation} onChange={(v) => setForm((f) => ({ ...f, irritation: v }))} />
        </div>
        <div className="skin-chips">
          {SKIN_CONCERNS.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${form.concerns.includes(c) ? 'ready-ok' : ''}`}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  concerns: f.concerns.includes(c) ? f.concerns.filter((x) => x !== c) : [...f.concerns, c],
                }))
              }
            >
              {c}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="chip">
            <input type="checkbox" checked={form.am} onChange={(e) => setForm((f) => ({ ...f, am: e.target.checked }))} /> AM done
          </label>
          <label className="chip">
            <input type="checkbox" checked={form.pm} onChange={(e) => setForm((f) => ({ ...f, pm: e.target.checked }))} /> PM done
          </label>
        </div>
        <textarea
          className="input"
          aria-label="Journal notes" placeholder="Notes — flaking, new product, weather, sleep."
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
        <button className="btn btn-hot" type="submit" disabled={busy||!draft.ready}>
          {busy ? 'Coach is reviewing…' : existing ? 'Save & review' : 'Save & review'}
        </button>
      </form>

      {review ? (
        <section className="card stack">
          <p className="page-eyebrow" style={{ margin: 0 }}>
            Coach
          </p>
          <p style={{ margin: 0, fontWeight: 550 }}>{review.comment}</p>
          {review.adjustments?.length ? (
            <ul className="skin-advice">
              {review.adjustments.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="card">
        <p className="page-eyebrow">14-day trend</p>
        <div className="skin-bars">
          {days.map((d) => {
            const log = byDate.get(d);
            const score = skinStatusScore(log);
            return (
              <div key={d} className="skin-bar" role="img" aria-label={`${d}: ${score==null?'Not recorded':score+' /100'}`} title={log ? `${d} · ${score}` : d}>
                <div className="skin-bar-fill" style={{ height: `${score ?? 0}%` }} />
                <span>{d.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="skin-slider">
      <span>
        {label} <b>{value}</b>
      </span>
      <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
