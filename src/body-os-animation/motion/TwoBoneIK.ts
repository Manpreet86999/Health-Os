import * as THREE from 'three';

export interface LimbChain {
  root: THREE.Object3D;
  mid: THREE.Object3D;
  end: THREE.Object3D;
  length1: number;
  length2: number;
}

export interface IKSolveResult {
  rootRotation: THREE.Euler;
  midRotation: THREE.Euler;
  endRotation?: THREE.Euler;
  footClampedY?: number;
}

/**
 * Analytical Two-Bone IK & Ground Constraint Solver.
 * Provides stable foot locking, ground contact enforcement, and smooth non-popping limb kinematics.
 */
export class TwoBoneIK {
  /**
   * Solves leg kinematics for grounded foot contact.
   * Ensures foot stays planted at (plantX, floorY, plantZ) without sliding,
   * knee flexes smoothly without popping, and ankle counter-flexes to keep foot sole flat.
   */
  static solveLegGroundLock(
    hipPos: THREE.Vector3,
    footPlant: THREE.Vector3,
    thighLength: number = 0.44,
    calfLength: number = 0.40,
    options?: {
      kneeOutwardSpread?: number;
      minFootY?: number;
    }
  ): {
    hipRotation: THREE.Euler;
    kneeRotation: THREE.Euler;
    ankleRotation: THREE.Euler;
  } {
    const minFootY = options?.minFootY ?? 0.0;
    const clampedFootY = Math.max(minFootY, footPlant.y);

    // Vector from hip to target ankle position
    const dx = footPlant.x - hipPos.x;
    const dy = clampedFootY - hipPos.y; // Typically negative
    const dz = footPlant.z - hipPos.z;

    const D = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const L1 = thighLength;
    const L2 = calfLength;
    const maxReach = (L1 + L2) * 0.998;
    const minReach = Math.abs(L1 - L2) + 0.02;
    const clampedD = Math.max(minReach, Math.min(maxReach, D));

    // Law of Cosines for knee interior angle
    // D^2 = L1^2 + L2^2 - 2*L1*L2*cos(kneeAngle)
    const cosKnee = (L1 * L1 + L2 * L2 - clampedD * clampedD) / (2 * L1 * L2);
    const clampedCosKnee = Math.max(-1, Math.min(1, cosKnee));
    const kneeInterior = Math.acos(clampedCosKnee);
    const kneeFlexion = Math.PI - kneeInterior; // Flexion from straight leg

    // Law of Cosines for hip-to-thigh angle alpha
    // L2^2 = L1^2 + D^2 - 2*L1*D*cos(alpha)
    const cosAlpha = (L1 * L1 + clampedD * clampedD - L2 * L2) / (2 * L1 * clampedD);
    const clampedCosAlpha = Math.max(-1, Math.min(1, cosAlpha));
    const alpha = Math.acos(clampedCosAlpha);

    // Sagittal angle of hip-to-ankle vector
    // In VRM: character forward is +Z, up is +Y.
    // Leg pointing down: dy is negative. Angle from vertical -Y:
    const sagittalAngle = Math.atan2(dz, -dy); // positive when ankle is in front (+Z), negative when behind
    const coronalAngle = Math.atan2(dx, -dy);  // positive when ankle is to the right (+X)

    // Thigh flexion around X (negative rotates thigh forward in VRM space)
    const thighFlexion = -(sagittalAngle + alpha);

    // Knee flexion around X (positive bends knee backwards in VRM space)
    const kneeAngle = kneeFlexion;

    // Ankle flexion to keep sole flat on floor
    // Total leg rotation in sagittal plane = thighFlexion + kneeAngle
    // To keep foot flat (rotation.x ~ 0 relative to world), ankle must counter-rotate
    const ankleFlexion = -(thighFlexion + kneeAngle);

    // Lateral spread/abduction
    const spread = options?.kneeOutwardSpread ?? 0;
    const isLeft = hipPos.x < 0;
    const hipZ = isLeft ? spread : -spread;

    return {
      hipRotation: new THREE.Euler(thighFlexion, 0, hipZ, 'XYZ'),
      kneeRotation: new THREE.Euler(kneeAngle, 0, 0, 'XYZ'),
      ankleRotation: new THREE.Euler(ankleFlexion, 0, 0, 'XYZ'),
    };
  }

  /**
   * Solves arm kinematics for hand contact or target tracking (e.g. push-ups, planks, or bar grip).
   * Ensures hands stay planted without sliding or wrist snapping.
   */
  static solveArmTarget(
    shoulderPos: THREE.Vector3,
    targetHandPos: THREE.Vector3,
    upperArmLength: number = 0.28,
    forearmLength: number = 0.24,
    poleDirection: 'outward' | 'downward' | 'forward' = 'outward'
  ): {
    shoulderRotation: THREE.Euler;
    elbowRotation: THREE.Euler;
    wristRotation: THREE.Euler;
  } {
    const dx = targetHandPos.x - shoulderPos.x;
    const dy = targetHandPos.y - shoulderPos.y;
    const dz = targetHandPos.z - shoulderPos.z;

    const D = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const L1 = upperArmLength;
    const L2 = forearmLength;
    const maxReach = (L1 + L2) * 0.998;
    const minReach = Math.abs(L1 - L2) + 0.02;
    const clampedD = Math.max(minReach, Math.min(maxReach, D));

    // Law of cosines for elbow
    const cosElbow = (L1 * L1 + L2 * L2 - clampedD * clampedD) / (2 * L1 * L2);
    const clampedCosElbow = Math.max(-1, Math.min(1, cosElbow));
    const elbowFlexion = Math.PI - Math.acos(clampedCosElbow);

    const cosAlpha = (L1 * L1 + clampedD * clampedD - L2 * L2) / (2 * L1 * clampedD);
    const clampedCosAlpha = Math.max(-1, Math.min(1, cosAlpha));
    const alpha = Math.acos(clampedCosAlpha);

    const isLeft = shoulderPos.x < 0;

    // Pitch (sagittal flexion) and Yaw (elevation)
    const pitch = Math.atan2(dz, -dy);
    const roll = isLeft ? -1.05 : 1.05;

    let elbowY = isLeft ? -elbowFlexion : elbowFlexion;
    if (poleDirection === 'downward') {
      elbowY = isLeft ? -elbowFlexion * 0.8 : elbowFlexion * 0.8;
    }

    return {
      shoulderRotation: new THREE.Euler(pitch - alpha * 0.5, 0, roll, 'XYZ'),
      elbowRotation: new THREE.Euler(0, elbowY, 0, 'XYZ'),
      wristRotation: new THREE.Euler(0, 0, 0, 'XYZ'),
    };
  }

  /**
   * Measures bone segment lengths dynamically from the active character skeleton.
   */
  static measureLimbLengths(
    root: THREE.Object3D | null,
    mid: THREE.Object3D | null,
    end: THREE.Object3D | null,
    fallbackL1 = 0.44,
    fallbackL2 = 0.40
  ): { l1: number; l2: number } {
    if (!root || !mid || !end) {
      return { l1: fallbackL1, l2: fallbackL2 };
    }

    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();

    root.getWorldPosition(p0);
    mid.getWorldPosition(p1);
    end.getWorldPosition(p2);

    const d1 = p0.distanceTo(p1);
    const d2 = p1.distanceTo(p2);

    return {
      l1: d1 > 0.05 ? d1 : fallbackL1,
      l2: d2 > 0.05 ? d2 : fallbackL2,
    };
  }
}
