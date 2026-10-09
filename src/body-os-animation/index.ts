/**
 * Health OS Animation System v1 — Public SDK Entry Point
 */

export * from './core/types.js';
export * from './core/AnimationAdapter.js';
export * from './core/events.js';
export * from './core/AnimationEngine.js';

export * from './camera/CameraPresets.js';
export * from './camera/CameraController.js';

export * from './character/SkeletonMap.js';
export * from './character/CharacterRegistry.js';
export * from './character/CharacterController.js';
export * from './character/ProductionSkeletonMap.js';
export * from './character/GripPresets.js';
export * from './character/NormalizedGripPresets.js';
export * from './character/ProductionMuscleMap.js';

export * from './motion/MotionEvents.js';
export * from './motion/MotionRegistry.js';
export * from './motion/MotionController.js';
export * from './motion/TwoBoneIK.js';
export * from './motion/ProductionRetarget.js';
// Motion V2 — normalized humanoid pipeline (M1: calibration only)
export * from './motion/BodyOSMotionClip.js';
export * from './motion/MotionLibrary.js';
export * from './motion/MotionPlayer.js';
export * from './motion/HumanoidApplicator.js';
export * from './motion/CalibrationClips.js';
export * from './motion/MotionV2Controller.js';
export * from './motion/FrameOwnershipDiagnostic.js';

export * from './muscles/MuscleRegistry.js';
export * from './muscles/MuscleMaterial.js';
export * from './muscles/MuscleController.js';

export * from './equipment/EquipmentRegistry.js';
export * from './equipment/AttachmentSystem.js';
export * from './equipment/EquipmentController.js';
export * from './equipment/ProductionAnchors.js';

export * from './exercise/ExerciseSchema.js';
export * from './exercise/ExerciseRegistry.js';
export * from './exercise/ExerciseController.js';

export * from './adapters/three-vrm/ThreeVRMAdapter.js';

export * from './ui/ExerciseAnimation.js';
export * from './ui/AnimationControls.js';

export * from './dev/AnimationStudio.js';
