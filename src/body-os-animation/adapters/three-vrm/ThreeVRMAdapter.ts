import * as THREE from 'three';
import type { BodyOSAnimationAdapter } from '../../core/AnimationAdapter.js';
import type { CameraPreset, DisplayMode, MuscleActivation } from '../../core/types.js';
import { AnimationEventEmitter } from '../../core/events.js';
import { CameraController } from '../../camera/CameraController.js';
import { CharacterController } from '../../character/CharacterController.js';
import { EquipmentController } from '../../equipment/EquipmentController.js';
import { ExerciseController } from '../../exercise/ExerciseController.js';
import { MotionController } from '../../motion/MotionController.js';
import { MotionV2Controller } from '../../motion/MotionV2Controller.js';
import type { FrameOwnershipReport } from '../../motion/FrameOwnershipDiagnostic.js';
import { getMotionMetadata } from '../../motion/MotionRegistry.js';
import { MuscleController } from '../../muscles/MuscleController.js';
import { FormCueController } from '../../form/FormCueController.js';
import { Environment } from '../../rendering/Environment.js';
import { Lighting } from '../../rendering/Lighting.js';

export class ThreeVRMAdapter implements BodyOSAnimationAdapter {
  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);

  private cameraController: CameraController;
  private characterController: CharacterController = new CharacterController();
  private motionController: MotionController = new MotionController();
  // Motion V2 (M1 calibration path). Exclusive with motionController per frame.
  private motionV2: MotionV2Controller = new MotionV2Controller();
  private motionV2Enabled = false;
  private equipmentController: EquipmentController = new EquipmentController();
  private muscleController: MuscleController = new MuscleController();
  private exerciseController: ExerciseController;
  private lighting: Lighting = new Lighting();
  private environment: Environment = new Environment();

  public events: AnimationEventEmitter = new AnimationEventEmitter();

  private animationFrameId: number | null = null;
  private lastTime = 0;
  private lastLoopCount = 0;
  private isDisposed = false;

  constructor() {
    this.cameraController = new CameraController(this.camera);
    this.exerciseController = new ExerciseController(
      this.characterController,
      this.motionController,
      this.equipmentController,
      this.muscleController,
      this.cameraController
    );
  }

  async initialize(container: HTMLElement): Promise<void> {
    if (this.isDisposed) return;
    this.container = container;

    // 1. Setup Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || 300, container.clientHeight || 300);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    // 2. Setup Scene
    this.scene.add(this.lighting.getGroup());
    this.scene.add(this.environment.getGroup());
    this.scene.add(this.exerciseController.getFormCueController().getOverlayGroup());

    // 3. Set scene root on equipment controller for world-space placement
    this.equipmentController.setSceneRoot(this.scene);

    // 4. Load default character
    const charRoot = await this.characterController.loadCharacter('male-athletic');
    this.scene.add(charRoot);
    this.muscleController.scanAndBind(charRoot);
    // Motion V2 binding (M1 calibration path; idle until enabled).
    this.motionV2.bind(this.characterController);

    // 5. Hook Motion Events
    this.motionController.onEvent((evt, loopCount) => {
      this.exerciseController.getFormCueController().setCurrentPhase(evt.name);
      this.events.emit('cuetrigger', { cue: evt.cue || evt.name, time: evt.time });
      this.events.emit('phasechange', { phase: evt.name, progress: evt.time });
    });

    // 6. Start Render Loop
    this.lastTime = performance.now();
    this.startLoop();

    (window as any).__bodyOsAdapter = this;

    const initialMeta = getMotionMetadata('motion-test-squat');
    this.events.emit('loaded', { exerciseId: 'motion-test-squat', duration: initialMeta.duration || 2.4 });
  }

  async loadCharacter(characterId: string): Promise<void> {
    const charRoot = await this.characterController.loadCharacter(characterId);
    this.scene.add(charRoot);
    this.muscleController.scanAndBind(charRoot);
    this.motionV2.bind(this.characterController);
    // Reload active exercise on new character
    await this.exerciseController.loadExercise(this.exerciseController.getCurrentExerciseId());
  }

  async loadExercise(exerciseId: string): Promise<void> {
    this.events.emit('loadstart', {
      exerciseId,
      characterId: this.characterController.getCharacterId(),
    });

    await this.exerciseController.loadExercise(exerciseId);
    const meta = getMotionMetadata(exerciseId);

    this.events.emit('loaded', {
      exerciseId,
      duration: meta.duration || 2.4,
    });
  }

  play(): void {
    this.motionController.play();
    this.events.emit('play', undefined);
  }

  pause(): void {
    this.motionController.pause();
    this.events.emit('pause', undefined);
  }

  restart(): void {
    this.motionController.restart();
  }

  seek(progress: number): void {
    this.motionController.seek(progress);
  }

  setSpeed(speed: number): void {
    this.motionController.setSpeed(speed);
  }

  setCamera(camera: CameraPreset, animate = true): void {
    this.cameraController.setPreset(camera, animate);
    this.events.emit('camerachange', { camera });
  }

  setDisplayMode(mode: DisplayMode): void {
    this.exerciseController.setDisplayMode(mode);
    this.events.emit('modechange', { mode });
  }

  setMuscleActivation(activation: MuscleActivation): void {
    this.exerciseController.setMuscleActivation(activation);
  }

  // ---------------------------------------------------------------------------
  // Motion V2 — calibration path (M1). Exclusive with the V1 motion
  // controller: exactly one of the two writes poses per frame, never both.
  // ---------------------------------------------------------------------------

  enableMotionV2(clipId = 'v2-calib-neutral'): boolean {
    this.motionV2.bind(this.characterController);
    const ok = this.motionV2.playClip(clipId);
    if (ok) this.motionV2Enabled = true;
    return ok;
  }

  disableMotionV2(): void {
    this.motionV2Enabled = false;
  }

  isMotionV2Enabled(): boolean {
    return this.motionV2Enabled;
  }

  playMotionV2Clip(clipId: string): boolean {
    return this.motionV2.playClip(clipId);
  }

  listMotionV2Clips(): string[] {
    return this.motionV2.listClips();
  }

  motionV2Seek(progress: number): void {
    this.motionV2.getPlayer().seek(progress);
  }

  motionV2Play(): void {
    this.motionV2.getPlayer().play();
  }

  motionV2Pause(): void {
    this.motionV2.getPlayer().pause();
  }

  setMotionV2GripDiagnostic(enabled: boolean): void {
    this.motionV2.setGripDiagnostic(enabled);
  }

  /** Developer-only normalized-vs-raw frame report (M1 diagnostics). */
  runFrameOwnershipDiagnostic(): FrameOwnershipReport | null {
    return this.motionV2.diagnoseFrames();
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.container) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private startLoop(): void {
    const tick = (now: number) => {
      if (this.isDisposed) return;
      const delta = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;

      // Update camera smooth lerp
      this.cameraController.update(delta);

      // Update kinematics / motion.
      // M1 frame order: motion sample → normalized pose (+grip merge) →
      // (future constraints) → vrm.update() → equipment → render.
      // V1 and V2 never pose in the same frame.
      if (this.motionV2Enabled) {
        const status = this.motionV2.update(delta);
        if (status) {
          this.events.emit('timeupdate', {
            currentTime: status.currentTime,
            progress: status.progress,
          });
        }
      } else {
        const status = this.motionController.update(delta, this.characterController);
        if (status.loopCount > this.lastLoopCount) {
          this.lastLoopCount = status.loopCount;
          this.events.emit('loop', { loopCount: status.loopCount });
        }
        this.events.emit('timeupdate', {
          currentTime: status.currentTime,
          progress: status.progress,
        });
      }
      this.characterController.update(delta);
      this.characterController.getRoot()?.updateWorldMatrix(true, true);

      // Update equipment constraints (two-hand barbell tracking)
      this.equipmentController.update();

      // Update Form Mode overlays (zero overhead if mode !== 'form')
      const formController = this.exerciseController.getFormCueController();
      if (formController.getIsVisible()) {
        formController.update(this.characterController, this.equipmentController);
      }

      // Render
      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  getExerciseController(): ExerciseController {
    return this.exerciseController;
  }

  getFormCueController(): FormCueController {
    return this.exerciseController.getFormCueController();
  }

  getMuscleController(): MuscleController {
    return this.muscleController;
  }

  dispose(): void {
    this.isDisposed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.exerciseController.dispose();
    this.motionController.dispose();
    this.equipmentController.dispose();
    this.muscleController.dispose();
    this.characterController.dispose();
    this.lighting.dispose();
    this.environment.dispose();
    this.events.clear();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
  }
}
