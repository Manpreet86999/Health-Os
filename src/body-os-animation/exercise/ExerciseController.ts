import type { DisplayMode, MuscleActivation } from '../core/types.js';
import { CameraController } from '../camera/CameraController.js';
import { CharacterController } from '../character/CharacterController.js';
import { EquipmentController } from '../equipment/EquipmentController.js';
import { MotionController } from '../motion/MotionController.js';
import { MuscleController } from '../muscles/MuscleController.js';
import { FormCueController } from '../form/FormCueController.js';
import { getExerciseDefinition } from './ExerciseRegistry.js';

export class ExerciseController {
  private characterController: CharacterController;
  private motionController: MotionController;
  private equipmentController: EquipmentController;
  private muscleController: MuscleController;
  private cameraController: CameraController;
  private formCueController: FormCueController;

  private currentExerciseId = 'bodyweight-squat';
  private currentMode: DisplayMode = 'exercise';

  constructor(
    character: CharacterController,
    motion: MotionController,
    equipment: EquipmentController,
    muscles: MuscleController,
    camera: CameraController,
    formCue?: FormCueController
  ) {
    this.characterController = character;
    this.motionController = motion;
    this.equipmentController = equipment;
    this.muscleController = muscles;
    this.cameraController = camera;
    this.formCueController = formCue || new FormCueController();
  }

  getFormCueController(): FormCueController {
    return this.formCueController;
  }

  getMuscleController(): MuscleController {
    return this.muscleController;
  }

  async loadExercise(exerciseId: string): Promise<void> {
    // Stage 5.1 (Phase C): calibration poses bypass the exercise registry —
    // deterministic static poses through the same retarget path. No
    // equipment, no grip, no muscle activation; camera untouched.
    if (exerciseId.startsWith('calib-')) {
      this.currentExerciseId = exerciseId;
      this.motionController.setExercise(exerciseId);
      await this.equipmentController.loadAndAttach([], this.characterController);
      try {
        this.characterController.clearGripPreset();
      } catch {
        // ignore
      }
      this.formCueController.setExerciseCues([]);
      this.applyDisplayMode(this.currentMode);
      return;
    }
    const exercise = getExerciseDefinition(exerciseId);
    this.currentExerciseId = exercise.id;

    // 1. Motion
    this.motionController.setExercise(exercise.id);

    // 2. Equipment
    await this.equipmentController.loadAndAttach(
      exercise.equipment,
      this.characterController
    );

    // 2b. Stage 4/5: semantic production grip. Exercise code requests a
    // grip by name; per-finger rotations live in the GripPresets module.
    // Exercises without handheld equipment explicitly clear any previous
    // grip so curled fingers never persist across switches. Never fails
    // exercise loading (procedural fallback rig has no finger bones).
    try {
      const equippedIds = new Set(exercise.equipment.map((e) => e.id));
      if (equippedIds.has('barbell')) {
        this.characterController.applyGripPreset('BARBELL_GRIP');
      } else if (equippedIds.has('dumbbell')) {
        this.characterController.applyGripPreset('DUMBBELL_GRIP');
      } else {
        this.characterController.clearGripPreset();
      }
    } catch {
      // Grip is cosmetic; ignore.
    }

    // 3. Muscles
    this.updateMuscleActivation(exercise.muscles);

    // 4. Form Cues
    if (exercise.form?.cues) {
      this.formCueController.setExerciseCues(exercise.form.cues);
    } else {
      this.formCueController.setExerciseCues([]);
    }

    // 5. Default Camera
    this.cameraController.setPreset(exercise.camera.default, true);

    // 6. Ensure mode visibility is correctly applied to new exercise
    this.applyDisplayMode(this.currentMode);
  }

  setDisplayMode(mode: DisplayMode): void {
    this.currentMode = mode;
    this.applyDisplayMode(mode);
  }

  getDisplayMode(): DisplayMode {
    return this.currentMode;
  }

  private applyDisplayMode(mode: DisplayMode): void {
    const exercise = getExerciseDefinition(this.currentExerciseId);

    if (mode === 'muscles') {
      this.muscleController.setVisible(true);
      this.muscleController.setActivation(exercise.muscles);
      this.formCueController.setVisible(false);
      this.motionController.setSpeed(1.0);
    } else if (mode === 'form') {
      this.muscleController.setVisible(false);
      this.formCueController.setVisible(true);
      this.motionController.setSpeed(0.5); // Slower playback for form examination
    } else {
      // Normal exercise mode
      this.muscleController.setVisible(false);
      this.formCueController.setVisible(false);
      this.motionController.setSpeed(1.0);
    }
  }

  setMuscleActivation(activation: MuscleActivation): void {
    this.muscleController.setActivation(activation);
  }

  private updateMuscleActivation(muscles: { primary: string[]; secondary: string[] }): void {
    if (this.currentMode === 'muscles') {
      this.muscleController.setVisible(true);
      this.muscleController.setActivation(muscles);
    } else {
      this.muscleController.setVisible(false);
    }
  }

  getCurrentExerciseId(): string {
    return this.currentExerciseId;
  }

  dispose(): void {
    this.formCueController.dispose();
  }
}
