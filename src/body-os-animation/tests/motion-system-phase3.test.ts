import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MotionController } from '../motion/MotionController.js';
import { TwoBoneIK } from '../motion/TwoBoneIK.js';
import { MotionEvents } from '../motion/MotionEvents.js';
import { getMotionMetadata } from '../motion/MotionRegistry.js';
import { getExerciseDefinition } from '../exercise/ExerciseRegistry.js';
import type { CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import type { HumanoidBoneName } from '../core/types.js';

class MockSkeletonProvider implements CharacterSkeletonProvider {
  private bones: Map<HumanoidBoneName, THREE.Object3D> = new Map();

  constructor() {
    const boneNames: HumanoidBoneName[] = [
      'hips',
      'spine',
      'chest',
      'upperChest',
      'neck',
      'head',
      'leftShoulder',
      'rightShoulder',
      'leftUpperArm',
      'rightUpperArm',
      'leftLowerArm',
      'rightLowerArm',
      'leftHand',
      'rightHand',
      'leftUpperLeg',
      'rightUpperLeg',
      'leftLowerLeg',
      'rightLowerLeg',
      'leftFoot',
      'rightFoot',
      'leftToes',
      'rightToes',
    ];
    for (const name of boneNames) {
      const obj = new THREE.Object3D();
      obj.name = name;
      this.bones.set(name, obj);
    }
  }

  getRoot(): THREE.Object3D {
    return this.bones.get('hips')!;
  }

  getBone(boneName: HumanoidBoneName): THREE.Object3D | null {
    return this.bones.get(boneName) || null;
  }
}

test('MotionController: play, pause, restart, and seeking', () => {
  const controller = new MotionController();
  controller.setExercise('motion-test-squat');

  assert.equal(controller.getDuration(), 2.4);
  assert.equal(controller.getCurrentTime(), 0);

  // Play and seek
  controller.seek(0.5);
  assert.ok(Math.abs(controller.getCurrentTime() - 1.2) < 0.001);

  // Clamped seek out of bounds
  controller.seek(-0.5);
  assert.equal(controller.getCurrentTime(), 0);
  controller.seek(1.5);
  assert.ok(Math.abs(controller.getCurrentTime() - 2.4) < 0.001);

  // Pause and play
  controller.pause();
  controller.play();

  // Restart
  controller.restart();
  assert.equal(controller.getCurrentTime(), 0);
  assert.equal(controller.getLoopCount(), 0);
});

test('MotionController: speed multipliers (0.25x, 0.5x, 1x, 1.5x, 2x)', () => {
  const controller = new MotionController();
  const skeleton = new MockSkeletonProvider();
  controller.setExercise('motion-test-squat');

  const speeds = [0.25, 0.5, 1.0, 1.5, 2.0];
  for (const spd of speeds) {
    controller.restart();
    controller.setSpeed(spd);
    assert.equal(controller.getSpeed(), spd);

    const delta = 0.1;
    const result = controller.update(delta, skeleton);
    const expectedTime = delta * spd;
    assert.ok(
      Math.abs(result.currentTime - expectedTime) < 0.001,
      `Expected ${expectedTime}s for speed ${spd}x, got ${result.currentTime}`
    );
  }
});

test('TwoBoneIK: stable ground locking, knee flexion, and flat foot alignment', () => {
  const hipStanding = new THREE.Vector3(0, 0.98, 0);
  const footPlant = new THREE.Vector3(0, 0, 0);

  // Standing: nearly straight leg
  const standingIK = TwoBoneIK.solveLegGroundLock(hipStanding, footPlant, 0.44, 0.40);
  assert.ok(!isNaN(standingIK.hipRotation.x));
  assert.ok(!isNaN(standingIK.kneeRotation.x));
  assert.ok(!isNaN(standingIK.ankleRotation.x));

  // Deep squat: hip drops to 0.60m and moves back Z = -0.18m
  const hipSquat = new THREE.Vector3(0, 0.60, -0.18);
  const squatIK = TwoBoneIK.solveLegGroundLock(hipSquat, footPlant, 0.44, 0.40);

  // Knee should flex significantly
  assert.ok(
    squatIK.kneeRotation.x > 1.2,
    `Knee flexion should exceed 1.2 rad in deep squat, got ${squatIK.kneeRotation.x}`
  );
  // Ankle should counter-flex to keep sole flat on floor
  assert.ok(
    squatIK.ankleRotation.x < 0,
    `Ankle should counter-rotate to ground contact, got ${squatIK.ankleRotation.x}`
  );

  // Over-reach limit test: target beyond leg reach does not produce NaN or popping
  const hipFar = new THREE.Vector3(0, 2.5, 0);
  const farIK = TwoBoneIK.solveLegGroundLock(hipFar, footPlant, 0.44, 0.40);
  assert.ok(!isNaN(farIK.hipRotation.x), 'Over-reach should not produce NaN');
  assert.ok(!isNaN(farIK.kneeRotation.x), 'Over-reach should not produce NaN');
});

test('MotionEvents: rep-phase evaluation and loop transitions', () => {
  const events = new MotionEvents();
  events.setEvents([
    { time: 0.0, name: 'rep:start', cue: 'Start rep' },
    { time: 0.2, name: 'phase:descent', cue: 'Lowering' },
    { time: 0.5, name: 'rep:bottom', cue: 'Bottom inflection' },
    { time: 0.75, name: 'phase:ascent', cue: 'Driving up' },
    { time: 0.95, name: 'rep:top', cue: 'Lockout' },
    { time: 1.0, name: 'rep:end', cue: 'Complete' },
  ]);

  const triggered: string[] = [];
  const handler = (evt: { name: string }) => triggered.push(evt.name);

  events.evaluate(0.0, handler);
  assert.deepEqual(triggered, ['rep:start']);

  events.evaluate(0.3, handler);
  assert.deepEqual(triggered, ['rep:start', 'phase:descent']);

  events.evaluate(0.6, handler);
  assert.deepEqual(triggered, ['rep:start', 'phase:descent', 'rep:bottom']);

  assert.equal(events.getCurrentPhase(0.0), 'rep:start');
  assert.equal(events.getCurrentPhase(0.35), 'phase:descent');
  assert.equal(events.getCurrentPhase(0.55), 'rep:bottom');
  assert.equal(events.getCurrentPhase(0.8), 'phase:ascent');
  assert.equal(events.getCurrentPhase(0.98), 'rep:top');

  // Trigger loop
  events.onLoop((evt) => triggered.push(evt.name));
  assert.equal(events.getLoopCount(), 1);
  assert.ok(triggered.includes('rep:end'));
});

test('Core Motion System: 50 consecutive loops zero-drift test on all Phase 3 motions', () => {
  const motions = [
    'motion-test-squat',
    'motion-test-arm-raise',
    'motion-test-elbow-curl',
    'motion-test-hip-hinge',
    'motion-test-push-up-plank',
  ];

  const skeleton = new MockSkeletonProvider();
  const hips = skeleton.getBone('hips')!;
  const leftUpperLeg = skeleton.getBone('leftUpperLeg')!;
  const leftLowerLeg = skeleton.getBone('leftLowerLeg')!;
  const leftUpperArm = skeleton.getBone('leftUpperArm')!;
  const leftLowerArm = skeleton.getBone('leftLowerArm')!;

  for (const motionId of motions) {
    const controller = new MotionController();
    controller.setExercise(motionId);
    controller.setSpeed(1.0);

    // Record baseline transforms at loop 0, progress = 0.5
    controller.seek(0.5);
    controller.update(0, skeleton);

    const baseHipsY = hips.position.y;
    const baseHipsZ = hips.position.z;
    const baseThighX = leftUpperLeg.rotation.x;
    const baseKneeX = leftLowerLeg.rotation.x;
    const baseArmZ = leftUpperArm.rotation.z;
    const baseForearmY = leftLowerArm.rotation.y;

    // Run through 50 full continuous loops
    controller.restart();
    const duration = controller.getDuration();
    const dt = 0.05; // 20 FPS step
    const totalSimTime = 50 * duration;
    let elapsed = 0;

    while (elapsed < totalSimTime) {
      controller.update(dt, skeleton);
      elapsed += dt;
    }

    assert.ok(
      controller.getLoopCount() >= 50,
      `Expected at least 50 loops for ${motionId}, got ${controller.getLoopCount()}`
    );

    // Seek to exactly 0.5 on loop 50+
    controller.seek(0.5);
    controller.update(0, skeleton);

    // Verify zero drift
    const driftHipsY = Math.abs(hips.position.y - baseHipsY);
    const driftHipsZ = Math.abs(hips.position.z - baseHipsZ);
    const driftThighX = Math.abs(leftUpperLeg.rotation.x - baseThighX);
    const driftKneeX = Math.abs(leftLowerLeg.rotation.x - baseKneeX);
    const driftArmZ = Math.abs(leftUpperArm.rotation.z - baseArmZ);
    const driftForearmY = Math.abs(leftLowerArm.rotation.y - baseForearmY);

    assert.ok(driftHipsY < 1e-6, `${motionId}: hips.y drifted by ${driftHipsY}`);
    assert.ok(driftHipsZ < 1e-6, `${motionId}: hips.z drifted by ${driftHipsZ}`);
    assert.ok(driftThighX < 1e-6, `${motionId}: thigh.x drifted by ${driftThighX}`);
    assert.ok(driftKneeX < 1e-6, `${motionId}: knee.x drifted by ${driftKneeX}`);
    assert.ok(driftArmZ < 1e-6, `${motionId}: upperArm.z drifted by ${driftArmZ}`);
    assert.ok(driftForearmY < 1e-6, `${motionId}: lowerArm.y drifted by ${driftForearmY}`);
  }
});
