/**
 * @deprecated Motion V1 legacy. Superseded by Motion V2
 * (`BodyOSMotionClip` + `MotionPlayer` + `HumanoidApplicator`, which write
 * rest-relative normalized poses via `vrm.humanoid.setNormalizedPose()`).
 * Retained only because `MotionController` (V1 procedural path) and legacy
 * tests still reference it. Do NOT use in any V2 execution path. New code
 * must source rest from `humanoid.normalizedRestPose`, never live-sampled
 * calibration.
 *
 * Health OS Production Retargeting Layer — Stage 5.1
 *
 * Root cause (Phase A):
 *   MotionController.applyProceduralMotion() wrote absolute local Eulers:
 *     bone.rotation.set(x, y, z)
 *   Those Eulers were authored against the procedural fallback rig, whose
 *   rest pose is identity on every joint (limbs along -Y, abduction = Z).
 *
 *   The Production V1 VRM (male-athletic.ExportRig, Blender DEF-* bones
 *   exposed through VRM humanoid normalized nodes) does NOT rest at
 *   identity. Authored A-pose + Blender bone rolls + VRM T-pose
 *   normalization mean e.g.:
 *     - upperArm rest quaternion != identity
 *     - forearm hinge axis != local Y
 *     - thigh flexion axis != local X
 *     - shoulder/clavicle rest carries A-pose abduction
 *   Overwriting .rotation therefore discards the rest orientation and maps
 *   canonical abduction/flexion onto the wrong local axes — arms cross the
 *   pelvis, curls swing the upper arm, squat counterbalance deforms, plank
 *   and bench chains collapse.
 *
 * Shared fix (Phase B):
 *   runtimeLocal = productionRestLocal × (restWorld⁻¹ × worldDelta × restWorld)
 *
 *   Canonical motion deltas are expressed as WORLD-space anatomical rotations
 *   (Euler XYZ: X = sagittal flexion/extension, Z = coronal abduction/
 *   adduction) and mapped into each bone's rest frame by similarity
 *   transform. Consequences:
 *   - On identity-rest rigs (fallback / mock) restWorld = identity, so this
 *     reduces exactly to the old bone.rotation.set() behaviour — existing
 *     numerical tests keep passing bit-identically.
 *   - On Production V1 VRM (authored A-pose + Blender rolls + VRM
 *     normalization), a canonical abduction still moves the limb in
 *     the world coronal plane instead of spinning about a rolled local axis.
 *   - Exercise code MUST NOT hard-code Blender DEF names; it uses canonical
 *     HumanoidBoneName IDs via SkeletonMap / ProductionSkeletonMap.
 */

import * as THREE from 'three';
import type { HumanoidBoneName } from '../core/types.js';
import type { CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';

const _eulerQuat = new THREE.Quaternion();
const _composed = new THREE.Quaternion();
const _localDelta = new THREE.Quaternion();
const _restWorldInv = new THREE.Quaternion();
const _euler = new THREE.Euler();

export interface ProductionRestRecord {
  /** Rest local quaternion captured at bind time (identity on fallback rig). */
  rest: THREE.Quaternion;
  /** Rest WORLD quaternion captured at bind time (maps local↔world). */
  restWorld: THREE.Quaternion;
  /** Rest local position (used for diagnostics only; positions stay absolute). */
  restPosition: THREE.Vector3;
  /** Parent canonical bone name, or null for hips root. */
  parent: HumanoidBoneName | null;
  /** World-space rest direction of the bone's -Y axis (limb direction). */
  worldRestDir: THREE.Vector3;
}

const CANONICAL_PARENTS: Record<HumanoidBoneName, HumanoidBoneName | null> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  upperChest: 'chest',
  neck: 'upperChest',
  head: 'neck',
  leftShoulder: 'upperChest',
  leftUpperArm: 'leftShoulder',
  leftLowerArm: 'leftUpperArm',
  leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest',
  rightUpperArm: 'rightShoulder',
  rightLowerArm: 'rightUpperArm',
  rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  leftFoot: 'leftLowerLeg',
  leftToes: 'leftFoot',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
  rightFoot: 'rightLowerLeg',
  rightToes: 'rightFoot',
};

