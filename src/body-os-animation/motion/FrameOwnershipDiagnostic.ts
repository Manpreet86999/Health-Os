/**
 * Health OS Motion V2 — Frame Ownership Diagnostic (M1).
 *
 * Developer-only. Reports, for selected bones, the normalized proxy world
 * transform vs the raw rendered bone world transform, plus their relative
 * offset O = normWorld⁻¹ × rawWorld.
 *
 * Purpose: decide the future attachment/grasp frame. If O is stable across
 * poses (constant offset), a grip/equipment frame
 *   rawWorld = normalizedWorld × offset
 * exists and attachments can be solved in normalized space with a fixed
 * grasp offset. If O varies, attachments need per-pose solving.
 *
 * Pure functions over a live `VRMHumanoid`; safe in browser and in node
 * tests (construct `VRMHumanoid` over mock nodes).
 */

import * as THREE from 'three';
import type { VRMHumanBoneName, VRMHumanoid, VRMPose } from '@pixiv/three-vrm';

export interface BoneFrameSample {
  bone: string;
  normalizedPosition: [number, number, number];
  normalizedQuaternion: [number, number, number, number];
  rawPosition: [number, number, number];
  rawQuaternion: [number, number, number, number];
  /** O = normWorld⁻¹ × rawWorld, position + quaternion parts. */
  offsetPosition: [number, number, number];
  offsetQuaternion: [number, number, number, number];
}

export const DIAGNOSTIC_BONES: VRMHumanBoneName[] = [
  'leftHand',
  'rightHand',
  'leftFoot',
  'rightFoot',
];

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pw = new THREE.Vector3();
const _qw = new THREE.Quaternion();

function snapshot(node: THREE.Object3D): { p: [number, number, number]; q: [number, number, number, number] } {
  node.getWorldPosition(_p);
  node.getWorldQuaternion(_q);
  return { p: [_p.x, _p.y, _p.z], q: [_q.x, _q.y, _q.z, _q.w] };
}

/** Samples current normalized-vs-raw frames for the given bones. */
export function sampleBoneFrames(humanoid: VRMHumanoid, bones: VRMHumanBoneName[]): BoneFrameSample[] {
  const out: BoneFrameSample[] = [];
  for (const bone of bones) {
    const normNode = humanoid.getNormalizedBoneNode(bone);
    const rawNode = humanoid.getRawBoneNode(bone);
    if (!normNode || !rawNode) continue;
    const n = snapshot(normNode);
    const r = snapshot(rawNode);
    _pw.fromArray(n.p);
    _qw.fromArray(n.q);
    const offP = _p.fromArray(r.p).sub(_pw);
    const offQ = _q.fromArray(r.q).premultiply(_qw.clone().invert());
    out.push({
      bone,
      normalizedPosition: n.p,
      normalizedQuaternion: n.q,
      rawPosition: r.p,
      rawQuaternion: r.q,
      offsetPosition: [offP.x, offP.y, offP.z],
      offsetQuaternion: [offQ.x, offQ.y, offQ.z, offQ.w],
    });
  }
  return out;
}

export interface FrameOwnershipReport {
  bones: string[];
  /** Max angular (rad) drift of O across poses per bone; ~0 = stable grasp frame. */
  offsetQuaternionDrift: Record<string, number>;
  /** Max position drift of O across poses per bone (m). */
  offsetPositionDrift: Record<string, number>;
  samples: BoneFrameSample[][];
}

/**
 * Applies each pose (then `humanoid.update()`), samples frames, and
 * measures O stability across the pose set.
 */
export function runFrameOwnershipDiagnostic(
  humanoid: VRMHumanoid,
  bones: VRMHumanBoneName[],
  poses: VRMPose[]
): FrameOwnershipReport {
  const samples = poses.map((pose) => {
    humanoid.setNormalizedPose(pose);
    humanoid.update();
    return sampleBoneFrames(humanoid, bones);
  });
  const offsetQuaternionDrift: Record<string, number> = {};
  const offsetPositionDrift: Record<string, number> = {};
  for (const bone of bones) {
    const quats = samples.map((s) =>
      new THREE.Quaternion().fromArray(
        s.find((x) => x.bone === bone)?.offsetQuaternion ?? [0, 0, 0, 1]
      )
    );
    const poss = samples.map(
      (s) => s.find((x) => x.bone === bone)?.offsetPosition ?? [0, 0, 0]
    );
    let maxAngle = 0;
    for (let i = 1; i < quats.length; i++) {
      maxAngle = Math.max(maxAngle, quats[0]!.angleTo(quats[i]!));
    }
    let maxDist = 0;
    for (let i = 1; i < poss.length; i++) {
      const a = poss[0]!;
      const b = poss[i]!;
      maxDist = Math.max(
        maxDist,
        Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
      );
    }
    offsetQuaternionDrift[bone] = maxAngle;
    offsetPositionDrift[bone] = maxDist;
  }
  return {
    bones: bones as string[],
    offsetQuaternionDrift,
    offsetPositionDrift,
    samples,
  };
}
