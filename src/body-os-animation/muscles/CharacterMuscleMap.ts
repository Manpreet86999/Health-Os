/**
 * Health OS Character Muscle Map Abstraction
 * Decouples canonical muscle IDs from asset-specific 3D meshes, materials, and vertex masks.
 * Enables zero-code replacement of character assets (e.g. replacing male-athletic.vrm with
 * a future high-definition character).
 */

import type { CanonicalMuscleId, HumanoidBoneName, MuscleSide } from '../core/types.js';
import { normalizeMuscleId } from './MuscleRegistry.js';

export type MuscleTargetType = 'mesh' | 'material-slot' | 'vertex-group' | 'shader-mask' | 'overlay';

export interface ProductionVertexGroup {
  group: string;
  regionIndex: number;
  side: MuscleSide;
}

export interface MuscleTargetDescriptor {
  muscleId: CanonicalMuscleId;
  targetType: MuscleTargetType;
  meshNames: string[];
  materialNames?: string[];
  boneAttachment?: HumanoidBoneName;
  bilateralSplit?: {
    leftMesh?: string;
    rightMesh?: string;
  };
  /**
   * Stage 4: Production V1 vertex-group regions on the production Body mesh
   * (`bodyos.region.<muscle>.<side>`). Additive metadata — mesh targets for
   * the procedural fallback rig are preserved alongside.
   */
  vertexGroups?: ProductionVertexGroup[];
  /** Production mesh target id (e.g. `bodyos.character.male-athletic.body`). */
  productionTarget?: string;
}

/**
 * Character-specific mapping registries.
 * New production characters register their internal mesh/material mappings here.
 */
