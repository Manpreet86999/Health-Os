import type { ExerciseMotionMetadata } from '../core/types.js';

export const MOTION_REGISTRY: Record<string, ExerciseMotionMetadata> = {
  // Phase 3 Core Motion Validation Tests
  'motion-test-squat': {
    asset: 'motion-test-squat',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Standing tall, brace core' },
      { time: 0.15, name: 'phase:descent', cue: 'Hips back, knees track toes' },
      { time: 0.50, name: 'rep:bottom', cue: 'Inflection at parallel depth' },
      { time: 0.75, name: 'phase:ascent', cue: 'Drive through full foot contact' },
      { time: 0.95, name: 'rep:top', cue: 'Full hip and knee extension' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'motion-test-arm-raise': {
    asset: 'motion-test-arm-raise',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Arms resting alongside torso' },
      { time: 0.20, name: 'phase:ascent', cue: 'Abducting arms through lateral plane' },
      { time: 0.50, name: 'rep:top', cue: 'Overhead extension with upward scapular rotation' },
      { time: 0.75, name: 'phase:descent', cue: 'Controlled lowering without shoulder collapse' },
      { time: 0.95, name: 'rep:bottom', cue: 'Return to neutral A-pose' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'motion-test-elbow-curl': {
    asset: 'motion-test-elbow-curl',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Elbows pinned to ribcage' },
      { time: 0.20, name: 'phase:ascent', cue: 'Forearm flexion with smooth supination' },
      { time: 0.50, name: 'rep:top', cue: 'Peak biceps contraction, zero elbow snap' },
      { time: 0.75, name: 'phase:descent', cue: 'Controlled eccentric extension' },
      { time: 0.95, name: 'rep:bottom', cue: 'Full stretch without hyperextension' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'motion-test-hip-hinge': {
    asset: 'motion-test-hip-hinge',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Upright neutral posture, soft knees' },
      { time: 0.20, name: 'phase:descent', cue: 'Push hips back horizontally, neutral spine' },
      { time: 0.50, name: 'rep:bottom', cue: 'Max hamstring stretch at 45° torso angle' },
      { time: 0.75, name: 'phase:ascent', cue: 'Drive hips forward with glutes' },
      { time: 0.95, name: 'rep:top', cue: 'Lockout hips without hyperextending spine' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'motion-test-push-up-plank': {
    asset: 'motion-test-push-up-plank',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Rigid plank: straight line from ears to heels' },
      { time: 0.20, name: 'phase:descent', cue: 'Lower torso, elbows tracking at 45°' },
      { time: 0.50, name: 'rep:bottom', cue: 'Chest hovering above floor, core braced' },
      { time: 0.75, name: 'phase:ascent', cue: 'Press floor away through palms' },
      { time: 0.95, name: 'rep:top', cue: 'Lockout plank with active scapulae' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },

  // Rig Tests & Neutral Baseline
  'neutral-stance': {
    asset: 'neutral-stance',
    loop: true,
    duration: 2.0,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Neutral athletic standing posture' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'arms-raised': {
    asset: 'rig-test-arms-raised',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Rest A-pose' },
      { time: 0.5, name: 'rep:top', cue: 'Full abduction overhead' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'deep-squat-test': {
    asset: 'rig-test-deep-squat',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Standing baseline' },
      { time: 0.5, name: 'rep:bottom', cue: 'Deep squat below parallel' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'elbow-flexion': {
    asset: 'rig-test-elbow-flexion',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Arms extended' },
      { time: 0.5, name: 'rep:top', cue: 'Peak elbow flexion' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'hip-flexion': {
    asset: 'rig-test-hip-flexion',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Feet planted' },
      { time: 0.5, name: 'rep:top', cue: 'High knee anterior flexion' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },

  // ===========================================================================
  // PHASE 5: THE FIVE PRODUCTION EXERCISES
  // ===========================================================================
  'jumping-jack': {
    asset: 'jumping-jack',
    loop: true,
    duration: 1.2,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Standing tall, light on balls of feet' },
      { time: 0.20, name: 'phase:ascent', cue: 'Springing upward, sweeping arms overhead' },
      { time: 0.50, name: 'rep:top', cue: 'Wide stance, full overhead extension' },
      { time: 0.75, name: 'phase:descent', cue: 'Return arms smoothly, absorb landing through knees' },
      { time: 0.95, name: 'rep:bottom', cue: 'Cushioned reset on midfoot' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'bodyweight-squat': {
    asset: 'bodyweight-squat',
    loop: true,
    duration: 2.4,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Brace core, feet shoulder-width, toes turned 15°' },
      { time: 0.20, name: 'phase:descent', cue: 'Hips back and down, knees track over toes' },
      { time: 0.50, name: 'rep:bottom', cue: 'Inflection at parallel depth, chest proud' },
      { time: 0.75, name: 'phase:ascent', cue: 'Drive through full foot contact, knees out' },
      { time: 0.95, name: 'rep:top', cue: 'Full hip and knee lockout, glutes engaged' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'push-up': {
    asset: 'push-up',
    loop: true,
    duration: 2.2,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Rigid plank: straight line from ears to heels, glutes tight' },
      { time: 0.20, name: 'phase:descent', cue: 'Lower chest under control, elbows at 45 degrees' },
      { time: 0.50, name: 'rep:bottom', cue: 'Chest hovers just above floor, forearms vertical' },
      { time: 0.75, name: 'phase:ascent', cue: 'Press the floor away through palms, core rigid' },
      { time: 0.95, name: 'rep:top', cue: 'Full arm lockout with active scapular protraction' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'dumbbell-curl': {
    asset: 'dumbbell-curl',
    loop: true,
    duration: 2.6,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Standing tall, elbows pinned to sides, dumbbells at hips' },
      { time: 0.20, name: 'phase:ascent', cue: 'Flex forearms smoothly, supinating palms upward' },
      { time: 0.50, name: 'rep:top', cue: 'Peak biceps squeeze at top, elbows motionless' },
      { time: 0.75, name: 'phase:descent', cue: 'Resist gravity on controlled eccentric lowering' },
      { time: 0.95, name: 'rep:bottom', cue: 'Full stretch without hyperextending elbows' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },
  'bench-press': {
    asset: 'bench-press',
    loop: true,
    duration: 2.5,
    events: [
      { time: 0.0, name: 'rep:start', cue: 'Bar locked out over chest, scapulae pinched into bench pad' },
      { time: 0.20, name: 'phase:descent', cue: 'Tuck elbows at 45 degrees, lower bar with control' },
      { time: 0.50, name: 'rep:bottom', cue: 'Light touch on lower sternum, forearms vertical' },
      { time: 0.75, name: 'phase:ascent', cue: 'Drive feet into floor, press bar vertically' },
      { time: 0.95, name: 'rep:top', cue: 'Lockout elbows over chest, maintain retracted upper back' },
      { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
    ],
  },

  // ===========================================================================
  // STAGE 5.1: DEVELOPER-ONLY CALIBRATION / DEBUG POSES (Phase C)
  // Deterministic static poses through the same rest × delta retarget path
  // as exercises. Surfaced in Animation Studio's calibration selector only.
  // ===========================================================================
  'calib-neutral': { asset: 'calib-neutral', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: neutral' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
  'calib-arms-forward': { asset: 'calib-arms-forward', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: arms forward' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
  'calib-arms-side': { asset: 'calib-arms-side', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: T-pose' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
  'calib-arms-overhead': { asset: 'calib-arms-overhead', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: overhead' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
  'calib-elbow-flexion-90': { asset: 'calib-elbow-flexion-90', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: elbow 90' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
  'calib-hip-flexion': { asset: 'calib-hip-flexion', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: hip flexion' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
  'calib-knee-flexion-90': { asset: 'calib-knee-flexion-90', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: knee 90' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
  'calib-ankle-neutral': { asset: 'calib-ankle-neutral', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: ankle neutral' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
  'calib-horizontal-plank': { asset: 'calib-horizontal-plank', loop: true, duration: 2.0, events: [{ time: 0.0, name: 'rep:start', cue: 'Calibration: plank' }, { time: 1.0, name: 'rep:end', cue: 'Rep complete' }] },
};

export function getMotionMetadata(id: string): ExerciseMotionMetadata {
  if (MOTION_REGISTRY[id]) return MOTION_REGISTRY[id];
  const clean = id.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (clean.includes('jack') || clean.includes('jumping')) return MOTION_REGISTRY['jumping-jack'];
  if (clean.includes('squat')) return MOTION_REGISTRY['bodyweight-squat'];
  if (clean.includes('push') || clean.includes('plank')) return MOTION_REGISTRY['push-up'];
  if (clean.includes('curl')) return MOTION_REGISTRY['dumbbell-curl'];
  if (clean.includes('bench')) return MOTION_REGISTRY['bench-press'];
  if (clean.includes('hinge')) return MOTION_REGISTRY['motion-test-hip-hinge'];
  if (clean.includes('arm') || clean.includes('raise')) return MOTION_REGISTRY['motion-test-arm-raise'];
  return MOTION_REGISTRY['bodyweight-squat'] || MOTION_REGISTRY[id];
}
