import type { CameraPreset, DisplayMode, MuscleActivation } from './types.js';

/**
 * BodyOSAnimationAdapter
 *
 * The essential abstraction layer required by Health OS.
 * No workout UI component may ever directly depend on Three.js, VRM,
 * GLTF loaders, or AnimationMixer. All renderers (ThreeVRMAdapter,
 * SVGAdapter, RiveAdapter, VideoAdapter) must implement this interface.
 */
export interface BodyOSAnimationAdapter {
  /**
   * Initializes WebGL canvas / viewport inside the given container element.
   */
  initialize(container: HTMLElement): Promise<void>;

  /**
   * Loads or switches the character model (e.g. "male-athletic", "female-athletic").
   */
  loadCharacter(characterId: string): Promise<void>;

  /**
   * Loads the exercise definition, binds the .vrma motion clip,
   * mounts required equipment onto character sockets, and resets camera.
   */
  loadExercise(exerciseId: string): Promise<void>;

  /** Play the loaded exercise motion */
  play(): void;

  /** Pause the current motion */
  pause(): void;

  /** Restart playback from progress 0 */
  restart(): void;

  /**
   * Seek to a normalized position between 0.0 and 1.0
   */
  seek(progress: number): void;

  /**
   * Set playback rate multiplier (0.25 to 2.0)
   */
  setSpeed(speed: number): void;

  /**
   * Transition camera to a defined preset orientation.
   */
  setCamera(camera: CameraPreset, animate?: boolean): void;

  /**
   * Toggle between standard exercise view, muscle highlight view,
   * or form guidance view.
   */
  setDisplayMode(mode: DisplayMode): void;

  /**
   * Highlight specified primary (Electric Blue) and secondary (Cyan/Accent) muscle groups.
   */
  setMuscleActivation(activation: MuscleActivation): void;

  /**
   * Handle viewport resizing
   */
  resize(width: number, height: number): void;

  /**
   * Clean up all WebGL contexts, geometry, materials, and listeners.
   */
  dispose(): void;
}