/** Canonical Health OS expected world rest directions (standing A-pose). */
export const CANONICAL_EXPECTED_DIRS: Record<HumanoidBoneName, THREE.Vector3> = {
  hips: new THREE.Vector3(0, 1, 0),
  spine: new THREE.Vector3(0, 1, 0),
  chest: new THREE.Vector3(0, 1, 0),
  upperChest: new THREE.Vector3(0, 1, 0),
  neck: new THREE.Vector3(0, 1, 0),
  head: new THREE.Vector3(0, 1, 0),
  leftShoulder: new THREE.Vector3(-1, 0.15, 0),
  leftUpperArm: new THREE.Vector3(-0.18, -1, 0).normalize(),
  leftLowerArm: new THREE.Vector3(0, -1, 0),
  leftHand: new THREE.Vector3(0, -1, 0),
  rightShoulder: new THREE.Vector3(1, 0.15, 0),
  rightUpperArm: new THREE.Vector3(0.18, -1, 0).normalize(),
  rightLowerArm: new THREE.Vector3(0, -1, 0),
  rightHand: new THREE.Vector3(0, -1, 0),
  leftUpperLeg: new THREE.Vector3(0, -1, 0),
  leftLowerLeg: new THREE.Vector3(0, -1, 0),
  leftFoot: new THREE.Vector3(0, -0.15, 1).normalize(),
  leftToes: new THREE.Vector3(0, 0, 1),
  rightUpperLeg: new THREE.Vector3(0, -1, 0),
  rightLowerLeg: new THREE.Vector3(0, -1, 0),
  rightFoot: new THREE.Vector3(0, -0.15, 1).normalize(),
  rightToes: new THREE.Vector3(0, 0, 1),
};

/**
 * Per-character calibration store. Keyed by provider instance; holds the
 * production rest quaternion for every canonical bone.
 */
export class ProductionRetarget {
  private rests = new Map<HumanoidBoneName, ProductionRestRecord>();
  private calibratedFor: CharacterSkeletonProvider | null = null;
  private restCaptured = false;

  /** Capture rest pose from the live skeleton. Idempotent per provider. */
  calibrate(character: CharacterSkeletonProvider): void {
    if (this.calibratedFor === character && this.restCaptured) return;
    this.rests.clear();
    this.calibratedFor = character;
    character.getRoot().updateMatrixWorld(true);
    const boneNames = Object.keys(CANONICAL_PARENTS) as HumanoidBoneName[];
    for (const name of boneNames) {
      const bone = character.getBone(name);
      if (!bone) continue;
      const rest = bone.quaternion.clone();
      const restPosition = bone.position.clone();
      const restWorld = bone.getWorldQuaternion(new THREE.Quaternion());
      // World-space rest direction: bone-local -Y in world (limb direction).
      const dir = new THREE.Vector3(0, -1, 0)
        .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      // For spine-chain bones the limb axis is +Y; flip for readability.
      if (['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'].includes(name)) {
        dir.negate();
      }
      this.rests.set(name, {
        rest,
        restWorld,
        restPosition,
        parent: CANONICAL_PARENTS[name] ?? null,
        worldRestDir: dir.clone(),
      });
    }
    this.restCaptured = true;
  }

  /** Force recalibration (e.g. character swap). */
  invalidate(): void {
    this.restCaptured = false;
    this.calibratedFor = null;
    this.rests.clear();
  }

  isCalibrated(): boolean {
    return this.restCaptured;
  }

  getRest(name: HumanoidBoneName): ProductionRestRecord | null {
    return this.rests.get(name) ?? null;
  }

  getAllRests(): ReadonlyMap<HumanoidBoneName, ProductionRestRecord> {
    return this.rests;
  }

