import React, { useEffect, useRef, useState } from 'react';
import type { CameraPreset, DisplayMode, MuscleActivation } from '../core/types.js';
import { ThreeVRMAdapter } from '../adapters/three-vrm/ThreeVRMAdapter.js';
import { useAnimationStore } from '../core/AnimationEngine.js';
import { AnimationControls } from './AnimationControls.js';

export interface ExerciseAnimationProps {
  // New SDK API
  exerciseId?: string;
  character?: string;
  mode?: DisplayMode | 'animation' | 'muscle' | 'guide';
  camera?: CameraPreset;
  autoplay?: boolean;
  loop?: boolean;
  speed?: number;
  showControls?: boolean;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];

  // Legacy compatibility props for existing Health OS UI
  exerciseName?: string;
  variant?: 'thumb' | 'large';
  className?: string;
  style?: React.CSSProperties;
}

import { EXERCISE_REGISTRY } from '../exercise/ExerciseRegistry.js';

export function normalizeExerciseId(raw: string): string {
  if (!raw) return 'bodyweight-squat';
  if (EXERCISE_REGISTRY[raw]) return raw;
  // Stage 5.1: calibration poses pass through (same retarget path, no registry entry).
  if (raw.startsWith('calib-')) return raw;
  const n = (raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (n.includes('jack') || n.includes('jumping')) return 'jumping-jack';
  if (n.includes('squat')) return 'bodyweight-squat';
  if (n.includes('push') || n.includes('plank')) return 'push-up';
  if (n.includes('curl')) return 'dumbbell-curl';
  if (n.includes('bench')) return 'bench-press';
  if (n.includes('hinge')) return 'motion-test-hip-hinge';
  if (n.includes('arm') || n.includes('raise')) return 'motion-test-arm-raise';
  return 'bodyweight-squat';
}

function normalizeDisplayMode(raw?: string): DisplayMode {
  if (raw === 'muscle' || raw === 'muscles') return 'muscles';
  if (raw === 'guide' || raw === 'form') return 'form';
  return 'exercise';
}

export function ExerciseAnimation({
  exerciseId,
  exerciseName,
  character = 'male-athletic',
  mode = 'exercise',
  camera = 'three-quarter-front',
  autoplay = true,
  loop = true,
  speed = 1.0,
  showControls,
  primaryMuscles,
  secondaryMuscles,
  variant = 'large',
  className = '',
  style = {},
}: ExerciseAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<ThreeVRMAdapter | null>(null);
  const [isReady, setIsReady] = useState(false);

  const resolvedId = normalizeExerciseId(exerciseId || exerciseName || 'bodyweight-squat');
  const resolvedMode = normalizeDisplayMode(mode);
  const isThumb = variant === 'thumb';

  const { setAdapter, setActiveCue, setCurrentPhase, setLoopCount, updateTime, setDuration } = useAnimationStore();

  // If thumbnail mode, render lightweight vector preview
  if (isThumb) {
    return (
      <div
        className={`exercise-vector-box thumb ${className}`}
        style={{
          width: 56,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
          position: 'relative',
          ...style,
        }}
      >
        <svg viewBox="0 0 100 100" style={{ width: '80%', height: '80%' }}>
          <circle cx="50" cy="24" r="9" fill="#dec0aa" />
          <path d="M 44 20 C 44 14 56 14 56 20 Z" fill="#221f1d" />
          <path d="M 50 34 L 50 56" stroke="#0066FF" strokeWidth="12" strokeLinecap="round" />
          <path d="M 46 58 L 40 84" stroke="#16191f" strokeWidth="8" strokeLinecap="round" />
          <path d="M 54 58 L 60 84" stroke="#16191f" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const adapter = new ThreeVRMAdapter();
    adapterRef.current = adapter;
    setAdapter(adapter);

    const unsubscribeCue = adapter.events.on('cuetrigger', (e) => {
      setActiveCue(e.cue);
    });
    const unsubscribePhase = adapter.events.on('phasechange', (e) => {
      setCurrentPhase(e.phase);
    });
    const unsubscribeLoop = adapter.events.on('loop', (e) => {
      setLoopCount(e.loopCount);
    });
    const unsubscribeTime = adapter.events.on('timeupdate', (e) => {
      updateTime(e.currentTime, e.progress);
    });
    const unsubscribeLoaded = adapter.events.on('loaded', (e) => {
      if (e.duration) setDuration(e.duration);
    });

    let didCancel = false;

    adapter
      .initialize(container)
      .then(async () => {
        if (didCancel) return;
        await adapter.loadCharacter(character);
        await adapter.loadExercise(resolvedId);
        adapter.setCamera(camera, false);
        adapter.setDisplayMode(resolvedMode);
        adapter.setSpeed(speed);
        if (primaryMuscles && secondaryMuscles) {
          adapter.setMuscleActivation({ primary: primaryMuscles, secondary: secondaryMuscles });
        }
        if (autoplay) {
          adapter.play();
        } else {
          adapter.pause();
        }
        (window as any).__bodyOsAdapter = adapter;
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[ExerciseAnimation] WebGL initialization error:', err);
      });

    const handleResize = () => {
      if (container && adapterRef.current) {
        adapterRef.current.resize(container.clientWidth, container.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      didCancel = true;
      delete (window as any).__bodyOsAdapter;
      window.removeEventListener('resize', handleResize);
      unsubscribeCue();
      unsubscribePhase();
      unsubscribeLoop();
      unsubscribeTime();
      unsubscribeLoaded();
      adapter.dispose();
      adapterRef.current = null;
    };
  }, [character, containerRef]);

  // Handle dynamic updates when props change
  useEffect(() => {
    if (!adapterRef.current || !isReady) return;
    adapterRef.current.loadExercise(resolvedId);
  }, [resolvedId, isReady]);

  useEffect(() => {
    if (!adapterRef.current || !isReady) return;
    adapterRef.current.setDisplayMode(resolvedMode);
  }, [resolvedMode, isReady]);

  useEffect(() => {
    if (!adapterRef.current || !isReady) return;
    adapterRef.current.setCamera(camera, true);
  }, [camera, isReady]);

  useEffect(() => {
    if (!adapterRef.current || !isReady) return;
    adapterRef.current.setSpeed(speed);
  }, [speed, isReady]);

  return (
    <div
      className={`body-os-exercise-viewport ${className}`}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...style,
      }}
    >
      <div
        style={{
          width: '100%',
          height: 540,
          borderRadius: 20,
          background:
            'radial-gradient(circle at 50% 35%, rgba(0, 102, 255, 0.08) 0%, rgba(15, 23, 42, 0.5) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
        }}
      >
        {/* WebGL Canvas Container */}
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
          }}
        />

        {/* Engine watermark badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 14,
            background: 'rgba(10, 11, 14, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: 10,
            fontWeight: 700,
            color: '#38BDF8',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#0066FF',
              boxShadow: '0 0 8px #0066FF',
            }}
          />
          Health OS 3D · Engine v1
        </div>
      </div>

      {/* Optional Playback Toolbar */}
      {showControls && <AnimationControls />}
    </div>
  );
}
