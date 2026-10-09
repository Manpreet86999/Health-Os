/**
 * Health OS Motion V2 — Motion Player (M1).
 *
 * Samples a `BodyOSMotionClip` into a rest-relative normalized humanoid
 * pose (`VRMPose`). Transport: play/pause/seek/speed/loop + Health OS
 * timing events (reuses `MotionEvents`).
 *
 * Deliberately ignorant of: Blender, DEF bones, production characters,
 * equipment, exercises. Input = clip; output = pose + playback status.
 */

import type { VRMPose } from '@pixiv/three-vrm';
import type { BodyOSMotionClip } from './BodyOSMotionClip.js';
import { sampleBodyOSMotionClip } from './BodyOSMotionClip.js';
import { MotionEvents, type MotionEventTrigger, type RepPhaseName } from './MotionEvents.js';

export interface MotionPlayerStatus {
  pose: VRMPose;
  progress: number;
  currentTime: number;
  loopCount: number;
  currentPhase: RepPhaseName;
}

export class MotionPlayer {
  private clip: BodyOSMotionClip | null = null;
  private isPlaying = true;
  private currentTime = 0;
  private speed = 1.0;
  private loopCount = 0;
  private events: MotionEvents = new MotionEvents();
  private onTriggerCallback?: (event: MotionEventTrigger, loopCount: number) => void;

  setClip(clip: BodyOSMotionClip): void {
    this.clip = clip;
    this.currentTime = 0;
    this.loopCount = 0;
    this.events.reset();
    this.events.setEvents(
      (clip.events || []).map((e) => ({ time: e.time, name: e.name, cue: e.cue }))
    );
  }

  getClip(): BodyOSMotionClip | null {
    return this.clip;
  }

  getDuration(): number {
    return this.clip?.duration ?? 0;
  }

  play(): void {
    this.isPlaying = true;
  }

  pause(): void {
    this.isPlaying = false;
  }

  isPaused(): boolean {
    return !this.isPlaying;
  }

  restart(): void {
    this.currentTime = 0;
    this.loopCount = 0;
    this.events.reset();
    this.play();
  }

  seek(progress: number): void {
    const duration = this.getDuration();
    if (duration <= 0) return;
    const clamped = Math.max(0, Math.min(1, progress));
    this.currentTime = clamped * duration;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(3.0, speed));
  }

  getSpeed(): number {
    return this.speed;
  }

  getLoopCount(): number {
    return this.loopCount;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  onEvent(callback: (event: MotionEventTrigger, loopCount: number) => void): void {
    this.onTriggerCallback = callback;
  }

  /** Pure sample at an absolute clip-local time (no transport advance). */
  sampleAt(time: number): VRMPose {
    if (!this.clip) return {};
    return sampleBodyOSMotionClip(this.clip, time);
  }

  update(delta: number): MotionPlayerStatus {
    const duration = this.getDuration();
    const loop = this.clip?.loop ?? true;
    if (this.isPlaying && duration > 0) {
      this.currentTime += delta * this.speed;
      if (this.currentTime >= duration) {
        if (loop) {
          this.currentTime %= duration;
          this.loopCount++;
          this.events.onLoop(this.onTriggerCallback);
        } else {
          this.currentTime = duration;
          this.pause();
        }
      }
    }
    const progress = duration > 0 ? this.currentTime / duration : 0;
    if (this.onTriggerCallback) {
      this.events.evaluate(progress, this.onTriggerCallback);
    }
    return {
      pose: this.sampleAt(this.currentTime),
      progress,
      currentTime: this.currentTime,
      loopCount: this.loopCount,
      currentPhase: this.events.getCurrentPhase(progress),
    };
  }
}
