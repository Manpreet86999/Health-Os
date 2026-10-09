import { cloudFetch as fetch } from '../lib/cloud-api';
import { setSuggestion } from '../../shared/automation-rules';
import { useAutomations } from '../state/AutomationContext';
import { FlashDeck } from '../components/FlashDeck';
import { useEffect, useMemo, useState } from 'react';
import { setSchema } from '../../shared/schemas';

import { WorkoutRestCard } from '../components/WorkoutRestCard';
import { EmptyState } from '../components/ui';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useApp } from '../state/AppContext';
import { getAuthToken } from '../lib/api';
import { parseSetCount } from '../lib/utils';
import type { ExerciseTrackingMode, PlannedExercise, ProgressionTip, SetLog, SetType, Side, Session } from '../lib/types';
import { PlateCalculator } from '../components/PlateCalculator';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';
import {
  buildProgressionRules,
  epley1rm,
  generateWarmupSets,
  weightFromPercent1rm,
  workSets,
} from '../../shared/training';

function stepFor(weight: number) {
  if (weight >= 40) return 2.5;
  if (weight >= 20) return 2;
  return 1;
}

function epley(weight: number, reps: number): number {
  return epley1rm(weight, reps);
}

const SET_TYPES: SetType[] = ['warmup', 'work', 'amrap', 'drop', 'failure', 'backoff'];
const LOGGING_MODE_LABEL: Record<ExerciseTrackingMode, string> = {
  weight_reps: 'Weight + reps',
  reps: 'Reps only',
  time: 'Time-based',
};

function defaultLoggingMode(exercise: { trackingMode?: ExerciseTrackingMode; exerciseId?: string; name: string }, library: Array<{ id: string; name: string; trackingMode?: ExerciseTrackingMode }>): ExerciseTrackingMode {
  if (exercise.trackingMode) return exercise.trackingMode;
  const match = library.find((item) => item.id === exercise.exerciseId) || library.find((item) => item.name.toLowerCase() === exercise.name.toLowerCase());
  if (match?.trackingMode) return match.trackingMode;
  if (/plank|hold|walk|jog|run|jumping jack|mountain climber|burpee|mobility/i.test(exercise.name)) return 'time';
  if (/push-up|pull-up|chin-up|dip|bodyweight|dead bug|leg raise|glute bridge|nordic/i.test(exercise.name)) return 'reps';
  return 'weight_reps';
}