  /**
   * Core retarget: bone.quaternion = rest × (restWorld⁻¹ × worldDelta × restWorld).
   * The canonical (x, y, z) Euler is interpreted as a WORLD-space anatomical
   * rotation (X = sagittal flexion, Z = coronal abduction). Identity rests
   * collapse the similarity to identity, reproducing legacy local Eulers.
   */
  setCanonicalEuler(
    character: CharacterSkeletonProvider,
    name: HumanoidBoneName,
    x: number,
    y: number,
    z: number,
    order: THREE.EulerOrder = 'XYZ'
  ): void {
    const bone = character.getBone(name);
    if (!bone) return;
    this.calibrate(character);
    const record = this.rests.get(name);
    _euler.set(x, y, z, order);
    _eulerQuat.setFromEuler(_euler);
    if (!record) {
      bone.quaternion.copy(_eulerQuat);
      return;
    }
    // worldDelta → rest-frame local delta by similarity transform.
    _restWorldInv.copy(record.restWorld).invert();
    _localDelta.copy(_restWorldInv).multiply(_eulerQuat).multiply(record.restWorld);
    _composed.copy(record.rest).multiply(_localDelta);
    bone.quaternion.copy(_composed);
  }

  /** Apply a canonical Euler object as a delta (e.g. TwoBoneIK output). */
  setCanonicalEulerObj(
    character: CharacterSkeletonProvider,
    name: HumanoidBoneName,
    euler: THREE.Euler
  ): void {
    this.setCanonicalEuler(character, name, euler.x, euler.y, euler.z, euler.order);
  }

  /** Reset a bone exactly to its captured rest orientation. */
  resetToRest(character: CharacterSkeletonProvider, name: HumanoidBoneName): void {
    const bone = character.getBone(name);
    if (!bone) return;
    this.calibrate(character);
    const record = this.rests.get(name);
    if (record) bone.quaternion.copy(record.rest);
    else bone.quaternion.identity();
  }

  /** Reset every known bone to rest. */
  resetAllToRest(character: CharacterSkeletonProvider): void {
    this.calibrate(character);
    for (const [name] of this.rests) {
      this.resetToRest(character, name);
    }
  }
}

/** Shared singleton used by MotionController (one calibration per character). */
const retargetByCharacter = new WeakMap<CharacterSkeletonProvider, ProductionRetarget>();

