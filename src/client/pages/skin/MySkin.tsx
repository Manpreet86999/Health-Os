import { TextAreaField } from '../../components/TextAreaField';
import { useDraftState, useDraftFields } from '../../lib/use-draft';
import { DraftFeedback } from '../../components/DraftFeedback';
import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useToast } from '../../components/Toast';
import { SKIN_CONCERNS, SKIN_TYPES, SKIN_TYPE_LABEL, type SkinType } from '../../../shared/skin';

export function SkinProfilePage() {
  const app = useApp();
  const toast = useToast();
  const { skin, refreshSkin } = app;
  const draft=useDraftState('care-profile',{
    skinType: skin.profile.skinType,
    concerns: skin.profile.concerns,
    sensitivities: skin.profile.sensitivities.join(', '),
    goals: skin.profile.goals.join(', '),
    climate: skin.profile.climate,
    hairTexture: skin.profile.hairTexture || '',
    scalpNotes: skin.profile.scalpNotes || '',
    bodyNotes: skin.profile.bodyNotes || '',
    treatmentNotes: skin.profile.treatmentNotes || '',
    notes: skin.profile.notes,
  });
  const {value:form,setValue:setForm}=draft;
  const [busy, setBusy] = useState(false);

  function toggleConcern(c: string) {
    setForm((f) => ({
      ...f,
      concerns: f.concerns.includes(c) ? f.concerns.filter((x) => x !== c) : [...f.concerns, c],
    }));
  }

  async function save() {
    setBusy(true);
    try {
      await app.api.saveSkinProfile({
        skinType: form.skinType,
        concerns: form.concerns,
        sensitivities: splitList(form.sensitivities),
        goals: splitList(form.goals),
        climate: form.climate,
        hairTexture: form.hairTexture,
        scalpNotes: form.scalpNotes,
        bodyNotes: form.bodyNotes,
        treatmentNotes: form.treatmentNotes,
        notes: form.notes,
      });
      await draft.clear();
      await refreshSkin();
      toast.push('Skin profile saved', 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade page-shell skin-os">
      <DraftFeedback draft={draft}/><header className="page-hero">
        <div>
          <span className="page-eyebrow">My Profile</span>
          <h1 className="page-title">My Profile</h1>
          <p className="page-sub">
            Your skin, hair, scalp, body areas, sensitivities, and treatments. You can leave anything unknown.
          </p>
        </div>
        <div className="page-hero-actions">
          <button type="button" className="btn btn-hot" disabled={busy||!draft.ready} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </header>

      <div className="grid-2">
        <section className="card stack">
          <div>
            <p className="page-eyebrow">Skin type</p>
            <h3 style={{ margin: 0 }}>Baseline</h3>
          </div>
          <div className="skin-type-grid">
            {SKIN_TYPES.filter((t) => t !== 'unknown').map((t) => (
              <button
                key={t}
                type="button"
                className={`kd-ws ${form.skinType === t ? 'active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, skinType: t as SkinType }))}
              >
                {SKIN_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <label className="stack" style={{ gap: 6 }}>
            <span className="subtle">Climate / environment</span>
            <input
              className="input"
              value={form.climate}
              onChange={(e) => setForm((f) => ({ ...f, climate: e.target.value }))}
              placeholder="Humid summers, dry AC, hard water…"
            />
          </label>
        </section>

        <section className="card stack">
          <div>
            <p className="page-eyebrow">Concerns</p>
            <h3 style={{ margin: 0 }}>What you are training</h3>
          </div>
          <div className="skin-chips">
            {SKIN_CONCERNS.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${form.concerns.includes(c) ? 'ready-ok' : ''}`}
                onClick={() => toggleConcern(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="card stack">
        <h3>Hair, scalp & body</h3>
        <label>Hair texture / characteristics<input className="input" value={form.hairTexture} onChange={e => setForm(f => ({...f,hairTexture:e.target.value}))} placeholder="Fine, curly, color-treated, unknown…" /></label>
        <TextAreaField label="Scalp observations" className="input" value={form.scalpNotes} onChange={e => setForm(f => ({...f,scalpNotes:e.target.value}))} placeholder="Wash frequency, itch, flaking, sensitivity…"/>
        <TextAreaField label="Body skin and affected areas" className="input" value={form.bodyNotes} onChange={e => setForm(f => ({...f,bodyNotes:e.target.value}))} placeholder="Arms, back, shaving areas…"/>
        <TextAreaField label="Existing treatments or clinician instructions" className="input" value={form.treatmentNotes} onChange={e => setForm(f => ({...f,treatmentNotes:e.target.value}))} placeholder="Record what you already use or have been told"/>
      </section>

      <section className="card stack">
        <label className="stack" style={{ gap: 6 }}>
          <span className="subtle">Sensitivities (comma separated)</span>
          <input
            className="input"
            value={form.sensitivities}
            onChange={(e) => setForm((f) => ({ ...f, sensitivities: e.target.value }))}
            placeholder="fragrance, niacinamide, essential oils…"
          />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="subtle">Goals</span>
          <input
            className="input"
            value={form.goals}
            onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))}
            placeholder="calm redness, even tone, keep barrier intact…"
          />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="subtle">Notes</span>
          <textarea
            className="input"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="History, prescriptions to avoid overlapping, patch-test notes."
          />
        </label>
      </section>
    </div>
  );
}

function splitList(v: string): string[] {
  return v
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
