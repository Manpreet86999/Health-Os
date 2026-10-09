/**
 * Health OS Animation System — Stage 5: First Five Production Exercises
 *
 * Production-readiness verification for jumping-jack, bodyweight-squat,
 * push-up, dumbbell-curl and bench-press against the Production V1
 * architecture (canonical skeleton, production equipment, grip presets):
 * - loop closure: progress 0 and 1 produce identical transforms
 * - no accumulated drift across repeated loops
 * - finite transforms (no NaN) across dense progress samples
 * - curl left/right symmetry (both dumbbells track together)
 * - jack takeoff/landing continuity (no pops)
 * - measured leg lengths follow the bound skeleton
 * - grip application + clearing across exercise switches
 * - sleeve-mounted plates follow the barbell
 * - full-pipeline stress switching with cleanup verification
 * - playback speeds 0.25x–2x and rep/phase event preservation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { MotionController } from '../motion/MotionController.js';
import { EXERCISE_REGISTRY } from '../exercise/ExerciseRegistry.js';
import { ExerciseController } from '../exercise/ExerciseController.js';
import { CharacterController } from '../character/CharacterController.js';
import { CameraController } from '../camera/CameraController.js';
import { MuscleController } from '../muscles/MuscleController.js';
import { FormCueController } from '../form/FormCueController.js';
import { EquipmentController } from '../equipment/EquipmentController.js';
import { AnimationEventEmitter } from '../core/events.js';
import { GRIP_PRESETS } from '../character/GripPresets.js';
import type { CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import type { HumanoidBoneName } from '../core/types.js';

const FIVE = ['jumping-jack', 'bodyweight-squat', 'push-up', 'dumbbell-curl', 'bench-press'] as const;

function createMockCharacter(): CharacterSkeletonProvider & { root: THREE.Group; bones: Map<string, THREE.Object3D> } {
  const root = new THREE.Group();
  root.name = 'mock_root';
  const bones = new Map<string, THREE.Object3D>();
  const names: HumanoidBoneName[] = [
    'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
    'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  ];
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.set(0, 0.98, 0);
  root.add(hips);
  bones.set('hips', hips);
  for (const name of names) {
    if (name === 'hips') continue;
    const bone = new THREE.Group();
    bone.name = name;
    bone.position.set(0, 0.1, 0);
    hips.add(bone);
    bones.set(name, bone);
  }
  // Procedural-rig-like chained leg segments (0.44 thigh, 0.40 calf)
  for (const side of ['left', 'right'] as const) {
    const upper = bones.get(`${side}UpperLeg`)!;
    const lower = bones.get(`${side}LowerLeg`)!;
    const foot = bones.get(`${side}Foot`)!;
    hips.remove(upper);
    hips.remove(lower);
    hips.remove(foot);
    upper.position.set(side === 'left' ? -0.1 : 0.1, -0.11, 0);
    lower.position.set(0, -0.44, 0);
    foot.position.set(0, -0.4, 0);
    hips.add(upper);
    upper.add(lower);
    lower.add(foot);
  }
  root.updateMatrixWorld(true);
  return { root, bones, getBone: (n) => bones.get(n) || null, getRoot: () => root };
}

/** Snapshot of every bone transform in a subtree. */
function snapshot(root: THREE.Object3D): Map<string, number[]> {
  const snap = new Map<string, number[]>();
  root.traverse((o) => {
    snap.set(o.name, [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z]);
  });
  return snap;
}

function snapshotsEqual(a: Map<string, number[]>, b: Map<string, number[]>, tol = 1e-9): boolean {
  if (a.size !== b.size) return false;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (!vb || va.length !== vb.length) return false;
    for (let i = 0; i < va.length; i++) {
      if (Math.abs(va[i]! - vb[i]!) > tol) return false;
    }
  }
  return true;
}

function assertFiniteTransforms(root: THREE.Object3D, label: string): void {
  root.traverse((o) => {
    for (const v of [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z]) {
      assert.ok(Number.isFinite(v), `${label}: non-finite transform on ${o.name}`);
    }
  });
}

/** Synthetic production-style barbell with sleeve anchors. */
function syntheticBarbell(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'synthetic_barbell';
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.028, 0.028));
  bar.name = 'synthetic_bar';
  root.add(bar);
  for (const [name, id, x] of [['BODYOS_Sleeve_Left', 'equipment.sleeve.left', 0.694], ['BODYOS_Sleeve_Right', 'equipment.sleeve.right', -0.694]] as const) {
    const anchor = new THREE.Object3D();
    anchor.name = name;
    anchor.userData.bodyos_anchor = true;
    anchor.userData.bodyos_id = id;
    anchor.userData.role = 'plate_mount';
    anchor.position.set(x, 0, 0);
    root.add(anchor);
  }
  return root;
}

