/**
 * Health OS Motion V2 — Calibration Clips (M1).
 *
 * Deterministic `BodyOSMotionClip` generators for the calibration-renders
 * gate. Quaternions are baked at generation time (assets carry quats, not
 * Eulers); the Euler literals below are authoring conveniences only.
 *
 * All rotations are normalized-space anatomical deltas:
 *   X = sagittal flexion/extension, Z = coronal abduction/adduction,
 *   applied rest-relatively by three-vrm (`setNormalizedPose`).
 * No DEF names, no character-specific axes.
 */

import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';
import type { BodyOSMotionClip } from './BodyOSMotionClip.js';

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

type Quat = [number, number, number, number];

function baked(x: number, y: number, z: number): Quat {
  _e.set(x, y, z, 'XYZ');
  _q.setFromEuler(_e);
  return [_q.x, _q.y, _q.z, _q.w];
}

interface StaticPoseDef {
  id: string;
  bones: Partial<Record<VRMHumanBoneName, Quat>>;
  hipsPosition?: [number, number, number];
}

function staticClip(def: StaticPoseDef): BodyOSMotionClip {
  const duration = 2.0;
  const tracks = Object.entries(def.bones).map(([bone, rotation]) => ({
    bone: bone as VRMHumanBoneName,
    times: [0, duration],
    rotations: [rotation!, rotation!] as Quat[],
  }));
  return {
    id: def.id,
    version: 1,
    duration,
    loop: true,
    tracks,
    hips: def.hipsPosition
      ? { times: [0, duration], positions: [def.hipsPosition, def.hipsPosition] }
      : undefined,
    events: [
      { time: 0.0, name: 'rep:start', cue: `Calibration: ${def.id}` },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  };
}

const PI = Math.PI;

export const CALIBRATION_CLIP_IDS = [
  'v2-calib-neutral',
  'v2-calib-arms-side',
  'v2-calib-arms-forward',
  'v2-calib-arms-overhead',
  'v2-calib-elbow-flexion-90',
  'v2-calib-hip-flexion',
  'v2-calib-knee-flexion-90',
  'v2-calib-horizontal-plank',
] as const;

/** Builds all eight M1 calibration clips. Pure; safe to call in tests. */
export function buildCalibrationClips(): BodyOSMotionClip[] {
  return [
    // Rest exactly as authored (empty track set = normalized rest pose).
    staticClip({ id: 'v2-calib-neutral', bones: {} }),
    // T-pose: lateral abduction to horizontal (left negative-Z, mirrored).
    staticClip({
      id: 'v2-calib-arms-side',
      bones: {
        leftUpperArm: baked(0, 0, -1.45),
        rightUpperArm: baked(0, 0, 1.45),
      },
    }),
    // 90° shoulder flexion: arms point forward (+Z).
    staticClip({
      id: 'v2-calib-arms-forward',
      bones: {
        leftUpperArm: baked(-PI / 2, 0, 0),
        rightUpperArm: baked(-PI / 2, 0, 0),
      },
    }),
    // Full abduction arc peak: hands above head, lateral V.
    staticClip({
      id: 'v2-calib-arms-overhead',
      bones: {
        leftUpperArm: baked(0, 0, -2.6),
        rightUpperArm: baked(0, 0, 2.6),
      },
    }),
    // 90° elbow hinge about canonical X; upper arms hang near-vertical.
    staticClip({
      id: 'v2-calib-elbow-flexion-90',
      bones: {
        leftUpperArm: baked(0.05, 0, -0.1),
        rightUpperArm: baked(0.05, 0, 0.1),
        leftLowerArm: baked(-PI / 2, 0, 0),
        rightLowerArm: baked(-PI / 2, 0, 0),
      },
    }),
    // 90° hip flexion: left thigh forward.
    staticClip({
      id: 'v2-calib-hip-flexion',
      bones: { leftUpperLeg: baked(-PI / 2, 0, 0) },
    }),
    // 90° knee hinge: left shin swings backward.
    staticClip({
      id: 'v2-calib-knee-flexion-90',
      bones: { leftLowerLeg: baked(PI / 2, 0, 0) },
    }),
    // Torso horizontal: hips pitched forward, limbs straight, feet dorsiflexed.
    staticClip({
      id: 'v2-calib-horizontal-plank',
      bones: {
        hips: baked(PI / 2, 0, 0),
        leftFoot: baked(0.7, 0, 0),
        rightFoot: baked(0.7, 0, 0),
      },
      hipsPosition: [0, 0.38, 0],
    }),
  ];
}
