/**
 * Health OS Motion V2 — Motion Library (M1).
 *
 * Minimal registry/cache for canonical `BodyOSMotionClip` assets.
 * M1 scope: calibration clips only. Exercise clips are explicitly out of
 * scope until the calibration-renders gate passes.
 */

import type { BodyOSMotionClip } from './BodyOSMotionClip.js';

const clips = new Map<string, BodyOSMotionClip>();

export function registerMotionClip(clip: BodyOSMotionClip): void {
  clips.set(clip.id, clip);
}

export function getMotionClip(id: string): BodyOSMotionClip | null {
  return clips.get(id) ?? null;
}

export function listMotionClipIds(): string[] {
  return [...clips.keys()];
}

export function clearMotionClips(): void {
  clips.clear();
}
