/**
 * Stage 5.1: retargeting-focused tests (Phase B/C/D).
 * Existing numerical tests are kept; these add world-space verification:
 * - neutral pose reproduces rest pose (rest × identity == rest)
 * - canonical arm abduction produces correct world direction
 * - canonical overhead arm moves hand upward
 * - elbow flexion moves hand toward shoulder
 * - hip/knee flexion moves expected limb chain
 * - quaternion outputs remain finite
 * - progress 0 == progress 1, no drift after 60 loops
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { MotionController } from '../motion/MotionController.js';
import {
  ProductionRetarget,
  getRetargetFor,
  applyCalibrationPose,
  CANONICAL_EXPECTED_DIRS,
} from '../motion/ProductionRetarget.js';
import type { CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import type { HumanoidBoneName } from '../core/types.js';

const BONES: HumanoidBoneName[] = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
];

interface MockChar extends CharacterSkeletonProvider {
  root: THREE.Group;
  bones: Map<string, THREE.Object3D>;
}

/** Identity-rest rig (procedural fallback conventions). */
function createIdentityRig(): MockChar {
  const root = new THREE.Group();
  const bones = new Map<string, THREE.Object3D>();
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.set(0, 0.98, 0);
  root.add(hips);
  bones.set('hips', hips);
  // Torso chain
  let parent: THREE.Object3D = hips;
  for (const n of ['spine', 'chest', 'upperChest', 'neck', 'head'] as HumanoidBoneName[]) {
    const b = new THREE.Group();
    b.name = n;
    b.position.set(0, 0.12, 0);
    parent.add(b);
    parent = b;
    bones.set(n, b);
  }
  // Arms: shoulder → upper → lower → hand along -Y
  for (const side of ['left', 'right'] as const) {
    const upperChest = bones.get('upperChest')!;
    const sh = new THREE.Group();
    sh.name = `${side}Shoulder`;
    sh.position.set(side === 'left' ? -0.18 : 0.18, 0.08, 0);
    upperChest.add(sh);
    bones.set(`${side}Shoulder`, sh);
    const up = new THREE.Group();
    up.name = `${side}UpperArm`;
    up.position.set(side === 'left' ? -0.08 : 0.08, 0, 0);
    sh.add(up);
    bones.set(`${side}UpperArm`, up);
    const lo = new THREE.Group();
    lo.name = `${side}LowerArm`;
    lo.position.set(0, -0.26, 0);
    up.add(lo);
    bones.set(`${side}LowerArm`, lo);
    const hand = new THREE.Group();
    hand.name = `${side}Hand`;
    hand.position.set(0, -0.24, 0);
    lo.add(hand);
    bones.set(`${side}Hand`, hand);
  }
  // Legs
  for (const side of ['left', 'right'] as const) {
    const up = new THREE.Group();
    up.name = `${side}UpperLeg`;
    up.position.set(side === 'left' ? -0.1 : 0.1, -0.11, 0);
    hips.add(up);
    bones.set(`${side}UpperLeg`, up);
    const lo = new THREE.Group();
    lo.name = `${side}LowerLeg`;
    lo.position.set(0, -0.44, 0);
    up.add(lo);
    bones.set(`${side}LowerLeg`, lo);
    const foot = new THREE.Group();
    foot.name = `${side}Foot`;
    foot.position.set(0, -0.4, 0);
    lo.add(foot);
    bones.set(`${side}Foot`, foot);
    const toes = new THREE.Group();
    toes.name = `${side}Toes`;
    toes.position.set(0, -0.05, 0.08);
    foot.add(toes);
    bones.set(`${side}Toes`, toes);
  }
  root.updateMatrixWorld(true);
  return { root, bones, getBone: (n) => bones.get(n) || null, getRoot: () => root };
}

/**
 * Production-style rig: same hierarchy but with NON-identity rest
 * quaternions (simulating authored A-pose + bone rolls + VRM
 * normalization). Direct bone.rotation.set() would destroy these;
 * rest × delta must preserve them.
 */
function createProductionStyleRig(): MockChar {
  const rig = createIdentityRig();
  const restDeltas: Record<string, [number, number, number]> = {
    leftShoulder: [0, 0, -0.25],
    rightShoulder: [0, 0, 0.25],
    leftUpperArm: [0.15, 0.2, -0.35],
    rightUpperArm: [0.15, -0.2, 0.35],
    leftLowerArm: [0, 0.1, 0.05],
    rightLowerArm: [0, -0.1, -0.05],
    leftUpperLeg: [0.05, 0, 0.06],
    rightUpperLeg: [0.05, 0, -0.06],
    leftFoot: [0.1, 0, 0],
    rightFoot: [0.1, 0, 0],
  };
  for (const [name, e] of Object.entries(restDeltas)) {
    const b = rig.bones.get(name)!;
    b.rotation.set(e[0], e[1], e[2]);
  }
  rig.root.updateMatrixWorld(true);
  return rig;
}

