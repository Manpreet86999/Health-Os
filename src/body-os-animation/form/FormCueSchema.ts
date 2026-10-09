/**
 * Health OS Form Cue Schema
 * Zod validation schema for declarative exercise form cues.
 */

import { z } from 'zod';

export const FormCueTypeSchema = z.enum([
  'arrow',
  'path',
  'joint-angle',
  'alignment-line',
  'range-of-motion',
  'body-axis',
  'equipment-path',
  'contact-point',
  'text-label',
  'warning-region',
]);

export const FormCueDefinitionSchema = z.object({
  id: z.string().min(1),
  type: FormCueTypeSchema,
  label: z.string().min(1),
  phases: z.array(z.string()).default(['all']),
  anchor: z.string().min(1),
  target: z.union([z.string(), z.tuple([z.number(), z.number(), z.number()])]).optional(),
  secondaryAnchor: z.string().optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  targetAngle: z.number().min(0).max(360).optional(),
  tolerance: z.number().min(0).max(90).optional(),
  pathPoints: z.array(z.tuple([z.number(), z.number(), z.number()])).optional(),
  visualRadius: z.number().positive().optional(),
});

export const ExerciseFormMetadataSchema = z.object({
  cues: z.array(FormCueDefinitionSchema).default([]),
});

export type ValidatedFormCueDefinition = z.infer<typeof FormCueDefinitionSchema>;
export type ValidatedExerciseFormMetadata = z.infer<typeof ExerciseFormMetadataSchema>;
