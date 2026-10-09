import * as THREE from 'three';
import type { CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import type { HumanoidBoneName } from '../core/types.js';
import { MotionEvents, type MotionEventTrigger, type RepPhaseName } from './MotionEvents.js';
import { getMotionMetadata } from './MotionRegistry.js';
import { TwoBoneIK } from './TwoBoneIK.js';
import {
  applyCalibrationPose,
  getRetargetFor,
  type CalibrationPoseId,
} from './ProductionRetarget.js';

export interface MotionUpdateResult {
  progress: number;
  currentTime: number;
  loopCount: number;
  currentPhase: RepPhaseName;
}

export class MotionController {
  private exerciseId = 'motion-test-squat';
  private isPlaying = true;
  private duration = 2.4;
  private currentTime = 0;
  private speed = 1.0;
  private loop = true;
  private loopCount = 0;
  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private motionEvents: MotionEvents = new MotionEvents();
  private onTriggerCallback?: (event: MotionEventTrigger, loopCount: number) => void;
  /**
   * Stage 5: measured leg segment lengths for the bound character, cached
   * per exercise load. Segment distances are pose-invariant, so one
   * measurement per exercise is sufficient and avoids per-frame allocation.
   * Falls back to procedural-rig proportions when bones are unavailable.
   */
  private cachedLegLengths: { l1: number; l2: number } | null = null;

  setExercise(exerciseId: string): void {
    this.exerciseId = exerciseId;
    const meta = getMotionMetadata(exerciseId);
    this.duration = meta.duration;
    this.loop = meta.loop;
    this.currentTime = 0;
    this.loopCount = 0;
    this.motionEvents.reset();
    this.motionEvents.setEvents(meta.events || []);
    this.cachedLegLengths = null;
  }

  /**
   * Returns hip→knee→ankle segment lengths measured on the live skeleton,
   * so TwoBoneIK ground locks stay correct on any character proportions
   * (procedural rig or Production V1 VRM).
   */
  getLegLengths(character: CharacterSkeletonProvider): { l1: number; l2: number } {
    if (!this.cachedLegLengths) {
      this.cachedLegLengths = TwoBoneIK.measureLimbLengths(
        character.getBone('leftUpperLeg'),
        character.getBone('leftLowerLeg'),
        character.getBone('leftFoot'),
        0.44,
        0.40
      );
    }
    return this.cachedLegLengths;
  }

  setClip(clip: THREE.AnimationClip, root: THREE.Object3D): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.mixer = new THREE.AnimationMixer(root);
    this.currentAction = this.mixer.clipAction(clip);
    this.currentAction.setLoop(
      this.loop ? THREE.LoopRepeat : THREE.LoopOnce,
      Infinity
    );
    this.currentAction.play();
    this.duration = clip.duration || this.duration;
  }

  play(): void {
    this.isPlaying = true;
    if (this.currentAction) this.currentAction.paused = false;
  }

  pause(): void {
    this.isPlaying = false;
    if (this.currentAction) this.currentAction.paused = true;
  }

  restart(): void {
    this.currentTime = 0;
    this.loopCount = 0;
    this.motionEvents.reset();
    if (this.currentAction) {
      this.currentAction.time = 0;
    }
    this.play();
  }

  seek(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    this.currentTime = clamped * this.duration;
    if (this.currentAction) {
      this.currentAction.time = this.currentTime;
    }
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(3.0, speed));
    if (this.currentAction) {
      this.currentAction.timeScale = this.speed;
    }
  }

  getSpeed(): number {
    return this.speed;
  }

  getDuration(): number {
    return this.duration;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getLoopCount(): number {
    return this.loopCount;
  }

  getCurrentPhase(): RepPhaseName {
    const progress = this.duration > 0 ? this.currentTime / this.duration : 0;
    return this.motionEvents.getCurrentPhase(progress);
  }

  onEvent(callback: (event: MotionEventTrigger, loopCount: number) => void): void {
    this.onTriggerCallback = callback;
  }

  update(delta: number, character: CharacterSkeletonProvider): MotionUpdateResult {
    const progress = this.duration > 0 ? this.currentTime / this.duration : 0;

    if (!this.isPlaying) {
      if (!this.mixer) {
        this.applyProceduralMotion(this.exerciseId, progress, character);
      }
      return {
        progress,
        currentTime: this.currentTime,
        loopCount: this.loopCount,
        currentPhase: this.motionEvents.getCurrentPhase(progress),
      };
    }

    const effectiveDelta = delta * this.speed;
    this.currentTime += effectiveDelta;

    // Handle loop boundary
    if (this.currentTime >= this.duration) {
      if (this.loop) {
        this.currentTime %= this.duration;
        this.loopCount++;
        this.motionEvents.onLoop(this.onTriggerCallback);
      } else {
        this.currentTime = this.duration;
        this.pause();
      }
    }

    const currentProgress = this.duration > 0 ? this.currentTime / this.duration : 0;

    // Evaluate cue & rep milestone events
    if (this.onTriggerCallback) {
      this.motionEvents.evaluate(currentProgress, this.onTriggerCallback);
    }

    // Step animation
    if (this.mixer) {
      this.mixer.update(effectiveDelta);
    } else {
      this.applyProceduralMotion(this.exerciseId, currentProgress, character);
    }

    return {
      progress: currentProgress,
      currentTime: this.currentTime,
      loopCount: this.loopCount,
      currentPhase: this.motionEvents.getCurrentPhase(currentProgress),
    };
  }

  /**
   * Stage 5.1: all joint angles are canonical deltas applied as
   *   runtimeQuat = productionRest × canonicalDelta
   * via ProductionRetarget. On identity-rest rigs this is exactly the old
   * bone.rotation.set() behaviour; on Production V1 VRM it honours the
   * authored A-pose rest + Blender rolls + VRM normalization.
   * World-space contacts (feet→floor, hands→floor/bar, torso→bench) take
   * priority over free Euler values and are solved through the existing
   * TwoBoneIK system, whose outputs are likewise treated as canonical
   * deltas and composed onto rest.
   */
  public applyProceduralMotion(
    exerciseId: string,
    progress: number,
    character: CharacterSkeletonProvider
  ): void {
    const hips = character.getBone('hips');
    if (!hips) return;

    const retarget = getRetargetFor(character);
    retarget.calibrate(character);
    // Canonical-delta writer: R('leftUpperArm', x, y, z).
    const R = (name: HumanoidBoneName, x: number, y: number, z: number): void => {
      retarget.setCanonicalEuler(character, name, x, y, z);
    };
    const RE = (name: HumanoidBoneName, e: THREE.Euler): void => {
      retarget.setCanonicalEulerObj(character, name, e);
    };

    // Developer-only calibration harness (Phase C): deterministic poses
    // through the SAME retarget path as exercises.
    const calibId = exerciseId.startsWith('calib-') ? exerciseId.slice('calib-'.length) : null;
    if (calibId) {
      const map: Record<string, CalibrationPoseId> = {
        neutral: 'neutral',
        'arms-forward': 'arms-forward',
        'arms-side': 'arms-side',
        't-pose': 'arms-side',
        'arms-overhead': 'arms-overhead',
        'elbow-90': 'elbow-flexion-90',
        'elbow-flexion-90': 'elbow-flexion-90',
        'hip-flexion': 'hip-flexion',
        'knee-90': 'knee-flexion-90',
        'knee-flexion-90': 'knee-flexion-90',
        'ankle-neutral': 'ankle-neutral',
        plank: 'horizontal-plank',
        'horizontal-plank': 'horizontal-plank',
      };
      const pose = map[calibId];
      if (pose) {
        // Calibration poses are static (progress-independent) so axis
        // conventions can be verified visually frame-to-frame.
        applyCalibrationPose(character, pose, retarget);
        return;
      }
    }

    const spine = character.getBone('spine');
    const chest = character.getBone('chest');
    const upperChest = character.getBone('upperChest');
    const neck = character.getBone('neck');
    const head = character.getBone('head');
    const leftShoulder = character.getBone('leftShoulder');
    const rightShoulder = character.getBone('rightShoulder');
    const leftUpperArm = character.getBone('leftUpperArm');
    const rightUpperArm = character.getBone('rightUpperArm');
    const leftLowerArm = character.getBone('leftLowerArm');
    const rightLowerArm = character.getBone('rightLowerArm');
    const leftHand = character.getBone('leftHand');
    const rightHand = character.getBone('rightHand');
    const leftUpperLeg = character.getBone('leftUpperLeg');
    const rightUpperLeg = character.getBone('rightUpperLeg');
    const leftLowerLeg = character.getBone('leftLowerLeg');
    const rightLowerLeg = character.getBone('rightLowerLeg');
    const leftFoot = character.getBone('leftFoot');
    const rightFoot = character.getBone('rightFoot');
    void leftShoulder;
    void rightShoulder;
    void leftUpperArm;
    void rightUpperArm;
    void leftLowerArm;
    void rightLowerArm;
    void leftHand;
    void rightHand;
    void leftUpperLeg;
    void rightUpperLeg;
    void leftLowerLeg;
    void rightLowerLeg;
    void leftFoot;
    void rightFoot;

    // Reset default orientation baseline (canonical neutral = rest × delta)
    hips.position.set(0, 0.98, 0);
    R('hips', 0, 0, 0);
    if (spine) R('spine', 0, 0, 0);
    if (chest) R('chest', 0, 0, 0);
    if (upperChest) R('upperChest', 0, 0, 0);
    if (neck) R('neck', 0, 0, 0);
    if (head) R('head', 0, 0, 0);
    if (leftShoulder) R('leftShoulder', 0, 0, -0.08);
    if (rightShoulder) R('rightShoulder', 0, 0, 0.08);
    if (leftUpperArm) R('leftUpperArm', 0.04, 0, -1.05);
    if (rightUpperArm) R('rightUpperArm', 0.04, 0, 1.05);
    if (leftLowerArm) R('leftLowerArm', 0, -0.08, 0);
    if (rightLowerArm) R('rightLowerArm', 0, 0.08, 0);
    if (leftHand) R('leftHand', 0, 0, 0);
    if (rightHand) R('rightHand', 0, 0, 0);
    if (leftUpperLeg) R('leftUpperLeg', 0, 0, 0);
    if (rightUpperLeg) R('rightUpperLeg', 0, 0, 0);
    if (leftLowerLeg) R('leftLowerLeg', 0, 0, 0);
    if (rightLowerLeg) R('rightLowerLeg', 0, 0, 0);
    if (leftFoot) R('leftFoot', 0, 0, 0);
    if (rightFoot) R('rightFoot', 0, 0, 0);

    // Smooth sinusoidal rep curve: 0 -> 1 -> 0 (cosine ease-in-out, C1 continuous across loop wrap)
    const repPhase = (1 - Math.cos(progress * Math.PI * 2)) / 2;

    switch (exerciseId) {
      // =========================================================================
      // PRODUCTION EXERCISE 2: BODYWEIGHT SQUAT (TwoBoneIK Ground Lock + Forward Counterbalance)
      // =========================================================================
      case 'motion-test-squat':
      case 'bodyweight-squat':
      case 'deep-squat-test': {
        // Hips lower smoothly from 0.98m down to 0.62m while translating back Z = -0.20m
        const depth = exerciseId === 'deep-squat-test' ? 0.40 : 0.36;
        const hipY = 0.98 - repPhase * depth;
        const hipZ = -repPhase * 0.20;
        hips.position.set(0, hipY, hipZ);

        // Stage 5: solve against measured segment lengths so the ground lock
        // holds on production VRM proportions as well as the fallback rig.
        const legLengths = this.getLegLengths(character);

        // Torso counter-lean: spine and chest incline forward ~28 degrees to balance COM over mid-foot
        const torsoLean = repPhase * 0.50;
        if (spine) R('spine', torsoLean * 0.65, 0, 0);
        if (chest) R('chest', torsoLean * 0.35, 0, 0);
        if (neck) R('neck', -torsoLean * 0.40, 0, 0); // Gaze tracks horizon

        // TwoBoneIK: Ground lock feet firmly to floor (Y=0, Z=0) to prevent foot sliding
        // Left Leg IK — outputs are canonical deltas composed onto rest.
        const hipLeftPos = new THREE.Vector3(-0.12, hipY, hipZ);
        const footLeftTarget = new THREE.Vector3(-0.16, 0.0, 0.0);
        const leftLegIK = TwoBoneIK.solveLegGroundLock(hipLeftPos, footLeftTarget, legLengths.l1, legLengths.l2, {
          kneeOutwardSpread: 0.20 * repPhase,
        });

        if (leftUpperLeg) RE('leftUpperLeg', leftLegIK.hipRotation);
        if (leftLowerLeg) RE('leftLowerLeg', leftLegIK.kneeRotation);
        if (leftFoot) RE('leftFoot', leftLegIK.ankleRotation);

        // Right Leg IK
        const hipRightPos = new THREE.Vector3(0.12, hipY, hipZ);
        const footRightTarget = new THREE.Vector3(0.16, 0.0, 0.0);
        const rightLegIK = TwoBoneIK.solveLegGroundLock(hipRightPos, footRightTarget, legLengths.l1, legLengths.l2, {
          kneeOutwardSpread: 0.20 * repPhase,
        });

        if (rightUpperLeg) RE('rightUpperLeg', rightLegIK.hipRotation);
        if (rightLowerLeg) RE('rightLowerLeg', rightLegIK.kneeRotation);
        if (rightFoot) RE('rightFoot', rightLegIK.ankleRotation);

        // Stage 5.1: plausible athletic counterbalance — arms reach forward
        // to shoulder height (no wild axial twist, elbows extended, feet
        // stay world-grounded via the leg IK above which takes priority).
        if (leftUpperArm) R('leftUpperArm', -1.20 * repPhase, 0, -0.55 + repPhase * 0.45);
        if (rightUpperArm) R('rightUpperArm', -1.20 * repPhase, 0, 0.55 - repPhase * 0.45);
        if (leftLowerArm) R('leftLowerArm', 0, 0, 0);
        if (rightLowerArm) R('rightLowerArm', 0, 0, 0);
        if (leftHand) R('leftHand', 0, 0, 0);
        if (rightHand) R('rightHand', 0, 0, 0);
        break;
      }

      // =========================================================================
      // PHASE 3 VALIDATION MOTION 2: ARM RAISE (Scapulohumeral Rhythm, Zero Collapse)
      // =========================================================================
      case 'motion-test-arm-raise':
      case 'arms-raised': {
        // Upright standing posture, feet flat
        hips.position.set(0, 0.98, 0);

        // Abduct arms from resting hang through the lateral plane to an
        // overhead V. Stage 5.1: outward-up excursion (left negative-Z,
        // right positive-Z); the pre-5.1 +2.20 sweep rotated inward-down.
        const abduction = 1.05 + repPhase * 1.75;

        // Scapulohumeral rhythm: clavicle / shoulder elevates upward ~15°
        const scapulaElev = repPhase * 0.25;
        if (leftShoulder) R('leftShoulder', 0, 0, -0.08 + scapulaElev);
        if (rightShoulder) R('rightShoulder', 0, 0, 0.08 - scapulaElev);

        // Upper arm elevation in coronal plane with slight external rotation
        if (leftUpperArm) R('leftUpperArm', 0.04 - repPhase * 0.12, -repPhase * 0.20, -abduction);
        if (rightUpperArm) R('rightUpperArm', 0.04 - repPhase * 0.12, repPhase * 0.20, abduction);

        // Soft elbow lock (zero hyperextension or snapping)
        if (leftLowerArm) R('leftLowerArm', 0, -0.08, 0);
        if (rightLowerArm) R('rightLowerArm', 0, 0.08, 0);

        // Neutral wrist
        if (leftHand) R('leftHand', 0, 0, 0);
        if (rightHand) R('rightHand', 0, 0, 0);
        break;
      }

      // =========================================================================
      // PRODUCTION EXERCISE 4: DUMBBELL BICEPS CURL (Pinned Elbows, Smooth Supination)
      // =========================================================================
      case 'motion-test-elbow-curl':
      case 'dumbbell-curl':
      case 'elbow-flexion': {
        // Solid standing stance, zero torso swing
        hips.position.set(0, 0.98, 0);
        if (spine) R('spine', 0, 0, 0);

        // Shoulders fixed: zero anterior shoulder swing
        if (leftShoulder) R('leftShoulder', 0, 0, -0.08);
        if (rightShoulder) R('rightShoulder', 0, 0, 0.08);

        // Upper arms remain strictly pinned alongside ribcage (near-vertical
        // hang, slight A-pose) — Stage 5.1: primary movement is elbow
        // flexion only, no large upper-arm swing or sideways flare.
        // (Pre-5.1 ±1.45 flared the arms 83° sideways; anatomically wrong.)
        const supination = repPhase * 0.22;
        const armSwing = repPhase * 0.05;
        if (leftUpperArm) R('leftUpperArm', 0.05, 0, -0.15 + armSwing);
        if (rightUpperArm) R('rightUpperArm', 0.05, 0, 0.15 - armSwing);

        // Forearms flex about the elbow hinge (canonical X) with progressive
        // supination twist about the forearm long axis (canonical Y).
        // (Pre-5.1 flexed about Y, which spins the hanging limb in place
        // instead of lifting the hand — the failed-curl visual defect.)
        const curlAngle = repPhase * 1.95;
        if (leftLowerArm) R('leftLowerArm', -curlAngle, -supination, 0);
        if (rightLowerArm) R('rightLowerArm', -curlAngle, supination, 0);

        // Neutral wrists: zero wrist snapping or inversion
        if (leftHand) R('leftHand', 0, 0, 0);
        if (rightHand) R('rightHand', 0, 0, 0);
        break;
      }

      // =========================================================================
      // PHASE 3 VALIDATION MOTION 4: HIP HINGE (Posterior Shift, Soft Knees, Flat Feet)
      // =========================================================================
      case 'motion-test-hip-hinge': {
        const hingeZ = -repPhase * 0.26;
        const hingeY = 0.98 - repPhase * 0.05;
        hips.position.set(0, hingeY, hingeZ);

        const hingeTilt = repPhase * 0.78;
        if (spine) R('spine', hingeTilt * 0.70, 0, 0);
        if (chest) R('chest', hingeTilt * 0.30, 0, 0);
        if (neck) R('neck', -hingeTilt * 0.50, 0, 0);

        const hingeLegLengths = this.getLegLengths(character);
        const hipLeftPos = new THREE.Vector3(-0.12, hingeY, hingeZ);
        const footLeftTarget = new THREE.Vector3(-0.14, 0.0, 0.0);
        const leftHingeIK = TwoBoneIK.solveLegGroundLock(hipLeftPos, footLeftTarget, hingeLegLengths.l1, hingeLegLengths.l2);

        if (leftUpperLeg) RE('leftUpperLeg', leftHingeIK.hipRotation);
        if (leftLowerLeg) RE('leftLowerLeg', leftHingeIK.kneeRotation);
        if (leftFoot) RE('leftFoot', leftHingeIK.ankleRotation);

        const hipRightPos = new THREE.Vector3(0.12, hingeY, hingeZ);
        const footRightTarget = new THREE.Vector3(0.14, 0.0, 0.0);
        const rightHingeIK = TwoBoneIK.solveLegGroundLock(hipRightPos, footRightTarget, hingeLegLengths.l1, hingeLegLengths.l2);

        if (rightUpperLeg) RE('rightUpperLeg', rightHingeIK.hipRotation);
        if (rightLowerLeg) RE('rightLowerLeg', rightHingeIK.kneeRotation);
        if (rightFoot) RE('rightFoot', rightHingeIK.ankleRotation);

        if (leftUpperArm) R('leftUpperArm', -hingeTilt, 0, -1.05 + repPhase * 0.45);
        if (rightUpperArm) R('rightUpperArm', -hingeTilt, 0, 1.05 - repPhase * 0.45);
        break;
      }

      // =========================================================================
      // PRODUCTION EXERCISE 3: STANDARD PUSH-UP (Hand & Toe Floor IK, 45° Elbow Path)
      // =========================================================================
      case 'motion-test-push-up-plank':
      case 'push-up': {
        // Stage 5.1: horizontal prone plank driven by WORLD-SPACE contacts.
        // Hips pitch is a canonical delta (rest × 90°); hands→floor and
        // toes→floor take priority over free Euler values. Arm angles below
        // are refined by the existing TwoBoneIK.solveArmTarget so the body
        // stays a coherent rigid-ish chain instead of approximate locals.
        const plankHipsY = 0.38 - repPhase * 0.20;
        hips.position.set(0, plankHipsY, 0.0);
        R('hips', Math.PI / 2, 0, 0);

        // Core braced: straight rigid line through spine, chest, neck
        if (spine) R('spine', 0, 0, 0);
        if (chest) R('chest', 0, 0, 0);
        if (neck) R('neck', -0.15, 0, 0); // Neutral head

        // Legs extend straight back along horizontal line
        if (leftUpperLeg) R('leftUpperLeg', 0, 0, 0.04);
        if (rightUpperLeg) R('rightUpperLeg', 0, 0, -0.04);
        if (leftLowerLeg) R('leftLowerLeg', 0, 0, 0);
        if (rightLowerLeg) R('rightLowerLeg', 0, 0, 0);
        // Dorsiflex feet on toes against floor (toe contact priority)
        if (leftFoot) R('leftFoot', 0.70, 0, 0);
        if (rightFoot) R('rightFoot', 0.70, 0, 0);

        // Push-up arm kinematics as canonical baseline …
        const armPitch = -0.20 - repPhase * 0.25;
        const armForward = -1.15 + repPhase * 0.45;
        const armAbduct = -0.95 + repPhase * 0.35;
        if (leftUpperArm) R('leftUpperArm', armPitch, armForward, armAbduct);
        if (rightUpperArm) R('rightUpperArm', armPitch, -armForward, -armAbduct);

        const elbowFlex = repPhase * 1.40;
        if (leftLowerArm) R('leftLowerArm', 0, -elbowFlex, 0);
        if (rightLowerArm) R('rightLowerArm', 0, elbowFlex, 0);

        // … then world-space hand-contact correction wins on conflict:
        // solve shoulder→floor-target arms and compose onto rest so palms
        // stay planted while the torso descends coherently.
        try {
          character.getRoot().updateMatrixWorld(true);
          const lS = character.getBone('leftShoulder');
          const rS = character.getBone('rightShoulder');
          if (lS && rS) {
            const lP = new THREE.Vector3();
            const rP = new THREE.Vector3();
            lS.getWorldPosition(lP);
            rS.getWorldPosition(rP);
            const armLens = TwoBoneIK.measureLimbLengths(
              character.getBone('leftUpperArm'),
              character.getBone('leftLowerArm'),
              character.getBone('leftHand'),
              0.28, 0.24
            );
            const lT = new THREE.Vector3(-0.28, 0.0, 0.32);
            const rT = new THREE.Vector3(0.28, 0.0, 0.32);
            const lIK = TwoBoneIK.solveArmTarget(lP, lT, armLens.l1, armLens.l2, 'outward');
            const rIK = TwoBoneIK.solveArmTarget(rP, rT, armLens.l1, armLens.l2, 'outward');
            // Blend: baseline rep motion dominates, IK provides contact
            // correction (30%) so elbows keep the 45° path while hands
            // stay grounded. Both are canonical deltas → rest-relative.
            const blend = 0.3;
            if (leftUpperArm) {
              const cur = new THREE.Euler().setFromQuaternion(leftUpperArm.quaternion, 'XYZ');
              void cur;
              const blended = new THREE.Euler(
                armPitch + (lIK.shoulderRotation.x - armPitch) * blend,
                armForward + (lIK.shoulderRotation.y - armForward) * blend,
                armAbduct + (lIK.shoulderRotation.z - armAbduct) * blend,
                'XYZ'
              );
              RE('leftUpperArm', blended);
              const eb = new THREE.Euler(0, -(elbowFlex + (Math.abs(lIK.elbowRotation.y) - elbowFlex) * blend), 0, 'XYZ');
              RE('leftLowerArm', eb);
            }
            if (rightUpperArm) {
              const blended = new THREE.Euler(
                armPitch + (rIK.shoulderRotation.x - armPitch) * blend,
                -armForward + (rIK.shoulderRotation.y + armForward) * blend,
                -armAbduct + (rIK.shoulderRotation.z + armAbduct) * blend,
                'XYZ'
              );
              RE('rightUpperArm', blended);
              const eb = new THREE.Euler(0, elbowFlex + (Math.abs(rIK.elbowRotation.y) - elbowFlex) * blend, 0, 'XYZ');
              RE('rightLowerArm', eb);
            }
          }
        } catch {
          // IK correction is best-effort; canonical baseline already applied.
        }

        // Flat planted palms
        if (leftHand) R('leftHand', 0.60, 0.20, -0.20);
        if (rightHand) R('rightHand', 0.60, -0.20, 0.20);
        break;
      }

      // =========================================================================
      // BASELINE STANDING & PHASE 1 COMPATIBILITY
      // =========================================================================
      case 'neutral-stance': {
        hips.position.set(0, 0.98, 0);
        R('hips', 0, 0, 0);
        if (leftShoulder) R('leftShoulder', 0, 0, -0.08);
        if (rightShoulder) R('rightShoulder', 0, 0, 0.08);
        if (leftUpperArm) R('leftUpperArm', 0.04, 0, -1.05);
        if (rightUpperArm) R('rightUpperArm', 0.04, 0, 1.05);
        if (leftLowerArm) R('leftLowerArm', 0, -0.08, 0);
        if (rightLowerArm) R('rightLowerArm', 0, 0.08, 0);
        break;
      }

      // =========================================================================
      // PRODUCTION EXERCISE 1: JUMPING JACK (Rhythmic Bounce, Clean Scapulohumeral Arc)
      // =========================================================================
      case 'jumping-jack': {
        // Controlled sinusoidal flight hop peaking at mid-rep
        const flightHop = Math.sin(progress * Math.PI) * 0.06;
        hips.position.set(0, 0.98 + flightHop, 0);

        // Legs: coronal abduction spreading feet to shoulder width
        // (symmetric; rest-relative so production axes stay lateral and
        //  arms never cross the pelvis — abduction stays in ±Z plane).
        const legAbduction = repPhase * 0.26;
        if (leftUpperLeg) R('leftUpperLeg', 0, 0, legAbduction);
        if (rightUpperLeg) R('rightUpperLeg', 0, 0, -legAbduction);

        // Soft landing knee cushion (continuous across landing transitions)
        const landingPhase = Math.sin(progress * Math.PI * 2);
        const kneeCushion = 0.02 + (landingPhase < 0 ? Math.abs(landingPhase) * 0.12 : 0);
        if (leftLowerLeg) R('leftLowerLeg', kneeCushion, 0, 0);
        if (rightLowerLeg) R('rightLowerLeg', kneeCushion, 0, 0);

        // Keep soles flat on floor: counter-abduct ankles by legAbduction.
        // Stage 5: toe pitch scales proportionally with flight height so the
        // takeoff/landing transitions are pop-free and loop-closing.
        const toePitch = 0.15 * Math.min(1, Math.max(0, flightHop / 0.06));
        if (leftFoot) R('leftFoot', toePitch, 0, -legAbduction);
        if (rightFoot) R('rightFoot', toePitch, 0, legAbduction);

        // Stable clavicle/shoulders: zero axillary skin distortion
        if (leftShoulder) R('leftShoulder', 0, 0, -0.08);
        if (rightShoulder) R('rightShoulder', 0, 0, 0.08);

        // Abduct upper arms through coronal plane: A-pose (-1.15) to overhead athletic V (-2.80 rad).
        // Stage 5.1: at peak shoulders abduct upward, elbows mostly
        // extended, hands above head. Negative-Z excursion for the left
        // arm (mirrored positive right) keeps the arc lateral — arms never
        // cross the pelvis. (The pre-5.1 +0.80 peak rotated inward-down.)
        const armAbduction = -1.15 - repPhase * 1.65;
        if (leftUpperArm) R('leftUpperArm', 0, 0, armAbduction);
        if (rightUpperArm) R('rightUpperArm', 0, 0, -armAbduction);

        // Soft natural elbow bend (eliminates axillary skin strain, natural bounce posture)
        const elbowBend = repPhase * 0.12;
        if (leftLowerArm) R('leftLowerArm', 0, -elbowBend, 0);
        if (rightLowerArm) R('rightLowerArm', 0, elbowBend, 0);

        // Neutral hands reaching overhead
        if (leftHand) R('leftHand', 0, 0, 0);
        if (rightHand) R('rightHand', 0, 0, 0);
        break;
      }

      // =========================================================================
      // PRODUCTION EXERCISE 5: BARBELL FLAT BENCH PRESS (Supine, 2-Hand Barbell IK)
      // =========================================================================
      case 'bench-press': {
        // Stage 5.1: WORLD-SPACE setup first, then press movement.
        // Torso aligned to bench, pelvis on bench, head supported, feet
        // planted, hands aligned to bar. Bar path is constrained by the
        // two-hand attachment rather than forcing impossible hand poses.
        // Flat bench pad surface is at Y=0.475m.
        // Hips rest firmly on Pad_Hips at Y=0.50m, Z=+0.20m
        hips.position.set(0, 0.50, 0.20);
        // Supine pitch: -90 degrees around X (facing upwards towards ceiling +Y)
        R('hips', -Math.PI / 2, 0, 0);

        // Rigid neutral spine supported along bench pad (Pad_UpperBack & Pad_Head)
        if (spine) R('spine', 0, 0, 0);
        if (chest) R('chest', 0, 0, 0);
        if (upperChest) R('upperChest', 0, 0, 0);
        if (neck) R('neck', 0, 0, 0);
        if (head) R('head', 0, 0, 0);

        // Scapular retraction and depression into bench pad
        if (leftShoulder) R('leftShoulder', 0, 0, -0.05);
        if (rightShoulder) R('rightShoulder', 0, 0, 0.05);

        // Legs: Upper legs angle down and outward beside bench (pad width 0.30m)
        // Lower legs bend to place feet planted flat on floor (Y=0.01m).
        // Feet→floor contact takes priority (world-static bench + floor).
        if (leftUpperLeg) R('leftUpperLeg', 1.42, 0, 0.42);
        if (rightUpperLeg) R('rightUpperLeg', 1.42, 0, -0.42);
        if (leftLowerLeg) R('leftLowerLeg', 1.25, 0, 0);
        if (rightLowerLeg) R('rightLowerLeg', 1.25, 0, 0);
        if (leftFoot) R('leftFoot', -0.65, 0, 0);
        if (rightFoot) R('rightFoot', -0.65, 0, 0);

        // Upper body pressing kinematics:
        // Lockout (repPhase = 0): Arms extended upward towards ceiling (Y = 0.96m)
        // Descent (repPhase -> 1.0): Elbows tuck 45 degrees, lowering bar towards chest (Y = 0.74m)
        // Bar path constrained by the two-hand bar attachment: symmetric
        // press, elbows tucked 45°, forearms vertical under the bar.
        const pressTuck = repPhase * 0.45;
        const armElev = 0.35 - repPhase * 0.50;
        const armForward = -1.35 + repPhase * 0.90;

        if (leftUpperArm) R('leftUpperArm', 0.10 + pressTuck, armForward, -armElev);
        if (rightUpperArm) R('rightUpperArm', 0.10 + pressTuck, -armForward, armElev);

        // Forearms flex along hinge axis (keeping forearms vertical under barbell)
        const elbowFlex = 0.15 + repPhase * 1.65;
        if (leftLowerArm) R('leftLowerArm', 0, -elbowFlex, 0);
        if (rightLowerArm) R('rightLowerArm', 0, elbowFlex, 0);

        // Locked neutral wrists gripping the barbell
        if (leftHand) R('leftHand', 0, 0, 0);
        if (rightHand) R('rightHand', 0, 0, 0);
        break;
      }

      case 'hip-flexion': {
        if (leftShoulder) R('leftShoulder', 0, 0, -0.08);
        if (rightShoulder) R('rightShoulder', 0, 0, 0.08);
        if (leftUpperArm) R('leftUpperArm', 0.04, 0, -1.05);
        if (rightUpperArm) R('rightUpperArm', 0.04, 0, 1.05);
        const hipFlex = repPhase * 1.62;
        if (leftUpperLeg) R('leftUpperLeg', -hipFlex, 0, repPhase * 0.05);
        if (leftLowerLeg) R('leftLowerLeg', hipFlex * 1.05, 0, 0);
        break;
      }

      default:
        break;
    }
  }

  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    this.currentAction = null;
  }
}
