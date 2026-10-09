import { create } from 'zustand';
import type { CameraPreset, DisplayMode, PlaybackState } from './types.js';
import type { BodyOSAnimationAdapter } from './AnimationAdapter.js';
import { ThreeVRMAdapter } from '../adapters/three-vrm/ThreeVRMAdapter.js';

export interface AnimationEngineStore extends PlaybackState {
  activeCue: string;
  currentPhase: string;
  loopCount: number;
  adapter: BodyOSAnimationAdapter | null;
  setPlaying: (playing: boolean) => void;
  restart: () => void;
  setProgress: (progress: number) => void;
  setSpeed: (speed: number) => void;
  setCamera: (camera: CameraPreset) => void;
  setMode: (mode: DisplayMode) => void;
  setExercise: (exerciseId: string) => Promise<void>;
  setCharacter: (characterId: string) => Promise<void>;
  setActiveCue: (cue: string) => void;
  setCurrentPhase: (phase: string) => void;
  setLoopCount: (loopCount: number) => void;
  setAdapter: (adapter: BodyOSAnimationAdapter) => void;
  updateTime: (currentTime: number, progress: number) => void;
  setDuration: (duration: number) => void;
}

export const useAnimationStore = create<AnimationEngineStore>((set, get) => ({
  isPlaying: true,
  progress: 0,
  currentTime: 0,
  duration: 2.4,
  speed: 1.0,
  loop: true,
  camera: 'three-quarter-front',
  mode: 'exercise',
  exerciseId: 'motion-test-squat',
  characterId: 'male-athletic',
  activeCue: '',
  currentPhase: 'rep:start',
  loopCount: 0,
  adapter: null,

  updateTime: (currentTime, progress) => set({ currentTime, progress }),
  setDuration: (duration) => set({ duration }),

  setPlaying: (isPlaying) => {
    const adapter = get().adapter;
    if (adapter) {
      if (isPlaying) adapter.play();
      else adapter.pause();
    }
    set({ isPlaying });
  },

  restart: () => {
    const adapter = get().adapter;
    if (adapter) {
      adapter.restart();
    }
    set({ isPlaying: true, progress: 0, currentTime: 0, loopCount: 0 });
  },

  setProgress: (progress) => {
    const adapter = get().adapter;
    if (adapter) adapter.seek(progress);
    set({ progress });
  },

  setSpeed: (speed) => {
    const adapter = get().adapter;
    if (adapter) adapter.setSpeed(speed);
    set({ speed });
  },

  setCamera: (camera) => {
    const adapter = get().adapter;
    if (adapter) adapter.setCamera(camera, true);
    set({ camera });
  },

  setMode: (mode) => {
    const adapter = get().adapter;
    if (adapter) adapter.setDisplayMode(mode);
    set({ mode });
  },

  setExercise: async (exerciseId) => {
    const adapter = get().adapter;
    if (adapter) {
      await adapter.loadExercise(exerciseId);
    }
    set({ exerciseId, progress: 0, activeCue: '', currentPhase: 'rep:start', loopCount: 0 });
  },

  setCharacter: async (characterId) => {
    const adapter = get().adapter;
    if (adapter) {
      await adapter.loadCharacter(characterId);
    }
    set({ characterId });
  },

  setActiveCue: (activeCue) => set({ activeCue }),
  setCurrentPhase: (currentPhase) => set({ currentPhase }),
  setLoopCount: (loopCount) => set({ loopCount }),

  setAdapter: (adapter) => set({ adapter }),
}));

export function createDefaultAdapter(): BodyOSAnimationAdapter {
  return new ThreeVRMAdapter();
}
