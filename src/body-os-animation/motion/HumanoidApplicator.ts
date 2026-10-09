/**
 * Health OS Motion V2 — Humanoid Applicator (M1).
 *
 * Single interface for writing a canonical normalized pose to whatever
 * skeleton is bound. The VRM path is the primary implementation; the
 * procedural fallback rig gets a separate applicator behind the same
 * interface so canonical clips stay identical and the VRM implementation
 * is never compromised for legacy assumptions.
 *
 * Ownership rule: Health OS writes NORMALIZED bones only. Raw humanoid
 * bones are three-vrm owned render output (see `VRMHumanoid.update`).
 */

import * as THREE from 'three';
import type { VRMHumanBoneName, VRMHumanoid, VRMPose } from '@pixiv/three-vrm';
import type { CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import type { HumanoidBoneName } from '../core/types.js';
import { VRM_HUMANOID_BONES } from '../character/SkeletonMap.js';

export interface HumanoidApplicator {
  /** Write a rest-relative normalized pose. Never touches raw bones. */
  applyPose(pose: VRMPose): void;
  /** Return to rest via the skeleton's own rest definition. */
  resetPose(): void;
  /** Pose-layer bone node for diagnostics/attachment-frame reasoning. */
  getBoneNode(name: VRMHumanBoneName): THREE.Object3D | null;
  isVRM(): boolean;
}

/** Production path: `vrm.humanoid.setNormalizedPose()`. Verified API, three-vrm 3.5.5. */
export class VRMNormalizedApplicator implements HumanoidApplicator {
  constructor(private readonly humanoid: VRMHumanoid) {}

  applyPose(pose: VRMPose): void {
    this.humanoid.setNormalizedPose(pose);
  }

  resetPose(): void {
    // Loader-defined rest — never live-sampled calibration.
    this.humanoid.resetNormalizedPose();
  }

  getBoneNode(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.humanoid.getNormalizedBoneNode(name);
  }

  isVRM(): boolean {
    return true;
  }
}

/**
 * Fallback path: writes the same normalized quats onto the procedural
 * rig's identity-rest groups. Separate class, same clips.
 */
export class FallbackRigApplicator implements HumanoidApplicator {
  constructor(private readonly provider: CharacterSkeletonProvider) {}

  applyPose(pose: VRMPose): void {
    for (const [boneName, transform] of Object.entries(pose)) {
      const bone = this.provider.getBone(boneName as HumanoidBoneName);
      if (!bone) continue;
      if (transform?.rotation) {
        bone.quaternion.fromArray(transform.rotation);
      }
      // Only the root carries translation in Health OS clips.
      if (transform?.position && boneName === 'hips') {
        bone.position.fromArray(transform.position);
      }
    }
  }

  resetPose(): void {
    // Canonical bones only — attached meshes/equipment keep their offsets.
    for (const name of VRM_HUMANOID_BONES) {
      const bone = this.provider.getBone(name);
      if (bone) bone.quaternion.identity();
    }
    const hips = this.provider.getBone('hips');
    if (hips) hips.position.set(0, 0.98, 0);
  }

  getBoneNode(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.provider.getBone(name as HumanoidBoneName);
  }

  isVRM(): boolean {
    return false;
  }
}
