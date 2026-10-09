import type { EquipmentDefinition } from '../core/types.js';

/**
 * Health OS Equipment Registry — Phase 4: Equipment & Interaction System
 *
 * Production-quality equipment definitions with:
 * - Stable unique IDs
 * - Socket attachment points matching humanoid bone names
 * - Constraint metadata for two-hand and world-static modes
 * - Weight plate system for barbell loading
 *
 * All equipment follows the approved Health OS industrial design:
 * matte charcoal/black, machined metal, subtle electric-blue accents, minimal OS branding.
 */

export interface EquipmentConstraintConfig {
  mode: 'parent' | 'two-hand' | 'world-static';
  /** For 'two-hand': names of the two bones */
  boneA?: string;
  boneB?: string;
  /** Center offset for two-hand midpoint calculation */
  centerOffset?: [number, number, number];
  /** Additional rotation offset */
  rotationOffset?: [number, number, number];
  /** For 'world-static': fixed world position */
  worldPosition?: [number, number, number];
  worldRotation?: [number, number, number];
}

export interface ExtendedEquipmentDefinition extends EquipmentDefinition {
  constraint?: EquipmentConstraintConfig;
  /** Physical dimensions for collision / alignment debugging (meters) */
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    weight?: number; // kg
  };
  /**
   * Stage 4: Production V1 asset binding.
   * `glb` is the authoritative runtime URL served from the client public dir.
   * `runtimeId` selects one root inside multi-root GLBs (e.g. `plate-20kg`
   * inside `weight-plates.glb`). `anchors` maps legacy socket names to
   * production `bodyos_id` values for metadata-driven anchor resolution.
   */
  production?: {
    glb: string;
    runtimeId?: string;
    anchors?: Record<string, string>;
  };
}