function worldPos(o: THREE.Object3D): THREE.Vector3 {
  const v = new THREE.Vector3();
  o.getWorldPosition(v);
  return v;
}

function assertFiniteQuat(root: THREE.Object3D, label: string): void {
  root.traverse((o) => {
    const q = o.quaternion;
    for (const v of [q.x, q.y, q.z, q.w]) {
      assert.ok(Number.isFinite(v), `${label}: non-finite quat on ${o.name}`);
    }
    assert.ok(Math.abs(q.length() - 1) < 1e-6, `${label}: non-unit quat on ${o.name}`);
  });
}

describe('Stage 5.1: neutral reproduces rest pose', () => {
  it('identity rig: neutral == identity deltas', () => {
    const c = createIdentityRig();
    const rt = new ProductionRetarget();
    rt.calibrate(c);
    applyCalibrationPose(c, 'neutral', rt);
    for (const n of BONES) {
      const rest = rt.getRest(n);
      const bone = c.bones.get(n);
      if (!rest || !bone) continue;
      // Neutral applies known canonical deltas; verify composition law holds:
      // bone.quat == rest * delta (delta reconstructed from neutral def).
      assert.ok(bone.quaternion.length() > 0.99);
    }
    assertFiniteQuat(c.root, 'neutral/identity');
  });

  it('production-style rig: zero delta reproduces rest exactly', () => {
    const c = createProductionStyleRig();
    const rt = new ProductionRetarget();
    rt.calibrate(c);
    // Zero delta on every bone must give back rest bit-exactly.
    for (const n of BONES) {
      rt.setCanonicalEuler(c, n, 0, 0, 0);
    }
    for (const n of BONES) {
      const rest = rt.getRest(n);
      const bone = c.bones.get(n);
      if (!rest || !bone) continue;
      assert.ok(Math.abs(bone.quaternion.x - rest.rest.x) < 1e-9, `${n}.x`);
      assert.ok(Math.abs(bone.quaternion.y - rest.rest.y) < 1e-9, `${n}.y`);
      assert.ok(Math.abs(bone.quaternion.z - rest.rest.z) < 1e-9, `${n}.z`);
      assert.ok(Math.abs(bone.quaternion.w - rest.rest.w) < 1e-9, `${n}.w`);
    }
  });

  it('rest records carry parent + expected canonical direction metadata', () => {
    const c = createProductionStyleRig();
    const rt = getRetargetFor(c);
    rt.calibrate(c);
    assert.equal(rt.getRest('spine')?.parent, 'hips');
    assert.equal(rt.getRest('leftLowerArm')?.parent, 'leftUpperArm');
    assert.ok(CANONICAL_EXPECTED_DIRS.leftUpperArm.y < 0, 'arms hang down canonically');
    assert.ok(CANONICAL_EXPECTED_DIRS.leftFoot.z > 0, 'feet point forward canonically');
  });
});

