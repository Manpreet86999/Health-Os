import type { AppSettings, Profile } from './types.js';

export const emptySettings = (): AppSettings => ({
  senderName: 'Health OS',
  userEmail: '',
  senderEmail: '',
  appPassword: '',
  recipients: [] as string[],
  streakStartDate: '',
  aiProvider: 'openrouter',
  aiApiKey: '',
  openRouterApiKey: '',
  nvidiaNimApiKey: '',
  /** Best free OpenRouter coaching model */
  aiModel: 'openrouter/free',
  pinHash: '',
  secretsSalt: '',
  telegramBotToken: '',
  telegramChatId: '',
  telegramMiniAppUrl: '',
  reportSchedule: 'Sunday 20:00',
  braveSearchApiKey: '',
  isActivated: false,
  productKeyHash: '',
  hasSeenFeatureGuide: false,
  githubUpdatesRepo: '',
  autoCheckUpdates: false,
  gdriveEnabled: false,
  gdriveSchedule: 'weekly',
  gdriveLastBackup: '',
  gdriveLastBackupSize: 0,
  gdriveFolderId: '',
  gdriveRefreshToken: '',
  weeklyGoal: 4,
  restSeconds: 90,
});

export const defaultProfile = (): Omit<Profile, 'createdAt'> & { createdAt: string } => ({
  displayName: '',
  units: 'kg' as const,
  createdAt: new Date().toISOString(),
});
