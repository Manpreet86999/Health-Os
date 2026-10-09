import { ExerciseReferences } from './ExerciseReferences';
import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { matchCachedExercise, normalizeExerciseName } from '../../shared/global-exercises';

interface ExerciseDetailModalProps {
  exerciseName: string;
  exerciseId?: string;
  allExercises?: Array<{ name: string; exerciseId?: string; target?: string; vol?: string; cue?: string }>;
  currentIndex?: number;
  onSelectIndex?: (index: number) => void;
  onClose: () => void;
}

export function ExerciseDetailModal({
  exerciseName,
  exerciseId,
  allExercises = [],
  currentIndex = 0,
  onSelectIndex,
  onClose,
}: ExerciseDetailModalProps) {
  const [durationSec, setDurationSec] = useState<number>(30);

  const {db,setPage}=useApp();
  const id=exerciseId || allExercises[currentIndex]?.exerciseId;
  const candidates=db?.exercises || [];
  const exercise=candidates.find(e=>e.id===id) || matchCachedExercise({name:exerciseName},candidates) || candidates.find(e=>e.source==='custom' && normalizeExerciseName(e.name)===normalizeExerciseName(exerciseName));
  const data = {
    name:exercise?.name || exerciseName,
    focusMuscles:exercise?.muscles || [], secondaryMuscles:[] as string[],
    equipment:exercise?.equipment || 'Not specified', defaultDuration:'00:30',
    instructions:exercise?.defaultCue ? [exercise.defaultCue] : ['Use the workout cues and your coach’s instructions.'],
    cues:allExercises[currentIndex]?.cue ? [allExercises[currentIndex].cue!] : [],
  };

  const total = allExercises.length || 1;
  const previous=db?.sessions.filter(s=>s.status!=='draft').sort((a,b)=>b.date.localeCompare(a.date)).flatMap(s=>s.logs.filter(log=>log.status!=='skipped'&&normalizeExerciseName(log.name)===normalizeExerciseName(exerciseName)).map(log=>({date:s.date,sets:log.sets.filter(set=>set.type!=='warmup')})))[0];
  const currentNum = currentIndex + 1;

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handlePrev = () => {
    if (onSelectIndex && currentIndex > 0) {
      onSelectIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (onSelectIndex && currentIndex < total - 1) {
      onSelectIndex(currentIndex + 1);
    }
  };

  return (
    <div
      className="modal-backdrop fade"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="exercise-detail-dialog"
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '92vh',
          backgroundColor: 'var(--bg-1, #111214)',
          border: '1px solid var(--line, #25272D)',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 12px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--text-0, #FFF)',
            }}
          >
            {exerciseName}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: '#38BDF8',
              fontSize: 13,
              fontWeight: 600,
              padding: '4px 8px',
            }}
            onClick={onClose}
          >
            <span style={{ fontSize: 16 }}>⇄</span> Close
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px' }}>
          <ExerciseReferences exercise={exerciseName} saved={exercise}/>
          <section className="glass card stack" style={{marginBottom:20}}><span className="bio-eyebrow">PREVIOUS PERFORMANCE</span>{previous?<><strong>{previous.date}</strong><div className="row wrap">{previous.sets.map((set,i)=><span className="pill pill-slate" key={i}>{set.w?`${set.w} ${db?.profile.units} × `:''}{set.durationSec?`${set.durationSec}s`:set.r?`${set.r} reps`:'No value'}{set.rir!==undefined?` · RIR ${set.rir}`:''}</span>)}</div></>:<p className="subtle">No recorded performance for this exercise yet.</p>}<button className="btn btn-soft btn-sm" onClick={()=>{onClose();setPage('ExerciseHistory');}}>Exercise history</button></section>

          {/* Duration Stepper */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              padding: '14px 18px',
              backgroundColor: 'var(--bg-2, #18191D)',
              borderRadius: '18px',
              border: '1px solid var(--line, #25272D)',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-1, #E2E8F0)',
              }}
            >
              Duration
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                type="button"
                onClick={() => setDurationSec((s) => Math.max(10, s - 5))}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: '1px solid var(--line, #334155)',
                  backgroundColor: 'var(--bg-1, #111214)',
                  color: 'var(--text-0, #FFF)',
                  fontSize: 18,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                −
              </button>
              <strong style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', minWidth: 64, textAlign: 'center' }}>
                {formatDuration(durationSec)}
              </strong>
              <button
                type="button"
                onClick={() => setDurationSec((s) => s + 5)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: '1px solid var(--line, #334155)',
                  backgroundColor: 'var(--bg-1, #111214)',
                  color: 'var(--text-0, #FFF)',
                  fontSize: 18,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div style={{ marginBottom: 20 }}>
            <h4
              style={{
                margin: '0 0 10px',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#2563EB',
              }}
            >
              Instructions
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.instructions.map((step, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(37,99,235,0.15)',
                      color: '#38BDF8',
                      fontSize: 11,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-1, #CBD5E1)' }}>
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Focus Area */}
          <div>
            <h4
              style={{
                margin: '0 0 10px',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-1, #94A3B8)',
              }}
            >
              Focus Area
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.focusMuscles.map((muscle) => (
                <span
                  key={muscle}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 20,
                    backgroundColor: 'rgba(37,99,235,0.12)',
                    border: '1px solid rgba(37,99,235,0.3)',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: '#60A5FA',
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: '#2563EB',
                    }}
                  />
                  {muscle}
                </span>
              ))}
              {data.secondaryMuscles.map((muscle) => (
                <span
                  key={muscle}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 20,
                    backgroundColor: 'var(--bg-2, #18191D)',
                    border: '1px solid var(--line, #25272D)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--text-2, #94A3B8)',
                  }}
                >
                  {muscle}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar: Carousel Prev/Next & Close */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: 'var(--bg-2, #18191D)',
            borderTop: '1px solid var(--line, #25272D)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* Pagination Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              disabled={currentIndex <= 0}
              onClick={handlePrev}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: currentIndex > 0 ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.05)',
                color: currentIndex > 0 ? '#38BDF8' : 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                cursor: currentIndex > 0 ? 'pointer' : 'default',
              }}
            >
              ⏮
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1, #E2E8F0)', minWidth: 44, textAlign: 'center' }}>
              {currentNum} / {total}
            </span>
            <button
              type="button"
              disabled={currentIndex >= total - 1}
              onClick={handleNext}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: currentIndex < total - 1 ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.05)',
                color: currentIndex < total - 1 ? '#38BDF8' : 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                cursor: currentIndex < total - 1 ? 'pointer' : 'default',
              }}
            >
              ⏭
            </button>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              maxWidth: 160,
              padding: '12px 20px',
              borderRadius: 24,
              border: 'none',
              backgroundColor: '#2563EB',
              color: '#FFF',
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
