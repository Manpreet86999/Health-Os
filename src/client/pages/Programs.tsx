import { useDraftFields } from '../lib/use-draft';
import { DraftFeedback } from '../components/DraftFeedback';
import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { weekStatus } from '../lib/utils';
import type { ProgramPhase, Week } from '../lib/types';

const PHASES: ProgramPhase[] = ['accumulate', 'intensify', 'deload', 'peak', 'other'];

function importPreview(value: unknown): Record<string, any> {
  let source: any = value;
  if (Array.isArray(source)) source = source.length === 1 ? source[0] : null;
  if (source && typeof source === 'object') source = source.week || (Array.isArray(source.weeks) && source.weeks.length === 1 ? source.weeks[0] : undefined) || source.plan || source.data || source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Choose a JSON file containing one training week.');
  const rawDays = Array.isArray(source.days) ? source.days : source.days && typeof source.days === 'object' ? Object.entries(source.days).map(([key, day]) => ({ key, ...(day as object) })) : Array.isArray(source.schedule) ? source.schedule : [];
  if (!rawDays.length) throw new Error('The imported plan has no days.');
  return { ...source, name: source.name || source.weekName || source.title || source.planName || 'Imported Week', days: rawDays };
}

const sampleWeek = (): Week => ({
  id: '',
  name: 'Health OS Week 4',
  weekNumber: 4,
  startDate: '',
  notes: 'Full import template.',
  active: false,
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((key, i) => ({
    key,
    type: i === 6 ? 'rest' : i % 3 === 0 ? 'push' : i % 3 === 1 ? 'pull' : 'legs',
    title: i === 6 ? 'RECOVERY DAY' : `Day ${key}`,
    subtitle: '',
    muscles: [],
    exercises:
      i === 6
        ? [{ name: 'Active Mobility', target: 'Systemic', vol: '20-30m', cue: 'Light flow' }]
        : [
            { name: 'Main Lift', target: 'Primary', vol: '4 x 6-8', cue: 'Progress when you hit the top reps.' },
            { name: 'Accessory', target: 'Secondary', vol: '3 x 10-12', cue: 'Controlled tempo.' },
          ],
  })),
});

function templatePpl(): Week {
  const day = (
    key: string,
    type: string,
    title: string,
    muscles: string[],
    exercises: Week['days'][0]['exercises'],
  ) => ({ key, type, title, subtitle: '', muscles, exercises });
  return {
    id: '',
    name: 'PPL Template',
    weekNumber: 1,
    startDate: '',
    notes: 'Push / Pull / Legs classic split.',
    active: false,
    days: [
      day('Mon', 'push', 'Push A', ['Chest', 'Shoulders', 'Triceps'], [
        { name: 'Bench Press', target: 'Chest', vol: '4 x 6-8', cue: 'Scapular retract' },
        { name: 'Overhead Press', target: 'Shoulders', vol: '3 x 8-10', cue: 'Brace core' },
        { name: 'Incline DB Press', target: 'Chest', vol: '3 x 10-12', cue: 'Control eccentric' },
        { name: 'Tricep Pushdown', target: 'Triceps', vol: '3 x 12-15', cue: 'Elbows pinned' },
      ]),
      day('Tue', 'pull', 'Pull A', ['Back', 'Biceps'], [
        { name: 'Deadlift or RDL', target: 'Back', vol: '3 x 5-6', cue: 'Hinge pattern' },
        { name: 'Pull-ups / Lat Pulldown', target: 'Back', vol: '4 x 6-10', cue: 'Full stretch' },
        { name: 'Barbell Row', target: 'Back', vol: '3 x 8-10', cue: 'Chest proud' },
        { name: 'Barbell Curl', target: 'Biceps', vol: '3 x 10-12', cue: 'No swing' },
      ]),
      day('Wed', 'legs', 'Legs A', ['Quads', 'Hamstrings', 'Glutes'], [
        { name: 'Back Squat', target: 'Quads', vol: '4 x 5-8', cue: 'Depth + brace' },
        { name: 'Romanian Deadlift', target: 'Hamstrings', vol: '3 x 8-10', cue: 'Soft knee' },
        { name: 'Walking Lunge', target: 'Legs', vol: '3 x 10/leg', cue: 'Upright torso' },
        { name: 'Calf Raise', target: 'Calves', vol: '3 x 12-15', cue: 'Full ROM' },
      ]),
      day('Thu', 'push', 'Push B', ['Chest', 'Shoulders', 'Triceps'], [
        { name: 'Incline Bench', target: 'Chest', vol: '4 x 6-8', cue: '45° max' },
        { name: 'Lateral Raise', target: 'Shoulders', vol: '3 x 12-15', cue: 'Lead with elbows' },
        { name: 'Dips', target: 'Triceps', vol: '3 x 8-12', cue: 'Slight lean' },
      ]),
      day('Fri', 'pull', 'Pull B', ['Back', 'Biceps'], [
        { name: 'Chest-supported Row', target: 'Back', vol: '4 x 8-10', cue: 'Squeeze mid-back' },
        { name: 'Seated Cable Row', target: 'Back', vol: '3 x 10-12', cue: 'Neutral spine' },
        { name: 'Face Pull', target: 'Rear delts', vol: '3 x 15', cue: 'External rotate' },
        { name: 'Hammer Curl', target: 'Biceps', vol: '3 x 10-12', cue: 'Neutral grip' },
      ]),
      day('Sat', 'legs', 'Legs B', ['Quads', 'Glutes'], [
        { name: 'Front Squat or Hack', target: 'Quads', vol: '3 x 8-10', cue: 'Upright' },
        { name: 'Hip Thrust', target: 'Glutes', vol: '3 x 8-12', cue: 'Full lockout' },
        { name: 'Leg Curl', target: 'Hamstrings', vol: '3 x 10-12', cue: 'Control' },
      ]),
      day('Sun', 'rest', 'RECOVERY', [], [
        { name: 'Walk + Mobility', target: 'Systemic', vol: '20-40m', cue: 'Easy zone 2' },
      ]),
    ],
  };
}

