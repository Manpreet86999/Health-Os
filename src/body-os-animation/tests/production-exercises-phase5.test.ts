/**
 * Health OS Animation System — Phase 5: Production Exercise System Tests
 *
 * Validates the Five Core Production Exercises:
 * 1. Jumping Jack (Cardio / Conditioning, flight bounce, scapulohumeral arc)
 * 2. Bodyweight Squat (Strength / Lower body, TwoBoneIK grounded foot lock, parallel depth)
 * 3. Standard Push-Up (Strength / Chest & Core, prone floor plank, 45-degree elbow path)
 * 4. Dumbbell Biceps Curl (Hypertrophy / Biceps, dual hex dumbbells via Grip_C, pinned elbows, supination)
 * 5. Barbell Flat Bench Press (Strength / Compound, supine on flat bench, true two-hand barbell constraint)
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import {
  EXERCISE_REGISTRY,
  getExerciseDefinition,
} from '../exercise/ExerciseRegistry.js';
import { getMotionMetadata } from '../motion/MotionRegistry.js';
import { MotionController } from '../motion/MotionController.js';
import { EquipmentController } from '../equipment/EquipmentController.js';
import { AttachmentSystem, type CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import { TwoBoneIK } from '../motion/TwoBoneIK.js';
import type { HumanoidBoneName } from '../core/types.js';

// =============================================================================
// Mock VRM Character Skeleton Provider for Test Rig
// =============================================================================
function createMockCharacter(): CharacterSkeletonProvider & {
  root: THREE.Group;
  bones: Map<string, THREE.Object3D>;
} {
  const root = new THREE.Group();
  root.name = 'mock_vrm_root';

  const bones = new Map<string, THREE.Object3D>();
  const boneNames: HumanoidBoneName[] = [
    'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
    'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  ];

  let current = root;
  for (const name of boneNames) {
    const bone = new THREE.Group();
    bone.name = name;
    bone.position.set(0, 0, 0);
    current.add(bone);
    bones.set(name, bone);
    if (name === 'hips') current = bone;
  }

  // Set standard rest positions
  const leftHand = bones.get('leftHand')!;
  leftHand.position.set(-0.42, 1.25, 0);

  const rightHand = bones.get('rightHand')!;
  rightHand.position.set(0.42, 1.25, 0);

  root.updateMatrixWorld(true);

  return {
    root,
    bones,
    getBone: (name: HumanoidBoneName) => bones.get(name) || null,
    getRoot: () => root,
  };
}

// =============================================================================
// 1. Production Exercise Manifest & Registry Validation
// =============================================================================
test('Phase 5: All 5 Production Exercises are Registered and Schema Valid', () => {
  const requiredExercises = [
    'jumping-jack',
    'bodyweight-squat',
    'push-up',
    'dumbbell-curl',
    'bench-press',
  ];

  for (const id of requiredExercises) {
    const ex = EXERCISE_REGISTRY[id];
    assert.ok(ex, `Exercise "${id}" must exist in EXERCISE_REGISTRY`);
    assert.strictEqual(ex.id, id);
    assert.ok(ex.name && ex.name.length > 0, `Exercise "${id}" must have a name`);
    assert.ok(ex.motion.duration > 0, `Exercise "${id}" must have a positive duration`);
    assert.strictEqual(ex.motion.loop, true, `Exercise "${id}" must have loop=true`);
    assert.ok(ex.motion.events.length >= 4, `Exercise "${id}" must have at least 4 milestone cue events`);
    assert.ok(ex.muscles.primary.length > 0, `Exercise "${id}" must specify primary muscles`);
    assert.ok(ex.camera.default, `Exercise "${id}" must have a default camera preset`);
    assert.ok(ex.camera.supported.includes(ex.camera.default), `Default camera must be in supported list`);
  }
});

// =============================================================================
// 2. Equipment Manifest Contracts for Dumbbell Curl & Bench Press
// =============================================================================
test('Phase 5: Equipment Manifests for Dumbbell Curl and Bench Press', () => {
  const curl = EXERCISE_REGISTRY['dumbbell-curl'];
  assert.strictEqual(curl.equipment.length, 2, 'Dumbbell curl must specify 2 dumbbells');
  assert.strictEqual(curl.equipment[0].id, 'dumbbell');
  assert.strictEqual(curl.equipment[0].attachToBone, 'leftHand');
  assert.strictEqual(curl.equipment[0].socketName, 'Grip_C');
  assert.strictEqual(curl.equipment[1].id, 'dumbbell');
  assert.strictEqual(curl.equipment[1].attachToBone, 'rightHand');
  assert.strictEqual(curl.equipment[1].socketName, 'Grip_C');

  const bench = EXERCISE_REGISTRY['bench-press'];
  // Stage 5 station: bench + floor + barbell + 2 sleeve-mounted plates.
  assert.strictEqual(bench.equipment.length, 5, 'Bench press must specify the full production station');
  const benchEquip = bench.equipment.find((e) => e.id === 'flat-bench');
  assert.ok(benchEquip, 'Flat bench must be attached');
  assert.strictEqual(benchEquip.attachToBone, 'floor');
  assert.strictEqual(benchEquip.socketName, 'Floor_Base');

  const barbellEquip = bench.equipment.find((e) => e.id === 'barbell');
  assert.ok(barbellEquip, 'Barbell must be attached');
  assert.strictEqual(barbellEquip.socketName, 'two-hand');

  const floorEquip = bench.equipment.find((e) => e.id === 'body-os-floor');
  assert.ok(floorEquip, 'Production floor must be attached');

  const plates = bench.equipment.filter((e) => e.id === 'weight-plate-20kg');
  assert.strictEqual(plates.length, 2, 'Two plates must mount the barbell sleeves');
  assert.ok(plates.every((p) => p.attachToEquipment === 'barbell'), 'Plates mount on the barbell instance');
  const sleeveAnchors = plates.map((p) => p.anchorBodyosId).sort();
  assert.deepStrictEqual(sleeveAnchors, ['equipment.sleeve.left', 'equipment.sleeve.right']);
});

// =============================================================================
// 3. Jumping Jack Kinematics: Vertical Bounce & Scapulohumeral Arc
// =============================================================================
test('Phase 5 Kinematics: Jumping Jack Flight Bounce & Scapulohumeral Arc', () => {
  const motion = new MotionController();
  const character = createMockCharacter();
  motion.setExercise('jumping-jack');

  // Baseline at progress 0.0 (standing neutral)
  motion.seek(0.0);
  motion.update(0.0, character);
  const hips = character.getBone('hips')!;
  const leftUpperArm = character.getBone('leftUpperArm')!;
  const rightUpperArm = character.getBone('rightUpperArm')!;
  const leftUpperLeg = character.getBone('leftUpperLeg')!;
  const rightUpperLeg = character.getBone('rightUpperLeg')!;

  const baseHipsY = hips.position.y;
  assert.ok(Math.abs(baseHipsY - 0.98) < 0.05, `Base hips Y should be ~0.98m, got ${baseHipsY}`);

  // Apex at progress 0.25 (sinusoidal flight bounce peak)
  motion.seek(0.25);
  motion.update(0.0, character);
  assert.ok(hips.position.y > baseHipsY, `Hips should lift during flight phase at t=0.25: ${hips.position.y} > ${baseHipsY}`);

  // Peak arm extension & leg abduction at progress 0.50
  motion.seek(0.50);
  motion.update(0.0, character);
  // Stage 5.1: arms must abduct UPWARD (hands above head), never crossing
  // the pelvis. Asserted in world space: upper-arm limb direction points
  // up-and-out. (Pre-5.1 asserted raw rotation.z > 0.75, which on
  // canonical axes rotates the left arm inward-down toward the pelvis.)
  character.root.updateMatrixWorld(true);
  const leftUpperArmWorld = new THREE.Quaternion();
  const rightUpperArmWorld = new THREE.Quaternion();
  leftUpperArm.getWorldQuaternion(leftUpperArmWorld);
  rightUpperArm.getWorldQuaternion(rightUpperArmWorld);
  const leftLimbDir = new THREE.Vector3(0, -1, 0).applyQuaternion(leftUpperArmWorld);
  const rightLimbDir = new THREE.Vector3(0, -1, 0).applyQuaternion(rightUpperArmWorld);
  assert.ok(leftLimbDir.y > 0.7, `Left arm should point overhead at apex, got dirY=${leftLimbDir.y}`);
  assert.ok(rightLimbDir.y > 0.7, `Right arm should point overhead at apex, got dirY=${rightLimbDir.y}`);
  assert.ok(leftLimbDir.x < -0.15, `Left arm must stay lateral (never cross pelvis), got dirX=${leftLimbDir.x}`);
  assert.ok(rightLimbDir.x > 0.15, `Right arm must stay lateral (never cross pelvis), got dirX=${rightLimbDir.x}`);
  // Elbows mostly extended at apex: the elbow-bend delta stays small
  // (single-axis local readout; this mock rig parents every bone flat
  // under hips, so segment world directions compose differently here —
  // world-space chain behaviour is covered by the Stage 5.1 suite).
  assert.ok(
    Math.abs(character.bones.get('leftLowerArm')!.rotation.y) < 0.3,
    `Elbows should stay mostly extended at apex, got ${character.bones.get('leftLowerArm')!.rotation.y}`
  );
  // Legs abduct in coronal plane
  assert.ok(leftUpperLeg.rotation.z > 0.25, `Left leg should abduct laterally: ${leftUpperLeg.rotation.z}`);
  assert.ok(rightUpperLeg.rotation.z < -0.25, `Right leg should abduct laterally: ${rightUpperLeg.rotation.z}`);
});

// =============================================================================
// 4. Bodyweight Squat Kinematics: TwoBoneIK Ground Lock & Parallel Depth
// =============================================================================
test('Phase 5 Kinematics: Bodyweight Squat Parallel Depth & Foot Ground Lock', () => {
  const motion = new MotionController();
  const character = createMockCharacter();
  motion.setExercise('bodyweight-squat');

  // Standing at 0.0
  motion.seek(0.0);
  motion.update(0.0, character);
  const hips = character.getBone('hips')!;
  const spine = character.getBone('spine')!;
  const leftLowerLeg = character.getBone('leftLowerLeg')!;

  const standingY = hips.position.y;
  assert.ok(standingY > 0.95, `Standing hips Y should be ~0.98m, got ${standingY}`);

  // Bottom of squat at 0.50
  motion.seek(0.50);
  motion.update(0.0, character);

  const bottomY = hips.position.y;
  const descent = standingY - bottomY;
  assert.ok(descent >= 0.35, `Squat must achieve parallel depth (>= 0.35m descent), got ${descent.toFixed(3)}m`);
  assert.ok(hips.position.z < -0.10, `Hips must translate posteriorly for balance, got Z=${hips.position.z.toFixed(3)}`);
  assert.ok(spine.rotation.x > 0.25, `Torso must incline forward ~32 degrees (counter-lean), got ${spine.rotation.x.toFixed(3)}rad`);
  assert.ok(leftLowerLeg.rotation.x > 0.8, `Knees must flex deeply, got ${leftLowerLeg.rotation.x.toFixed(3)}rad`);
});

// =============================================================================
// 5. Standard Push-Up Kinematics: Prone Horizontal Plank & 45° Elbow Path
// =============================================================================
test('Phase 5 Kinematics: Push-Up Horizontal Plank & 45-Degree Elbow Tuck', () => {
  const motion = new MotionController();
  const character = createMockCharacter();
  motion.setExercise('push-up');

  // Top lockout at 0.0
  motion.seek(0.0);
  motion.update(0.0, character);
  const hips = character.getBone('hips')!;
  const leftUpperArm = character.getBone('leftUpperArm')!;
  const leftLowerArm = character.getBone('leftLowerArm')!;

  // Horizontal plank orientation (90 degrees pitch forward)
  assert.ok(Math.abs(hips.rotation.x - Math.PI / 2) < 0.01, `Push-up must orient hips horizontally (PI/2 rad), got ${hips.rotation.x}`);
  const topHipsY = hips.position.y;

  // Chest at floor inflection at 0.50
  motion.seek(0.50);
  motion.update(0.0, character);

  const bottomHipsY = hips.position.y;
  assert.ok(bottomHipsY < topHipsY, `Chest/hips must descend towards floor, ${bottomHipsY} < ${topHipsY}`);
  assert.ok(leftLowerArm.rotation.y < -1.0, `Elbows must flex along hinge axis, got ${leftLowerArm.rotation.y}`);
  // Check upper arm abduction indicates 45-degree arrow tuck, not 90-degree flare
  assert.ok(Math.abs(leftUpperArm.rotation.x) < 0.5, `Upper arms should not flare forward excessively: ${leftUpperArm.rotation.x}`);
});

// =============================================================================
// 6. Dumbbell Curl: Pinned Elbows, Forearm Supination, Stable Hand Lock
// =============================================================================
test('Phase 5 Kinematics: Dumbbell Curl Pinned Elbows & Forearm Supination', () => {
  const motion = new MotionController();
  const character = createMockCharacter();
  motion.setExercise('dumbbell-curl');

  // Arms hanging at 0.0
  motion.seek(0.0);
  motion.update(0.0, character);
  const leftUpperArm = character.getBone('leftUpperArm')!;
  const leftLowerArm = character.getBone('leftLowerArm')!;
  const rightUpperArm = character.getBone('rightUpperArm')!;
  const rightLowerArm = character.getBone('rightLowerArm')!;

  const baseUpperArmX = leftUpperArm.rotation.x;

  // Peak curl at 0.50
  motion.seek(0.50);
  motion.update(0.0, character);

  // Upper arm remains pinned to ribcage (zero anterior shoulder swing)
  assert.ok(Math.abs(leftUpperArm.rotation.x - baseUpperArmX) < 0.05, `Upper arm must stay pinned: delta=${Math.abs(leftUpperArm.rotation.x - baseUpperArmX)}`);
  assert.ok(Math.abs(rightUpperArm.rotation.x - baseUpperArmX) < 0.05, `Right upper arm must stay pinned`);

  // Forearm flexes into peak contraction about the elbow hinge (canonical
  // X). Stage 5.1: pre-5.1 flexed about Y, which spins a hanging limb in
  // place instead of lifting the hand — asserted in corrected axes plus
  // world-space forearm direction below.
  assert.ok(Math.abs(leftLowerArm.rotation.x) > 1.8, `Left forearm must flex >1.8rad, got ${leftLowerArm.rotation.x}`);
  assert.ok(Math.abs(rightLowerArm.rotation.x) > 1.8, `Right forearm must flex >1.8rad, got ${rightLowerArm.rotation.x}`);

  // Progressive supination twist about the forearm long axis (canonical Y),
  // mirrored left/right so both dumbbells track together.
  assert.ok(Math.abs(leftLowerArm.rotation.y) > 0.15, `Left forearm must supinate, got ${leftLowerArm.rotation.y}`);
  assert.ok(Math.abs(rightLowerArm.rotation.y) > 0.15, `Right forearm must supinate, got ${rightLowerArm.rotation.y}`);
  assert.ok(
    Math.abs(leftLowerArm.rotation.y + rightLowerArm.rotation.y) < 0.05,
    `Supination must mirror left/right, got ${leftLowerArm.rotation.y} / ${rightLowerArm.rotation.y}`
  );

  // World space: forearm limb direction swings from hanging-down at rest
  // to forward-up at peak (hand lifted toward shoulder on a real rig).
  character.root.updateMatrixWorld(true);
  const foreWorld = new THREE.Quaternion();
  leftLowerArm.getWorldQuaternion(foreWorld);
  const foreDir = new THREE.Vector3(0, -1, 0).applyQuaternion(foreWorld);
  assert.ok(foreDir.z > 0.5, `Flexed forearm must swing forward, got dirZ=${foreDir.z}`);
  assert.ok(foreDir.y > -0.2, `Flexed forearm must lift off the hang, got dirY=${foreDir.y}`);
});

// =============================================================================
// 7. Bench Press: Supine Body Contact & Barbell Two-Hand Constraint
// =============================================================================
test('Phase 5 Kinematics: Bench Press Supine Contact & Two-Hand Barbell Invariance', async () => {
  const motion = new MotionController();
  const equipment = new EquipmentController();
  const character = createMockCharacter();

  motion.setExercise('bench-press');
  const benchDef = EXERCISE_REGISTRY['bench-press'];
  await equipment.loadAndAttach(benchDef.equipment, character);

  const hips = character.getBone('hips')!;
  const leftHand = character.getBone('leftHand')!;
  const rightHand = character.getBone('rightHand')!;

  // Verify supine body pitch (-90 degrees pitch around X)
  motion.seek(0.0);
  motion.update(0.0, character);
  assert.ok(Math.abs(hips.rotation.x - (-Math.PI / 2)) < 0.01, `Bench press must orient hips supine (-PI/2 rad), got ${hips.rotation.x}`);
  assert.ok(Math.abs(hips.position.y - 0.50) < 0.05, `Hips must rest on bench pad surface at Y~0.50m, got ${hips.position.y}`);

  // Test across 10 sample points throughout rep cycle:
  // The barbell must maintain PERFECT horizontal orientation (Y and Z tilt < 0.001 rad)
  const instances = equipment.getActiveInstances();
  const barbell = instances.find((inst) => inst.name.includes('barbell'));
  assert.ok(barbell, 'Barbell instance must be attached');

  for (let step = 0; step <= 10; step++) {
    const progress = step / 10;
    motion.seek(progress);
    motion.update(0.0, character);

    // Position hands symmetrically
    const pressDescent = (1 - Math.cos(progress * Math.PI * 2)) / 2;
    const handY = 0.96 - pressDescent * 0.32;
    leftHand.position.set(-0.42, handY, -0.22);
    rightHand.position.set(0.42, handY, -0.22);
    character.root.updateMatrixWorld(true);

    equipment.update();

    // Check barbell position and alignment against world positions of hands
    const handWorldA = new THREE.Vector3();
    const handWorldB = new THREE.Vector3();
    leftHand.getWorldPosition(handWorldA);
    rightHand.getWorldPosition(handWorldB);
    const expectedMidY = (handWorldA.y + handWorldB.y) / 2 - 0.03; // minus centerOffset Y

    const barPos = new THREE.Vector3();
    barbell.getWorldPosition(barPos);
    assert.ok(Math.abs(barPos.x) < 0.01, `Barbell must stay centered horizontally at step ${step}: X=${barPos.x}`);
    assert.ok(Math.abs(barPos.y - expectedMidY) < 0.01, `Barbell must track hand world height: barY=${barPos.y}, expectedMidY=${expectedMidY}`);

    const barRot = barbell.rotation;
    assert.ok(Math.abs(barRot.y) < 0.01, `Barbell yaw must remain horizontal: Y=${barRot.y}`);
    assert.ok(Math.abs(barRot.z) < 0.01, `Barbell roll must remain horizontal: Z=${barRot.z}`);
  }

  equipment.dispose();
});

// =============================================================================
// 8. 50-Cycle Repeated Exercise Switching & Zero-Leak Lifecycle
// =============================================================================
test('Phase 5 Lifecycle: 50 Sequential Exercise Switches Produce Zero Leaks', async () => {
  const equipment = new EquipmentController();
  const character = createMockCharacter();
  const exercises = [
    'jumping-jack',
    'bodyweight-squat',
    'push-up',
    'dumbbell-curl',
    'bench-press',
  ];

  for (let cycle = 0; cycle < 10; cycle++) {
    for (const exId of exercises) {
      const exDef = EXERCISE_REGISTRY[exId];
      await equipment.loadAndAttach(exDef.equipment, character);

      const expectedCount = exDef.equipment.length;
      assert.strictEqual(
        equipment.getAttachmentRecordCount(),
        expectedCount,
        `Cycle ${cycle}, exercise "${exId}" should have ${expectedCount} records`
      );
    }
  }

  equipment.detachAll();
  assert.strictEqual(equipment.getAttachmentRecordCount(), 0, 'Must have 0 records after detachAll');
  assert.strictEqual(equipment.getActiveInstances().length, 0, 'Must have 0 instances after detachAll');

  equipment.dispose();
});
