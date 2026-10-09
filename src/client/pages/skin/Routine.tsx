import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useToast } from '../../components/Toast';
import { today } from '../../lib/utils';
import type { RoutineSlot, SkinRoutine } from '../../../shared/skin';
import { logForDate } from '../../../shared/skin';

export function SkinRoutine() {
  const app = useApp();
  const toast = useToast();
  const { skin, refreshSkin } = app;
  const date = today();
  const todayLog = logForDate(skin.logs, date);
  const [busy, setBusy] = useState(false);
  const [draftLabel, setDraftLabel] = useState<Record<RoutineSlot, string>>({ am: '', pm: '' });

  async function saveRoutine(next: SkinRoutine) {
    setBusy(true);
    try {
      await app.api.saveSkinRoutine(next);
      await refreshSkin();
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function addStep(slot: RoutineSlot) {
    const label = (draftLabel[slot] || '').trim();
    if (!label) return;
    const routine = skin.routines.find((r) => r.slot === slot);
    if (!routine) return;
    const product = skin.products.find((p) => p.name.toLowerCase() === label.toLowerCase());
    await saveRoutine({
      ...routine,
      steps: [
        ...routine.steps,
        {
          id: crypto.randomUUID(),
          productId: product?.id || '',
          label,
          waitMin: 0,
          notes: '',
          paused: false,
        },
      ],
    });
    setDraftLabel((d) => ({ ...d, [slot]: '' }));
  }

  async function move(slot: RoutineSlot, index: number, dir: -1 | 1) {
    const routine = skin.routines.find((r) => r.slot === slot);
    if (!routine) return;
    const next = [...routine.steps];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    await saveRoutine({ ...routine, steps: next });
  }

  async function remove(slot: RoutineSlot, index: number) {
    const routine = skin.routines.find((r) => r.slot === slot);
    if (!routine) return;
    await saveRoutine({ ...routine, steps: routine.steps.filter((_, i) => i !== index) });
  }

  async function toggleDone(slot: RoutineSlot) {
    try {
      await app.api.saveSkinLog({
        ...(todayLog || {
          date,
          // Completing a routine is evidence of completion, not a skin
          // assessment. Keep observations empty until the member records them.
          barrier: null,
          hydration: null,
          oiliness: null,
          irritation: null,
          concerns: [],
          notes: '',
        }),
        date,
        skipReview: true,
        routineDone: {
          am: slot === 'am' ? !todayLog?.routineDone.am : Boolean(todayLog?.routineDone.am),
          pm: slot === 'pm' ? !todayLog?.routineDone.pm : Boolean(todayLog?.routineDone.pm),
        },
      });
      await refreshSkin();
      toast.push(`${slot.toUpperCase()} ${todayLog?.routineDone[slot] ? 'reopened' : 'logged'}`, 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  return (
    <div className="fade page-shell skin-os">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Routine</span>
          <h1 className="page-title">AM / PM protocol</h1>
          <p className="page-sub">The coach writes this from your shelf. Mark done when you finish the slot.</p>
        </div>
        <button
          type="button"
          className="btn btn-hot"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await app.api.skinBuildRoutine('Build AM and PM from my shelf and link products.');
              await refreshSkin();
              toast.push(res.ok ? res.notes || 'Routine built' : res.error || 'Build failed', res.ok ? 'ok' : 'err');
            } catch (e) {
              toast.push((e as Error).message, 'err');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Building…' : 'Build with AI'}
        </button>
      </header>

      <div className="grid-2">
        {(['am', 'pm'] as RoutineSlot[]).map((slot) => {
          const routine = skin.routines.find((r) => r.slot === slot);
          const done = Boolean(todayLog?.routineDone[slot]);
          return (
            <section key={slot} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <p className="page-eyebrow">{slot === 'am' ? 'Morning' : 'Night'}</p>
                  <h3 style={{ margin: 0 }}>{routine?.name || `${slot.toUpperCase()} routine`}</h3>
                </div>
                <button type="button" className={`btn ${done ? 'btn-soft' : 'btn-hot'} btn-sm`} onClick={() => void toggleDone(slot)}>
                  {done ? 'Undo log' : 'Mark done'}
                </button>
              </div>
              <ol className="skin-steps">
                {(routine?.steps || []).map((step, i) => (
                  <li key={step.id} className={step.paused ? 'paused' : ''}>
                    <span className="skin-step-idx">{i + 1}</span>
                    <div className="skin-step-body">
                      <strong>{step.label}</strong>
                      <span className="subtle">
                        {step.paused ? 'Paused by coach' : step.productId ? (step.waitMin ? `Wait ${step.waitMin} min` : 'Linked') : 'Not on shelf'}
                      </span>
                    </div>
                    <div className="skin-step-ops">
                      <button type="button" className="icon-btn" disabled={busy} onClick={() => void move(slot, i, -1)} aria-label="Move up">
                        ↑
                      </button>
                      <button type="button" className="icon-btn" disabled={busy} onClick={() => void move(slot, i, 1)} aria-label="Move down">
                        ↓
                      </button>
                      <button type="button" className="icon-btn" disabled={busy} onClick={() => void remove(slot, i)} aria-label="Remove">
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="row">
                <input
                  className="input"
                  list={`skin-products-${slot}`}
                  placeholder="Add step or product name"
                  value={draftLabel[slot]}
                  onChange={(e) => setDraftLabel((d) => ({ ...d, [slot]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addStep(slot);
                    }
                  }}
                />
                <datalist id={`skin-products-${slot}`}>
                  {skin.products.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>
                <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void addStep(slot)}>
                  Add
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
