/**
 * Health OS Motion V2 — Canonical Motion Clip (M1).
 *
 * The single normalized runtime representation for all Health OS motion.
 * - Bone addressing uses VRM 1.0 `VRMHumanBoneName` only (never Blender
 *   DEF names, never character-specific axes).
 * - Rotations are quaternion tracks (never Euler tracks).
 * - Hips translation is the only positional track (body root trajectory).
 * - Shape-compatible in spirit with `VRMAnimation.humanoidTracks`
 *   (`@pixiv/three-vrm-animation`), so a VRMA importer can target this
 *   type later without redesign.
 *
 * A clip is sampled by `MotionPlayer` into a rest-relative `VRMPose`
 * (three-vrm 3.5.5 normalized-pose semantics) and written exclusively via
 * `vrm.humanoid.setNormalizedPose()`. Raw bones are never addressed here.
 */

import * as THREE from 'three';
import type { VRMHumanBoneName, VRMPose } from '@pixiv/three-vrm';

export interface BodyOSBoneTrack {
  /** VRM 1.0 humanoid bone name. */
  bone: VRMHumanBoneName;
  /** Monotonic key times in seconds, length >= 1. */
  times: number[];
  /** Unit quaternions [x, y, z, w], rest-relative, one per key time. */
  rotations: Array<[number, number, number, number]>;
}

export interface BodyOSHipsTrack {
  times: number[];
  /** Local positions [x, y, z] relative to normalized rest, one per key. */
  positions: Array<[number, number, number]>;
}

export interface BodyOSMotionEvent {
  /** Normalized 0..1 progress. */
  time: number;
  name: string;
  cue?: string;
}

export interface BodyOSMotionClip {
  id: string;
  version: number;
  /** Seconds; must be > 0. */
  duration: number;
  loop: boolean;
  tracks: BodyOSBoneTrack[];
  /** Optional root trajectory; absent = rest hips position. */
  hips?: BodyOSHipsTrack;
  events: BodyOSMotionEvent[];
  /**
   * Informational rest hips height (m) of the authoring Info, used later
   * for cross-character hips scaling. M1: informational only.
   */
  restHipsHeight?: number;
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

function trackIndex(times: number[], t: number): number {
  if (t <= times[0]!) return 0;
  for (let i = 0; i < times.length - 1; i++) {
    if (t <= times[i + 1]!) return i;
  }
  return times.length - 2;
}

/**
 * Pure sample: evaluates a clip at an absolute clip-local time (seconds)
 * into a rest-relative `VRMPose`. Quaternion slerp between keys; hips
 * linear interpolation. No side effects; safe to call from tests.
 */
export function sampleBodyOSMotionClip(clip: BodyOSMotionClip, time: number): VRMPose {
  const pose: VRMPose = {};
  const t = Math.max(0, Math.min(clip.duration, time));
  for (const track of clip.tracks) {
    if (track.times.length === 0 || track.rotations.length === 0) continue;
    if (track.times.length === 1 || track.rotations.length === 1) {
      pose[track.bone] = { rotation: [...track.rotations[0]!] as [number, number, number, number] };
      continue;
    }
    const i = Math.max(0, Math.min(track.times.length - 2, trackIndex(track.times, t)));
    const t0 = track.times[i]!;
    const t1 = track.times[i + 1]!;
    const span = t1 - t0;
    const alpha = span > 1e-9 ? Math.max(0, Math.min(1, (t - t0) / span)) : 0;
    _qa.fromArray(track.rotations[i]!);
    _qb.fromArray(track.rotations[i + 1]!);
    _qa.slerp(_qb, alpha);
    pose[track.bone] = { rotation: [_qa.x, _qa.y, _qa.z, _qa.w] };
  }
  if (clip.hips && clip.hips.times.length > 0) {
    const ht = clip.hips;
    // Merge with (not over) any hips rotation track: one pose entry.
    const entry = pose.hips ?? {};
    if (ht.times.length === 1) {
      entry.position = [...ht.positions[0]!] as [number, number, number];
    } else {
      const i = Math.max(0, Math.min(ht.times.length - 2, trackIndex(ht.times, t)));
      const t0 = ht.times[i]!;
      const t1 = ht.times[i + 1]!;
      const span = t1 - t0;
      const alpha = span > 1e-9 ? Math.max(0, Math.min(1, (t - t0) / span)) : 0;
      const a = ht.positions[i]!;
      const b = ht.positions[i + 1]!;
      entry.position = [
        a[0]! + (b[0]! - a[0]!) * alpha,
        a[1]! + (b[1]! - a[1]!) * alpha,
        a[2]! + (b[2]! - a[2]!) * alpha,
      ];
    }
    pose.hips = entry;
  }
  return pose;
}

/** Validates clip structure; returns human-readable problems (empty = ok). */
export function validateBodyOSMotionClip(clip: BodyOSMotionClip): string[] {
  const problems: string[] = [];
  if (!(clip.duration > 0)) problems.push('duration must be > 0');
  for (const track of clip.tracks) {
    if (track.times.length !== track.rotations.length) {
      problems.push(`track ${track.bone}: times/rotations length mismatch`);
    }
    for (let i = 1; i < track.times.length; i++) {
      if (!(track.times[i]! > track.times[i - 1]!)) {
        problems.push(`track ${track.bone}: times must be strictly increasing`);
      }
    }
  }
  if (clip.hips && clip.hips.times.length !== clip.hips.positions.length) {
    problems.push('hips: times/positions length mismatch');
  }
  return problems;
}
