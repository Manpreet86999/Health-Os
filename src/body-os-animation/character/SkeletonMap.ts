import type { HumanoidBoneName } from '../core/types.js';

/**
 * Standard VRM 1.0 Humanoid Skeleton Bone Names & Aliases
 */
export const VRM_HUMANOID_BONES: HumanoidBoneName[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
];

/**
 * Common Blender / Mixamo / standard rig naming fallbacks
 */
export const BONE_NAME_ALIASES: Record<HumanoidBoneName, string[]> = {
  hips: ['hips', 'pelvis', 'root_motion', 'bip01_pelvis'],
  spine: ['spine', 'spine1', 'lower_spine'],
  chest: ['chest', 'spine2', 'middle_spine'],
  upperChest: ['upperchest', 'upper_chest', 'spine3'],
  neck: ['neck', 'neck1'],
  head: ['head'],
  leftShoulder: ['leftshoulder', 'shoulder_l', 'l_shoulder', 'clavicle_l'],
  leftUpperArm: ['leftupperarm', 'upper_arm_l', 'l_upperarm', 'arm_l'],
  leftLowerArm: ['leftlowerarm', 'lower_arm_l', 'l_forearm', 'forearm_l'],
  leftHand: ['lefthand', 'hand_l', 'l_hand', 'wrist_l'],
  rightShoulder: ['rightshoulder', 'shoulder_r', 'r_shoulder', 'clavicle_r'],
  rightUpperArm: ['rightupperarm', 'upper_arm_r', 'r_upperarm', 'arm_r'],
  rightLowerArm: ['rightlowerarm', 'lower_arm_r', 'r_forearm', 'forearm_r'],
  rightHand: ['righthand', 'hand_r', 'r_hand', 'wrist_r'],
  leftUpperLeg: ['leftupperleg', 'upper_leg_l', 'l_thigh', 'thigh_l'],
  leftLowerLeg: ['leftlowerleg', 'lower_leg_l', 'l_calf', 'calf_l'],
  leftFoot: ['leftfoot', 'foot_l', 'l_foot', 'ankle_l'],
  leftToes: ['lefttoes', 'toes_l', 'l_toe', 'toe_l'],
  rightUpperLeg: ['rightupperleg', 'upper_leg_r', 'r_thigh', 'thigh_r'],
  rightLowerLeg: ['rightlowerleg', 'lower_leg_r', 'r_calf', 'calf_r'],
  rightFoot: ['rightfoot', 'foot_r', 'r_foot', 'ankle_r'],
  rightToes: ['righttoes', 'toes_r', 'r_toe', 'toe_r'],
};

export function matchHumanoidBone(name: string): HumanoidBoneName | null {
  const clean = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
  for (const [bone, aliases] of Object.entries(BONE_NAME_ALIASES)) {
    if (bone.toLowerCase() === clean) return bone as HumanoidBoneName;
    for (const alias of aliases) {
      if (clean.includes(alias)) return bone as HumanoidBoneName;
    }
  }
  return null;
}
