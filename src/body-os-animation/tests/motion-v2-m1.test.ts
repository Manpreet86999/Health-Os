/**
 * Health OS Motion V2 — M1 calibration gate tests.
 *
 * Validates OUTCOMES in normalized-humanoid space, never Euler values:
 * - clip structure/sampling (slerp, seek, loop, speed, events)
 * - setNormalizedPose/getNormalizedPose round-trip on a real VRMHumanoid
 * - calibration clip world-space outcomes (hands lateral/overhead/forward,
 *   wrist→shoulder, knee/ankle chains, plank pitch)
 * - normalized finger grip persists through vrm.update()
 * - frame-ownership offset stability (grasp-frame finding)
 * - fallback applicator parity on identical clips
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VRMHumanoid, type VRMHumanBones, type VRMPose } from '@pixiv/three-vrm';

import {
  sampleBodyOSMotionClip,
  validateBodyOSMotionClip,
  type BodyOSMotionClip,
} from '../motion/BodyOSMotionClip.js';
import {
  clearMotionClips,
  getMotionClip,
  listMotionClipIds,
  registerMotionClip,
} from '../motion/MotionLibrary.js';
import { MotionPlayer } from '../motion/MotionPlayer.js';
import { buildCalibrationClips, CALIBRATION_CLIP_IDS } from '../motion/CalibrationClips.js';
import { FallbackRigApplicator, VRMNormalizedApplicator } from '../motion/HumanoidApplicator.js';
import {
  buildGripDiagnosticPose,
  mergeGripPose,
} from '../character/NormalizedGripPresets.js';
import {
  DIAGNOSTIC_BONES,
  runFrameOwnershipDiagnostic,
  sampleBoneFrames,
} from '../motion/FrameOwnershipDiagnostic.js';
import type { CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import type { HumanoidBoneName } from '../core/types.js';

afterEach(() => {
  clearMotionClips();
});

function registerCalib(): void {
  for (const clip of buildCalibrationClips()) registerMotionClip(clip);
}

// ---------------------------------------------------------------------------
// Mock normalized-style rig: identity-rotation proxies at anatomical rest
// offsets — structurally what three-vrm builds for normalized bones.
// ---------------------------------------------------------------------------

const CHAIN: Array<[string, string | null, [number, number, number]]> = [
  ['hips', null, [0, 0.98, 0]],
  ['spine', 'hips', [0, 0.12, 0]],
  ['chest', 'spine', [0, 0.12, 0]],
  ['upperChest', 'chest', [0, 0.12, 0]],
  ['neck', 'upperChest', [0, 0.12, 0]],
  ['head', 'neck', [0, 0.12, 0]],
  ['leftShoulder', 'upperChest', [-0.18, 0.08, 0]],
  ['leftUpperArm', 'leftShoulder', [-0.08, 0, 0]],
  ['leftLowerArm', 'leftUpperArm', [0, -0.26, 0]],
  ['leftHand', 'leftLowerArm', [0, -0.24, 0]],
  ['leftIndexProximal', 'leftHand', [0, -0.05, 0]],
  ['leftIndexIntermediate', 'leftIndexProximal', [0, -0.03, 0]],
  ['leftIndexDistal', 'leftIndexIntermediate', [0, -0.03, 0]],
  ['rightShoulder', 'upperChest', [0.18, 0.08, 0]],
  ['rightUpperArm', 'rightShoulder', [0.08, 0, 0]],
  ['rightLowerArm', 'rightUpperArm', [0, -0.26, 0]],
  ['rightHand', 'rightLowerArm', [0, -0.24, 0]],
  ['rightIndexProximal', 'rightHand', [0, -0.05, 0]],
  ['rightIndexIntermediate', 'rightIndexProximal', [0, -0.03, 0]],
  ['rightIndexDistal', 'rightIndexIntermediate', [0, -0.03, 0]],
  ['leftUpperLeg', 'hips', [-0.1, -0.11, 0]],
  ['leftLowerLeg', 'leftUpperLeg', [0, -0.44, 0]],
  ['leftFoot', 'leftLowerLeg', [0, -0.4, 0]],
  ['leftToes', 'leftFoot', [0, -0.05, 0.08]],
  ['rightUpperLeg', 'hips', [0.1, -0.11, 0]],
  ['rightLowerLeg', 'rightUpperLeg', [0, -0.44, 0]],
  ['rightFoot', 'rightLowerLeg', [0, -0.4, 0]],
  ['rightToes', 'rightFoot', [0, -0.05, 0.08]],
];

function buildMockHumanoid(): { humanoid: VRMHumanoid; nodes: Map<string, THREE.Object3D> } {
  const nodes = new Map<string, THREE.Object3D>();
  const scene = new THREE.Group();
  for (const [name, parent, pos] of CHAIN) {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(pos[0]!, pos[1]!, pos[2]!);
    (parent ? nodes.get(parent)! : scene).add(node);
    nodes.set(name, node);
  }
  scene.updateMatrixWorld(true);
  const bones = {} as VRMHumanBones;
  for (const [name, node] of nodes) {
    (bones as Record<string, { node: THREE.Object3D }>)[name] = { node };
  }
  return { humanoid: new VRMHumanoid(bones), nodes };
}

function world(node: THREE.Object3D): THREE.Vector3 {
  return node.getWorldPosition(new THREE.Vector3());
}

function applyClipPose(
  humanoid: VRMHumanoid,
  nodes: Map<string, THREE.Object3D>,
  clipId: string,
  time: number
): void {
  const clip = getMotionClip(clipId)!;
  assert.ok(clip, `clip registered: ${clipId}`);
  const app = new VRMNormalizedApplicator(humanoid);
  // Mirror playClip semantics: reset so static clips evaluate from rest.
  app.resetPose();
  app.applyPose(sampleBodyOSMotionClip(clip, time));
  humanoid.update();
  void nodes;
}

function assertUnitFinite(q: THREE.Quaternion, label: string): void {
  for (const v of [q.x, q.y, q.z, q.w]) assert.ok(Number.isFinite(v), `${label} finite`);
  assert.ok(Math.abs(q.length() - 1) < 1e-6, `${label} unit`);
}

// ---------------------------------------------------------------------------
// Clip structure + sampling
// ---------------------------------------------------------------------------

describe('M1: calibration clip assets', () => {
  it('all eight calibration clips validate clean', () => {
    const clips = buildCalibrationClips();
    assert.equal(clips.length, 8);
    assert.deepEqual(
      clips.map((c) => c.id).sort(),
      [...CALIBRATION_CLIP_IDS].sort()
    );
    for (const clip of clips) {
      assert.deepEqual(validateBodyOSMotionClip(clip), [], clip.id);
      for (const track of clip.tracks) {
        for (const r of track.rotations) {
          const q = new THREE.Quaternion(r[0], r[1], r[2], r[3]);
          assertUnitFinite(q, `${clip.id}/${track.bone}`);
        }
      }
    }
  });

  it('library registers and lists calibration clips', () => {
    registerCalib();
    for (const id of CALIBRATION_CLIP_IDS) {
      assert.ok(getMotionClip(id), id);
    }
    assert.ok(listMotionClipIds().length >= 8);
  });

  it('slerp midpoint splits the rotation angle', () => {
    const half = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 4, 0, 0));
    const full = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const clip: BodyOSMotionClip = {
      id: 'probe',
      version: 1,
      duration: 2.0,
      loop: true,
      tracks: [
        {
          bone: 'leftUpperArm',
          times: [0, 2.0],
          rotations: [
            [0, 0, 0, 1],
            [full.x, full.y, full.z, full.w],
          ],
        },
      ],
      events: [],
    };
    const mid = sampleBodyOSMotionClip(clip, 1.0);
    const q = new THREE.Quaternion().fromArray(mid.leftUpperArm!.rotation!);
    assert.ok(Math.abs(q.angleTo(half)) < 1e-6, `slerp midpoint, got angle ${q.angleTo(half)}`);
  });

  it('static clips loop-close: sample(0) equals sample(duration)', () => {
    registerCalib();
    for (const id of CALIBRATION_CLIP_IDS) {
      const clip = getMotionClip(id)!;
      const a = sampleBodyOSMotionClip(clip, 0);
      const b = sampleBodyOSMotionClip(clip, clip.duration);
      assert.deepEqual(a, b, `${id} loop closure`);
    }
  });
});

// ---------------------------------------------------------------------------
// Player transport
// ---------------------------------------------------------------------------

describe('M1: MotionPlayer transport', () => {
  function probeClip(): BodyOSMotionClip {
    return {
      id: 'probe',
      version: 1,
      duration: 2.0,
      loop: true,
      tracks: [],
      events: [
        { time: 0.0, name: 'rep:start' },
        { time: 0.5, name: 'rep:top' },
        { time: 1.0, name: 'rep:end' },
      ],
    };
  }

  it('seek/play/pause/speed/loop behave', () => {
    const player = new MotionPlayer();
    player.setClip(probeClip());
    player.pause();
    player.seek(0.5);
    assert.ok(Math.abs(player.getCurrentTime() - 1.0) < 1e-9);
    player.play();
    player.setSpeed(2.0);
    player.update(0.25);
    assert.ok(Math.abs(player.getCurrentTime() - 1.5) < 1e-9);
    player.update(0.5); // crosses duration at 2x -> loops
    assert.equal(player.getLoopCount(), 1);
    assert.ok(player.getCurrentTime() < 2.0);
  });

  it('emits phase events across a loop', () => {
    const player = new MotionPlayer();
    player.setClip(probeClip());
    const fired: string[] = [];
    player.onEvent((e) => fired.push(e.name));
    player.play();
    for (let i = 0; i < 300; i++) player.update(1 / 60);
    assert.ok(fired.includes('rep:start'));
    assert.ok(fired.includes('rep:top'));
    assert.ok(player.getLoopCount() > 0);
  });

  it('output pose carries no Euler/DEF concepts (VRMPose quats only)', () => {
    registerCalib();
    const player = new MotionPlayer();
    player.setClip(getMotionClip('v2-calib-arms-overhead')!);
    player.pause();
    player.seek(0.5);
    const status = player.update(0);
    assert.ok(status.pose.leftUpperArm?.rotation);
    assert.equal(status.pose.leftUpperArm!.rotation!.length, 4);
  });
});

// ---------------------------------------------------------------------------
// Normalized round-trip + calibration outcomes on a real VRMHumanoid
// ---------------------------------------------------------------------------

describe('M1: normalized pose round-trip', () => {
  it('setNormalizedPose/getNormalizedPose agree within tolerance', () => {
    const { humanoid } = buildMockHumanoid();
    const e = new THREE.Euler(0.3, -0.5, 1.1);
    const q = new THREE.Quaternion().setFromEuler(e);
    const pose: VRMPose = {
      leftUpperArm: { rotation: [q.x, q.y, q.z, q.w] },
      hips: { position: [0, 0.9, -0.05] },
    };
    humanoid.setNormalizedPose(pose);
    const back = humanoid.getNormalizedPose();
    const qb = new THREE.Quaternion().fromArray(back.leftUpperArm!.rotation!);
    assert.ok(qb.angleTo(q) < 1e-6, `round-trip angle ${qb.angleTo(q)}`);
    const hp = back.hips!.position!;
    assert.ok(
      Math.abs(hp[0]!) < 1e-9 && Math.abs(hp[1]! - 0.9) < 1e-9 && Math.abs(hp[2]! + 0.05) < 1e-9,
      `hips position round-trip, got ${hp}`
    );
  });

  it('neutral returns proxies to rest (identity quats)', () => {
    registerCalib();
    const { humanoid } = buildMockHumanoid();
    const app = new VRMNormalizedApplicator(humanoid);
    app.applyPose(sampleBodyOSMotionClip(getMotionClip('v2-calib-arms-overhead')!, 0));
    app.resetPose();
    const pose = humanoid.getNormalizedPose();
    for (const [bone, t] of Object.entries(pose)) {
      if (!t?.rotation) continue;
      const q = new THREE.Quaternion().fromArray(t.rotation);
      assert.ok(q.angleTo(new THREE.Quaternion()) < 1e-6, `${bone} at rest`);
    }
  });
});

describe('M1: calibration world-space outcomes', () => {
  it('T-pose moves hands laterally away from torso', () => {
    registerCalib();
    const { humanoid, nodes } = buildMockHumanoid();
    applyClipPose(humanoid, nodes, 'v2-calib-neutral', 0);
    const neutralL = Math.abs(world(nodes.get('leftHand')!).x);
    const neutralR = Math.abs(world(nodes.get('rightHand')!).x);
    applyClipPose(humanoid, nodes, 'v2-calib-arms-side', 0);
    assert.ok(Math.abs(world(nodes.get('leftHand')!).x) > neutralL + 0.1, 'left hand lateral');
    assert.ok(Math.abs(world(nodes.get('rightHand')!).x) > neutralR + 0.1, 'right hand lateral');
  });

  it('overhead puts both hands above shoulders', () => {
    registerCalib();
    const { humanoid, nodes } = buildMockHumanoid();
    applyClipPose(humanoid, nodes, 'v2-calib-arms-overhead', 0);
    const lSh = world(nodes.get('leftShoulder')!).y;
    const rSh = world(nodes.get('rightShoulder')!).y;
    assert.ok(world(nodes.get('leftHand')!).y > lSh + 0.1, 'left hand overhead');
    assert.ok(world(nodes.get('rightHand')!).y > rSh + 0.1, 'right hand overhead');
  });

  it('arms-forward moves hands forward of shoulders', () => {
    registerCalib();
    const { humanoid, nodes } = buildMockHumanoid();
    applyClipPose(humanoid, nodes, 'v2-calib-arms-forward', 0);
    assert.ok(
      world(nodes.get('leftHand')!).z > world(nodes.get('leftShoulder')!).z + 0.2,
      'left hand forward'
    );
    assert.ok(
      world(nodes.get('rightHand')!).z > world(nodes.get('rightShoulder')!).z + 0.2,
      'right hand forward'
    );
  });

  it('elbow-flexion brings wrist toward shoulder', () => {
    registerCalib();
    const { humanoid, nodes } = buildMockHumanoid();
    applyClipPose(humanoid, nodes, 'v2-calib-neutral', 0);
    const extended = world(nodes.get('leftHand')!).distanceTo(world(nodes.get('leftShoulder')!));
    applyClipPose(humanoid, nodes, 'v2-calib-elbow-flexion-90', 0);
    const flexed = world(nodes.get('leftHand')!).distanceTo(world(nodes.get('leftShoulder')!));
    assert.ok(flexed < extended - 0.05, `wrist approaches shoulder (${flexed} < ${extended})`);
  });

  it('hip-flexion drives the knee forward/up; knee-flexion swings the ankle back', () => {
    registerCalib();
    const { humanoid, nodes } = buildMockHumanoid();
    applyClipPose(humanoid, nodes, 'v2-calib-neutral', 0);
    const kneeRest = world(nodes.get('leftLowerLeg')!);
    const ankleRest = world(nodes.get('leftFoot')!);
    applyClipPose(humanoid, nodes, 'v2-calib-hip-flexion', 0);
    const kneeFlex = world(nodes.get('leftLowerLeg')!);
    assert.ok(kneeFlex.z > kneeRest.z + 0.1, 'knee forward');
    assert.ok(kneeFlex.y > kneeRest.y, 'knee up');
    applyClipPose(humanoid, nodes, 'v2-calib-neutral', 0);
    applyClipPose(humanoid, nodes, 'v2-calib-knee-flexion-90', 0);
    const ankleFlex = world(nodes.get('leftFoot')!);
    const kneeNow = world(nodes.get('leftLowerLeg')!);
    assert.ok(ankleFlex.z < ankleRest.z - 0.05, 'ankle swings back');
    void kneeNow;
  });

  it('plank pitches hips ~90° with finite unit quats everywhere', () => {
    registerCalib();
    const { humanoid, nodes } = buildMockHumanoid();
    applyClipPose(humanoid, nodes, 'v2-calib-horizontal-plank', 0);
    const hipsQ = nodes.get('hips')!.getWorldQuaternion(new THREE.Quaternion());
    void hipsQ;
    const normHips = humanoid.getNormalizedBoneNode('hips')!;
    const nq = normHips.getWorldQuaternion(new THREE.Quaternion());
    // Normalized hips proxy pitched forward from rest by ~PI/2 about X.
    const rest = new THREE.Quaternion();
    assert.ok(nq.angleTo(rest) > Math.PI / 2 - 0.2, 'hips pitched to horizontal');
    nodes.forEach((node, name) => {
      assertUnitFinite(node.getWorldQuaternion(new THREE.Quaternion()), `plank/${name}`);
    });
  });
});

// ---------------------------------------------------------------------------
// Normalized grip + frame ownership + fallback parity
// ---------------------------------------------------------------------------

describe('M1: normalized grip persists through update', () => {
  it('finger pose merged pre-update survives on raw bones', () => {
    const { humanoid } = buildMockHumanoid();
    const grip = buildGripDiagnosticPose();
    const restRaw = humanoid
      .getRawBoneNode('leftIndexProximal')!
      .getWorldQuaternion(new THREE.Quaternion())
      .clone();
    humanoid.setNormalizedPose(mergeGripPose({}, grip));
    humanoid.update();
    const posedRaw = humanoid
      .getRawBoneNode('leftIndexProximal')!
      .getWorldQuaternion(new THREE.Quaternion());
    // Raw finger must have moved off rest AND match its normalized proxy
    // through the (identity-rest) copy: angle off rest ≈ proximal curl.
    assert.ok(posedRaw.angleTo(restRaw) > 0.5, 'grip visible on raw finger');
    const posedNorm = humanoid
      .getNormalizedBoneNode('leftIndexProximal')!
      .getWorldQuaternion(new THREE.Quaternion());
    assert.ok(posedRaw.angleTo(posedNorm) < 1e-6, 'raw follows normalized');
  });

  it('grip merge is disjoint from body tracks', () => {
    registerCalib();
    const clip = getMotionClip('v2-calib-arms-overhead')!;
    const merged = mergeGripPose(sampleBodyOSMotionClip(clip, 0), buildGripDiagnosticPose());
    assert.ok(merged.leftUpperArm?.rotation, 'body track kept');
    assert.ok(merged.leftIndexProximal?.rotation, 'grip added');
  });
});

describe('M1: frame ownership diagnostic', () => {
  it('normalized-vs-raw offset is pose-stable (grasp frame exists)', () => {
    registerCalib();
    const { humanoid } = buildMockHumanoid();
    const rest = {};
    const overhead = sampleBodyOSMotionClip(getMotionClip('v2-calib-arms-overhead')!, 0);
    const curled = sampleBodyOSMotionClip(getMotionClip('v2-calib-elbow-flexion-90')!, 0);
    const report = runFrameOwnershipDiagnostic(humanoid, DIAGNOSTIC_BONES, [rest, overhead, curled]);
    assert.equal(report.samples.length, 3);
    for (const bone of DIAGNOSTIC_BONES) {
      assert.ok(
        report.offsetQuaternionDrift[bone]! < 1e-6,
        `${bone} orientation offset stable (${report.offsetQuaternionDrift[bone]})`
      );
      assert.ok(
        report.offsetPositionDrift[bone]! < 1e-6,
        `${bone} position offset stable (${report.offsetPositionDrift[bone]})`
      );
    }
  });

  it('samples carry both frames per bone', () => {
    const { humanoid } = buildMockHumanoid();
    const samples = sampleBoneFrames(humanoid, ['leftHand', 'rightFoot']);
    assert.equal(samples.length, 2);
    for (const s of samples) {
      assert.equal(s.normalizedQuaternion.length, 4);
      assert.equal(s.rawQuaternion.length, 4);
      assert.equal(s.offsetQuaternion.length, 4);
    }
  });
});

describe('M1: fallback applicator parity', () => {
  function fallbackProvider(root: THREE.Group): CharacterSkeletonProvider & { bones: Map<string, THREE.Object3D> } {
    const bones = new Map<string, THREE.Object3D>();
    root.traverse((o) => {
      if (o.name) bones.set(o.name, o);
    });
    return {
      bones,
      getBone: (n) => bones.get(n as string) || null,
      getRoot: () => root,
    };
  }

  function buildFallbackRoot(): THREE.Group {
    const root = new THREE.Group();
    const byName = new Map<string, THREE.Object3D>();
    for (const [name, parent, pos] of CHAIN) {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(pos[0]!, pos[1]!, pos[2]!);
      (parent ? byName.get(parent)! : root).add(g);
      byName.set(name, g);
    }
    root.updateMatrixWorld(true);
    return root;
  }

  it('identical overhead clip puts fallback hands above shoulders too', () => {
    registerCalib();
    const clip = getMotionClip('v2-calib-arms-overhead')!;
    const provider = fallbackProvider(buildFallbackRoot());
    new FallbackRigApplicator(provider).applyPose(sampleBodyOSMotionClip(clip, 0));
    provider.getRoot().updateMatrixWorld(true);
    const lHand = provider.bones.get('leftHand')!;
    const lSh = provider.bones.get('leftShoulder')!;
    const rHand = provider.bones.get('rightHand')!;
    const rSh = provider.bones.get('rightShoulder')!;
    assert.ok(world(lHand).y > world(lSh).y, 'fallback left overhead');
    assert.ok(world(rHand).y > world(rSh).y, 'fallback right overhead');
  });
});