function templateUpperLower(): Week {
  const day = (
    key: string,
    type: string,
    title: string,
    muscles: string[],
    exercises: Week['days'][0]['exercises'],
  ) => ({ key, type, title, subtitle: '', muscles, exercises });
  return {
    id: '',
    name: 'Upper / Lower Template',
    weekNumber: 1,
    startDate: '',
    notes: 'Four hard days, three easy/recovery.',
    active: false,
    days: [
      day('Mon', 'upper', 'Upper A', ['Chest', 'Back', 'Shoulders'], [
        { name: 'Bench Press', target: 'Chest', vol: '4 x 5-8', cue: '' },
        { name: 'Bent-over Row', target: 'Back', vol: '4 x 6-8', cue: '' },
        { name: 'OHP', target: 'Shoulders', vol: '3 x 8', cue: '' },
        { name: 'Lat Pulldown', target: 'Back', vol: '3 x 10', cue: '' },
      ]),
      day('Tue', 'lower', 'Lower A', ['Quads', 'Hamstrings'], [
        { name: 'Squat', target: 'Quads', vol: '4 x 5-8', cue: '' },
        { name: 'RDL', target: 'Hamstrings', vol: '3 x 8', cue: '' },
        { name: 'Leg Press', target: 'Quads', vol: '3 x 10-12', cue: '' },
      ]),
      day('Wed', 'rest', 'Active Rest', [], [
        { name: 'Mobility / Walk', target: 'Systemic', vol: '30m', cue: '' },
      ]),
      day('Thu', 'upper', 'Upper B', ['Chest', 'Back', 'Arms'], [
        { name: 'Incline Press', target: 'Chest', vol: '4 x 8', cue: '' },
        { name: 'Pull-up', target: 'Back', vol: '4 x AMRAP', cue: '' },
        { name: 'Lateral Raise', target: 'Shoulders', vol: '3 x 15', cue: '' },
        { name: 'Curl + Extension', target: 'Arms', vol: '3 x 12', cue: '' },
      ]),
      day('Fri', 'lower', 'Lower B', ['Glutes', 'Quads'], [
        { name: 'Deadlift variation', target: 'Posterior', vol: '3 x 5', cue: '' },
        { name: 'Split Squat', target: 'Quads', vol: '3 x 8/leg', cue: '' },
        { name: 'Leg Curl', target: 'Hamstrings', vol: '3 x 12', cue: '' },
      ]),
      day('Sat', 'rest', 'Optional Cardio', [], [
        { name: 'Zone 2 Cardio', target: 'Systemic', vol: '30-45m', cue: '' },
      ]),
      day('Sun', 'rest', 'RECOVERY', [], [
        { name: 'Full rest or walk', target: 'Systemic', vol: 'as needed', cue: '' },
      ]),
    ],
  };
}

