import React, { useState } from 'react';
import type { CameraPreset, DisplayMode } from '../core/types.js';
import { CHARACTER_REGISTRY } from '../character/CharacterRegistry.js';
import { EXERCISE_REGISTRY } from '../exercise/ExerciseRegistry.js';
import { EQUIPMENT_REGISTRY } from '../equipment/EquipmentRegistry.js';
import { ExerciseAnimation } from '../ui/ExerciseAnimation.js';
import { AnimationControls } from '../ui/AnimationControls.js';
import { CALIBRATION_CLIP_IDS } from '../motion/CalibrationClips.js';

function getV2Adapter(): any {
  return (window as any).__bodyOsAdapter ?? null;
}

/**
 * MOTION V2 — CALIBRATION (M1). Drives canonical clips exclusively
 * through the V2 normalized-humanoid pipeline. No V1 motion, no exercises.
 */
function MotionV2CalibrationPanel() {
  const [enabled, setEnabled] = useState(false);
  const [clipId, setClipId] = useState<string>(CALIBRATION_CLIP_IDS[0]!);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [grip, setGrip] = useState(false);
  const [diag, setDiag] = useState<string>('');

  const toggleEnabled = (on: boolean) => {
    const adapter = getV2Adapter();
    setEnabled(on);
    if (!adapter) {
      setDiag('adapter not ready');
      return;
    }
    if (on) {
      const ok = adapter.enableMotionV2(clipId);
      setDiag(ok ? `V2 enabled: ${clipId}` : 'V2 enable failed');
    } else {
      adapter.disableMotionV2();
      setDiag('V2 disabled — V1 motion resumes');
    }
  };

  const selectClip = (id: string) => {
    setClipId(id);
    const adapter = getV2Adapter();
    if (adapter && enabled) {
      adapter.playMotionV2Clip(id);
      setDiag(`V2 clip: ${id}`);
    }
  };

  const togglePlay = () => {
    const adapter = getV2Adapter();
    if (!adapter) return;
    if (playing) adapter.motionV2Pause();
    else adapter.motionV2Play();
    setPlaying(!playing);
  };

  const seek = (p: number) => {
    setProgress(p);
    getV2Adapter()?.motionV2Seek(p);
  };

  const toggleGrip = (on: boolean) => {
    setGrip(on);
    getV2Adapter()?.setMotionV2GripDiagnostic(on);
    if (on) setDiag('grip diagnostic ON: normalized fist merged pre-update');
  };

  const runDiagnostic = () => {
    const report = getV2Adapter()?.runFrameOwnershipDiagnostic?.();
    setDiag(report ? JSON.stringify(report, null, 1) : 'diagnostic unavailable (VRM required)');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        paddingTop: '14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 800, color: '#38BDF8' }}>
          MOTION V2 — CALIBRATION
        </span>
        <button
          type="button"
          onClick={() => toggleEnabled(!enabled)}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: enabled ? '#22c55e' : 'rgba(255, 255, 255, 0.12)',
            backgroundColor: enabled ? 'rgba(34, 197, 94, 0.15)' : '#181a20',
            color: enabled ? '#22c55e' : '#94A3B8',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {enabled ? 'V2 ON' : 'V2 OFF'}
        </button>
      </div>

      <label style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1' }}>Calibration clip</label>
      <select
        value={clipId}
        onChange={(e) => selectClip(e.target.value)}
        disabled={!enabled}
        style={{
          backgroundColor: '#181a20',
          border: '1px dashed rgba(56, 189, 248, 0.4)',
          borderRadius: '10px',
          color: '#FFF',
          padding: '10px 12px',
          fontSize: '13px',
          outline: 'none',
        }}
      >
        {CALIBRATION_CLIP_IDS.map((id) => (
          <option key={id} value={id}>
            {id.replace('v2-calib-', '')}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!enabled}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backgroundColor: '#181a20',
            color: '#CBD5E1',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={progress}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!enabled}
          style={{ flex: 1, accentColor: '#38BDF8' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          id="v2-grip-chk"
          checked={grip}
          onChange={(e) => toggleGrip(e.target.checked)}
          disabled={!enabled}
          style={{ accentColor: '#38BDF8' }}
        />
        <label htmlFor="v2-grip-chk" style={{ fontSize: '12px', color: '#38BDF8', cursor: 'pointer' }}>
          Grip diagnostic (normalized fist, per-frame merge)
        </label>
      </div>

      <button
        type="button"
        onClick={runDiagnostic}
        disabled={!enabled}
        style={{
          padding: '6px 12px',
          borderRadius: '8px',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          color: '#38BDF8',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Run frame-ownership diagnostic
      </button>
      {diag && (
        <pre
          style={{
            fontSize: '10px',
            color: '#94A3B8',
            backgroundColor: '#0d0f13',
            borderRadius: '8px',
            padding: '8px',
            maxHeight: '220px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {diag}
        </pre>
      )}
    </div>
  );
}

export function AnimationStudio() {
  const [selectedCharacter, setSelectedCharacter] = useState<string>('male-athletic');
  const [selectedExercise, setSelectedExercise] = useState<string>('jumping-jack');
  const [camera, setCamera] = useState<CameraPreset>('three-quarter-front');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('exercise');
  const [speed, setSpeed] = useState<number>(1.0);
  const [showPrimaryMuscles, setShowPrimaryMuscles] = useState<boolean>(true);
  const [showSecondaryMuscles, setShowSecondaryMuscles] = useState<boolean>(true);
  const [showEquipmentPanel, setShowEquipmentPanel] = useState<boolean>(true);
  const [showFormPanel, setShowFormPanel] = useState<boolean>(true);
  const [showJointGuides, setShowJointGuides] = useState<boolean>(true);
  const [showPaths, setShowPaths] = useState<boolean>(true);
  const [showAlignments, setShowAlignments] = useState<boolean>(true);
  const [showContactPoints, setShowContactPoints] = useState<boolean>(true);

  // Sync category toggles to live adapter
  const updateFormToggle = (cat: 'jointGuides' | 'paths' | 'alignments' | 'contactPoints', val: boolean) => {
    if (cat === 'jointGuides') setShowJointGuides(val);
    if (cat === 'paths') setShowPaths(val);
    if (cat === 'alignments') setShowAlignments(val);
    if (cat === 'contactPoints') setShowContactPoints(val);
    const adapter = (window as any).__bodyOsAdapter;
    if (adapter?.getFormCueController()) {
      adapter.getFormCueController().setCategoryToggle(cat, val);
    }
  };

  const activeExercise = EXERCISE_REGISTRY[selectedExercise] || EXERCISE_REGISTRY['motion-test-squat'] || EXERCISE_REGISTRY['neutral-stance'];

  // Determine unique equipment IDs used by the current exercise
  const activeEquipmentIds = [...new Set(activeExercise.equipment.map((e) => e.id))];
  const activeEquipmentDefs = activeEquipmentIds
    .map((id) => EQUIPMENT_REGISTRY[id])
    .filter(Boolean);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0b0e',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Studio Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#0066FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '16px',
              letterSpacing: '-0.03em',
              color: '#FFF',
              boxShadow: '0 0 15px rgba(0, 102, 255, 0.5)',
            }}
          >
            OS
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Health OS Animation Studio — Phase 6: Muscle + Form Architecture
            </h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>
              Exercise Mode · Muscle Mode · Form Mode · Asset-Decoupled Mapping · Dynamic Joint Angles & Paths
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: 'rgba(0, 102, 255, 0.1)',
              border: '1px solid rgba(0, 102, 255, 0.3)',
              color: '#38BDF8',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            Phase 6: Live 3-Mode Architecture
          </span>
        </div>
      </header>

      {/* Quick Select Bar for the 5 Production Exercises */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
          backgroundColor: '#111215',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '12px 16px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>
          Production Suite:
        </span>
        {[
          { id: 'jumping-jack', label: 'Jumping Jack', icon: '🏃', cam: 'front' },
          { id: 'bodyweight-squat', label: 'Bodyweight Squat', icon: '🏋️', cam: 'three-quarter-front' },
          { id: 'push-up', label: 'Push-Up', icon: '🤸', cam: 'horizontal-floor' },
          { id: 'dumbbell-curl', label: 'Dumbbell Curl', icon: '💪', cam: 'three-quarter-front' },
          { id: 'bench-press', label: 'Bench Press', icon: '🏋️‍♂️', cam: 'three-quarter-front' },
        ].map((item) => {
          const isSelected = selectedExercise === item.id;
          return (
            <button
              key={item.id}
              id={`quick-select-${item.id}`}
              type="button"
              onClick={() => {
                setSelectedExercise(item.id);
                setCamera(item.cam as CameraPreset);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid',
                borderColor: isSelected ? '#0066FF' : 'rgba(255, 255, 255, 0.08)',
                backgroundColor: isSelected ? 'rgba(0, 102, 255, 0.2)' : '#181a20',
                color: isSelected ? '#38BDF8' : '#CBD5E1',
                fontSize: '12px',
                fontWeight: isSelected ? 800 : 600,
                cursor: 'pointer',
                boxShadow: isSelected ? '0 0 12px rgba(0, 102, 255, 0.3)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Studio Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 380px) 1fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Inspector Sidebar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            backgroundColor: '#111215',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '20px',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8' }}>
            Rig & Animation Controls
          </h2>

          {/* Character Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1' }}>Character Rig</label>
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              style={{
                backgroundColor: '#181a20',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                color: '#FFF',
                padding: '10px 12px',
                fontSize: '13px',
                outline: 'none',
              }}
            >
              {Object.values(CHARACTER_REGISTRY).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.gender})
                </option>
              ))}
            </select>
          </div>

          {/* Exercise Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1' }}>Validation Exercise</label>
            <select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              style={{
                backgroundColor: '#181a20',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                color: '#FFF',
                padding: '10px 12px',
                fontSize: '13px',
                outline: 'none',
              }}
            >
              {Object.values(EXERCISE_REGISTRY).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} [{ex.category}]{ex.equipment.length > 0 ? ' 🏋️' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Motion V2 — Calibration (M1). Canonical clips through the V2
              normalized-humanoid pipeline. Exclusive with V1 motion per
              frame; no exercise motion here. */}
          <MotionV2CalibrationPanel />

          {/* Display Mode Switcher */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1' }}>Display Mode</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {(
                [
                  { id: 'exercise', label: 'Exercise' },
                  { id: 'muscles', label: 'Muscles' },
                  { id: 'form', label: 'Form (Slow)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDisplayMode(m.id)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: displayMode === m.id ? '#0066FF' : 'rgba(255, 255, 255, 0.08)',
                    backgroundColor: displayMode === m.id ? 'rgba(0, 102, 255, 0.18)' : '#181a20',
                    color: displayMode === m.id ? '#38BDF8' : '#94A3B8',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Camera Angles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1' }}>Camera Angle</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {(
                [
                  { id: 'three-quarter-front', label: '3/4 Perspective' },
                  { id: 'front', label: 'Front Plane' },
                  { id: 'side', label: 'Sagittal (Side)' },
                  { id: 'back', label: 'Posterior (Back)' },
                  { id: 'horizontal-floor', label: 'Floor Plane' },
                ] as const
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => setCamera(cam.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: camera === cam.id ? '#0066FF' : 'rgba(255, 255, 255, 0.08)',
                    backgroundColor: camera === cam.id ? 'rgba(0, 102, 255, 0.18)' : '#181a20',
                    color: camera === cam.id ? '#38BDF8' : '#94A3B8',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {cam.label}
                </button>
              ))}
            </div>
          </div>

          {/* Muscle Activation Inspector */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '14px',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#CBD5E1' }}>Muscle Highlighting</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="primary-chk"
                checked={showPrimaryMuscles}
                onChange={(e) => setShowPrimaryMuscles(e.target.checked)}
                style={{ accentColor: '#0066FF' }}
              />
              <label htmlFor="primary-chk" style={{ fontSize: '12px', color: '#38BDF8', cursor: 'pointer' }}>
                Primary: <strong>{activeExercise.muscles.primary.join(', ')}</strong>
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="sec-chk"
                checked={showSecondaryMuscles}
                onChange={(e) => setShowSecondaryMuscles(e.target.checked)}
                style={{ accentColor: '#38BDF8' }}
              />
              <label htmlFor="sec-chk" style={{ fontSize: '12px', color: '#94A3B8', cursor: 'pointer' }}>
                Secondary: <strong>{activeExercise.muscles.secondary.join(', ')}</strong>
              </label>
            </div>
          </div>

          {/* ============================================================= */}
          {/* PHASE 4: Equipment & Interaction Inspector Panel               */}
          {/* ============================================================= */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#CBD5E1' }}>
                Equipment Inspector
              </span>
              <button
                type="button"
                onClick={() => setShowEquipmentPanel(!showEquipmentPanel)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#64748B',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {showEquipmentPanel ? '▾ Hide' : '▸ Show'}
              </button>
            </div>

            {showEquipmentPanel && (
              <>
                {/* Attachment Summary */}
                {activeExercise.equipment.length === 0 ? (
                  <div
                    style={{
                      fontSize: '11px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#181a20',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      color: '#64748B',
                      textAlign: 'center',
                    }}
                  >
                    No Equipment — Bodyweight Movement
                  </div>
                ) : (
                  <>
                    {/* Active Attachment Points */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {activeExercise.equipment.map((eq, i) => {
                        const def = EQUIPMENT_REGISTRY[eq.id];
                        const constraintMode = def?.constraint?.mode || 'parent';
                        const constraintBadge = {
                          parent: { label: 'PARENT', color: '#22c55e' },
                          'two-hand': { label: '2-HAND', color: '#f59e0b' },
                          'world-static': { label: 'STATIC', color: '#8b5cf6' },
                        }[constraintMode];

                        return (
                          <div
                            key={i}
                            style={{
                              fontSize: '11px',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              backgroundColor: '#181a20',
                              border: '1px solid rgba(255, 255, 255, 0.06)',
                              color: '#94A3B8',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <span style={{ color: '#38BDF8', fontWeight: 700 }}>{eq.id}</span>
                              <span style={{ color: '#475569', margin: '0 4px' }}>→</span>
                              <code style={{ color: '#CBD5E1' }}>{eq.attachToBone}</code>
                              <span style={{ color: '#475569', margin: '0 4px' }}>·</span>
                              <code style={{ color: '#64748B' }}>{eq.socketName}</code>
                            </div>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: `${constraintBadge.color}22`,
                                border: `1px solid ${constraintBadge.color}44`,
                                color: constraintBadge.color,
                                fontSize: '9px',
                                fontWeight: 800,
                                letterSpacing: '0.05em',
                              }}
                            >
                              {constraintBadge.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Equipment Specs */}
                    {activeEquipmentDefs.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Equipment Specifications
                        </span>
                        {activeEquipmentDefs.map((def) => (
                          <div
                            key={def.id}
                            style={{
                              fontSize: '10px',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              backgroundColor: '#13151a',
                              border: '1px solid rgba(255, 255, 255, 0.04)',
                              color: '#64748B',
                            }}
                          >
                            <div style={{ fontWeight: 700, color: '#94A3B8', marginBottom: '4px' }}>
                              {def.name} (v{def.version})
                            </div>
                            {def.dimensions && (
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {def.dimensions.length && (
                                  <span>L: {def.dimensions.length}m</span>
                                )}
                                {def.dimensions.width && (
                                  <span>W: {def.dimensions.width}m</span>
                                )}
                                {def.dimensions.height && (
                                  <span>H: {def.dimensions.height}m</span>
                                )}
                                {def.dimensions.weight && (
                                  <span style={{ color: '#38BDF8' }}>
                                    {def.dimensions.weight}kg
                                  </span>
                                )}
                              </div>
                            )}
                            {def.variants && def.variants.length > 0 && (
                              <div style={{ marginTop: '2px' }}>
                                Variants: {def.variants.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          {/* ============================================================= */}
          {/* PHASE 6: Form Mode Visualizer Inspector Panel                  */}
          {/* ============================================================= */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#CBD5E1' }}>
                Form Mode Visualizer
              </span>
              <button
                type="button"
                onClick={() => setShowFormPanel(!showFormPanel)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#64748B',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {showFormPanel ? '▾ Hide' : '▸ Show'}
              </button>
            </div>

            {showFormPanel && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="form-joint-chk"
                      checked={showJointGuides}
                      onChange={(e) => updateFormToggle('jointGuides', e.target.checked)}
                      style={{ accentColor: '#00d2ff' }}
                    />
                    <label htmlFor="form-joint-chk" style={{ fontSize: '12px', color: '#38BDF8', cursor: 'pointer' }}>
                      Joint Angles (Knee / Elbow Flexion Arcs)
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="form-paths-chk"
                      checked={showPaths}
                      onChange={(e) => updateFormToggle('paths', e.target.checked)}
                      style={{ accentColor: '#00d2ff' }}
                    />
                    <label htmlFor="form-paths-chk" style={{ fontSize: '12px', color: '#38BDF8', cursor: 'pointer' }}>
                      Movement & Equipment Trajectory Paths
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="form-align-chk"
                      checked={showAlignments}
                      onChange={(e) => updateFormToggle('alignments', e.target.checked)}
                      style={{ accentColor: '#00d2ff' }}
                    />
                    <label htmlFor="form-align-chk" style={{ fontSize: '12px', color: '#38BDF8', cursor: 'pointer' }}>
                      Alignment Lines (Spine / Bar / Knee-Over-Toe)
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="form-contact-chk"
                      checked={showContactPoints}
                      onChange={(e) => updateFormToggle('contactPoints', e.target.checked)}
                      style={{ accentColor: '#00d2ff' }}
                    />
                    <label htmlFor="form-contact-chk" style={{ fontSize: '12px', color: '#38BDF8', cursor: 'pointer' }}>
                      Surface Contact Discs (Floor / Hand / Foot)
                    </label>
                  </div>
                </div>

                {/* Active Declarative Form Cues List */}
                <div
                  style={{
                    backgroundColor: '#181a20',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '10px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#38BDF8' }}>
                    Active Form Cues ({activeExercise.form?.cues.length || 0}):
                  </div>
                  {(!activeExercise.form?.cues || activeExercise.form.cues.length === 0) ? (
                    <span style={{ color: '#64748B' }}>No form cues configured for this exercise.</span>
                  ) : (
                    activeExercise.form.cues.map((cue) => (
                      <div
                        key={cue.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          paddingBottom: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#F1F5F9' }}>
                          <span>{cue.label}</span>
                          <span style={{ color: '#00D2FF', fontFamily: 'monospace' }}>[{cue.type}]</span>
                        </div>
                        <div style={{ color: '#64748B', fontSize: '10px' }}>
                          Phases: {cue.phases.join(', ')} {cue.targetAngle ? `· Target: ${cue.targetAngle}° (±${cue.tolerance || 10}°)` : ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right 3D Viewport Stage */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              backgroundColor: '#111215',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '24px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <ExerciseAnimation
              exerciseId={selectedExercise}
              character={selectedCharacter}
              mode={displayMode}
              camera={camera}
              speed={speed}
              showControls={true}
              primaryMuscles={showPrimaryMuscles ? activeExercise.muscles.primary : []}
              secondaryMuscles={showSecondaryMuscles ? activeExercise.muscles.secondary : []}
            />

            {/* Exercise Details Card */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '14px 16px',
                borderRadius: '14px',
                backgroundColor: '#181a20',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#FFF' }}>
                  {activeExercise.name}
                </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {activeEquipmentIds.length > 0 && (
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(0, 102, 255, 0.12)',
                        border: '1px solid rgba(0, 102, 255, 0.25)',
                        color: '#38BDF8',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {activeEquipmentIds.length} Equipment
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                    Duration: {activeExercise.motion.duration}s · Loop: Yes
                  </span>
                </div>
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {activeExercise.cues.map((cue, idx) => (
                  <li key={idx}>{cue}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