function syntheticPlate(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'EQ_Plate_20kg';
  root.userData.runtime_id = 'plate-20kg';
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.055, 16));
  disc.name = 'EQ_Plate_20kg_Body';
  root.add(disc);
  return root;
}

// ---------------------------------------------------------------------------
// Loop closure: progress 0 === progress 1 for all five exercises
// ---------------------------------------------------------------------------
describe('Stage 5: loop closure', () => {
  for (const id of FIVE) {
    it(`${id} returns exactly to neutral every loop`, () => {
      const motion = new MotionController();
      const character = createMockCharacter();
      motion.setExercise(id);
      motion.pause();

      motion.seek(0);
      motion.update(0, character);
      const atStart = snapshot(character.root);

      motion.seek(1);
      motion.update(0, character);
      const atEnd = snapshot(character.root);

      assert.ok(snapshotsEqual(atStart, atEnd), `${id}: transforms at progress 1 must equal progress 0`);
    });
  }

  it('repeated loops accumulate zero drift', () => {
    const motion = new MotionController();
    const character = createMockCharacter();
    motion.setExercise('bodyweight-squat');
    motion.play();
    // Simulate 60 loops at 60fps
    for (let i = 0; i < 60 * 2.4 * 60; i++) {
      motion.update(1 / 60, character);
    }
    assert.ok(motion.getLoopCount() >= 55, `expected ~60 loops, got ${motion.getLoopCount()}`);
    assert.ok(motion.getCurrentTime() >= 0 && motion.getCurrentTime() <= motion.getDuration());
    motion.seek(0.5);
    motion.update(0, character);
    const mid = snapshot(character.root);
    motion.seek(0);
    motion.update(0, character);
    motion.seek(0.5);
    motion.update(0, character);
    assert.ok(snapshotsEqual(mid, snapshot(character.root)), 'mid-rep pose must be reproducible after 60 loops');
  });
});

