/**
 * Health OS Muscle Activation Schema
 * Declarative Zod validation for primary/secondary muscle activation models.
 */

import { z } from 'zod';
import { CANONICAL_MUSCLE_IDS } from './MuscleRegistry.js';

export const CanonicalMuscleIdSchema = z.enum([
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
]);

export const MuscleSideSchema = z.enum(['left', 'right', 'bilateral']);

export const MuscleActivationSchema = z.object({
  primary: z.array(z.string()).default([]),
  secondary: z.array(z.string()).default([]),
  intensity: z.record(z.string(), z.number().min(0).max(1)).optional(),
});

export type ValidatedMuscleActivation = z.infer<typeof MuscleActivationSchema>;

export function validateMuscleActivation(data: unknown): ValidatedMuscleActivation {
  return MuscleActivationSchema.parse(data);
}
