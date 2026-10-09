/**
 * Health OS Animation System v1 — Core Types & Contracts
 */

export type CameraPreset =
  | 'front'
  | 'back'
  | 'side'
  | 'side-left'
  | 'side-right'
  | 'three-quarter'
  | 'three-quarter-front'
  | 'three-quarter-front-left'
  | 'three-quarter-front-right'
  | 'three-quarter-back'
  | 'three-quarter-back-left'
  | 'three-quarter-back-right'
  | 'horizontal-floor';

export type DisplayMode = 'exercise' | 'muscles' | 'form';

export type CanonicalMuscleId =
  | 'deltoid'
  | 'trapezius'
  | 'pectoralis-major'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'rectus-abdominis'
  | 'obliques'
  | 'latissimus-dorsi'
  | 'erector-spinae'
  | 'gluteus-maximus'
  | 'quadriceps'
  | 'hamstrings'
  | 'adductors'
  | 'calves';

export type MuscleSide = 'left' | 'right' | 'bilateral';

export interface MuscleActivation {
  primary: string[];
  secondary: string[];
  intensity?: Record<string, number>;
}

export type HumanoidBoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'leftToes'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot'
  | 'rightToes';

export interface EquipmentAttachmentPoint {
  id: string; // e.g. "dumbbell"
  attachToBone: HumanoidBoneName | 'floor' | 'root';
  socketName: string; // e.g. "Grip_C", "Grip_L", "Grip_R"
  offset?: {
    position: [number, number, number];
    rotation: [number, number, number]; // Euler angles (radians or degrees)
    scale?: [number, number, number];
  };
  /**
   * Stage 5: mount onto a sibling equipment instance attached earlier in the
   * same exercise (e.g. plates onto the barbell) instead of a skeleton bone.
   * When set, `attachToBone` is ignored for parenting.
   */
  attachToEquipment?: string; // e.g. "barbell"
  /**
   * Stage 5: production `bodyos_id` anchor on the host equipment instance
   * used as the mount point (e.g. `equipment.sleeve.left`). Falls back to
   * the host origin when absent.
   */
  anchorBodyosId?: string;
}

export interface ExercisePhases {
  start: number;        // e.g. 0.0
  concentricEnd: number;// e.g. 0.42
  top: number;          // e.g. 0.50
  eccentricEnd: number; // e.g. 0.92
}

export interface ExerciseMotionMetadata {
  asset: string;       // e.g. "bodyweight-squat.vrma"
  loop: boolean;
  duration: number;     // seconds
  events?: Array<{
    time: number;       // normalized 0..1 or seconds
    name: string;       // "top", "bottom", "inflection"
    cue?: string;       // "Drive up", "Lower with control"
  }>;
}

export type FormCueType =
  | 'arrow'
  | 'path'
  | 'joint-angle'
  | 'alignment-line'
  | 'range-of-motion'
  | 'body-axis'
  | 'equipment-path'
  | 'contact-point'
  | 'text-label'
  | 'warning-region';

export interface FormCueDefinition {
  id: string;
  type: FormCueType;
  label: string;
  phases: string[]; // e.g. ['phase:descent', 'rep:bottom'] or ['all']
  anchor: HumanoidBoneName | 'floor' | string;
  target?: HumanoidBoneName | 'floor' | string | [number, number, number];
  secondaryAnchor?: HumanoidBoneName | string; // For 3-point joint angles
  color?: string; // Hex color code
  targetAngle?: number; // In degrees
  tolerance?: number; // In degrees
  pathPoints?: Array<[number, number, number]>; // Pre-computed canonical curve
  visualRadius?: number;
}

export interface ExerciseFormMetadata {
  cues: FormCueDefinition[];
}

export interface ExerciseDefinition {
  id: string;
  version: number;
  name: string;
  category: 'strength' | 'hypertrophy' | 'conditioning' | 'mobility';
  supportedCharacters: string[];
  motion: ExerciseMotionMetadata;
  equipment: EquipmentAttachmentPoint[];
  camera: {
    default: CameraPreset;
    supported: CameraPreset[];
  };
  muscles: {
    primary: string[];
    secondary: string[];
  };
  form?: ExerciseFormMetadata;
  phases: ExercisePhases;
  cues: string[];
}

export interface CharacterDefinition {
  id: string; // "male-athletic", "male-muscular", "female-athletic", "female-muscular"
  name: string;
  asset: string; // path to .vrm
  gender: 'male' | 'female';
  physique: 'athletic' | 'muscular';
  defaultOutfit: string;
}

export interface EquipmentDefinition {
  id: string; // "dumbbell", "barbell", "flat-bench", "squat-rack", etc.
  version: number;
  name: string;
  asset: string; // path to .glb
  attachmentPoints: Record<string, string>; // e.g. { handleCenter: "Grip_C" }
  variants?: string[];
  defaultScale?: [number, number, number];
}

export interface PlaybackState {
  isPlaying: boolean;
  progress: number; // 0..1
  currentTime: number; // seconds
  duration: number; // seconds
  speed: number;
  loop: boolean;
  camera: CameraPreset;
  mode: DisplayMode;
  exerciseId: string;
  characterId: string;
}