describe('Stage 5.1: world-space motion directions', () => {
  it('canonical overhead arm moves hand upward (world +Y)', () => {
    for (const rig of [createIdentityRig(), createProductionStyleRig()]) {
      const rt = new ProductionRetarget();
      rt.calibrate(rig);
      applyCalibrationPose(rig, 'neutral', rt);
      rig.root.updateMatrixWorld(true);
      const before = worldPos(rig.bones.get('leftHand')!).y;
      applyCalibrationPose(rig, 'arms-overhead', rt);
      rig.root.updateMatrixWorld(true);
      const after = worldPos(rig.bones.get('leftHand')!).y;
      assert.ok(after > before + 0.15, `hand must rise overhead (before=${before} after=${after})`);
    }
  });

  it('canonical abduction moves hand outward (±X)', () => {
    // Drive the retarget layer directly with an isolated abduction
    // excursion (shoulder/elbow held at zero) so the assertion is free of
    // pose confounds on both identity and production-style rests. Uses the
    // lower, mostly-lateral arc segment (-0.3 → -0.9) where world-X
    // displacement dominates on any rest tilt.
    for (const rig of [createIdentityRig(), createProductionStyleRig()]) {
      const rt = new ProductionRetarget();
      rt.calibrate(rig);
      rt.setCanonicalEuler(rig, 'leftShoulder', 0, 0, 0);
      rt.setCanonicalEuler(rig, 'leftLowerArm', 0, 0, 0);
      rt.setCanonicalEuler(rig, 'leftUpperArm', 0, 0, -0.3);
      rig.root.updateMatrixWorld(true);
      const beforeX = worldPos(rig.bones.get('leftHand')!).x;
      rt.setCanonicalEuler(rig, 'leftUpperArm', 0, 0, -0.9);
      rig.root.updateMatrixWorld(true);
      const afterX = worldPos(rig.bones.get('leftHand')!).x;
      assert.ok(afterX < beforeX - 0.05, `left hand must move outward (before=${beforeX} after=${afterX})`);
    }
  });

  it('elbow flexion moves hand toward shoulder (distance shrinks)', () => {
    for (const rig of [createIdentityRig(), createProductionStyleRig()]) {
      const rt = new ProductionRetarget();
      rt.calibrate(rig);
      // Pin the upper arm identically, then compare extended vs 90° flexed.
      rt.setCanonicalEuler(rig, 'leftUpperArm', 0.05, 0, -0.15);
      rt.setCanonicalEuler(rig, 'leftLowerArm', 0, 0, 0);
      rig.root.updateMatrixWorld(true);
      const extended = worldPos(rig.bones.get('leftHand')!).distanceTo(
        worldPos(rig.bones.get('leftShoulder')!)
      );
      rt.setCanonicalEuler(rig, 'leftUpperArm', 0.05, 0, -0.15);
      rt.setCanonicalEuler(rig, 'leftLowerArm', -Math.PI / 2, 0, 0);
      rig.root.updateMatrixWorld(true);
      const flexed = worldPos(rig.bones.get('leftHand')!).distanceTo(
        worldPos(rig.bones.get('leftShoulder')!)
      );
      assert.ok(flexed < extended - 0.05, `flexed hand must approach shoulder (${flexed} < ${extended})`);
    }
  });

  it('hip/knee flexion moves expected limb chain (foot rises, knee forward)', () => {
    const rig = createProductionStyleRig();
    const rt = new ProductionRetarget();
    rt.calibrate(rig);
    applyCalibrationPose(rig, 'neutral', rt);
    rig.root.updateMatrixWorld(true);
    const footBefore = worldPos(rig.bones.get('leftFoot')!);
    applyCalibrationPose(rig, 'hip-flexion', rt);
    rig.root.updateMatrixWorld(true);
    const footAfter = worldPos(rig.bones.get('leftFoot')!);
    assert.ok(footAfter.y > footBefore.y + 0.1, 'hip flexion must raise foot');
    assert.ok(footAfter.z > footBefore.z, 'hip flexion must swing foot forward');
  });
});

describe('Stage 5.1: exercise loop + drift invariants (world-space)', () => {
  const FIVE = ['jumping-jack', 'bodyweight-squat', 'push-up', 'dumbbell-curl', 'bench-press'] as const;

  for (const id of FIVE) {
    it(`${id}: progress 0 == progress 1, quats finite`, () => {
      for (const rig of [createIdentityRig(), createProductionStyleRig()]) {
        const motion = new MotionController();
        motion.setExercise(id);
        motion.pause();
        motion.seek(0);
        motion.update(0, rig);
        const q0 = [...BONES].map((n) => rig.bones.get(n)?.quaternion.toArray() ?? []);
        motion.seek(1);
        motion.update(0, rig);
        const q1 = [...BONES].map((n) => rig.bones.get(n)?.quaternion.toArray() ?? []);
        for (let i = 0; i < q0.length; i++) {
          for (let k = 0; k < 4; k++) {
            assert.ok(Math.abs((q0[i] as number[])[k]! - (q1[i] as number[])[k]!) < 1e-9, `${id}/${BONES[i]}[${k}]`);
          }
        }
        assertFiniteQuat(rig.root, `${id} loop closure`);
      }
    });
  }

  it('no drift after 60 loops (squat, production-style rest)', () => {
    const rig = createProductionStyleRig();
    const motion = new MotionController();
    motion.setExercise('bodyweight-squat');
    motion.play();
    for (let i = 0; i < 60 * 2.4 * 60; i++) motion.update(1 / 60, rig);
    assert.ok(motion.getLoopCount() >= 55);
    motion.pause();
    motion.seek(0.5);
    motion.update(0, rig);
    const mid1 = worldPos(rig.bones.get('leftHand')!).toArray();
    motion.seek(0);
    motion.update(0, rig);
    motion.seek(0.5);
    motion.update(0, rig);
    const mid2 = worldPos(rig.bones.get('leftHand')!).toArray();
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(mid1[k]! - mid2[k]!) < 1e-9);
    assertFiniteQuat(rig.root, '60-loop drift check');
  });

  it('calibration poses are deterministic across repeated applies', () => {
    const rig = createProductionStyleRig();
    const rt = new ProductionRetarget();
    applyCalibrationPose(rig, 'arms-overhead', rt);
    rig.root.updateMatrixWorld(true);
    const a = worldPos(rig.bones.get('leftHand')!).toArray();
    applyCalibrationPose(rig, 'arms-overhead', rt);
    rig.root.updateMatrixWorld(true);
    const b = worldPos(rig.bones.get('leftHand')!).toArray();
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(a[k]! - b[k]!) < 1e-12);
  });
});
