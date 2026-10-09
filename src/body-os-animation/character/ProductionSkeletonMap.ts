import * as THREE from 'three';
import type { HumanoidBoneName } from '../core/types.js';

/**
 * Health OS Production Skeleton Map — Stage 4: Production Asset Integration
 *
 * Adapter between the frozen Production V1 authoring skeleton
 * (`male-athletic.ExportRig`, Blender `DEF-*` deform bones, see
 * `3d-assets-source/male-athletic-production-v1/production-v1/manifests/skeleton-map.json`)
 * and the Health OS canonical skeleton (`HumanoidBoneName`).
 *
 * Architecture (unchanged):
 *   Character asset → SkeletonMap → canonical skeleton → Motion/Equipment/Muscle/Form
 *
 * Exercise code must use canonical bone names only. Production `DEF-*` names
 * appear exclusively in this adapter module.
 */

export const PRODUCTION_ARMATURE = 'male-athletic.ExportRig';

/**
 * Production DEF deform bone → canonical Health OS bone.
 * Source: manifests/skeleton-map.json `humanoid` section.
 */
export const PRODUCTION_DEF_TO_CANONICAL: Record<string, HumanoidBoneName> = {
  // Torso chain
  'DEF-spine': 'hips',
  'DEF-spine.001': 'spine',
  'DEF-spine.003': 'chest',
  'DEF-spine.004': 'upperChest',
  'DEF-spine.005': 'neck',
  'DEF-spine.006': 'head',
  // Legs
  'DEF-thigh.L': 'leftUpperLeg',
  'DEF-shin.L': 'leftLowerLeg',
  'DEF-foot.L': 'leftFoot',
  'DEF-toe.L': 'leftToes',
  'DEF-thigh.R': 'rightUpperLeg',
  'DEF-shin.R': 'rightLowerLeg',
  'DEF-foot.R': 'rightFoot',
  'DEF-toe.R': 'rightToes',
  // Arms
  'DEF-shoulder.L': 'leftShoulder',
  'DEF-upper_arm.L': 'leftUpperArm',
  'DEF-forearm.L': 'leftLowerArm',
  'DEF-hand.L': 'leftHand',
  'DEF-shoulder.R': 'rightShoulder',
  'DEF-upper_arm.R': 'rightUpperArm',
  'DEF-forearm.R': 'rightLowerArm',
  'DEF-hand.R': 'rightHand',
};

/**
 * Resolves a production authoring bone name to its canonical Health OS bone.
 * Returns null for intentionally unmapped bones (twist segments, helpers,
 * face-detail DEFs — see skeleton-map.json `unmapped_deform_bones`).
 */
export function resolveProductionBoneDef(defName: string): HumanoidBoneName | null {
  return PRODUCTION_DEF_TO_CANONICAL[defName] ?? null;
}

/**
 * Finds a production bone node inside a loaded character scene by its
 * authoring (`DEF-*`) name. Matches exact names and common export
 * variants (armature-prefixed or namespaced suffixes).
 */
export function findProductionBoneNode(root: THREE.Object3D, defName: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (found) return;
    if (child.name === defName || child.name.endsWith(`:${defName}`) || child.name.endsWith(`_${defName}`)) {
      found = child;
    }
  });
  return found;
}

/**
 * Production character anchors (authoring side).
 * Source: manifests/anchors.json. Each entry maps a semantic anchor to the
 * production bone it is parented to. Runtime grip/attachment code resolves
 * these through the canonical skeleton — never by hard-coding DEF names.
 */
export const PRODUCTION_CHARACTER_ANCHORS: Record<string, HumanoidBoneName> = {
  BODYOS_HandGrip_L: 'leftHand',
  BODYOS_HandGrip_R: 'rightHand',
  BODYOS_ChestAnchor: 'chest',
  BODYOS_PelvisAnchor: 'hips',
  BODYOS_HeadAnchor: 'head',
  BODYOS_FootContact_L: 'leftFoot',
  BODYOS_FootContact_R: 'rightFoot',
  FootContact_L: 'leftFoot',
  FootContact_R: 'rightFoot',
  Heel_L: 'leftFoot',
  Heel_R: 'rightFoot',
  Toe_L: 'leftToes',
  Toe_R: 'rightToes',
};
