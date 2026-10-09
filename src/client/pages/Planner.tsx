import { useDraftState, useDraftFields } from '../lib/use-draft';
import { DraftFeedback } from '../components/DraftFeedback';
import { useEffect, useMemo, useState } from 'react';

import { useToast } from '../components/Toast';
import { useApp } from '../state/AppContext';
import type { PlannedExercise } from '../lib/types';
import { applyProgressionToPlan, parseRepRange, weightFromPercent1rm } from '../../shared/training';
import { swapWeekDayExercises } from '../../shared/planner';

export function Planner() {
  const app = useApp();
  const toast = useToast();
  const { db, activeDay, setActiveDay, setManualDay, setPage, settings, analytics } = app;
  const plannedWeeks = db ? db.weeks.filter((w) => w.mode !== 'flexible' && w.status !== 'program') : [];
  const week = db ? plannedWeeks.find((w) => w.id === db.meta.activeWeekId) || plannedWeeks[0] || null : null;
  const day = week ? week.days.find((d) => d.key === activeDay) || week.days[0] : null;
  const planDraft=useDraftFields('planner:'+(week?.id||'none')+':'+(day?.key||'none'),()=>({exercises:structuredClone(day?.exercises||[]) as PlannedExercise[],dayMeta:{title:day?.title||'',type:day?.type||'',subtitle:day?.subtitle||'',muscles:(day?.muscles||[]).join(', ')}}));
  const [exercises,setExercises]=planDraft.field('exercises');
  const [dayMeta,setDayMeta]=planDraft.field('dayMeta');
  const [genPrompt, setGenPrompt] = useState('');
  const [busyGen, setBusyGen] = useState(false);
  const [genModel, setGenModel] = useState('');
  const [dirty, setDirty] = useState(false);
  const [copyFrom, setCopyFrom] = useState('');
  const [swapWith, setSwapWith] = useState('');
  const [swapping, setSwapping] = useState(false);
  const isActiveWeek = Boolean(week && week.id === db?.meta.activeWeekId);

  const nameSuggestions = useMemo(() => {
    if (!db) return [] as string[];
    const names = new Set<string>();
    for (const s of db.sessions) {
      for (const log of s.logs || []) {
        if (log.name) names.add(log.name);
      }
    }
    for (const w of db.weeks) {
      for (const d of w.days) {
        for (const e of d.exercises) {
          if (e.name) names.add(e.name);
        }
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b)).slice(0, 80);
  }, [db]);

  useEffect(() => {
    if (day) {
      setDirty(false);
      setCopyFrom('');
      setSwapWith('');
    }
  }, [day?.key, week?.id]);

  if (!db || !settings) return null;
  if (db.trainingConfig?.preplannedWeekMode === false) return <div className="fade page-shell"><div className="page-empty"><h3>Planner is unavailable in Flexible mode</h3><p>Start today&apos;s tracker from Today. Flexible workouts are planned inside Tracker.</p><button className="btn btn-hot" onClick={() => setPage('Dashboard')}>Open Today</button></div></div>;
  if (!week || !day) return <div className="fade page-shell"><div className="page-empty"><h3>No planned week is active</h3><p>Choose a Library split and move it to Planner to begin a preplanned week.</p><button className="btn btn-hot" onClick={() => setPage('Library')}>Open Library</button></div></div>;

  function update(i: number, field: keyof PlannedExercise, value: string) {
    setExercises((prev) => prev.map((ex, idx) => (idx === i ? { ...ex, [field]: value } : ex)));
    setDirty(true);
  }

  function pickFromLibrary(i: number, exerciseId: string) {
    const lib = db?.exercises?.find((e) => e.id === exerciseId);
    if (!lib) return;
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i
          ? {
              ...ex,
              name: lib.name,
              target: lib.muscles[0] || ex.target,
              cue: lib.defaultCue || ex.cue,
              exerciseId: lib.id,
              familyId: lib.familyId,
              restSec: lib.defaultRestSec,
              tempo: lib.defaultTempo || ex.tempo,
            }
          : ex,
      ),
    );
    setDirty(true);
  }

  function applyProgression() {
    const tips = analytics?.progressionRules || [];
    if (!tips.length) {
      toast.push('No progression rules yet — log more sessions', 'info');
      return;
    }
    setExercises((prev) => applyProgressionToPlan(prev, tips));
    setDirty(true);
    toast.push('Progression rules applied to plan', 'ok');
  }

  function groupSuperset(i: number, group: string) {
    update(i, 'supersetGroup', group);
  }

  function move(i: number, dir: -1 | 1) {
    setExercises((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  }

  async function save() {
    if (!week || !day) return;
    const next = {
      ...week,
      days: week.days.map((d) =>
        d.key === day.key
          ? {
              ...d,
              title: dayMeta.title || d.title,
              type: dayMeta.type || d.type,
              subtitle: dayMeta.subtitle,
              muscles: dayMeta.muscles
                .split(',')
                .map((m) => m.trim())
                .filter(Boolean),
              exercises,
            }
          : d,
      ),
    };
    if(!planDraft.ready)return;await app.api.saveWeek(week.id, next);await planDraft.clear();
    await app.refresh();
    setDirty(false);
    toast.push('Week saved', 'ok');
  }

  function copyDayExercises() {
    if (!copyFrom || !week || !day || !isActiveWeek) return;
    const src = week.days.find((d) => d.key === copyFrom && d.key !== day.key);
    if (!src?.exercises?.length) {
      toast.push('Source day has no exercises', 'err');
      return;
    }
    setExercises(JSON.parse(JSON.stringify(src.exercises)));
    setDirty(true);
    toast.push(`Copied ${src.exercises.length} exercises from ${copyFrom}`, 'ok');
  }

  async function swapDayExercises() {
    if (!week || !day || !swapWith || !isActiveWeek || swapping) return;
    setSwapping(true);
    try {
      const next = swapWeekDayExercises(week, day.key, swapWith, exercises);
      next.days = next.days.map((item) => item.key === day.key ? {
        ...item,
        title: dayMeta.title || item.title,
        type: dayMeta.type || item.type,
        subtitle: dayMeta.subtitle,
        muscles: dayMeta.muscles.split(',').map((muscle) => muscle.trim()).filter(Boolean),
      } : item);
      await app.api.saveWeek(week.id, next);
      await app.refresh();
      setExercises(next.days.find((item) => item.key === day.key)!.exercises);
      setDirty(false);
      setSwapWith('');
      toast.push(`Swapped ${day.key} and ${swapWith} exercises`, 'ok');
    } catch (error) {
      toast.push((error as Error).message || 'Could not swap days', 'err');
    } finally {
      setSwapping(false);
    }
  }

  async function generateWorkout() {
    if (!genPrompt.trim()) return;
    setBusyGen(true);
    try {
      const res = await app.api.workoutGen(`A ${day?.title || 'workout'} for: ${genPrompt}`);
      if (!res.ok) {
        toast.push(res.error || 'Generation failed', 'err');
        return;
      }
      if (res.workout && res.workout.exercises) {
        const mapped = res.workout.exercises.map((e: any) => ({
          name: e.name || 'Exercise',
          target: e.target || 'Mixed',
          vol: e.vol || `${e.sets || 3} x ${e.reps || '8-12'}`,
          cue: e.cue || '',
        }));
        setExercises((prev) => [...prev, ...mapped]);
        setDirty(true);
        setGenModel(res.model || '');
        setGenPrompt('');
        toast.push('Exercises generated and appended!', 'ok');
      }
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusyGen(false);
    }
  }

  const isAiEnabled = settings?.hasAiApiKey || settings?.aiProvider === 'ollama';

  return (
    <div className="fade page-shell">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Template</span>
          <h2 className="page-title">Planner</h2>
          <p className="page-sub">
            {week.name} — edit the permanent week template.
            {dirty ? ' · Unsaved changes' : ''}
          </p>
        </div>
        <div className="page-hero-actions">
          <label className="form-field"><span>Week</span><select
            className="input"
            style={{ maxWidth: 280 }}
            value={week.id}
            onChange={async (e) => {
              if (dirty && !window.confirm('Discard unsaved planner changes?')) return;
              await app.api.activateWeek(e.target.value);
              await app.refresh();
            }}
          >
            {plannedWeeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select></label>
        </div>
      </header>

      <DraftFeedback draft={planDraft}/><div className="day-scroll">
        {week.days.map((x) => (
          <button
            key={x.key}
            type="button"
            className={`page-day-chip${activeDay === x.key ? ' active' : ''}`}
            onClick={() => {
              if (dirty && !window.confirm('Discard unsaved planner changes?')) return;
              setActiveDay(x.key);
              setManualDay(true);
            }}
          >
            {x.key}
            <span className="sub">{x.title}</span>
          </button>
        ))}
      </div>

      <section className="page-panel">
        <div className="page-panel-head">
          <div style={{ flex: 1 }}>
            <span className="page-section-label">Day editor</span>
            <div className="grid-auto" style={{ marginTop: 8, marginBottom: 12 }}>
              <label className="form-field"><span>Day title</span><input
                className="input"
                value={dayMeta.title}
                onChange={(e) => {
                  setDayMeta({ ...dayMeta, title: e.target.value });
                  setDirty(true);
                }}
                placeholder="Day title"
              /></label>
              <label className="form-field"><span>Type (push/pull/legs/rest)</span><input
                className="input"
                value={dayMeta.type}
                onChange={(e) => {
                  setDayMeta({ ...dayMeta, type: e.target.value });
                  setDirty(true);
                }}
                placeholder="Type (push/pull/legs/rest)"
              /></label>
              <label className="form-field"><span>Subtitle</span><input
                className="input"
                value={dayMeta.subtitle}
                onChange={(e) => {
                  setDayMeta({ ...dayMeta, subtitle: e.target.value });
                  setDirty(true);
                }}
                placeholder="Subtitle"
              /></label>
              <label className="form-field"><span>Muscles (comma-separated)</span><input
                className="input"
                value={dayMeta.muscles}
                onChange={(e) => {
                  setDayMeta({ ...dayMeta, muscles: e.target.value });
                  setDirty(true);
                }}
                placeholder="Muscles (comma-separated)"
              /></label>
            </div>
            <span className="pill pill-slate">{dayMeta.type || 'day'}</span>
            {dirty ? <span className="pill pill-orange" style={{ marginLeft: 8 }}>Unsaved</span> : null}
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                setExercises((p) => [...p, { name: 'New Exercise', target: 'Other', vol: '3 x 8-12', cue: '' }]);
                setDirty(true);
              }}
            >
              Add Exercise
            </button>
            <button type="button" className="btn btn-soft" onClick={applyProgression}>
              Apply progression
            </button>
            <button type="button" className="btn btn-hot" onClick={() => void save()}>
              Save Week
            </button>
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => {
                setPage('Dashboard');
              }}
            >
              Track
            </button>
          </div>
        </div>

        <div className="row mb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
          <label className="form-field"><span>Copy from day</span><select
            className="input"
            style={{ maxWidth: 200 }}
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
          >
            <option value="">Copy from active week…</option>
            {isActiveWeek && week.days
              .filter((d) => d.key !== day.key)
              .map((d) => (
                <option key={d.key} value={d.key}>
                  {d.key} · {d.title}
                </option>
              ))}
          </select></label>
          <button type="button" className="btn btn-soft" disabled={!copyFrom || !isActiveWeek} onClick={copyDayExercises}>
            Copy exercises
          </button>
          <label className="form-field"><span> Choose day to swap exercises with</span><select
            className="input"
            style={{ maxWidth: 200 }}
            aria-label="Choose day to swap exercises with"
            value={swapWith}
            onChange={(e) => setSwapWith(e.target.value)}
          >
            <option value="">Swap with day…</option>
            {isActiveWeek && week.days
              .filter((item) => item.key !== day.key)
              .map((item) => (
                <option key={item.key} value={item.key}>
                  {item.key} · {item.title}
                </option>
              ))}
          </select></label>
          <button type="button" className="btn btn-soft" disabled={!swapWith || !isActiveWeek || swapping} onClick={() => void swapDayExercises()}>
            {swapping ? 'Swapping…' : 'Swap exercises'}
          </button>
        </div>

        {isAiEnabled && (
          <div className="page-ai-strip mb-4">
            <div style={{ fontSize: 18 }}>⚡</div>
            <label className="form-field"><span>Details</span><input
              className="input"
              style={{ flex: 1, margin: 0, padding: '8px 12px' }}
              placeholder="AI: e.g. 'Push day focusing on upper chest' or 'Hypertrophy leg day'"
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void generateWorkout();
              }}
            /></label>
            <button
              className="btn btn-hot btn-sm"
              disabled={busyGen || !genPrompt.trim()}
              onClick={() => void generateWorkout()}
            >
              {busyGen ? 'Generating...' : 'Auto-Generate'}
            </button>
            {genModel ? (
              <span className="subtle" style={{ fontSize: 11, width: '100%', textAlign: 'right' }}>
                Model: {genModel}
              </span>
            ) : null}
          </div>
        )}

        <div className="stack">
          {exercises.map((ex, i) => (
            <div
              key={i}
              className="page-panel"
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 12,
                alignItems: 'start',
                padding: 16,
              }}
            >
              <div className="stack" style={{ gap: 4 }}>
                <button type="button" className="btn btn-soft btn-sm" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  disabled={i === exercises.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
              </div>
              <div className="stack">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))',
                    gap: 8,
                  }}
                >
                  <label className="form-field"><span>Exercise</span><input
                    className="input"
                    list="exercise-suggestions"
                    value={ex.name}
                    onChange={(e) => update(i, 'name', e.target.value)}
                    placeholder="Exercise"
                  /></label>
                  <label className="form-field"><span>Target</span><input
                    className="input"
                    value={ex.target}
                    onChange={(e) => update(i, 'target', e.target.value)}
                    placeholder="Target"
                  /></label>
                  <label className="form-field"><span>Sets x reps</span><input
                    className="input"
                    value={ex.vol}
                    onChange={(e) => update(i, 'vol', e.target.value)}
                    placeholder="Sets x reps"
                  /></label>
                  <label className="form-field"><span>Cue</span><input
                    className="input"
                    value={ex.cue}
                    onChange={(e) => update(i, 'cue', e.target.value)}
                    placeholder="Cue"
                  /></label>
                  <button
                    type="button"
                    className="btn btn-danger"
                    aria-label={`Remove ${ex.name || 'exercise'}`}
                    onClick={() => {
                      setExercises((p) => p.filter((_, j) => j !== i));
                      setDirty(true);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <details className="flow-details"><summary>Advanced prescription · library, %1RM, RIR, tempo, rest & supersets</summary><div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))',
                    gap: 8,
                  }}
                >
                  <label className="form-field"><span>Exercise from library</span><select
                    className="input"
                    value={ex.exerciseId || ''}
                    onChange={(e) => pickFromLibrary(i, e.target.value)}
                  >
                    <option value="">Library pick…</option>
                    {(db.exercises || []).map((lib) => (
                      <option key={lib.id} value={lib.id}>
                        {lib.name}
                      </option>
                    ))}
                  </select></label>
                  <label className="form-field"><span>%1RM</span><input
                    className="input"
                    placeholder="%1RM"
                    value={ex.percent1rm ?? ''}
                    onChange={(e) => update(i, 'percent1rm', e.target.value)}
                  /></label>
                  <label className="form-field"><span>RIR</span><input
                    className="input"
                    placeholder="RIR"
                    value={ex.rirTarget ?? ''}
                    onChange={(e) => update(i, 'rirTarget', e.target.value)}
                  /></label>
                  <label className="form-field"><span>Tempo</span><input
                    className="input"
                    placeholder="Tempo"
                    value={ex.tempo ?? ''}
                    onChange={(e) => update(i, 'tempo', e.target.value)}
                  /></label>
                  <label className="form-field"><span>Rest s</span><input
                    className="input"
                    placeholder="Rest s"
                    value={ex.restSec ?? ''}
                    onChange={(e) => update(i, 'restSec', e.target.value)}
                  /></label>
                  <label className="form-field"><span>Superset group</span><select
                    className="input"
                    value={ex.supersetGroup || ''}
                    onChange={(e) => groupSuperset(i, e.target.value)}
                  >
                    <option value="">SS</option>
                    {['A', 'B', 'C', 'D'].map((g) => (
                      <option key={g} value={g}>
                        SS {g}
                      </option>
                    ))}
                  </select></label>
                </div></details>
                {ex.percent1rm && analytics?.personalRecords?.find((p) => p.exercise === ex.name) ? (
                  <span className="subtle" style={{ fontSize: 12 }}>
                    ≈{' '}
                    {weightFromPercent1rm(
                      analytics.personalRecords.find((p) => p.exercise === ex.name)!.bestE1rm,
                      Number(ex.percent1rm),
                    )}{' '}
                    {settings.units} for {parseRepRange(ex.vol).sets}× @ {ex.percent1rm}%
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {!exercises.length ? <div className="page-empty">No exercises yet.</div> : null}
        </div>
        <datalist id="exercise-suggestions">
          {nameSuggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </section>
    </div>
  );
}