export function Tracker() {
  const app = useApp();
  const automation = useAutomations();
  const toast = useToast();
  const { tracker, setTracker, setPage, setLastSessionId, settings, analytics, db } = app;
  const [prevSets, setPrevSets] = useState<SetLog[]>([]);
  const [tip, setTip] = useState<ProgressionTip | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', target: 'Other', vol: '3 x 8-12' });
  const [entryKey, setEntryKey] = useState<string | null>(null);
  const [weights, setWeights] = useState<string[]>([]);
  const [reps, setReps] = useState<string[]>([]);
  const [durations, setDurations] = useState<string[]>([]);
  const [trackingMode, setTrackingMode] = useState<ExerciseTrackingMode>('weight_reps');
  const [rpes, setRpes] = useState<string[]>([]);
  const [rirs, setRirs] = useState<string[]>([]);
  const [setTypes, setSetTypes] = useState<string[]>([]);
  const [sides, setSides] = useState<string[]>([]);
  const [journal, setJournal] = useState('');
  const [summary, setSummary] = useState(false);
  const [prFlash, setPrFlash] = useState<string | null>(null);
  const [sessionPrs, setSessionPrs] = useState<string[]>([]);
  const [completedSets,setCompletedSets]=useState<number[]>([]);
  const [completedRecords,setCompletedRecords]=useState<Record<number,SetLog>>({});
  const [setCardIndex,setSetCardIndex]=useState(0);
  const [gymMode, setGymMode] = useState(
    () => tracker?.gymMode || localStorage.getItem('workout-os-gym-mode') === '1',
  );

  const [aiCues, setAiCues] = useState<string[]>([]);
  const [cuesModel, setCuesModel] = useState('');
  const [busyCues, setBusyCues] = useState(false);
  const [busyRegulating, setBusyRegulating] = useState(false);
  const [busySaving, setBusySaving] = useState(false);
  const [importingTelegram, setImportingTelegram] = useState(false);
  const [flexExerciseName, setFlexExerciseName] = useState('');
  const [flexExerciseNames, setFlexExerciseNames] = useState<string[]>([]);
  const [flexAddMore, setFlexAddMore] = useState(false);
  const [flexMusclesConfirmed, setFlexMusclesConfirmed] = useState(false);
  const [showExerciseDetails, setShowExerciseDetails] = useState(false);

  const liveStats = useMemo(() => {
    if (!tracker) return { tonnage: 0, sets: 0, bestE1: 0 };
    let tonnage = 0;
    let sets = 0;
    for (const log of tracker.logs) {
      if (log.status === 'skipped') continue;
      for (const s of log.sets || []) {
        const w = Number(s.w) || 0;
        const r = Number(s.r) || 0;
        if (w || r) sets++;
        tonnage += w * r;
      }
    }
    return { tonnage, sets, bestE1: 0 };
  }, [tracker]);

  const currentBestE1 = useMemo(() => {
    if (!tracker) return 0;
    const name = tracker.exercises[tracker.index]?.name;
    if (!name) return 0;
    return (
      analytics?.personalRecords?.find((p) => p.exercise === name)?.bestE1rm ||
      0
    );
  }, [tracker, analytics?.personalRecords]);

  const { draftStatus,workoutDraftMessage } = useApp();
  const draftNote = Boolean(tracker && tracker.logs?.length);

  async function autoRegulate() {
    if (!tracker) return;
    setBusyRegulating(true);
    try {
      const res = await fetch('/api/ai/auto-regulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ sessionJson: JSON.stringify(tracker) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to auto-regulate');
      if (data.workout && data.workout.exercises) {
        setTracker({ ...tracker, plannedExercises:tracker.plannedExercises||tracker.exercises.map(exercise=>({...exercise})),exercises: data.workout.exercises, name: data.workout.name || tracker.name });
        toast.push(`Session optimized by AI (${data.model})`, 'ok');
      }
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusyRegulating(false);
    }
  }

  async function importTelegramGymEntries() {
    if (!tracker || importingTelegram) return;
    setImportingTelegram(true);
    try {
      const result = await app.api.getTelegramGymEntries();
      const logged = result.entries.filter((entry) => entry.sets.length);
      if (!logged.length) return toast.push('No gym sets found. Send entries like “1: 60 kg × 10, 10, 8” in Telegram.', 'info');
      const logs = [...tracker.logs];
      for (const entry of logged) {
        const exercise = tracker.exercises[entry.exerciseIndex - 1];
        if (!exercise) continue;
        const nextSets = entry.sets.map((set, index) => ({ s: index + 1, w: set.w, r: set.r, type: 'work' as SetType, side: 'both' as Side }));
        const existing = logs.findIndex((log) => log.name === exercise.name);
        const nextLog = { name: exercise.name, target: exercise.target, status: 'completed', sets: nextSets, journal: entry.note || '' };
        if (existing >= 0) logs[existing] = nextLog; else logs.push(nextLog);
      }
      setTracker({ ...tracker, logs });
      toast.push(`${logged.length} exercise${logged.length === 1 ? '' : 's'} imported from Telegram. Review before finishing.`, 'ok');
    } catch (error) { toast.push(error instanceof Error ? error.message : 'Could not import Telegram entries.', 'err'); }
    finally { setImportingTelegram(false); }
  }

  useEffect(() => {
    if (!tracker) return;
    const ex = tracker.exercises[tracker.index];
    if (!ex) {
      setSummary(true);
      return;
    }
    setSummary(false);
    const key = `${tracker.id}:${tracker.index}:${ex.name}`;
    const saved = tracker.currentEntry;
    if (saved?.key === key && saved.weights.length) {
      setWeights(saved.weights);setReps(saved.reps);setDurations(saved.durations);
      setRpes(saved.rpes);setRirs(saved.rirs);setSetTypes(saved.setTypes);setSides(saved.sides);
      setJournal(saved.journal);setTrackingMode(saved.trackingMode);setEntryKey(key);
      setCompletedSets(saved.completedSets||[]);setCompletedRecords(saved.completedRecords||{});
      const next=saved.weights.findIndex((_,index)=>!saved.completedSets?.includes(index));setSetCardIndex(Math.max(0,next));
      return;
    }
    // Set cards are immediately available from the hydrated cloud workspace.
    // Optional progression suggestions must never block workout entry.
    const mode = defaultLoggingMode(ex, db?.exercises || []);
    const count = parseSetCount(ex.vol);
    const previous = db?.sessions.filter(s=>['finished','completed'].includes(s.status))
      .sort((a,b)=>b.date.localeCompare(a.date))
      .find(s=>s.logs.some(log=>log.name.toLowerCase()===ex.name.toLowerCase()))
      ?.logs.find(log=>log.name.toLowerCase()===ex.name.toLowerCase())?.sets || [];
    const nextTip = db ? buildProgressionRules(db).find(t=>t.exercise===ex.name) || null : null;
    const increment = db?.trainingConfig?.loadIncrements?.[ex.name] || (settings?.units==='lb'?5:2.5);
    const fills = Array.from({length:count},(_,i)=>setSuggestion({...ex,trackingMode:mode},previous[i],increment,nextTip?.suggestedWeight));
    const suggested = (value:unknown)=>automation.preferences.smartDefaults?String(value??''):'';
    const nextWeights = fills.map(f=>suggested(f.weight));
    const best = analytics?.personalRecords?.find(r=>r.exercise===ex.name)?.bestE1rm || 0;
    if(ex.percent1rm && best && automation.preferences.smartDefaults){
      const target=weightFromPercent1rm(best,Number(ex.percent1rm));
      nextWeights.fill(String(Math.round(target/increment)*increment));
    }
    setTrackingMode(mode);setPrevSets(previous);setTip(nextTip);
    setWeights(nextWeights);setReps(fills.map(f=>suggested(f.reps)));
    setDurations(fills.map(f=>suggested(f.durationSec)));setRpes(fills.map(f=>suggested(f.rpe)));setRirs(fills.map(f=>suggested(f.rir)));
    setSetTypes(Array.from({length:count},()=> 'work'));setSides(Array.from({length:count},()=> 'both'));
    setJournal('');setAiCues([]);setCuesModel('');setEntryKey(key);
    setCompletedSets([]);setCompletedRecords({});setSetCardIndex(0);
  }, [tracker?.id, tracker?.index, tracker?.exercises[tracker.index]?.name]);

  useEffect(() => {
    if (!tracker || !entryKey || entryKey !== `${tracker.id}:${tracker.index}:${tracker.exercises[tracker.index]?.name}`) return;
    const currentEntry = {key:entryKey,weights,reps,durations,rpes,rirs,setTypes,sides,journal,trackingMode,completedSets,completedRecords};
    if (JSON.stringify(tracker.currentEntry) !== JSON.stringify(currentEntry)) {
      setTracker({...tracker,currentEntry});
    }
  }, [entryKey,weights,reps,durations,rpes,rirs,setTypes,sides,journal,trackingMode,completedSets,completedRecords,tracker,setTracker]);
  if (!tracker) {
    return (
      <div className="fade page-shell">
        <header className="page-hero">
          <div>
            <span className="page-eyebrow">Session</span>
            <h2 className="page-title">Tracker</h2>
            <p className="page-sub">No active session yet. Start from Home after readiness is logged.</p>
          </div>
        </header>
        <div className="page-panel">
          <EmptyState
            title="No active session"
            body="Start from Home after readiness is logged. Your draft autosaves while training."
            action={
              <button type="button" className="btn btn-hot" onClick={() => setPage('Dashboard')}>
                Go to Home
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const flexMuscles = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Cardio'];
  const addFlexibleExercises = async () => {
    const typedName = flexExerciseName.trim();
    const names = [...flexExerciseNames, ...(typedName ? [typedName] : [])]
      .filter((name, index, list) => list.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index);
    if (!names.length) return toast.push('Add at least one exercise.', 'err');
    const target = tracker.targetMuscles?.[0] || 'Other';
    const exercises: PlannedExercise[] = [];
    for (const name of names) {
      let match = (db?.exercises || []).find((exercise) => exercise.name.toLowerCase() === name.toLowerCase());
      if (!match) {
        const exerciseId = crypto.randomUUID();
        try {
          await app.api.saveExercise({ id: exerciseId, name, aliases: [], muscles: [target], equipment: '', movementPattern: '', substitutions: [], meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
          match = { id: exerciseId, name, muscles: [target] } as any;
        } catch (error) { return toast.push((error as Error).message, 'err'); }
      }
      if (!match) return toast.push(`Could not add ${name} to your Library.`, 'err');
      exercises.push({ name: match.name, target: match.muscles?.[0] || target, vol: '3 x 8-12', cue: '', exerciseId: match.id, trackingMode: match.trackingMode });
    }
    setTracker({ ...tracker, exercises: [...tracker.exercises, ...exercises], index: tracker.exercises.length });
    setFlexExerciseName(''); setFlexExerciseNames([]); setFlexAddMore(false);
    toast.push(`${exercises.length} exercise${exercises.length === 1 ? '' : 's'} added.`, 'ok');
  };

  if (tracker.mode === 'flexible' && !flexMusclesConfirmed) {
    return <div className="fade page-shell"><section className="tracker-celebrate stack"><span className="pill pill-green">Flexible workout</span><h2>What are you training today?</h2><p className="subtle">Choose one or more target muscles. Then you will add your first exercise.</p><div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>{flexMuscles.map((muscle) => <button key={muscle} type="button" className={`btn btn-sm ${(tracker.targetMuscles || []).includes(muscle) ? 'btn-hot' : 'btn-soft'}`} onClick={() => { const current = tracker.targetMuscles || []; setTracker({ ...tracker, targetMuscles: current.includes(muscle) ? current.filter((item) => item !== muscle) : [...current, muscle] }); }}>{muscle}</button>)}</div><button className="btn btn-hot btn-xl" onClick={() => { if (!tracker.targetMuscles?.length) return toast.push('Select at least one target muscle.', 'err'); setFlexMusclesConfirmed(true); }}>Continue to exercise</button></section></div>;
  }

  if (tracker.mode === 'flexible' && (!tracker.exercises.length || flexAddMore)) {
    const addNameToList = () => {
      const name = flexExerciseName.trim();
      if (!name) return toast.push('Enter an exercise name first.', 'err');
      if (flexExerciseNames.some((item) => item.toLowerCase() === name.toLowerCase())) return toast.push('That exercise is already in this workout.', 'info');
      setFlexExerciseNames([...flexExerciseNames, name]);
      setFlexExerciseName('');
    };
    return <div className="fade page-shell"><section className="tracker-celebrate stack"><span className="pill pill-green">{flexAddMore ? 'Add exercises' : 'Build today\'s workout'}</span><h2>What exercises are you doing?</h2><p className="subtle">Add every exercise you want now. New names are saved to your Library automatically, then their flashcards open one by one.</p><div className="row" style={{ gap: 8 }}><input className="input" autoFocus value={flexExerciseName} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addNameToList(); } }} onChange={(event) => setFlexExerciseName(event.target.value)} placeholder="e.g. Barbell bench press"/><button className="btn btn-soft" type="button" onClick={addNameToList}>Add exercise</button></div>{flexExerciseNames.length ? <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>{flexExerciseNames.map((name) => <button key={name} type="button" className="chip" onClick={() => setFlexExerciseNames(flexExerciseNames.filter((item) => item !== name))}>{name} ×</button>)}</div> : null}<button className="btn btn-hot btn-xl" onClick={() => void addFlexibleExercises()}>{flexExerciseNames.length || flexExerciseName.trim() ? `Start ${flexExerciseNames.length + (flexExerciseName.trim() ? 1 : 0)} exercise tracker${flexExerciseNames.length + (flexExerciseName.trim() ? 1 : 0) === 1 ? '' : 's'}` : 'Add exercises to start'}</button></section></div>;
  }

  if (tracker.mode === 'flexible' && !summary && !tracker.exercises[tracker.index]) {
    return <div className="fade page-shell"><section className="tracker-celebrate stack"><span className="pill pill-green">Exercise saved</span><h2>Add another exercise?</h2><p className="subtle">Continue building this workout, or complete today&apos;s workout and save it.</p><button className="btn btn-soft btn-xl" onClick={() => setFlexAddMore(true)}>Add more exercise</button><button className="btn btn-hot btn-xl" onClick={() => setSummary(true)}>Complete today&apos;s workout</button></section></div>;
  }

  if (summary || !tracker.exercises[tracker.index]) {
    const done = tracker.logs.filter((l) => l.status === 'completed').length;
    const skipped = tracker.logs.length - done;
    const total = tracker.logs.length;
    let sessionTonnage = 0;
    for (const log of tracker.logs) {
      if (log.status === 'skipped') continue;
      for (const s of log.sets || []) {
        sessionTonnage += (Number(s.w) || 0) * (Number(s.r) || 0);
      }
    }
    
    let emoji = '🎉 💪 🔥';
    let pillClass = 'pill pill-green';
    let pillText = 'Session complete';
    let heading = 'Outstanding work';
    
    if (total > 0) {
      if (done === 0) {
        emoji = '😅 🤷‍♂️ 🛋️';
        pillClass = 'pill pill-slate';
        pillText = 'Session skipped';
        heading = 'Rest day taken?';
      } else if (done < total / 2) {
        emoji = '👍 🏃 💦';
        pillClass = 'pill pill-cyan';
        pillText = 'Partial session';
        heading = 'Better than nothing!';
      } else if (done < total) {
        emoji = '👏 💪 💧';
        pillClass = 'pill pill-cyan';
        pillText = 'Good effort';
        heading = 'Solid work today';
      }
    }

    return (
      <div className="fade page-shell">
        <section className={("tracker-celebrate")}>
          <div className="confetti" aria-hidden>
            {(emoji)}
          </div>
          <span className={pillClass}>{pillText}</span>
          <h2 style={{ margin: '12px 0 4px' }}>{(heading)}</h2>
          <p className="subtle">
            {tracker.dayTitle} &middot; {tracker.date}
          </p>
          <div className="page-signals my-4">
            <div className="page-signal">
              <span className="page-signal-label">Done</span>
              <span className="page-signal-value">{done}</span>
            </div>
            <div className="page-signal">
              <span className="page-signal-label">Skipped</span>
              <span className="page-signal-value">{skipped}</span>
            </div>
            <div className="page-signal">
              <span className="page-signal-label">{('Tonnage')}</span>
              <span className="page-signal-value">{Math.round(sessionTonnage)}</span>
            </div>
          </div>
          {sessionPrs.length > 0 ? (
            <div className="page-panel mb-3" style={{ textAlign: 'left' }}>
              <span className="pill pill-orange">PRs this session</span>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {sessionPrs.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="row mb-3" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('Analyzer')}>
              View Analyzer
            </button>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('Records')}>
              Open Records
            </button>
          </div>
          <button
            type="button"
            className="btn btn-good btn-xl w-full"
            disabled={busySaving}
            onClick={async () => {
              setBusySaving(true);
              try {
                const endedAt = new Date().toISOString();
                const started = tracker.startedAt ? new Date(tracker.startedAt).getTime() : 0;
                const durationMinutes =
                  started > 0 ? Math.max(1, Math.round((Date.now() - started) / 60000)) : undefined;
                const res = await fetch('/api/sessions/finish-and-send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
                  body: JSON.stringify({
                    ...tracker,
                    endedAt,
                    startedAt: tracker.startedAt,
                    durationMinutes,
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to save and send report');
                
                setLastSessionId(data.session.id);
                setTracker(null);

                setSessionPrs([]);
                await app.refresh();
                toast.push('Workout saved. AI report generation and email delivery start automatically in the cloud.', 'ok');
                setPage('Reports', 'Workout Reports');
              } catch (e) {
                toast.push((e as Error).message, 'err');
                if ((e as Error).message.includes('already has')) setPage('Reports', 'Workout Reports');
              } finally {
                setBusySaving(false);
              }
            }}
          >
            {busySaving ? 'Saving workout…' : 'Save workout'}
          </button>
          <button type="button" className="btn btn-ghost w-full mt-3" onClick={() => setPage('Dashboard')}>
            Exit without saving
          </button>
        </section>
      </div>
    );
  }

  const ex = tracker.exercises[tracker.index];
  const pct = Math.round((tracker.index / Math.max(1, tracker.exercises.length)) * 100);
  const units = settings?.units || 'kg';

  function adjustWeight(i: number, delta: number) {
    setWeights((arr) =>
      arr.map((x, j) => {
        if (j !== i) return x;
        const cur = Number(x) || 0;
        return String(Math.max(0, Math.round((cur + delta) * 2) / 2));
      }),
    );
  }

  async function loadCues(name: string) {
    setBusyCues(true);
    try {
      const res = await app.api.exerciseCues(name);
      if (!res.ok) {
        toast.push(res.error || 'Failed to load cues', 'err');
        return;
      }
      setAiCues(res.cues || []);
      setCuesModel(res.model || '');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusyCues(false);
    }
  }

  function applyAll(mode: 'same' | 'up' | 'down') {
    if (trackingMode !== 'weight_reps') return;
    setWeights((arr) =>
      arr.map((x, i) => {
        const base = Number(x) || Number(prevSets[i]?.w) || Number(tip?.suggestedWeight) || 0;
        const step = stepFor(base);
        if (mode === 'same') return String(base || '');
        if (mode === 'up') return String(Math.round((base + step) * 2) / 2);
        return String(Math.max(0, Math.round((base - step) * 2) / 2));
      }),
    );
  }

  function logExercise(forceSkip?: boolean) {
    const sets: SetLog[] = forceSkip && !completedSets.length
      ? []
      : completedSets.map(index=>completedRecords[index]).filter(Boolean);

      
    const status = sets.length === 0 ? 'skipped' : 'completed';

    // PR detection vs known best e1RM (work sets only)
    let hitPr = false;
    let bestSetE1 = 0;
    for (const s of workSets(sets)) {
      const e1 = epley(Number(s.w) || 0, Number(s.r) || 0);
      if (e1 > bestSetE1) bestSetE1 = e1;
    }
    if (status === 'completed' && bestSetE1 > 0 && bestSetE1 > (currentBestE1 || 0) + 0.5) {
      hitPr = true;
      const label = `${ex.name}: e1RM ~${Math.round(bestSetE1)}`;
      setSessionPrs((p) => [...p, label]);
      setPrFlash(label);
      setTimeout(() => setPrFlash(null), 3500);
    }

    setTracker({
      ...tracker!,
      logs: [
        ...tracker!.logs,
        {
          name: ex.name,
          target: ex.target,
          status,
          sets: sets,
          journal,
          exerciseId: ex.exerciseId,
          familyId: ex.familyId,
          supersetGroup: ex.supersetGroup,
          plannedRestSec: ex.restSec != null ? Number(ex.restSec) : undefined,
          plannedTempo: ex.tempo,
          trackingMode,
        },
      ],
      index: tracker!.index + 1,
      restTimer:undefined,
    });
    if (hitPr) {
      toast.push(`PR! ${ex.name}`, 'ok');
    } else {
      toast.push(status === 'skipped' ? `Skipped ${ex.name}` : `Logged ${ex.name}`, 'ok');
    }
  }

  function completeSet(index:number) {
    const record={s:index+1,w:trackingMode==='weight_reps'?weights[index]:'',r:trackingMode==='time'?durations[index]:reps[index],durationSec:trackingMode==='time'?durations[index]:undefined,trackingMode,rpe:rpes[index]||'',rir:rirs[index]||'',type:(setTypes[index]||'work') as SetType,side:(sides[index]||'both') as Side,tempo:ex.tempo,restSec:ex.restSec};
    if(!setSchema.safeParse(record).success||!Number.isFinite(Number(record.r))||Number(record.r)<=0){toast.push('Enter valid weight, reps or seconds, and effort before completing the set.','err');return;}
    const already=completedSets.includes(index);
    setCompletedSets(current=>already?current:[...current,index]);setCompletedRecords(current=>({...current,[index]:record}));
    const next=weights.findIndex((_,candidate)=>candidate!==index&&!completedSets.includes(candidate));setSetCardIndex(Math.max(0,next));
    if(!already){const total=Number(ex.restSec)||Number(settings?.restSeconds)||90;app.patchTracker({restTimer:{deadline:Date.now()+total*1000,remaining:total,total,running:true,card:true}});}
  }

  function injectWarmups() {
    if(completedSets.length){toast.push('Add warm-ups before completing your first set.','info');return;}
    const top = Math.max(...weights.map((w) => Number(w) || 0), Number(tip?.suggestedWeight) || 0);
    if (!top) {
      toast.push('Enter a work weight first', 'err');
      return;
    }
    const wu = generateWarmupSets(top, 5, settings?.units === 'lb' ? 45 : 20);
    setWeights((prev) => [...wu.map((x) => String(x.w)), ...prev]);
    setReps((prev) => [...wu.map((x) => String(x.r)), ...prev]);
    setRpes((prev) => [...wu.map(() => ''), ...prev]);
    setRirs((prev) => [...wu.map(() => ''), ...prev]);
    setSetTypes((prev) => [...wu.map((x) => x.type), ...prev]);
    setSides((prev) => [...wu.map(() => 'both'), ...prev]);
    toast.push(`Added ${wu.length} warm-up sets`, 'ok');
  }

  return (
    <section className="fade tracker-shell">
      {(<>
      {prFlash ? (
        <div className="tracker-pr-flash">
          🏆 New PR — {prFlash}
        </div>
      ) : null}

      <header className="stitch-workout-heading"><div><p className="page-eyebrow">TRAIN / ACTIVE WORKOUT</p><h1 className="page-title">Your session</h1><p className="page-sub">{tracker.dayTitle} · {tracker.exercises.length} exercises</p></div><button type="button" className="btn btn-soft" onClick={() => setPage('Today')}>Minimize workout</button></header>
      <aside className="stitch-session-plan" aria-label="Session exercise order"><div><span className="bio-eyebrow">YOUR PLAN</span><h2>Exercise queue</h2></div><ol>{tracker.exercises.map((exercise,index)=><li key={index} aria-current={index===tracker.index?'step':undefined} className={index<tracker.index?'is-complete':''}><span className="stitch-exercise-index">{index<tracker.index?'✓':String(index+1).padStart(2,'0')}</span><div><strong>{exercise.name}</strong><small>{exercise.vol} · {exercise.target}</small></div></li>)}</ol><p className="subtle">Your draft stays saved as you train.</p></aside>
      <div className="tracker-top">
        <div className="toolbar" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill pill-cyan">
              {tracker.index + 1} / {tracker.exercises.length}
            </span>
            <span className="pill pill-slate">{liveStats.sets} sets</span>
            <span className="pill pill-slate">{Math.round(liveStats.tonnage)} vol</span>
            {currentBestE1 > 0 ? (
              <span className="pill pill-orange">Best e1RM {Math.round(currentBestE1)}</span>
            ) : null}
            <span className="subtle" style={{ fontSize: 12 }}>
              {draftStatus === 'error' ? 'Cloud draft save failed — your device draft is separate' : draftStatus === 'saved' ? 'Draft saved to account' : 'Saving draft to account…'}
            </span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="dash-telegram-button" title="Import gym entries from Telegram" aria-label="Import gym entries from Telegram" disabled={importingTelegram} onClick={() => void importTelegramGymEntries()}>
              {importingTelegram ? '…' : '➤'}
            </button>
            <label className="subtle" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={gymMode}
                onChange={(e) => {
                  setGymMode(e.target.checked);
                  localStorage.setItem('workout-os-gym-mode', e.target.checked ? '1' : '0');
                  if (tracker) setTracker({ ...tracker, gymMode: e.target.checked });
                }}
              />
              Gym mode
            </label>
            {(settings?.hasAiApiKey || settings?.aiProvider === 'ollama') && (
              <button
                type="button"
                className="btn btn-soft btn-sm"
                style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={autoRegulate}
                disabled={busyRegulating}
              >
                {busyRegulating ? 'Optimizing...' : '⚡ AI Auto-Regulate'}
              </button>
            )}
          </div>
        </div>
        <div className="progress-track" role="progressbar" aria-label="Workout progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="page-panel grid-auto stitch-session-meta" style={{ padding: 16 }}>
        <input
          className="input"
          value={tracker.name}
          onChange={(e) => setTracker({ ...tracker, name: e.target.value })}
          aria-label="Session name"
          placeholder="Name"
        />
        <input
          className="input"
          type="date"
          aria-label="Session date"
          value={tracker.date}
          onChange={(e) => setTracker({ ...tracker, date: e.target.value })}
        />
        <div className="metric-light">
          <div className="metric-label">Readiness</div>
          <div className="metric-value" style={{ fontSize: '1.25rem' }}>
            {tracker.readiness?.score}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>/100</span>
          </div>
        </div>
      </div>

      <div className="page-panel stitch-workout-console" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tracker-exercise-hero">
          <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="pill pill-slate" style={{ background: 'var(--bg-2)', color: 'var(--text-1)', borderColor: 'var(--line)' }}>
              {ex.target}
            </span>
            <span className="pill pill-cyan">{ex.vol}</span>
            <button type="button" className="btn btn-soft btn-sm" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => logExercise(true)}>
              ⏭ Skip exercise
            </button>
          </div>
          <h2 className="hero-title" style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2rem)', marginTop: 12 }}>
            {ex.name}
          </h2>
          <p className="hero-sub">{ex.cue}</p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 14,
              marginBottom: 12,
              padding: '10px 14px',
              borderRadius: 14,
              backgroundColor: 'var(--bg-2, #18191D)',
              border: '1px solid var(--line, #25272D)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13, display: 'block', color: 'var(--text-0, #FFF)' }}>Exercise details</strong>
              <span className="subtle" style={{ fontSize: 11 }}>Instructions &amp; target muscles</span>
            </div>
            <button
              type="button"
              className="btn btn-hot btn-sm"
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 20 }}
              onClick={() => setShowExerciseDetails(true)}
            >
              View details
            </button>
          </div>
          <label className="tracker-log-mode">
            <span>Log this exercise as</span>
            <select className="input" value={trackingMode} onChange={(e) => setTrackingMode(e.target.value as ExerciseTrackingMode)}>
              {(['weight_reps', 'reps', 'time'] as ExerciseTrackingMode[]).map((mode) => <option key={mode} value={mode}>{LOGGING_MODE_LABEL[mode]}</option>)}
            </select>
          </label>
          {tip ? (
            <div className="suggest-banner">
              Suggest <b>{tip.suggestedWeight} {units}</b> × {tip.suggestedReps}
              <div style={{ marginTop: 4, opacity: 0.85, fontWeight: 500 }}>{tip.reason}</div>
            </div>
          ) : null}
          <div className="prev-banner">
            {automation.preferences.smartDefaults&&<span>Suggested inputs · confirm performed sets when logging. </span>}
            {prevSets.length
              ? `Last · ${workSets(prevSets).map((s) => `${s.w}×${s.r}`).join('  ·  ') || prevSets.map((s) => `${s.w}×${s.r}`).join('  ·  ')}`
              : 'First log for this lift — set a baseline'}
            {currentBestE1 > 0 ? `  ·  Best e1RM ${Math.round(currentBestE1)}` : ''}
            {ex.supersetGroup ? `  ·  Superset ${ex.supersetGroup}` : ''}
            {ex.percent1rm ? `  ·  @${ex.percent1rm}%` : ''}
            {ex.rirTarget != null && ex.rirTarget !== '' ? `  ·  RIR ${ex.rirTarget}` : ''}
            {ex.tempo ? `  ·  Tempo ${ex.tempo}` : ''}
          </div>
          {!gymMode && trackingMode === 'weight_reps' ? (
            <div className="row mt-3" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="btn btn-soft btn-sm" onClick={injectWarmups}>
                + Warm-up ramp
              </button>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => setPage('ExerciseHistory')}
              >
                Open history
              </button>
            </div>
          ) : null}
          
          {(settings?.hasAiApiKey || settings?.aiProvider === 'ollama') && (
            <div className="mt-4" style={{ textAlign: 'left' }}>
              {!aiCues.length ? (
                <button type="button" className="btn btn-soft btn-sm" disabled={busyCues} onClick={() => loadCues(ex.name)}>
                  {busyCues ? 'Loading Cues...' : '🧠 Get AI Form Cues'}
                </button>
              ) : (
                <div className="page-ai-strip" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: 'var(--hot)' }}>AI Form Cues</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
                    {aiCues.map((c, idx) => <li key={idx}>{c}</li>)}
                  </ul>
                  {cuesModel ? (
                    <span className="subtle" style={{ fontSize: 11, marginTop: 6 }}>Model: {cuesModel}</span>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: 18 }} className="stack stitch-set-workspace">
          {trackingMode === 'weight_reps' ? (
            <div className="quick-row">
              <button type="button" className="quick-btn" onClick={() => applyAll('same')}>= Same as last</button>
              <button type="button" className="quick-btn up" onClick={() => applyAll('up')}>+ Load</button>
              <button type="button" className="quick-btn down" onClick={() => applyAll('down')}>− Load</button>
            </div>
          ) : <p className="subtle" style={{ margin: 0 }}>This movement is logged as {LOGGING_MODE_LABEL[trackingMode].toLowerCase()}. You can change the mode above for today.</p>}

          {tracker.restTimer?.card ? <WorkoutRestCard state={tracker.restTimer} onChange={restTimer=>app.patchTracker({restTimer})} onFinish={()=>app.patchTracker({restTimer:undefined})} nextLabel={completedSets.length===weights.length?'Review exercise':`Set ${setCardIndex+1} · ${ex.name}`}/> : completedSets.length===weights.length ? <section className="page-panel"><h2>Exercise complete</h2><p>{completedSets.length} sets confirmed · {ex.name}</p><button className="btn btn-hot" onClick={()=>logExercise(false)}>Save & next</button></section> : <FlashDeck key={entryKey} label="Workout set cards" index={setCardIndex} showNavigation={false} onIndexChange={next=>{if(next<setCardIndex||completedSets.includes(setCardIndex))setSetCardIndex(next);}}>
          {weights.map((w, i) => (
            <div key={i} className="set-card" style={gymMode ? { gridTemplateColumns: trackingMode === 'weight_reps' ? 'auto 1fr 1fr auto' : 'auto 1fr auto' } : undefined}>
              <div className="set-num">Set {i + 1}<span className="subtle">{prevSets[i] ? `Previous: ${prevSets[i].w} × ${prevSets[i].r}` : 'A fresh starting point'}</span></div>
              {trackingMode === 'weight_reps' ? <div>
                <div className="metric-label">{units}</div>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  aria-label={`Set ${i + 1} load`}
                  value={w}
                  onChange={(e) => setWeights((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                  style={gymMode ? { fontSize: 22, fontWeight: 800 } : undefined}
                />
                <div className="quick-row">
                  <button type="button" className="quick-btn down" onClick={() => adjustWeight(i, -stepFor(Number(w) || 0))}>
                    −{stepFor(Number(w) || 0)}
                  </button>
                  <button type="button" className="quick-btn up" onClick={() => adjustWeight(i, stepFor(Number(w) || 0))}>
                    +{stepFor(Number(w) || 0)}
                  </button>
                </div>
              </div> : null}
              <div>
                <div className="metric-label">{trackingMode === 'time' ? 'Seconds' : 'Reps'}</div>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  aria-label={`Set ${i + 1} ${trackingMode === 'time' ? 'seconds' : 'reps'}`}
                  value={trackingMode === 'time' ? durations[i] || '' : reps[i] || ''}
                  onChange={(e) => trackingMode === 'time' ? setDurations((arr) => arr.map((x, j) => (j === i ? e.target.value : x))) : setReps((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                  style={gymMode ? { fontSize: 22, fontWeight: 800 } : undefined}
                />
              </div>
              {!gymMode ? (
                <>
                  <div className="rpe-col">
                    <div className="metric-label">RPE</div>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={10}
                      aria-label={`Set ${i + 1} effort (RPE, out of 10)`}
                      placeholder="—"
                      value={rpes[i] || ''}
                      onChange={(e) => setRpes((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  </div>
                  <div>
                    <div className="metric-label">RIR</div>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={5}
                      aria-label={`Set ${i + 1} repetitions in reserve (RIR)`}
                      placeholder="—"
                      value={rirs[i] || ''}
                      onChange={(e) => setRirs((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  </div>
                  <div>
                    <div className="metric-label">Type</div>
                    <select
                      className="input"
                      value={setTypes[i] || 'work'}
                      aria-label={`Set ${i + 1} type`}
                      onChange={(e) => setSetTypes((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                    >
                      {SET_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="metric-label">Side</div>
                    <select
                      className="input"
                      value={sides[i] || 'both'}
                      aria-label={`Set ${i + 1} side`}
                      onChange={(e) => setSides((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                    >
                      <option value="both">Both</option>
                      <option value="L">L</option>
                      <option value="R">R</option>
                    </select>
                  </div>
                </>
              ) : null}
              <button type="button" className="btn btn-hot" style={{gridColumn:'1 / -1'}} onClick={()=>completeSet(i)}>{completedSets.includes(i)?'Update set':'Complete Set'}</button>
            </div>
          ))}
          </FlashDeck>}

          {!gymMode && trackingMode === 'weight_reps' ? (
            <details className="stitch-plate-tools"><summary>Plate calculator</summary><PlateCalculator units={units as 'kg' | 'lb'} defaultTarget={weights.find((w) => w) || ''} /></details>
          ) : null}

          {workoutDraftMessage&&<p role={/unavailable|failed|could not/.test(workoutDraftMessage)?'alert':'status'}>{workoutDraftMessage}</p>}

          <textarea
            aria-label="Exercise notes"
            className="input min-h-80"
            placeholder="How did it feel?"
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
          />
          <div className="row mt-3" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => logExercise(true)}>
              Skip Exercise
            </button>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => {
              setAddForm({ name: '', target: ex.target, vol: ex.vol });
              setSubOpen(true);
            }}>
              Substitute
            </button>
          </div>
        </div>
      </div>

      <div className="sticky-actions">
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => {
            setWeights((a) => [...a, '']);
            setReps((a) => [...a, '']);
            setDurations((a) => [...a, '']);
            setRpes((a) => [...a, '']);
            setRirs((a) => [...a, '']);
            setSetTypes((a) => [...a, 'work']);
            setSides((a) => [...a, 'both']);
          }}
        >
          + Set
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => logExercise(true)}>
          Skip
        </button>
        <button type="button" className="btn btn-soft" onClick={() => setAddOpen(true)}>
          + Exercise
        </button>
        <button type="button" className="btn btn-hot btn-lg" hidden={completedSets.length===weights.length} disabled={!completedSets.length||tracker.restTimer?.card} onClick={() => logExercise(false)}>
          Save & next
        </button>
      </div>
      </>)}

      <Modal
        open={addOpen}
        title="Add exercise"
        onClose={() => setAddOpen(false)}
        actions={
          <>
            <button type="button" className="btn btn-soft" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-hot"
              onClick={() => {
                if (!addForm.name.trim()) return;
                const next = [...tracker.exercises];
                next.splice(tracker.index + 1, 0, {
                  name: addForm.name.trim(),
                  target: addForm.target || 'Other',
                  vol: addForm.vol || '3 x 8-12',
                  cue: 'Added during session',
                });
                setTracker({ ...tracker, exercises: next });
                setAddOpen(false);
                setAddForm({ name: '', target: 'Other', vol: '3 x 8-12' });
                toast.push('Exercise queued next', 'ok');
              }}
            >
              Add
            </button>
          </>
        }
      >
        <div className="stack">
          <label className="form-field"><span>Exercise name</span><input className="input" placeholder="Exercise name" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} /></label>
          <label className="form-field"><span>Target muscles</span><input className="input" placeholder="Target" value={addForm.target} onChange={(e) => setAddForm({ ...addForm, target: e.target.value })} /></label>
          <label className="form-field"><span>Sets × reps</span><input className="input" placeholder="Volume" value={addForm.vol} onChange={(e) => setAddForm({ ...addForm, vol: e.target.value })} /></label>
        </div>
      </Modal>
      <Modal
        open={subOpen}
        title={`Substitute ${ex?.name || 'Exercise'}`}
        onClose={() => setSubOpen(false)}
        actions={
          <>
            <button type="button" className="btn btn-soft" onClick={() => setSubOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-hot"
              onClick={() => {
                if (!addForm.name.trim()) return;
                const next = [...tracker.exercises];
                next[tracker.index] = {
                  name: addForm.name.trim(),
                  target: addForm.target || 'Other',
                  vol: addForm.vol || '3 x 8-12',
                  cue: `Substituted for ${ex.name}`,
                };
                setTracker({ ...tracker, plannedExercises:tracker.plannedExercises||tracker.exercises.map(exercise=>({...exercise})),exercises: next,preparationChoice:'adapted',notes:[tracker.notes,`Substituted ${ex.name} with ${addForm.name.trim()}`].filter(Boolean).join('\n') });
                setSubOpen(false);
                setAddForm({ name: '', target: 'Other', vol: '3 x 8-12' });
                toast.push('Exercise substituted', 'ok');
              }}
            >
              Confirm Swap
            </button>
          </>
        }
      >
        <div className="stack">
          <label className="form-field"><span>New exercise name</span><input className="input" placeholder="New exercise name" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} /></label>
          <label className="form-field"><span>Target muscles</span><input className="input" placeholder="Target" value={addForm.target} onChange={(e) => setAddForm({ ...addForm, target: e.target.value })} /></label>
          <label className="form-field"><span>Sets × reps</span><input className="input" placeholder="Volume" value={addForm.vol} onChange={(e) => setAddForm({ ...addForm, vol: e.target.value })} /></label>
        </div>
      </Modal>
      {showExerciseDetails && ex ? (
        <ExerciseDetailModal
          exerciseName={ex.name}
          allExercises={tracker.exercises}
          currentIndex={tracker.index}
          onClose={() => setShowExerciseDetails(false)}
        />
      ) : null}
    </section>
  );
}