export function getRetargetFor(character: CharacterSkeletonProvider): ProductionRetarget {
  let r = retargetByCharacter.get(character);
  if (!r) {
    r = new ProductionRetarget();
    retargetByCharacter.set(character, r);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Calibration / debug poses (Phase C). All operate through the same
// rest × delta path used by exercises. Deterministic, progress-independent.
// ---------------------------------------------------------------------------

export type CalibrationPoseId =
  | 'neutral'
  | 'arms-forward'
  | 'arms-side'
  | 'arms-overhead'
  | 'elbow-flexion-90'
  | 'hip-flexion'
  | 'knee-flexion-90'
  | 'ankle-neutral'
  | 'horizontal-plank';

export const CALIBRATION_POSES: CalibrationPoseId[] = [
  'neutral',
  'arms-forward',
  'arms-side',
  'arms-overhead',
  'elbow-flexion-90',
  'hip-flexion',
  'knee-flexion-90',
  'ankle-neutral',
  'horizontal-plank',
];

/**
 * Canonical deltas for each calibration pose, expressed in fallback-rig
 * joint space. Applied via ProductionRetarget so production axes are
 * honoured. Hips position is handled by the caller (standing vs plank).
 */
export function applyCalibrationPose(
  character: CharacterSkeletonProvider,
  pose: CalibrationPoseId,
  retarget?: ProductionRetarget
): void {
  const rt = retarget ?? getRetargetFor(character);
  rt.calibrate(character);
  const set = (b: HumanoidBoneName, x: number, y: number, z: number) =>
    rt.setCanonicalEuler(character, b, x, y, z);
  const hips = character.getBone('hips');

  // Start from rest everywhere.
  rt.resetAllToRest(character);
  if (hips) hips.position.set(0, 0.98, 0);

  switch (pose) {
    case 'neutral':
      // Canonical A-pose baseline (matches procedural fallback neutral).
      set('leftShoulder', 0, 0, -0.08);
      set('rightShoulder', 0, 0, 0.08);
      set('leftUpperArm', 0.04, 0, -1.05);
      set('rightUpperArm', 0.04, 0, 1.05);
      set('leftLowerArm', 0, -0.08, 0);
      set('rightLowerArm', 0, 0.08, 0);
      break;
    case 'arms-forward':
      // 90° shoulder flexion: arms point forward (+Z).
      set('leftUpperArm', -Math.PI / 2, 0, 0);
      set('rightUpperArm', -Math.PI / 2, 0, 0);
      set('leftLowerArm', 0, 0, 0);
      set('rightLowerArm', 0, 0, 0);
      break;
    case 'arms-side':
      // T-pose: arms abducted to horizontal via canonical deltas.
      // Negative-Z excursion on the left (mirrored right) keeps the arc
      // lateral — same convention as the jumping-jack peak.
      rt.setCanonicalEuler(character, 'leftUpperArm', 0, 0, -1.45);
      rt.setCanonicalEuler(character, 'rightUpperArm', 0, 0, 1.45);
      set('leftLowerArm', 0, 0, 0);
      set('rightLowerArm', 0, 0, 0);
      break;
    case 'arms-overhead':
      // Hands above head: full abduction arc peak (matches jack peak).
      set('leftShoulder', 0, 0, -0.08);
      set('rightShoulder', 0, 0, 0.08);
      set('leftUpperArm', 0, 0, -2.8);
      set('rightUpperArm', 0, 0, 2.8);
      set('leftLowerArm', 0, -0.12, 0);
      set('rightLowerArm', 0, 0.12, 0);
      break;
    case 'elbow-flexion-90':
      set('leftUpperArm', 0.05, 0, -0.15);
      set('rightUpperArm', 0.05, 0, 0.15);
      // 90° hinge about the canonical elbow axis (X): hand swings forward
      // to horizontal. (Flexion about Y would spin the hanging limb in
      // place without lifting the hand.)
      set('leftLowerArm', -Math.PI / 2, 0, 0);
      set('rightLowerArm', -Math.PI / 2, 0, 0);
      break;
    case 'hip-flexion':
      // 90° hip flexion (thigh forward).
      set('leftUpperLeg', -Math.PI / 2, 0, 0);
      set('rightUpperLeg', 0, 0, 0);
      set('leftLowerLeg', 0, 0, 0);
      set('rightLowerLeg', 0, 0, 0);
      break;
    case 'knee-flexion-90':
      set('leftUpperLeg', 0, 0, 0);
      set('leftLowerLeg', Math.PI / 2, 0, 0);
      set('rightUpperLeg', 0, 0, 0);
      set('rightLowerLeg', 0, 0, 0);
      break;
    case 'ankle-neutral':
      set('leftUpperLeg', 0, 0, 0);
      set('leftLowerLeg', 0, 0, 0);
      set('leftFoot', 0, 0, 0);
      set('rightFoot', 0, 0, 0);
      break;
    case 'horizontal-plank':
      // Torso horizontal: hips pitched 90° forward, limbs straight.
      if (hips) {
        rt.setCanonicalEuler(character, 'hips', Math.PI / 2, 0, 0);
        hips.position.set(0, 0.38, 0);
      }
      set('leftUpperLeg', 0, 0, 0.04);
      set('rightUpperLeg', 0, 0, -0.04);
      set('leftLowerLeg', 0, 0, 0);
      set('rightLowerLeg', 0, 0, 0);
      set('leftFoot', 0.7, 0, 0);
      set('rightFoot', 0.7, 0, 0);
      break;
  }
}
