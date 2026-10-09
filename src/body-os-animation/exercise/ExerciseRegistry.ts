import type { ExerciseDefinition } from '../core/types.js';
import { ExerciseManifestSchema } from './ExerciseSchema.js';
import { STANDARD_FORM_CUES } from '../form/FormCueRegistry.js';

const RAW_EXERCISES: Record<string, unknown> = {
  // Phase 3 Core Motion Validation Tests
  'motion-test-squat': {
    id: 'motion-test-squat',
    version: 1,
    name: 'Squat Motion [Phase 3]',
    category: 'strength',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    equipment: [],
    camera: {
      default: 'three-quarter-front',
      supported: ['three-quarter-front', 'front', 'side', 'back'],
    },
    muscles: {
      primary: ['quadriceps', 'gluteus_maximus'],
      secondary: ['hamstrings', 'calves', 'rectus_abdominis'],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.95,
      eccentricEnd: 0.50,
    },
    cues: [
      'TwoBoneIK grounded foot lock: zero foot sliding',
      'Smooth knee flexion without popping',
      'Neutral spinal alignment with torso counter-lean',
    ],
  },
  'motion-test-arm-raise': {
    id: 'motion-test-arm-raise',
    version: 1,
    name: 'Arm Raise [Phase 3]',
    category: 'mobility',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    equipment: [],
    camera: {
      default: 'front',
      supported: ['front', 'three-quarter-front', 'side', 'back'],
    },
    muscles: {
      primary: ['deltoids', 'trapezius'],
      secondary: ['latissimus_dorsi', 'pectoralis_major'],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.50,
      eccentricEnd: 1.0,
    },
    cues: [
      'Natural scapulohumeral rhythm: upward clavicle rotation',
      'Zero shoulder collapse or joint pinching at apex',
      'Stable soft elbow lock without hyperextension',
    ],
  },
  'motion-test-elbow-curl': {
    id: 'motion-test-elbow-curl',
    version: 1,
    name: 'Elbow Curl [Phase 3]',
    category: 'hypertrophy',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    equipment: [],
    camera: {
      default: 'three-quarter-front',
      supported: ['three-quarter-front', 'side', 'front'],
    },
    muscles: {
      primary: ['biceps'],
      secondary: ['forearms'],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.50,
      eccentricEnd: 1.0,
    },
    cues: [
      'Elbow pinned securely at ribcage: zero anterior shoulder swing',
      'Smooth forearm supination into peak flexion',
      'Zero elbow snapping or wrist inversion',
    ],
  },
  'motion-test-hip-hinge': {
    id: 'motion-test-hip-hinge',
    version: 1,
    name: 'Hip Hinge [Phase 3]',
    category: 'strength',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    equipment: [],
    camera: {
      default: 'side',
      supported: ['side', 'three-quarter-front', 'back', 'front'],
    },
    muscles: {
      primary: ['hamstrings', 'gluteus_maximus'],
      secondary: ['erector_spinae', 'latissimus_dorsi'],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.95,
      eccentricEnd: 0.50,
    },
    cues: [
      'Posterior hip translation with soft knees locked at 18 degrees',
      'Rigid neutral spine: zero lumbar rounding',
      'Full foot ground contact maintained throughout',
    ],
  },
  'motion-test-push-up-plank': {
    id: 'motion-test-push-up-plank',
    version: 1,
    name: 'Push-Up / Plank Position [Phase 3]',
    category: 'strength',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    equipment: [],
    camera: {
      default: 'side',
      supported: ['side', 'three-quarter-front', 'horizontal-floor'],
    },
    muscles: {
      primary: ['pectoralis_major', 'triceps'],
      secondary: ['deltoids', 'rectus_abdominis'],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.95,
      eccentricEnd: 0.50,
    },
    cues: [
      'Hands and toes locked to floor plane via IK',
      'Rigid core plank alignment: zero lumbar sag',
      'Smooth 45-degree elbow path with controlled lockout',
    ],
  },

  // Baseline Athletic Stance
  'neutral-stance': {
    id: 'neutral-stance',
    version: 1,
    name: 'Athletic Stance (Neutral Standing)',
    category: 'mobility',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
      asset: 'neutral-stance',
      loop: true,
      duration: 2.0,
      events: [
        { time: 0.0, name: 'rep:start', cue: 'Neutral athletic standing posture' },
        { time: 1.0, name: 'rep:end', cue: 'Rep complete' },
      ],
    },
    equipment: [],
    camera: {
      default: 'three-quarter-front',
      supported: ['three-quarter-front', 'front', 'side', 'back'],
    },
    muscles: {
      primary: ['quadriceps', 'rectus_abdominis', 'deltoids'],
      secondary: ['pectoralis_major', 'gluteus_maximus', 'calves'],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.5,
      top: 0.5,
      eccentricEnd: 1.0,
    },
    cues: ['Chest proud, athletic V-taper', 'Natural relaxed posture', 'Symmetrical balanced stance'],
  },

  // ===========================================================================
  // PHASE 5: THE FIVE PRODUCTION EXERCISES
  // ===========================================================================
  'jumping-jack': {
    id: 'jumping-jack',
    version: 2,
    name: 'Jumping Jack',
    category: 'conditioning',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    equipment: [],
    camera: {
      default: 'front',
      supported: ['front', 'side', 'three-quarter-front'],
    },
    muscles: {
      primary: ['calves', 'deltoid'],
      secondary: ['quadriceps', 'rectus-abdominis', 'trapezius'],
    },
    form: {
      cues: [
        STANDARD_FORM_CUES['jumping-jack-arm-arc'],
        STANDARD_FORM_CUES['jumping-jack-foot-contact'],
      ],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.50,
      eccentricEnd: 1.0,
    },
    cues: [
      'Land softly on balls of feet with knee cushion',
      'Rhythmic continuous breathing',
      'Full arm arc with natural scapular elevation',
    ],
  },
  'bodyweight-squat': {
    id: 'bodyweight-squat',
    version: 2,
    name: 'Bodyweight Squat',
    category: 'strength',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    equipment: [],
    camera: {
      default: 'three-quarter-front',
      supported: ['three-quarter-front', 'front', 'side', 'back'],
    },
    muscles: {
      primary: ['quadriceps', 'gluteus-maximus'],
      secondary: ['hamstrings', 'calves', 'rectus-abdominis'],
    },
    form: {
      cues: [
        STANDARD_FORM_CUES['squat-knee-angle'],
        STANDARD_FORM_CUES['squat-knee-track'],
        STANDARD_FORM_CUES['squat-hip-path'],
        STANDARD_FORM_CUES['squat-spine-neutral'],
      ],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.95,
      eccentricEnd: 0.50,
    },
    cues: [
      'TwoBoneIK grounded feet: zero foot sliding',
      'Knees track over second toe with outward spread',
      'Neutral spine with 32° torso counter-lean',
    ],
  },
  'push-up': {
    id: 'push-up',
    version: 3,
    name: 'Standard Push-Up',
    category: 'strength',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    // Stage 5: production neutral floor for hand/toe contact reference.
    equipment: [
      {
        id: 'body-os-floor',
        attachToBone: 'floor',
        socketName: 'FloorOrigin',
      },
    ],
    camera: {
      default: 'horizontal-floor',
      supported: ['horizontal-floor', 'side', 'three-quarter-front'],
    },
    muscles: {
      primary: ['pectoralis-major', 'triceps'],
      secondary: ['deltoid', 'rectus-abdominis'],
    },
    form: {
      cues: [
        STANDARD_FORM_CUES['pushup-spine-alignment'],
        STANDARD_FORM_CUES['pushup-elbow-angle'],
        STANDARD_FORM_CUES['pushup-hand-contact'],
      ],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.95,
      eccentricEnd: 0.50,
    },
    cues: [
      'Hands and toes locked to floor plane via IK',
      'Elbows track at 45 degrees, protecting shoulders',
      'Zero lumbar sagging or hip piking',
    ],
  },
  'dumbbell-curl': {
    id: 'dumbbell-curl',
    version: 2,
    name: 'Dumbbell Biceps Curl',
    category: 'hypertrophy',
    supportedCharacters: ['male-athletic', 'female-athletic', 'male-muscular', 'female-muscular'],
    motion: {
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
    equipment: [
      {
        id: 'dumbbell',
        attachToBone: 'leftHand',
        socketName: 'Grip_C',
        offset: {
          position: [0, -0.04, 0],
          rotation: [0, 0, 0],
        },
      },
      {
        id: 'dumbbell',
        attachToBone: 'rightHand',
        socketName: 'Grip_C',
        offset: {
          position: [0, -0.04, 0],
          rotation: [0, 0, 0],
        },
      },
    ],
    camera: {
      default: 'three-quarter-front',
      supported: ['three-quarter-front', 'front', 'side'],
    },
    muscles: {
      primary: ['biceps'],
      secondary: ['forearms'],
    },
    form: {
      cues: [
        STANDARD_FORM_CUES['curl-elbow-angle'],
        STANDARD_FORM_CUES['curl-dumbbell-arc'],
      ],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.50,
      eccentricEnd: 1.0,
    },
    cues: [
      'Both dumbbells locked securely to palms',
      'Elbows pinned to ribcage: zero anterior shoulder swing',
      'Full forearm supination into peak bicep squeeze',
    ],
  },
  'bench-press': {
    id: 'bench-press',
    version: 3,
    name: 'Barbell Flat Bench Press',
    category: 'strength',
    supportedCharacters: ['male-athletic', 'male-muscular', 'female-athletic'],
    motion: {
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
    // Stage 5: full production station. Hosts (bench, floor, barbell) attach
    // first; plates mount onto the barbell sleeves via production anchors and
    // follow the bar with zero per-frame cost.
    equipment: [
      {
        id: 'flat-bench',
        attachToBone: 'floor',
        socketName: 'Floor_Base',
        offset: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
      },
      {
        id: 'body-os-floor',
        attachToBone: 'floor',
        socketName: 'FloorOrigin',
      },
      {
        id: 'barbell',
        attachToBone: 'leftHand',
        socketName: 'two-hand',
        offset: {
          position: [0, -0.03, 0],
          rotation: [0, 0, 0],
        },
      },
      {
        id: 'weight-plate-20kg',
        attachToBone: 'root',
        socketName: 'Plate_C',
        attachToEquipment: 'barbell',
        anchorBodyosId: 'equipment.sleeve.left',
      },
      {
        id: 'weight-plate-20kg',
        attachToBone: 'root',
        socketName: 'Plate_C',
        attachToEquipment: 'barbell',
        anchorBodyosId: 'equipment.sleeve.right',
      },
    ],
    camera: {
      default: 'three-quarter-front',
      supported: ['three-quarter-front', 'side', 'front'],
    },
    muscles: {
      primary: ['pectoralis-major', 'triceps'],
      secondary: ['deltoid'],
    },
    form: {
      cues: [
        STANDARD_FORM_CUES['bench-bar-path'],
        STANDARD_FORM_CUES['bench-elbow-angle'],
        STANDARD_FORM_CUES['bench-bar-level'],
      ],
    },
    phases: {
      start: 0.0,
      concentricEnd: 0.50,
      top: 0.95,
      eccentricEnd: 0.50,
    },
    cues: [
      'True two-hand constraint: barbell strictly horizontal',
      'Body supine on bench: head, upper back, and hips in contact',
      'Feet planted flat on floor for stable leg drive',
    ],
  },
};

// Validate all raw manifests with Zod
export const EXERCISE_REGISTRY: Record<string, ExerciseDefinition> = {};
for (const [key, raw] of Object.entries(RAW_EXERCISES)) {
  const result = ExerciseManifestSchema.safeParse(raw);
  if (result.success) {
    EXERCISE_REGISTRY[key] = result.data as ExerciseDefinition;
  } else {
    console.error(`[ExerciseRegistry] Validation failed for ${key}:`, result.error);
  }
}

export function getExerciseDefinition(id: string): ExerciseDefinition {
  if (EXERCISE_REGISTRY[id]) return EXERCISE_REGISTRY[id];
  const clean = id.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (clean.includes('jack') || clean.includes('jumping')) return EXERCISE_REGISTRY['jumping-jack'];
  if (clean.includes('squat')) return EXERCISE_REGISTRY['bodyweight-squat'];
  if (clean.includes('push') || clean.includes('plank')) return EXERCISE_REGISTRY['push-up'];
  if (clean.includes('curl')) return EXERCISE_REGISTRY['dumbbell-curl'];
  if (clean.includes('bench')) return EXERCISE_REGISTRY['bench-press'];
  if (clean.includes('hinge')) return EXERCISE_REGISTRY['motion-test-hip-hinge'];
  if (clean.includes('arm') || clean.includes('raise')) return EXERCISE_REGISTRY['motion-test-arm-raise'];
  return EXERCISE_REGISTRY['bodyweight-squat'] || EXERCISE_REGISTRY[id];
}
