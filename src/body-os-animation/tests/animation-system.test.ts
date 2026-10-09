import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_REGISTRY, getExerciseDefinition } from '../exercise/ExerciseRegistry.js';
import { CHARACTER_REGISTRY, getCharacterDefinition } from '../character/CharacterRegistry.js';
import { EQUIPMENT_REGISTRY, getEquipmentDefinition } from '../equipment/EquipmentRegistry.js';
import { MUSCLE_REGISTRY, normalizeMuscleId } from '../muscles/MuscleRegistry.js';
import { CAMERA_CONFIGURATIONS, getCameraConfiguration } from '../camera/CameraPresets.js';
import { MOTION_REGISTRY, getMotionMetadata } from '../motion/MotionRegistry.js';

test('Health OS Animation System — 5 Phase-1 Validation Exercises', () => {
  const phase1Ids = [
    'jumping-jack',
    'bodyweight-squat',
    'push-up',
    'dumbbell-curl',
    'bench-press',
  ];

  for (const id of phase1Ids) {
    const ex = getExerciseDefinition(id);
    assert.ok(ex, `Exercise ${id} must be defined in EXERCISE_REGISTRY`);
    assert.equal(ex.id, id);
    assert.ok(ex.motion.duration > 0, `Duration for ${id} must be positive`);
    assert.ok(ex.muscles.primary.length > 0, `Primary muscles for ${id} must not be empty`);
    assert.ok(ex.camera.default, `Default camera for ${id} must be specified`);
  }
});

test('Health OS Animation System — Character Registry', () => {
  const maleAthletic = getCharacterDefinition('male-athletic');
  assert.equal(maleAthletic.id, 'male-athletic');
  assert.equal(maleAthletic.gender, 'male');
  assert.equal(maleAthletic.physique, 'athletic');
  assert.ok(CHARACTER_REGISTRY['female-athletic']);
});

test('Health OS Animation System — Equipment Registry & Sockets', () => {
  const dumbbell = getEquipmentDefinition('dumbbell');
  assert.ok(dumbbell);
  assert.equal(dumbbell!.attachmentPoints.handleCenter, 'Grip_C');

  const barbell = getEquipmentDefinition('barbell');
  assert.ok(barbell);
  assert.equal(barbell!.attachmentPoints.leftGrip, 'Grip_LeftHand');
  assert.equal(barbell!.attachmentPoints.rightGrip, 'Grip_RightHand');

  const bench = getEquipmentDefinition('flat-bench');
  assert.ok(bench);
  assert.equal(bench!.attachmentPoints.base, 'Floor_Base');
});

test('Health OS Animation System — Muscle Registry & Normalization', () => {
  assert.equal(normalizeMuscleId('Chest'), 'pectoralis-major');
  assert.equal(normalizeMuscleId('Quadriceps'), 'quadriceps');
  assert.equal(normalizeMuscleId('Biceps'), 'biceps');
  assert.equal(normalizeMuscleId('Abs'), 'rectus-abdominis');
  assert.equal(normalizeMuscleId('Calves'), 'calves');
});

test('Health OS Animation System — Camera Presets', () => {
  const config = getCameraConfiguration('three-quarter-front');
  assert.ok(config);
  assert.ok(config.position);
  assert.ok(config.target);
  assert.equal(config.fov, 38);
});