function templateFullBody(): Week {
  const fb = (key: string, title: string): Week['days'][0] => ({
    key,
    type: 'full',
    title,
    subtitle: 'Compound-first full body',
    muscles: ['Full body'],
    exercises: [
      { name: 'Squat pattern', target: 'Quads', vol: '3 x 6-8', cue: '' },
      { name: 'Hinge pattern', target: 'Posterior', vol: '3 x 6-8', cue: '' },
      { name: 'Horizontal press', target: 'Chest', vol: '3 x 8', cue: '' },
      { name: 'Horizontal pull', target: 'Back', vol: '3 x 8', cue: '' },
      { name: 'Core finisher', target: 'Core', vol: '2 x 30-60s', cue: '' },
    ],
  });
  return {
    id: '',
    name: 'Full Body 3x Template',
    weekNumber: 1,
    startDate: '',
    notes: 'Three full-body sessions with recovery between.',
    active: false,
    days: [
      fb('Mon', 'Full Body A'),
      { key: 'Tue', type: 'rest', title: 'Rest', subtitle: '', muscles: [], exercises: [] },
      fb('Wed', 'Full Body B'),
      { key: 'Thu', type: 'rest', title: 'Rest', subtitle: '', muscles: [], exercises: [] },
      fb('Fri', 'Full Body C'),
      { key: 'Sat', type: 'rest', title: 'Active recovery', subtitle: '', muscles: [], exercises: [{ name: 'Walk', target: 'Systemic', vol: '30m', cue: '' }] },
      { key: 'Sun', type: 'rest', title: 'Rest', subtitle: '', muscles: [], exercises: [] },
    ],
  };
}