// ---------------------------------------------------------------------------
// Finite transforms across dense samples
// ---------------------------------------------------------------------------
describe('Stage 5: finite transforms', () => {
  for (const id of FIVE) {
    it(`${id} has no NaN across 21 progress samples`, () => {
      const motion = new MotionController();
      const character = createMockCharacter();
      motion.setExercise(id);
      motion.pause();
      for (let s = 0; s <= 20; s++) {
        motion.seek(s / 20);
        motion.update(0, character);
        assertFiniteTransforms(character.root, `${id}@${s / 20}`);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Curl symmetry + jack continuity + measured legs
// ---------------------------------------------------------------------------
describe('Stage 5: curl symmetry and jack continuity', () => {
  it('dumbbell-curl arms mirror left/right through the rep', () => {
    const motion = new MotionController();
    const character = createMockCharacter();
    motion.setExercise('dumbbell-curl');
    motion.pause();
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      motion.seek(p);
      motion.update(0, character);
      const lU = character.bones.get('leftUpperArm')!.rotation;
      const rU = character.bones.get('rightUpperArm')!.rotation;
      const lL = character.bones.get('leftLowerArm')!.rotation;
      const rL = character.bones.get('rightLowerArm')!.rotation;
      assert.ok(Math.abs(lU.z + rU.z) < 1e-9, `upper-arm mirror at ${p}`);
      assert.ok(Math.abs(lU.x - rU.x) < 1e-9, `upper-arm pitch symmetry at ${p}`);
      assert.ok(Math.abs(lL.y + rL.y) < 1e-9, `forearm mirror at ${p}`);
    }
  });

  it('jumping-jack toe pitch is continuous across takeoff/landing', () => {
    const motion = new MotionController();
    const character = createMockCharacter();
    motion.setExercise('jumping-jack');
    motion.pause();
    let prev = 0;
    let first = true;
    for (let s = 0; s <= 200; s++) {
      motion.seek(s / 200);
      motion.update(0, character);
      const pitch = character.bones.get('leftFoot')!.rotation.x;
      if (!first) {
        assert.ok(Math.abs(pitch - prev) < 0.02, `foot pitch jump at ${s / 200}: ${prev} -> ${pitch}`);
      }
      first = false;
      prev = pitch;
    }
  });

  it('jumping-jack recovers neutral exactly (feet together, arms at sides)', () => {
    const motion = new MotionController();
    const character = createMockCharacter();
    motion.setExercise('jumping-jack');
    motion.pause();
    motion.seek(0);
    motion.update(0, character);
    assert.ok(Math.abs(character.bones.get('leftUpperLeg')!.rotation.z) < 1e-9);
    assert.ok(Math.abs(character.bones.get('leftFoot')!.rotation.x) < 1e-9);
    assert.ok(Math.abs(character.bones.get('hips')!.position.y - 0.98) < 1e-9);
  });

  it('leg lengths are measured from the bound skeleton', () => {
    const motion = new MotionController();
    const character = createMockCharacter();
    motion.setExercise('bodyweight-squat');
    const { l1, l2 } = motion.getLegLengths(character);
    assert.ok(Math.abs(l1 - 0.44) < 1e-9, `thigh measures 0.44, got ${l1}`);
    assert.ok(Math.abs(l2 - 0.40) < 1e-9, `calf measures 0.40, got ${l2}`);
    motion.setExercise('push-up');
    // Cache invalidates per exercise; re-measures identically on same rig
    const again = motion.getLegLengths(character);
    assert.ok(Math.abs(again.l1 - 0.44) < 1e-9);
  });
});

// ---------------------------------------------------------------------------
// Grip application + clearing across switches
// ---------------------------------------------------------------------------
describe('Stage 5: grip lifecycle', () => {
  function fingerRig(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'finger_rig';
    for (const name of Object.keys(GRIP_PRESETS.DUMBBELL_GRIP)) {
      const b = new THREE.Group();
      b.name = name;
      root.add(b);
    }
    return root;
  }

  it('curl applies DUMBBELL_GRIP; squat clears it (no stale grips)', async () => {
    const character = new CharacterController();
    const motion = new MotionController();
    const equipment = new EquipmentController();
    equipment.setModelLoader(async () => new THREE.Group());
    const muscles = new MuscleController();
    const camera = new CameraController(new THREE.PerspectiveCamera());
    const formCues = new FormCueController();
    const controller = new ExerciseController(character, motion, equipment, muscles, camera, formCues);

    await character.loadCharacter('male-athletic', fingerRig());
    await controller.loadExercise('dumbbell-curl');
    const curled = fingerRigCheck(character);
    assert.ok(curled > 0, 'curl must pose finger bones');

    await controller.loadExercise('bodyweight-squat');
    assert.equal(fingerRigCheck(character), 0, 'squat must clear stale grip');

    await controller.loadExercise('bench-press');
    assert.ok(fingerRigCheck(character) > 0, 'bench must apply BARBELL_GRIP');
    controller.dispose();
  });

  function fingerRigCheck(character: CharacterController): number {
    let bent = 0;
    const root = character.getRoot();
    root.traverse((o) => {
      if (o.name.startsWith('DEF-f_') && Math.abs(o.rotation.x) > 1e-9) bent += 1;
    });
    return bent;
  }
});

// ---------------------------------------------------------------------------
// Sleeve-mounted plates follow the barbell
// ---------------------------------------------------------------------------
describe('Stage 5: bench-press station', () => {
  it('plates mount on sleeves and track the bar through reps', async () => {
    const equipment = new EquipmentController();
    const character = createMockCharacter();
    equipment.setSceneRoot(new THREE.Group());
    equipment.setModelLoader(async (url: string) => {
      if (url.includes('barbell')) return syntheticBarbell();
      if (url.includes('weight-plates')) return syntheticPlate();
      const g = new THREE.Group();
      g.name = 'synthetic_static';
      return g;
    });

    const def = EXERCISE_REGISTRY['bench-press'];
    assert.equal(def.equipment.length, 5);
    await equipment.loadAndAttach(def.equipment, character);
    assert.equal(equipment.getActiveInstances().length, 5);

    const records = equipment.getAttachedRecords();
    const modes = records.map((r) => r.constraintMode);
    assert.ok(modes.includes('two-hand'), 'barbell two-hand record');
    assert.equal(modes.filter((m) => m === 'world-static').length, 2, 'bench + floor world-static');
    assert.equal(modes.filter((m) => m === 'equipment-mounted').length, 2, 'two sleeve plates');

    const barbell = equipment.getActiveInstances().find((i) => i.name.includes('barbell'))!;
    assert.ok(barbell.children.some((c) => c.name.includes('weight-plate')), 'plates parented under barbell');

    // Move the bar via the two-hand solver; plates must follow rigidly.
    const before = new THREE.Vector3();
    const plate = barbell.children.find((c) => c.name.includes('weight-plate'))!;
    plate.getWorldPosition(before);
    character.bones.get('leftHand')!.position.y += 0.1;
    character.bones.get('rightHand')!.position.y += 0.1;
    character.root.updateMatrixWorld(true);
    equipment.update();
    const after = new THREE.Vector3();
    plate.getWorldPosition(after);
    assert.ok(after.distanceTo(before) > 0.05, 'plate follows bar displacement');
    equipment.dispose();
  });

  it('push-up loads the production floor for contact reference', async () => {
    const equipment = new EquipmentController();
    const character = createMockCharacter();
    equipment.setSceneRoot(new THREE.Group());
    equipment.setModelLoader(async () => {
      const g = new THREE.Group();
      g.name = 'synthetic_floor';
      return g;
    });
    await equipment.loadAndAttach(EXERCISE_REGISTRY['push-up'].equipment, character);
    assert.equal(equipment.getActiveInstances().length, 1);
    assert.equal(equipment.getAttachedRecords()[0]!.constraintMode, 'world-static');
    equipment.dispose();
  });
});

// ---------------------------------------------------------------------------
// Full-pipeline stress: 5-exercise rotation with cleanup verification
// ---------------------------------------------------------------------------
describe('Stage 5: exercise-switch stress', () => {
  it('squat → curl → push-up → bench → jack → squat leaves no residue', async () => {
    const character = new CharacterController();
    const motion = new MotionController();
    const equipment = new EquipmentController();
    equipment.setModelLoader(async (url: string) => {
      if (url.includes('barbell')) return syntheticBarbell();
      if (url.includes('weight-plates')) return syntheticPlate();
      const g = new THREE.Group();
      g.name = 'synthetic_static';
      return g;
    });
    const muscles = new MuscleController();
    const camera = new CameraController(new THREE.PerspectiveCamera());
    const formCues = new FormCueController();
    const controller = new ExerciseController(character, motion, equipment, muscles, camera, formCues);

    await character.loadCharacter('male-athletic', createMockCharacter().root);
    const liveRoot = character.getRoot();

    const rotation = ['bodyweight-squat', 'dumbbell-curl', 'push-up', 'bench-press', 'jumping-jack', 'bodyweight-squat'];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const id of rotation) {
        await controller.loadExercise(id);
        const expected = EXERCISE_REGISTRY[id].equipment.length;
        assert.equal(equipment.getActiveInstances().length, expected, `${id}: instance count`);
        assert.equal(character.getRoot(), liveRoot, `${id}: same live scene`);
        motion.pause();
        motion.seek(0.5);
        motion.update(0, character);
        assertFiniteTransforms(liveRoot, `${id} mid-rep`);
        for (const mode of ['muscles', 'form', 'exercise'] as const) {
          controller.setDisplayMode(mode);
          assert.equal(character.getRoot(), liveRoot, `${id}/${mode}: scene stable`);
        }
      }
    }

    // No duplicated equipment roots under the scene
    const names = equipment.getActiveInstances().map((i) => i.name);
    assert.equal(new Set(names).size, names.length, 'no duplicate instances');
    controller.dispose();
    equipment.dispose();
  });
});

// ---------------------------------------------------------------------------
// Speeds, events, emitter hygiene
// ---------------------------------------------------------------------------
describe('Stage 5: playback contracts', () => {
  it('supports 0.25x / 0.5x / 1x / 1.5x / 2x', () => {
    const motion = new MotionController();
    motion.setExercise('bodyweight-squat');
    for (const s of [0.25, 0.5, 1.0, 1.5, 2.0]) {
      motion.setSpeed(s);
      assert.equal(motion.getSpeed(), s);
    }
  });

  it('preserves rep/phase events across all five exercises', () => {
    for (const id of FIVE) {
      const motion = new MotionController();
      const fired: string[] = [];
      motion.setExercise(id);
      motion.onEvent((e) => fired.push(e.name));
      motion.play();
      for (let i = 0; i < 600; i++) motion.update(1 / 60, createMockCharacter());
      assert.ok(fired.includes('rep:start'), `${id}: rep:start fires`);
      assert.ok(motion.getLoopCount() > 0, `${id}: loops accumulate`);
    }
  });

  it('event emitter unsubscribes cleanly (no listener growth)', () => {
    const emitter = new AnimationEventEmitter();
    let calls = 0;
    const off = emitter.on('timeupdate', () => { calls += 1; });
    emitter.emit('timeupdate', { currentTime: 1, progress: 0.5 });
    assert.equal(calls, 1);
    off();
    emitter.emit('timeupdate', { currentTime: 2, progress: 0.6 });
    assert.equal(calls, 1);
  });
});
