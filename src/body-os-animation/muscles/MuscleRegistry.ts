/**
 * Health OS Muscle Library & Registry
 * Standardized canonical muscle identifiers decoupled from 3D asset mesh names.
 */

import type { CanonicalMuscleId, MuscleSide } from '../core/types.js';

export interface MuscleGroupInfo {
  id: CanonicalMuscleId;
  name: string;
  category: 'upper_body' | 'core' | 'lower_body';
  supportedSides: MuscleSide[];
  aliases: string[];
}

export const CANONICAL_MUSCLE_IDS: readonly CanonicalMuscleId[] = [
  'deltoid',
  'trapezius',
  'pectoralis-major',
  'biceps',
  'triceps',
  'forearms',
  'rectus-abdominis',
  'obliques',
  'latissimus-dorsi',
  'erector-spinae',
  'gluteus-maximus',
  'quadriceps',
  'hamstrings',
  'adductors',
  'calves',
] as const;

export const MUSCLE_REGISTRY: Record<CanonicalMuscleId, MuscleGroupInfo> = {
  'deltoid': {
    id: 'deltoid',
    name: 'Deltoids (Shoulders)',
    category: 'upper_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['deltoids', 'shoulder', 'shoulders', 'anterior-deltoid', 'lateral-deltoid', 'posterior-deltoid'],
  },
  'trapezius': {
    id: 'trapezius',
    name: 'Trapezius (Traps)',
    category: 'upper_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['traps', 'upper-traps'],
  },
  'pectoralis-major': {
    id: 'pectoralis-major',
    name: 'Pectoralis Major (Chest)',
    category: 'upper_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['pectoralis', 'pecs', 'chest', 'pectoralis_major'],
  },
  'biceps': {
    id: 'biceps',
    name: 'Biceps Brachii',
    category: 'upper_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['bicep', 'biceps_brachii', 'arms'],
  },
  'triceps': {
    id: 'triceps',
    name: 'Triceps Brachii',
    category: 'upper_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['tricep', 'triceps_brachii'],
  },
  'forearms': {
    id: 'forearms',
    name: 'Forearms & Brachioradialis',
    category: 'upper_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['forearm', 'brachioradialis', 'grip'],
  },
  'rectus-abdominis': {
    id: 'rectus-abdominis',
    name: 'Rectus Abdominis (Abs)',
    category: 'core',
    supportedSides: ['bilateral'],
    aliases: ['rectus_abdominis', 'abs', 'abdominals', 'core'],
  },
  'obliques': {
    id: 'obliques',
    name: 'External & Internal Obliques',
    category: 'core',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['oblique', 'side-abs'],
  },
  'latissimus-dorsi': {
    id: 'latissimus-dorsi',
    name: 'Latissimus Dorsi (Lats)',
    category: 'upper_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['lats', 'latissimus', 'latissimus_dorsi', 'upper-back'],
  },
  'erector-spinae': {
    id: 'erector-spinae',
    name: 'Erector Spinae (Lower Back)',
    category: 'core',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['erector_spinae', 'lower-back', 'lowerback', 'spinal-erectors'],
  },
  'gluteus-maximus': {
    id: 'gluteus-maximus',
    name: 'Gluteus Maximus (Glutes)',
    category: 'lower_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['glutes', 'glute', 'gluteus_maximus', 'buttocks'],
  },
  'quadriceps': {
    id: 'quadriceps',
    name: 'Quadriceps (Quads)',
    category: 'lower_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['quads', 'quad', 'thighs', 'front-thighs'],
  },
  'hamstrings': {
    id: 'hamstrings',
    name: 'Hamstrings',
    category: 'lower_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['hamstring', 'posterior-thighs', 'biceps-femoris'],
  },
  'adductors': {
    id: 'adductors',
    name: 'Hip Adductors (Inner Thigh)',
    category: 'lower_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['adductor', 'inner-thigh', 'groin'],
  },
  'calves': {
    id: 'calves',
    name: 'Calves (Gastrocnemius & Soleus)',
    category: 'lower_body',
    supportedSides: ['left', 'right', 'bilateral'],
    aliases: ['calf', 'gastrocnemius', 'soleus', 'lower-leg'],
  },
};

/**
 * Normalizes any muscle alias or raw string to a canonical muscle ID.
 */
export function normalizeMuscleId(raw: string): CanonicalMuscleId {
  if (!raw) return 'deltoid';
  const clean = raw.toLowerCase().trim().replace(/_/g, '-');

  // Direct match
  if (clean in MUSCLE_REGISTRY) {
    return clean as CanonicalMuscleId;
  }

  // Alias lookup
  for (const [canonicalId, info] of Object.entries(MUSCLE_REGISTRY)) {
    if (info.aliases.includes(clean)) {
      return canonicalId as CanonicalMuscleId;
    }
  }

  // Substring fuzzy matching
  const alphanumeric = clean.replace(/[^a-z0-9]/g, '');
  if (alphanumeric.includes('chest') || alphanumeric.includes('pec')) return 'pectoralis-major';
  if (alphanumeric.includes('delt') || alphanumeric.includes('shoulder')) return 'deltoid';
  if (alphanumeric.includes('bicep') || (alphanumeric.includes('arm') && !alphanumeric.includes('fore'))) return 'biceps';
  if (alphanumeric.includes('tricep')) return 'triceps';
  if (alphanumeric.includes('forearm')) return 'forearms';
  if (alphanumeric.includes('lat')) return 'latissimus-dorsi';
  if (alphanumeric.includes('trap')) return 'trapezius';
  if (alphanumeric.includes('ab') || alphanumeric.includes('core')) return 'rectus-abdominis';
  if (alphanumeric.includes('oblique')) return 'obliques';
  if (alphanumeric.includes('erector') || alphanumeric.includes('lowerback') || alphanumeric.includes('spinae')) return 'erector-spinae';
  if (alphanumeric.includes('glute')) return 'gluteus-maximus';
  if (alphanumeric.includes('quad') || alphanumeric.includes('thigh')) return 'quadriceps';
  if (alphanumeric.includes('hamstring')) return 'hamstrings';
  if (alphanumeric.includes('adductor') || alphanumeric.includes('innerthigh')) return 'adductors';
  if (alphanumeric.includes('calf') || alphanumeric.includes('calve')) return 'calves';

  return 'deltoid';
}