export const CHARACTER_MUSCLE_MAPS: Record<string, Partial<Record<CanonicalMuscleId, MuscleTargetDescriptor>>> = {
  'male-athletic': {
    'pectoralis-major': {
      muscleId: 'pectoralis-major',
      targetType: 'mesh',
      meshNames: ['muscle_pectoralis_left', 'muscle_pectoralis_right'],
      boneAttachment: 'chest',
      bilateralSplit: { leftMesh: 'muscle_pectoralis_left', rightMesh: 'muscle_pectoralis_right' },
    },
    'deltoid': {
      muscleId: 'deltoid',
      targetType: 'mesh',
      meshNames: ['muscle_deltoid_left', 'muscle_deltoid_right'],
      boneAttachment: 'leftShoulder',
      bilateralSplit: { leftMesh: 'muscle_deltoid_left', rightMesh: 'muscle_deltoid_right' },
    },
    'biceps': {
      muscleId: 'biceps',
      targetType: 'mesh',
      meshNames: ['muscle_biceps_left', 'muscle_biceps_right'],
      boneAttachment: 'leftUpperArm',
      bilateralSplit: { leftMesh: 'muscle_biceps_left', rightMesh: 'muscle_biceps_right' },
    },
    'triceps': {
      muscleId: 'triceps',
      targetType: 'mesh',
      meshNames: ['muscle_triceps_left', 'muscle_triceps_right'],
      boneAttachment: 'leftUpperArm',
      bilateralSplit: { leftMesh: 'muscle_triceps_left', rightMesh: 'muscle_triceps_right' },
    },
    'forearms': {
      muscleId: 'forearms',
      targetType: 'mesh',
      meshNames: ['muscle_forearms_left', 'muscle_forearms_right'],
      boneAttachment: 'leftLowerArm',
      bilateralSplit: { leftMesh: 'muscle_forearms_left', rightMesh: 'muscle_forearms_right' },
    },
    'latissimus-dorsi': {
      muscleId: 'latissimus-dorsi',
      targetType: 'mesh',
      meshNames: ['muscle_lats_left', 'muscle_lats_right'],
      boneAttachment: 'spine',
      bilateralSplit: { leftMesh: 'muscle_lats_left', rightMesh: 'muscle_lats_right' },
    },
    'trapezius': {
      muscleId: 'trapezius',
      targetType: 'mesh',
      meshNames: ['muscle_trapezius_left', 'muscle_trapezius_right'],
      boneAttachment: 'upperChest',
      bilateralSplit: { leftMesh: 'muscle_trapezius_left', rightMesh: 'muscle_trapezius_right' },
    },
    'rectus-abdominis': {
      muscleId: 'rectus-abdominis',
      targetType: 'mesh',
      meshNames: ['muscle_rectus_abdominis'],
      boneAttachment: 'spine',
    },
    'obliques': {
      muscleId: 'obliques',
      targetType: 'mesh',
      meshNames: ['muscle_obliques_left', 'muscle_obliques_right'],
      boneAttachment: 'hips',
      bilateralSplit: { leftMesh: 'muscle_obliques_left', rightMesh: 'muscle_obliques_right' },
    },
    'erector-spinae': {
      muscleId: 'erector-spinae',
      targetType: 'mesh',
      meshNames: ['muscle_erector_spinae_left', 'muscle_erector_spinae_right'],
      boneAttachment: 'spine',
      bilateralSplit: { leftMesh: 'muscle_erector_spinae_left', rightMesh: 'muscle_erector_spinae_right' },
    },
    'gluteus-maximus': {
      muscleId: 'gluteus-maximus',
      targetType: 'mesh',
      meshNames: ['muscle_glute_left', 'muscle_glute_right'],
      boneAttachment: 'hips',
      bilateralSplit: { leftMesh: 'muscle_glute_left', rightMesh: 'muscle_glute_right' },
    },
    'quadriceps': {
      muscleId: 'quadriceps',
      targetType: 'mesh',
      meshNames: ['muscle_quads_left', 'muscle_quads_right'],
      boneAttachment: 'leftUpperLeg',
      bilateralSplit: { leftMesh: 'muscle_quads_left', rightMesh: 'muscle_quads_right' },
    },
    'hamstrings': {
      muscleId: 'hamstrings',
      targetType: 'mesh',
      meshNames: ['muscle_hamstrings_left', 'muscle_hamstrings_right'],
      boneAttachment: 'leftUpperLeg',
      bilateralSplit: { leftMesh: 'muscle_hamstrings_left', rightMesh: 'muscle_hamstrings_right' },
    },
    'adductors': {
      muscleId: 'adductors',
      targetType: 'mesh',
      meshNames: ['muscle_adductors_left', 'muscle_adductors_right'],
      boneAttachment: 'leftUpperLeg',
      bilateralSplit: { leftMesh: 'muscle_adductors_left', rightMesh: 'muscle_adductors_right' },
    },
    'calves': {
      muscleId: 'calves',
      targetType: 'mesh',
      meshNames: ['muscle_calves_left', 'muscle_calves_right'],
      boneAttachment: 'leftLowerLeg',
      bilateralSplit: { leftMesh: 'muscle_calves_left', rightMesh: 'muscle_calves_right' },
    },
  },
};

/**
 * Registers an asset-specific muscle map for any character ID.
 */
export function registerCharacterMuscleMap(
  characterId: string,
  map: Partial<Record<CanonicalMuscleId, MuscleTargetDescriptor>>
): void {
  CHARACTER_MUSCLE_MAPS[characterId] = {
    ...(CHARACTER_MUSCLE_MAPS[characterId] || {}),
    ...map,
  };
}

/**
 * Retrieves the muscle target descriptor for a given character and canonical muscle.
 * If the character has no explicit mapping, generates an automatic fallback descriptor.
 */
export function getMuscleTarget(
  characterId: string,
  rawMuscleId: string
): MuscleTargetDescriptor {
  const canonicalId = normalizeMuscleId(rawMuscleId);
  const characterMap = CHARACTER_MUSCLE_MAPS[characterId];

  if (characterMap && characterMap[canonicalId]) {
    return characterMap[canonicalId]!;
  }

  // Fallback descriptor for future characters without pre-registered maps:
  // Dynamically uses conventional naming patterns: muscle_<id>_left, muscle_<id>_right
  const cleanId = canonicalId.replace(/-/g, '_');
  return {
    muscleId: canonicalId,
    targetType: 'mesh',
    meshNames: [`muscle_${cleanId}_left`, `muscle_${cleanId}_right`, `muscle_${cleanId}`],
    bilateralSplit: {
      leftMesh: `muscle_${cleanId}_left`,
      rightMesh: `muscle_${cleanId}_right`,
    },
  };
}
