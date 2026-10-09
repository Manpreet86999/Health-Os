import * as THREE from 'three';
import { findProductionBoneNode } from './ProductionSkeletonMap.js';

/**
 * Health OS Production Grip Presets — Stage 4: Production Asset Integration
 *
 * Semantic finger-grip poses authored on the Production V1 ExportRig
 * (`DEF-*` finger bones, radians, local XYZ).
 * Source: `3d-assets-source/male-athletic-production-v1/production-v1/manifests/grip-presets.json`
 *
 * Exercise code requests a semantic grip (`BARBELL_GRIP` / `DUMBBELL_GRIP`);
 * the per-finger rotations live only in this module. Application is
 * exercise-independent: it poses whatever production-derived hand rig is
 * bound, and degrades gracefully (0 bones posed) on the procedural
 * fallback rig, which has no `DEF-*` finger bones.
 */

export type GripPresetName = 'DUMBBELL_GRIP' | 'BARBELL_GRIP';

type EulerXYZ = [number, number, number];

const DUMBBELL_GRIP: Record<string, EulerXYZ> = {
  'DEF-thumb.01.L': [0.35, 0.0, -0.55],
  'DEF-thumb.01.R': [0.35, 0.0, 0.55],
  'DEF-thumb.02.L': [0.75, 0.0, 0.0],
  'DEF-thumb.02.R': [0.75, 0.0, 0.0],
  'DEF-thumb.03.L': [0.55, 0.0, 0.0],
  'DEF-thumb.03.R': [0.55, 0.0, 0.0],
  'DEF-f_index.01.L': [1.25, 0.0, 0.0],
  'DEF-f_index.01.R': [1.25, 0.0, 0.0],
  'DEF-f_index.02.L': [1.45, 0.0, 0.0],
  'DEF-f_index.02.R': [1.45, 0.0, 0.0],
  'DEF-f_index.03.L': [0.85, 0.0, 0.0],
  'DEF-f_index.03.R': [0.85, 0.0, 0.0],
  'DEF-f_middle.01.L': [1.3, 0.0, 0.0],
  'DEF-f_middle.01.R': [1.3, 0.0, 0.0],
  'DEF-f_middle.02.L': [1.5, 0.0, 0.0],
  'DEF-f_middle.02.R': [1.5, 0.0, 0.0],
  'DEF-f_middle.03.L': [0.85, 0.0, 0.0],
  'DEF-f_middle.03.R': [0.85, 0.0, 0.0],
  'DEF-f_ring.01.L': [1.3, 0.0, 0.0],
  'DEF-f_ring.01.R': [1.3, 0.0, 0.0],
  'DEF-f_ring.02.L': [1.5, 0.0, 0.0],
  'DEF-f_ring.02.R': [1.5, 0.0, 0.0],
  'DEF-f_ring.03.L': [0.85, 0.0, 0.0],
  'DEF-f_ring.03.R': [0.85, 0.0, 0.0],
  'DEF-f_pinky.01.L': [1.35, 0.0, 0.0],
  'DEF-f_pinky.01.R': [1.35, 0.0, 0.0],
  'DEF-f_pinky.02.L': [1.55, 0.0, 0.0],
  'DEF-f_pinky.02.R': [1.55, 0.0, 0.0],
  'DEF-f_pinky.03.L': [0.9, 0.0, 0.0],
  'DEF-f_pinky.03.R': [0.9, 0.0, 0.0],
};

const BARBELL_GRIP: Record<string, EulerXYZ> = {
  'DEF-thumb.01.L': [0.375, 0.0, -0.55],
  'DEF-thumb.01.R': [0.375, 0.0, 0.55],
  'DEF-thumb.02.L': [0.8036, 0.0, 0.0],
  'DEF-thumb.02.R': [0.8036, 0.0, 0.0],
  'DEF-thumb.03.L': [0.5893, 0.0, 0.0],
  'DEF-thumb.03.R': [0.5893, 0.0, 0.0],
  'DEF-f_index.01.L': [1.3393, 0.0, 0.0],
  'DEF-f_index.01.R': [1.3393, 0.0, 0.0],
  'DEF-f_index.02.L': [1.5536, 0.0, 0.0],
  'DEF-f_index.02.R': [1.5536, 0.0, 0.0],
  'DEF-f_index.03.L': [0.9107, 0.0, 0.0],
  'DEF-f_index.03.R': [0.9107, 0.0, 0.0],
  'DEF-f_middle.01.L': [1.3929, 0.0, 0.0],
  'DEF-f_middle.01.R': [1.3929, 0.0, 0.0],
  'DEF-f_middle.02.L': [1.6071, 0.0, 0.0],
  'DEF-f_middle.02.R': [1.6071, 0.0, 0.0],
  'DEF-f_middle.03.L': [0.9107, 0.0, 0.0],
  'DEF-f_middle.03.R': [0.9107, 0.0, 0.0],
  'DEF-f_ring.01.L': [1.3929, 0.0, 0.0],
  'DEF-f_ring.01.R': [1.3929, 0.0, 0.0],
  'DEF-f_ring.02.L': [1.6071, 0.0, 0.0],
  'DEF-f_ring.02.R': [1.6071, 0.0, 0.0],
  'DEF-f_ring.03.L': [0.9107, 0.0, 0.0],
  'DEF-f_ring.03.R': [0.9107, 0.0, 0.0],
  'DEF-f_pinky.01.L': [1.4464, 0.0, 0.0],
  'DEF-f_pinky.01.R': [1.4464, 0.0, 0.0],
  'DEF-f_pinky.02.L': [1.65, 0.0, 0.0],
  'DEF-f_pinky.02.R': [1.65, 0.0, 0.0],
  'DEF-f_pinky.03.L': [0.9643, 0.0, 0.0],
  'DEF-f_pinky.03.R': [0.9643, 0.0, 0.0],
};

export const GRIP_PRESETS: Record<GripPresetName, Record<string, EulerXYZ>> = {
  DUMBBELL_GRIP,
  BARBELL_GRIP,
};

/** All production finger bones covered by either grip preset. */
export const GRIP_BONE_NAMES: readonly string[] = Object.freeze(Object.keys(DUMBBELL_GRIP));

/**
 * Applies a semantic grip preset to a bound character scene.
 * Resolves each authored `DEF-*` finger bone through the production
 * skeleton adapter. Returns the number of bones posed (0 when the bound
 * rig has no production finger bones, e.g. the procedural fallback rig).
 */
export function applyGripPreset(characterRoot: THREE.Object3D, preset: GripPresetName): number {
  const table = GRIP_PRESETS[preset];
  if (!table) return 0;
  let applied = 0;
  for (const [defName, euler] of Object.entries(table)) {
    const node = findProductionBoneNode(characterRoot, defName);
    if (!node) continue;
    node.rotation.set(euler[0], euler[1], euler[2]);
    applied += 1;
  }
  return applied;
}

/**
 * Stage 5: releases a previously applied grip, restoring neutral (open)
 * finger rotations. Returns the number of bones reset (0 on rigs without
 * production finger bones). Prevents stale grips persisting across
 * exercise switches (e.g. curl → squat).
 */
export function clearGripPreset(characterRoot: THREE.Object3D): number {
  let cleared = 0;
  for (const defName of GRIP_BONE_NAMES) {
    const node = findProductionBoneNode(characterRoot, defName);
    if (!node) continue;
    node.rotation.set(0, 0, 0);
    cleared += 1;
  }
  return cleared;
}
