import type { CanonicalMuscleId } from '../core/types.js';
import { CHARACTER_MUSCLE_MAPS } from '../muscles/CharacterMuscleMap.js';

/**
 * Health OS Production Muscle Map — Stage 4: Production Asset Integration
 *
 * Reconciles the frozen Production V1 muscle regions
 * (`manifests/muscle-map.json`: `bodyos.region.<muscle>.<side>` vertex
 * groups on the production Body mesh, with stable `region_index` values)
 * with the existing `CharacterMuscleMap` abstraction.
 *
 * The production VRM carries no separate `muscle_*` overlay meshes, so the
 * procedural-rig descriptors are preserved untouched for the fallback rig.
 * Production vertex-group metadata is merged additively; resolvers that only
 * understand mesh targets keep working, and future vertex-mask rendering can
 * consume `vertexGroups` without further registry changes.
 */

interface ProductionRegionEntry {
  group: string;
  regionIndex: number;
}

const PRODUCTION_BODY_TARGET = 'bodyos.character.male-athletic.body';

function entry(muscle: CanonicalMuscleId, leftIndex: number, rightIndex: number): {
  left: ProductionRegionEntry;
  right: ProductionRegionEntry;
} {
  return {
    left: { group: `bodyos.region.${muscle}.left`, regionIndex: leftIndex },
    right: { group: `bodyos.region.${muscle}.right`, regionIndex: rightIndex },
  };
}

const PRODUCTION_REGIONS: Record<CanonicalMuscleId, { left: ProductionRegionEntry; right: ProductionRegionEntry }> = {
  'deltoid': entry('deltoid', 1, 16),
  'trapezius': entry('trapezius', 2, 17),
  'pectoralis-major': entry('pectoralis-major', 3, 18),
  'biceps': entry('biceps', 4, 19),
  'triceps': entry('triceps', 5, 20),
  'forearms': entry('forearms', 6, 21),
  'rectus-abdominis': entry('rectus-abdominis', 7, 22),
  'obliques': entry('obliques', 8, 23),
  'latissimus-dorsi': entry('latissimus-dorsi', 9, 24),
  'erector-spinae': entry('erector-spinae', 10, 25),
  'gluteus-maximus': entry('gluteus-maximus', 11, 26),
  'quadriceps': entry('quadriceps', 12, 27),
  'hamstrings': entry('hamstrings', 13, 28),
  'adductors': entry('adductors', 14, 29),
  'calves': entry('calves', 15, 30),
};

export function getProductionTargetId(): string {
  return PRODUCTION_BODY_TARGET;
}

/**
 * Merges Production V1 vertex-group metadata into the `male-athletic`
 * muscle map. Idempotent. Existing mesh descriptors (fallback rig) are
 * preserved; production data is added alongside them.
 */
export function registerProductionMaleAthleticMuscleMap(): void {
  const map = CHARACTER_MUSCLE_MAPS['male-athletic'];
  if (!map) return;
  (Object.keys(PRODUCTION_REGIONS) as CanonicalMuscleId[]).forEach((muscleId) => {
    const regions = PRODUCTION_REGIONS[muscleId];
    const existing = map[muscleId];
    if (!existing) return;
    existing.vertexGroups = [
      { group: regions.left.group, regionIndex: regions.left.regionIndex, side: 'left' },
      { group: regions.right.group, regionIndex: regions.right.regionIndex, side: 'right' },
    ];
    existing.productionTarget = PRODUCTION_BODY_TARGET;
  });
}
