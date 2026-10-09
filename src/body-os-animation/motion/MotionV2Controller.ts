/**
 * Health OS Motion V2 — V2 Controller (M1).
 *
 * Owns the M1 execution path:
 *   MotionLibrary clip → MotionPlayer sample → grip merge →
 *   HumanoidApplicator.applyPose → (adapter tick calls vrm.update() after)
 *
 * Applicator is selected per bound character: VRM humanoid when present,
 * fallback rig otherwise — behind the same `HumanoidApplicator` interface
 * so canonical clips stay identical. Never runs V1 procedural motion;
 * the adapter tick branches V1/V2 exclusively per frame.
 */

import type { VRMPose } from '@pixiv/three-vrm';
import type { CharacterController } from '../character/CharacterController.js';
import type { VRMHumanoid } from '@pixiv/three-vrm';
import { MotionPlayer, type MotionPlayerStatus } from './MotionPlayer.js';
import { getMotionClip, listMotionClipIds, registerMotionClip } from './MotionLibrary.js';
import { buildCalibrationClips } from './CalibrationClips.js';
import {
  FallbackRigApplicator,
  VRMNormalizedApplicator,
  type HumanoidApplicator,
} from './HumanoidApplicator.js';
import { buildGripDiagnosticPose, mergeGripPose } from '../character/NormalizedGripPresets.js';
import {
  DIAGNOSTIC_BONES,
  runFrameOwnershipDiagnostic,
  type FrameOwnershipReport,
} from './FrameOwnershipDiagnostic.js';
import { sampleBodyOSMotionClip } from './BodyOSMotionClip.js';

export class MotionV2Controller {
  private readonly player = new MotionPlayer();
  private character: CharacterController | null = null;
  private applicator: HumanoidApplicator | null = null;
  private boundHumanoid: VRMHumanoid | null = null;
  private clipsRegistered = false;
  private gripDiagnostic = false;
  private currentClipId: string | null = null;

  /** Bind to the live character controller (call after character loads). */
  bind(character: CharacterController): void {
    this.character = character;
    this.applicator = null;
    this.boundHumanoid = null;
    if (!this.clipsRegistered) {
      for (const clip of buildCalibrationClips()) registerMotionClip(clip);
      this.clipsRegistered = true;
    }
  }

  private syncApplicator(): HumanoidApplicator | null {
    if (!this.character) return null;
    const humanoid = this.character.getHumanoid();
    if (humanoid) {
      if (!this.applicator || this.boundHumanoid !== humanoid || !this.applicator.isVRM()) {
        this.applicator = new VRMNormalizedApplicator(humanoid);
        this.boundHumanoid = humanoid;
      }
      return this.applicator;
    }
    // Non-VRM fallback rig: separate applicator, identical clips.
    if (!this.applicator || this.applicator.isVRM()) {
      this.applicator = new FallbackRigApplicator(this.character);
      this.boundHumanoid = null;
    }
    return this.applicator;
  }

  playClip(id: string): boolean {
    const clip = getMotionClip(id);
    if (!clip) return false;
    this.player.setClip(clip);
    this.player.play();
    this.currentClipId = id;
    // Static clips only author their own bones; reset first so no stale
    // pose leaks across clip switches (missing bones = rest).
    this.syncApplicator()?.resetPose();
    return true;
  }

  getCurrentClipId(): string | null {
    return this.currentClipId;
  }

  listClips(): string[] {
    return listMotionClipIds();
  }

  setGripDiagnostic(enabled: boolean): void {
    this.gripDiagnostic = enabled;
  }

  getGripDiagnostic(): boolean {
    return this.gripDiagnostic;
  }

  getPlayer(): MotionPlayer {
    return this.player;
  }

  /**
   * One V2 frame: sample → merge normalized grip → write normalized pose.
   * The caller MUST run `vrm.update()` afterwards (adapter tick order).
   */
  update(delta: number): MotionPlayerStatus | null {
    const applicator = this.syncApplicator();
    if (!applicator) return null;
    const status = this.player.update(delta);
    const grip: VRMPose | null = this.gripDiagnostic ? buildGripDiagnosticPose() : null;
    applicator.applyPose(mergeGripPose(status.pose, grip));
    return status;
  }

  /** Static pose write (used by diagnostics/seek-freeze). */
  showClipPose(id: string, time: number): boolean {
    const applicator = this.syncApplicator();
    const clip = getMotionClip(id);
    if (!applicator || !clip) return false;
    applicator.applyPose(sampleBodyOSMotionClip(clip, time));
    return true;
  }

  resetPose(): void {
    this.syncApplicator()?.resetPose();
  }

  /** Developer-only frame ownership report (normalized vs raw). */
  diagnoseFrames(): FrameOwnershipReport | null {
    const humanoid = this.character?.getHumanoid() ?? null;
    if (!humanoid) return null;
    const rest = {};
    const abducted = sampleBodyOSMotionClip(getMotionClip('v2-calib-arms-overhead')!, 0);
    const curled = sampleBodyOSMotionClip(getMotionClip('v2-calib-elbow-flexion-90')!, 0);
    const report = runFrameOwnershipDiagnostic(humanoid, DIAGNOSTIC_BONES, [rest, abducted, curled]);
    // Leave the humanoid posed by the current player on next update.
    return report;
  }
}
