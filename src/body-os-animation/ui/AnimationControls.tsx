import React from 'react';
import type { CameraPreset } from '../core/types.js';
import { useAnimationStore } from '../core/AnimationEngine.js';

export function AnimationControls() {
  const {
    isPlaying,
    progress,
    currentTime,
    duration,
    speed,
    camera,
    activeCue,
    currentPhase,
    loopCount,
    setPlaying,
    restart,
    setProgress,
    setSpeed,
    setCamera,
  } = useAnimationStore();

  const cameraButtons: Array<{ id: CameraPreset; label: string }> = [
    { id: 'front', label: 'Front' },
    { id: 'three-quarter-front', label: '3/4 View' },
    { id: 'side', label: 'Side' },
    { id: 'back', label: 'Back' },
  ];

  const speedOptions = [0.25, 0.5, 1.0, 1.5, 2.0];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 16px',
        backgroundColor: 'rgba(17, 18, 20, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        backdropFilter: 'blur(10px)',
        color: '#F8FAFC',
        fontSize: 12,
      }}
    >
      {/* Live Form Cue & Rep Phase Display */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Phase Badge */}
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              backgroundColor: 'rgba(0, 102, 255, 0.18)',
              border: '1px solid rgba(0, 102, 255, 0.4)',
              color: '#38BDF8',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {currentPhase || 'rep:start'}
          </span>

          {/* Cue */}
          {activeCue && (
            <span style={{ color: '#E2E8F0', fontWeight: 500, fontSize: 12 }}>
              {activeCue}
            </span>
          )}
        </div>

        {/* Loop / Rep Counter */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#94A3B8',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: '2px 8px',
            borderRadius: 10,
          }}
        >
          Rep #{loopCount + 1}
        </span>
      </div>

      {/* Scrubber & Play/Restart Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Play/Pause */}
        <button
          type="button"
          onClick={() => setPlaying(!isPlaying)}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: isPlaying ? 'rgba(255,255,255,0.1)' : '#0066FF',
            border: 'none',
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 14,
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Restart Button */}
        <button
          type="button"
          onClick={restart}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#94A3B8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 14,
          }}
          title="Restart Rep (↺)"
          aria-label="Restart"
        >
          ↺
        </button>

        {/* Timeline Slider */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.005"
          value={progress || 0}
          onChange={(e) => setProgress(parseFloat(e.target.value))}
          style={{
            flex: 1,
            accentColor: '#0066FF',
            cursor: 'pointer',
          }}
        />

        <span style={{ fontSize: 11, color: '#94A3B8', minWidth: 45, textAlign: 'right' }}>
          {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
        </span>
      </div>

      {/* Speed & Camera Angle Selectors */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          paddingTop: 8,
        }}
      >
        {/* Speed Pills (0.25x, 0.5x, 1x, 1.5x, 2x) */}
        <div style={{ display: 'flex', gap: 4 }}>
          {speedOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: speed === s ? '#0066FF' : 'rgba(255,255,255,0.06)',
                color: speed === s ? '#FFF' : '#94A3B8',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Camera Pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {cameraButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setCamera(btn.id)}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: camera === btn.id ? 'rgba(0,102,255,0.2)' : 'rgba(255,255,255,0.06)',
                color: camera === btn.id ? '#38BDF8' : '#94A3B8',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: camera === btn.id ? 'rgba(0,102,255,0.5)' : 'transparent',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