export const EQUIPMENT_REGISTRY: Record<string, ExtendedEquipmentDefinition> = {
  dumbbell: {
    id: 'dumbbell',
    version: 2,
    name: 'Hex Dumbbell',
    asset: '/assets/body-os/equipment/dumbbell.glb',
    attachmentPoints: {
      handleCenter: 'Grip_C',
      leftGrip: 'Grip_L',
      rightGrip: 'Grip_R',
    },
    variants: ['5kg', '10kg', '15kg', '20kg', '25kg', '30kg'],
    defaultScale: [1, 1, 1],
    constraint: {
      mode: 'parent',
    },
    production: {
      glb: '/assets/body-os/equipment/dumbbell.glb',
      anchors: {
        Grip_C: 'equipment.grip.center',
      },
    },
    dimensions: {
      length: 0.30,
      width: 0.13,
      height: 0.13,
      weight: 10,
    },
  },

  barbell: {
    id: 'barbell',
    version: 2,
    name: 'Olympic Barbell',
    asset: '/assets/body-os/equipment/barbell.glb',
    attachmentPoints: {
      center: 'Grip_C',
      leftGrip: 'Grip_LeftHand',
      rightGrip: 'Grip_RightHand',
      leftPlate: 'Plate_L',
      rightPlate: 'Plate_R',
    },
    variants: ['standard-20kg', 'short-10kg'],
    defaultScale: [1, 1, 1],
    constraint: {
      mode: 'two-hand',
      boneA: 'leftHand',
      boneB: 'rightHand',
      centerOffset: [0, -0.03, 0],
      rotationOffset: [0, 0, 0],
    },
    production: {
      glb: '/assets/body-os/equipment/barbell.glb',
      anchors: {
        Grip_LeftHand: 'equipment.grip.left',
        Grip_RightHand: 'equipment.grip.right',
      },
    },
    dimensions: {
      length: 2.2,
      width: 0.028,
      height: 0.028,
      weight: 20,
    },
  },

  'weight-plate-20kg': {
    id: 'weight-plate-20kg',
    version: 2,
    name: '20kg Bumper Plate',
    asset: '/assets/body-os/equipment/weight-plates.glb',
    attachmentPoints: {
      center: 'Plate_C',
    },
    variants: ['red'],
    defaultScale: [1, 1, 1],
    constraint: {
      mode: 'parent',
    },
    production: {
      glb: '/assets/body-os/equipment/weight-plates.glb',
      runtimeId: 'plate-20kg',
      anchors: {
        Plate_C: 'equipment.center',
      },
    },
    dimensions: {
      length: 0.45,
      width: 0.45,
      height: 0.055,
      weight: 20,
    },
  },

  'weight-plate-10kg': {
    id: 'weight-plate-10kg',
    version: 2,
    name: '10kg Training Plate',
    asset: '/assets/body-os/equipment/weight-plates.glb',
    attachmentPoints: {
      center: 'Plate_C',
    },
    variants: ['blue'],
    defaultScale: [1, 1, 1],
    constraint: {
      mode: 'parent',
    },
    production: {
      glb: '/assets/body-os/equipment/weight-plates.glb',
      runtimeId: 'plate-10kg',
      anchors: {
        Plate_C: 'equipment.center',
      },
    },
    dimensions: {
      length: 0.45,
      width: 0.45,
      height: 0.035,
      weight: 10,
    },
  },

  'weight-plate-5kg': {
    id: 'weight-plate-5kg',
    version: 2,
    name: '5kg Change Plate',
    asset: '/assets/body-os/equipment/weight-plates.glb',
    attachmentPoints: {
      center: 'Plate_C',
    },
    variants: ['green'],
    defaultScale: [1, 1, 1],
    constraint: {
      mode: 'parent',
    },
    production: {
      glb: '/assets/body-os/equipment/weight-plates.glb',
      runtimeId: 'plate-5kg',
      anchors: {
        Plate_C: 'equipment.center',
      },
    },
    dimensions: {
      length: 0.35,
      width: 0.35,
      height: 0.025,
      weight: 5,
    },
  },

  'flat-bench': {
    id: 'flat-bench',
    version: 2,
    name: 'Health OS Flat Bench',
    asset: '/assets/body-os/equipment/flat-bench.glb',
    attachmentPoints: {
      padCenter: 'Pad_C',
      padHead: 'Pad_Head',
      padUpperBack: 'Pad_UpperBack',
      padHips: 'Pad_Hips',
      base: 'Floor_Base',
    },
    variants: ['standard'],
    defaultScale: [1, 1, 1],
    constraint: {
      mode: 'world-static',
      worldPosition: [0, 0, 0],
      worldRotation: [0, 0, 0],
    },
    production: {
      glb: '/assets/body-os/equipment/flat-bench.glb',
      anchors: {
        Floor_Base: 'equipment.floor_base',
        Pad_C: 'equipment.contact.pad_center',
        Pad_Head: 'equipment.contact.pad_head',
        Pad_UpperBack: 'equipment.contact.pad_upper_back',
        Pad_Hips: 'equipment.contact.pad_hips',
      },
    },
    dimensions: {
      length: 1.2,
      width: 0.3,
      height: 0.48,
      weight: 30,
    },
  },

  'body-os-floor': {
    id: 'body-os-floor',
    version: 1,
    name: 'Health OS Neutral Floor',
    asset: '/assets/body-os/equipment/body-os-floor.glb',
    attachmentPoints: {
      origin: 'FloorOrigin',
    },
    variants: ['neutral-8m'],
    defaultScale: [1, 1, 1],
    constraint: {
      mode: 'world-static',
      worldPosition: [0, 0, 0],
      worldRotation: [0, 0, 0],
    },
    production: {
      glb: '/assets/body-os/equipment/body-os-floor.glb',
      anchors: {
        FloorOrigin: 'equipment.floor_origin',
      },
    },
    dimensions: {
      length: 8.0,
      width: 8.0,
      height: 0.03,
    },
  },
};

export function getEquipmentDefinition(id: string): ExtendedEquipmentDefinition | undefined {
  return EQUIPMENT_REGISTRY[id];
}

export function getAllEquipmentIds(): string[] {
  return Object.keys(EQUIPMENT_REGISTRY);
}

export function getEquipmentByType(type: 'dumbbell' | 'barbell' | 'plate' | 'bench' | 'floor'): ExtendedEquipmentDefinition[] {
  switch (type) {
    case 'dumbbell':
      return [EQUIPMENT_REGISTRY.dumbbell];
    case 'barbell':
      return [EQUIPMENT_REGISTRY.barbell];
    case 'plate':
      return Object.values(EQUIPMENT_REGISTRY).filter((e) => e.id.startsWith('weight-plate'));
    case 'bench':
      return [EQUIPMENT_REGISTRY['flat-bench']];
    case 'floor':
      return [EQUIPMENT_REGISTRY['body-os-floor']];
    default:
      return [];
  }
}
