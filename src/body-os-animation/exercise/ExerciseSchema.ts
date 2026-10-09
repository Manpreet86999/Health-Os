import { z } from 'zod';
import { ExerciseFormMetadataSchema } from '../form/FormCueSchema.js';

export const EquipmentAttachmentSchema = z.object({
  id: z.string(),
  attachToBone: z.enum([
    'hips',
    'spine',
    'chest',
    'upperChest',
    'neck',
    'head',
    'leftShoulder',
    'leftUpperArm',
    'leftLowerArm',
    'leftHand',
    'rightShoulder',
    'rightUpperArm',
    'rightLowerArm',
    'rightHand',
    'leftUpperLeg',
    'leftLowerLeg',
    'leftFoot',
    'leftToes',
    'rightUpperLeg',
    'rightLowerLeg',
    'rightFoot',
    'rightToes',
    'floor',
    'root',
  ]),
  socketName: z.string().default('Grip_C'),
  offset: z
    .object({
      position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
      rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
      scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
    })
    .optional(),
  // Stage 5: mount onto a sibling equipment instance (e.g. plates on barbell).
  attachToEquipment: z.string().optional(),
  anchorBodyosId: z.string().optional(),
});

export const CameraPresetSchema = z.enum([
  'front',
  'back',
  'side',
  'side-left',
  'side-right',
  'three-quarter',
  'three-quarter-front',
  'three-quarter-front-left',
  'three-quarter-front-right',
  'three-quarter-back',
  'three-quarter-back-left',
  'three-quarter-back-right',
  'horizontal-floor',
]);

export const ExerciseManifestSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  name: z.string(),
  category: z.enum(['strength', 'hypertrophy', 'conditioning', 'mobility']).default('strength'),
  supportedCharacters: z.array(z.string()).default(['male-athletic']),
  motion: z.object({
    asset: z.string(),
    loop: z.boolean().default(true),
    duration: z.number().positive(),
    events: z
      .array(
        z.object({
          time: z.number(),
          name: z.string(),
          cue: z.string().optional(),
        })
      )
      .optional(),
  }),
  equipment: z.array(EquipmentAttachmentSchema).default([]),
  camera: z.object({
    default: CameraPresetSchema.default('three-quarter-front'),
    supported: z.array(CameraPresetSchema).default(['three-quarter-front', 'front', 'side']),
  }),
  muscles: z.object({
    primary: z.array(z.string()),
    secondary: z.array(z.string()).default([]),
  }),
  form: ExerciseFormMetadataSchema.optional(),
  phases: z.object({
    start: z.number().default(0),
    concentricEnd: z.number(),
    top: z.number(),
    eccentricEnd: z.number(),
  }),
  cues: z.array(z.string()).default([]),
});

export type ValidatedExerciseManifest = z.infer<typeof ExerciseManifestSchema>;