export function Programs() {
  const app = useApp();
  const toast = useToast();
  const { db, setPage, setActiveDay, setManualDay } = app;
  
  const draft=useDraftFields('program-composer',()=>({id:crypto.randomUUID(),name:'',notes:'',selectedWeeks:[] as Array<{weekId:string;phase:ProgramPhase}>}));
  const [name,setName]=draft.field('name');
  const [notes,setNotes]=draft.field('notes');
  const [selectedWeeks,setSelectedWeeks]=draft.field('selectedWeeks');
  const importDraft=useDraftFields('program-week-import',()=>({id:crypto.randomUUID(),json:''}));const [json,setJson]=importDraft.field('json');
  const [selected, setSelected] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [biomech, setBiomech] = useState<Record<string, string[]>>({});
  const [busyBiomech, setBusyBiomech] = useState<Record<string, boolean>>({});

  if (!db) return null;

  if (db.trainingConfig?.preplannedWeekMode === false) {
    return <div className="fade page-shell"><section className="page-panel stack"><span className="pill pill-green">Flexible training active</span><h2 style={{ margin: 0 }}>Programs are paused</h2><p className="subtle">Preplanned Week is off, so only your current flexible Monday–Sunday week can run. Saved programs remain safely stored, but cannot be activated until you turn Preplanned Week back on in Settings.</p><button className="btn btn-hot" type="button" onClick={() => setPage('Dashboard')}>Open today&apos;s flexible workout</button></section></div>;
  }

  const programs = db.programs || [];
  const activeId = db.meta.activeWeekId;
  const isAiEnabled = app.settings?.hasAiApiKey || app.settings?.aiProvider === 'ollama';

  async function getBiomechanics(exercise: string) {
    setBusyBiomech((p) => ({ ...p, [exercise]: true }));
    try {
      const res = await app.api.exerciseCues(exercise);
      if (!res.ok) {
        toast.push(res.error || 'Failed to load biomechanics', 'err');
        return;
      }
      setBiomech((p) => ({ ...p, [exercise]: res.cues || [] }));
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusyBiomech((p) => ({ ...p, [exercise]: false }));
    }
  }

  async function importWeek(value = json) {
    try {
      const plan=importPreview(JSON.parse(value));
      const week = await app.api.importWeek({...plan,id:plan.id||importDraft.value.id});
      importDraft.setValue({id:crypto.randomUUID(),json:''});await importDraft.clear();
      setSelected(week.id);
      await app.refresh();
      toast.push('Week imported', 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  function toggleWeek(weekId: string) {
    setSelectedWeeks((prev) => {
      const exists = prev.find((w) => w.weekId === weekId);
      if (exists) return prev.filter((w) => w.weekId !== weekId);
      return [...prev, { weekId, phase: 'accumulate' }];
    });
  }

  async function saveProgram() {
    if (!name.trim() || !selectedWeeks.length) {
      toast.push('Name and at least one week required', 'err');
      return;
    }
    try {
      await app.api.saveProgram({
        id: draft.value.id,
        name: name.trim(),
        notes,
        active: true,
        weeks: selectedWeeks.map((w, i) => ({
          weekId: w.weekId,
          weekNumber: i + 1,
          phase: w.phase,
          name: db!.weeks.find((x) => x.id === w.weekId)?.name,
        })),
      });
      setName('');
      setNotes('');
      setSelectedWeeks([]);draft.setValue(current=>({...current,id:crypto.randomUUID()}));await draft.clear();
      await app.refresh();
      toast.push('Program saved', 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  async function buildDeload(weekId: string) {
    try {
      const w = await app.api.createDeloadWeek(weekId, 0.6);
      await app.refresh();
      toast.push(`Deload week created: ${w.name}`, 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  return (
    <div className="fade page-shell programs-workspace">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Mesocycles</span>
          <h2 className="page-title">Programs / Mesocycles</h2>
          <p className="page-sub">Multi-week blocks with phase roles (accumulate → intensify → deload → peak).</p>
        </div>
      </header>

      <section className="page-panel stack">
        <button
          type="button"
          className="page-panel-head"
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}
          aria-expanded={isComposeOpen}
          onClick={() => setIsComposeOpen((open) => !open)}
        >
          <div>
            <span className="page-section-label">Compose</span>
            <h3>New program</h3><DraftFeedback draft={draft}/>
          </div>
          <span className="subtle" aria-hidden="true">{isComposeOpen ? '▾' : '▸'}</span>
        </button>
        {isComposeOpen ? (
          <>
            <label className="form-field"><span>Program name</span><input className="input" placeholder="Program name" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="form-field"><span>Notes</span><textarea className="input" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></label>
            <div className="page-list">
              {db.weeks.map((w) => {
                const sel = selectedWeeks.find((x) => x.weekId === w.id);
                return (
                  <div key={w.id} className="page-list-item" style={{ alignItems: 'center' }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={Boolean(sel)} onChange={() => toggleWeek(w.id)} />
                      <span>
                        <b>{w.name}</b>
                        <span className="subtle"> · W{w.weekNumber || '?'}</span>
                      </span>
                    </label>
                    {sel ? (
                      <label className="form-field"><span>Sel</span><select
                        className="input"
                        style={{ maxWidth: 160 }}
                        value={sel.phase}
                        onChange={(e) =>
                          setSelectedWeeks((prev) =>
                            prev.map((x) =>
                              x.weekId === w.id ? { ...x, phase: e.target.value as ProgramPhase } : x,
                            ),
                          )
                        }
                      >
                        {PHASES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select></label>
                    ) : (
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => void buildDeload(w.id)}>
                        Build deload from this
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn btn-hot" disabled={!draft.ready} onClick={() => void saveProgram()}>
              Save program
            </button>
          </>
        ) : null}
      </section>

      <div className="stack">
        <span className="page-section-label">Library</span>
        <h3 style={{ margin: '0 0 8px' }}>Saved Programs</h3>
        {programs.map((p) => (
          <div key={p.id} className="page-panel">
            <div className="toolbar">
              <div>
                <span className={`pill ${p.active ? 'pill-green' : 'pill-slate'}`}>{p.active ? 'Active' : 'Saved'}</span>
                <h3 style={{ margin: '8px 0 0' }}>{p.name}</h3>
                <p className="subtle">{p.notes || 'No notes'}</p>
              </div>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={async () => {
                  await app.api.deleteProgram(p.id);
                  await app.refresh();
                }}
              >
                Delete
              </button>
            </div>
            <div className="page-list mt-3">
              {(p.weeks || []).map((w) => {
                const week = db.weeks.find((x) => x.id === w.weekId);
                return (
                  <div key={w.weekId} className="page-list-item">
                    <span>
                      W{w.weekNumber}: {week?.name || w.name || w.weekId}
                    </span>
                    <span className="pill pill-orange">{w.phase}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!programs.length ? <div className="page-empty">No programs yet — group weeks into a mesocycle above.</div> : null}
      </div>

      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Blocks</span>
          <h2 className="page-title">Weeks</h2>
          <p className="page-sub">Import, activate, and manage single training blocks. Use built-in templates to start fast.</p>
        </div>
      </header>

      <section className="page-panel">
        <div className="page-panel-head">
          <div>
            <span className="page-section-label">Quick start</span>
            <h3>Built-in templates</h3>
          </div>
        </div>
        <p className="subtle mb-3">Import a ready-made week, then edit it in Planner.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {[
            { label: 'Push / Pull / Legs', build: templatePpl },
            { label: 'Upper / Lower', build: templateUpperLower },
            { label: 'Full Body 3x', build: templateFullBody },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              className="btn btn-hot"
              onClick={async () => {
                try {
                  const week = await app.api.importWeek(t.build() as unknown as Record<string, unknown>);
                  setSelected(week.id);
                  await app.refresh();
                  toast.push(`${t.label} imported`, 'ok');
                } catch (e) {
                  toast.push((e as Error).message, 'err');
                }
              }}
            >
              + {t.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => setJson(JSON.stringify(templatePpl(), null, 2))}
          >
            Preview PPL JSON
          </button>
        </div>
      </section>

      <details className="flow-details"><summary>Import a training week · file or JSON</summary><section className="page-panel">
        <div className="page-panel-head">
          <div>
            <span className="page-section-label">JSON</span>
            <h3>Import Full Week Plan</h3>
          </div>
        </div>
        <p className="subtle mb-3">Paste one full JSON week or select a JSON file. Single-week exports and common plan wrappers are supported.</p>
        <DraftFeedback draft={importDraft}/><label htmlFor="week-import-json">Week JSON</label><textarea id="week-import-json"
          className="input min-h-220 mono"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{"name":"Health OS Week 4","weekNumber":4,"days":[...]}'
        />
        {json.trim()&&(()=>{try{const plan=JSON.parse(json);return <p role="status">Preview: {plan.name||'Unnamed week'} · {plan.days?.length||0} days. Review the JSON before importing.</p>;}catch{return <p role="status">Complete the JSON to preview this week.</p>;}})()}
        <div className="row mt-3">
          <button type="button" className="btn btn-hot" onClick={() => void importWeek()}>
            Import Full Week
          </button>
          <label className="btn btn-soft" style={{ cursor: 'pointer' }}>
            Select & Import File
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const text = await f.text();
                  const plan = importPreview(JSON.parse(text));
                  const normalized = JSON.stringify(plan, null, 2);
                  setJson(normalized);
                  await importWeek(normalized);
                } catch (error) {
                  toast.push(error instanceof Error ? error.message : 'Could not read that JSON file.', 'err');
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              const blob = new Blob([JSON.stringify(sampleWeek(), null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'workout-os-full-week-template.json';
              a.click();
            }}
          >
            Download Template
          </button>
          <button type="button" className="btn btn-soft" onClick={() => setJson(JSON.stringify(sampleWeek(), null, 2))}>
            Fill Template
          </button>
        </div>
      </section></details>

      <div className="stack">
        <span className="page-section-label">Your blocks</span>
        <h3 style={{ margin: '0 0 8px' }}>Saved Weeks</h3>
        {db.weeks.map((w) => {
          const status = weekStatus(w, db.sessions);
          const active = w.id === activeId;
          const open = selected === w.id;
          return (
            <div key={w.id} className="page-panel">
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-soft"
                  style={{ flex: 1, textAlign: 'left' }}
                  onClick={() => setSelected(open ? null : w.id)}
                >
                  <span className={`pill ${active ? 'pill-green' : 'pill-slate'}`}>{active ? 'Active' : 'Saved'}</span>{' '}
                  <span className={`pill ${status.complete ? 'pill-blue' : 'pill-orange'}`}>{status.label}</span>
                  <div style={{ fontWeight: 900, marginTop: 8 }}>
                    {open ? '▾' : '▸'} {w.name}
                  </div>
                  <div className="subtle">
                    {w.days.length} days
                    {w.weekNumber ? ` · Week ${w.weekNumber}` : ''} · {status.done}/{status.total} workout days
                  </div>
                </button>
                <div style={{ position: 'relative' }}>
                  <button type="button" className="btn btn-soft" onClick={() => setMenuId(menuId === w.id ? null : w.id)}>
                    ⋯
                  </button>
                  {menuId === w.id ? (
                    <div className="menu-panel" style={{ position: 'absolute', right: 0, top: 48, width: 220 }}>
                      <button type="button" className="menu-link" onClick={() => { setSelected(w.id); setMenuId(null); }}>
                        View full plan
                      </button>
                      <button
                        type="button"
                        className="menu-link"
                        disabled={active}
                        onClick={async () => {
                          await app.api.activateWeek(w.id);
                          setMenuId(null);
                          await app.refresh();
                          toast.push('Week activated', 'ok');
                        }}
                      >
                        Activate week
                      </button>
                      <button
                        type="button"
                        className="menu-link"
                        onClick={async () => {
                          if (!window.confirm('Mark pending days complete?')) return;
                          await app.api.completeWeek(w.id);
                          setMenuId(null);
                          await app.refresh();
                        }}
                      >
                        Complete week
                      </button>
                      <button
                        type="button"
                        className="menu-link"
                        onClick={async () => {
                          const copy = await app.api.duplicateWeek(w.id);
                          setSelected(copy.id);
                          setMenuId(null);
                          await app.refresh();
                        }}
                      >
                        Duplicate week
                      </button>
                      <button type="button" className="menu-link" style={{ color: '#be123c' }} onClick={() => { setDeleteId(w.id); setMenuId(null); }}>
                        Delete week
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              {open ? (
                <section className="mt-5">
                  <p className="subtle">{w.notes || 'No notes.'}</p>
                  <div className="row mt-3">
                    {active ? (
                      <button
                        type="button"
                        className="btn btn-hot"
                        onClick={() => {
                          setActiveDay(w.days[0]?.key || 'Mon');
                          setManualDay(true);
                          setPage('Dashboard');
                        }}
                      >
                        Start This Week
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-dark"
                        onClick={async () => {
                          await app.api.activateWeek(w.id);
                          await app.refresh();
                        }}
                      >
                        Activate This Week
                      </button>
                    )}
                  </div>
                  <div className="stack mt-4">
                    {w.days.map((d) => {
                      const done = db.sessions.some(
                        (s) => s.weekId === w.id && s.dayKey === d.key && (s.status === 'finished' || s.status === 'completed'),
                      );
                      return (
                        <div key={d.key} className="page-panel" style={{ padding: 14 }}>
                          <div className="toolbar">
                            <div>
                              <span className="pill pill-slate">{d.key}</span>{' '}
                              <span className={`pill ${done ? 'pill-green' : 'pill-orange'}`}>
                                {done ? 'Completed' : 'Pending'}
                              </span>
                              <h4 style={{ margin: '8px 0 0' }}>{d.title}</h4>
                              <p className="subtle">{d.subtitle}</p>
                            </div>
                            {active ? (
                              <button
                                type="button"
                                className="btn btn-soft"
                                onClick={() => {
                                  setActiveDay(d.key);
                                  setManualDay(true);
                                  setPage('Planner');
                                }}
                              >
                                Edit
                              </button>
                            ) : null}
                          </div>
                          <div className="page-list mt-3">
                            {(d.exercises || []).map((e, i) => (
                              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div className="page-list-item">
                                  <div>
                                    <b>
                                      {i + 1}. {e.name}
                                    </b>
                                    <div className="subtle">{e.cue}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <span className="pill pill-pink">{e.target}</span>
                                    <div className="subtle">{e.vol}</div>
                                  </div>
                                </div>
                                {isAiEnabled && (
                                  <div style={{ paddingLeft: 16 }}>
                                    {!biomech[e.name] ? (
                                      <button 
                                        className="btn btn-soft btn-sm" 
                                        style={{ fontSize: 11 }}
                                        disabled={busyBiomech[e.name]} 
                                        onClick={() => getBiomechanics(e.name)}
                                      >
                                        {busyBiomech[e.name] ? 'Analyzing...' : '🔬 Deep-Dive Biomechanics'}
                                      </button>
                                    ) : (
                                      <div className="page-ai-strip" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: 'var(--hot)' }}>AI Biomechanics</h4>
                                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.5 }}>
                                          {biomech[e.name].map((c, idx) => <li key={idx}>{c}</li>)}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          );
        })}
      </div>

      <Modal
        open={Boolean(deleteId)}
        title="Delete week?"
        onClose={() => setDeleteId(null)}
        actions={
          <>
            <button type="button" className="btn btn-soft" onClick={() => setDeleteId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                try {
                  if (!deleteId) return;
                  await app.api.deleteWeek(deleteId);
                  setDeleteId(null);
                  setSelected(null);
                  await app.refresh();
                  toast.push('Week deleted', 'ok');
                } catch (e) {
                  toast.push((e as Error).message, 'err');
                }
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p>Deletes this week and its saved records from the local database.</p>
      </Modal>

    </div>
  );
}
