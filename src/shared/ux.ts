import { z } from 'zod';

export const HOME_SUMMARIES = ['Train', 'Eat', 'Recover', 'Sleep', 'Health', 'Body', 'Care', 'Supplements'] as const;
export const uxPreferencesSchema = z.object({
  version: z.literal(1).default(1),
  homeSummaries: z.array(z.enum(HOME_SUMMARIES)).max(3).default(['Train', 'Sleep', 'Health']),
  quickLogFavorites: z.array(z.string().max(40)).max(5).default(['Water', 'Food', 'Weight']),
  setupCompleted: z.boolean().default(false),
});
export type UxPreferences = z.infer<typeof uxPreferencesSchema>;
export const defaultUxPreferences = (): UxPreferences => uxPreferencesSchema.parse({});
export type MutationStatus = 'idle' | 'draft' | 'saving' | 'localPending' | 'synced' | 'failed' | 'conflict';
export const mutationLabels: Record<MutationStatus, string> = {
  idle: '', draft: 'Draft saved on this device', saving: 'Saving…',
  localPending: 'Saved on this device — sync pending', synced: 'Saved to account',
  failed: 'Couldn’t save. Your entries are still available.', conflict: 'Conflict needs review. Your draft is preserved.',
};
