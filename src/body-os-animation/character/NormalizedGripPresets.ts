/**
 * Health OS Motion V2 — Normalized Grip Presets (M1 diagnostic).
 *
 * Grip expressed as a rest-relative normalized finger `VRMPose`, merged
 * into the sampled clip pose EVERY FRAME before `vrm.update()`. This is
 * the ownership fix for the V1 defect where one-shot raw `DEF-f_*`
 * rotations were overwritten by the next humanoid update (finger bones
 * are in `VRMHumanBoneList`).
 *
 * VRM 1.0 finger names (metacarpal/proximal/distal thumb;
 * proximal/intermediate/distal fingers) replace the Blender `DEF-*`
 * names at runtime. The DEF→VRM correspondence is documented here only:
 *   DEF-thumb.01/02/03.L → leftThumbMetacarpal/Proximal/Distal
 *   DEF-f_<name>.01/02/03.L → left<Name>Proximal/Intermediate/Distal
 *
 * M1 scope: a single diagnostic curl proving
 *   normalized finger pose → vrm.update() → visible persistent grip.
 * Curl/exercise grip tuning is explicitly out of scope.
 */

import * as THREE from 'three';
import type { VRMHumanBoneName, VRMPose } from '@pixiv/three-vrm';

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

type Quat = [number, number, number, number];

function flexX(angle: number): Quat {
  _e.set(angle, 0, 0, 'XYZ');
  _q.setFromEuler(_e);
  return [_q.x, _q.y, _q.z, _q.w];
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;

/**
 * Diagnostic fist: uniform X-curl on every finger joint, both hands.
 * Flexion-axis hypothesis (X) is what visual QA must confirm or correct.
 */
export function buildGripDiagnosticPose(
  proximal = 1.25,
  intermediate = 1.45,
  distal = 0.85
): VRMPose {
  const pose: VRMPose = {};
  for (const side of ['left', 'right'] as const) {
    pose[`${side}ThumbMetacarpal` as VRMHumanBoneName] = { rotation: flexX(0.35) };
    pose[`${side}ThumbProximal` as VRMHumanBoneName] = { rotation: flexX(0.75) };
    pose[`${side}ThumbDistal` as VRMHumanBoneName] = { rotation: flexX(0.55) };
    for (const f of FINGERS) {
      pose[`${side}${f}Proximal` as VRMHumanBoneName] = { rotation: flexX(proximal) };
      pose[`${side}${f}Intermediate` as VRMHumanBoneName] = { rotation: flexX(intermediate) };
      pose[`${side}${f}Distal` as VRMHumanBoneName] = { rotation: flexX(distal) };
    }
  }
  return pose;
}

/** Shallow-merge grip keys over a sampled clip pose (disjoint key sets). */
export function mergeGripPose(base: VRMPose, grip: VRMPose | null): VRMPose {
  if (!grip) return base;
  return { ...base, ...grip };
}
