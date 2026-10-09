import { get, post, put, del } from './api';
import type { AppDb, Bootstrap, CoachResult, Measurement, PublicSettings, Session, TrackerState, Week } from './types';
import type { SkinLog, SkinProduct, SkinProfile, SkinRoutine, SkinState, CareData, CareProposal, CarePhoto } from '../../shared/skin';

export interface WorkoutApiClient {
  bootstrap(): Promise<Bootstrap>;
  
  // Auth
  authStatus(): Promise<{ hasPin: boolean }>;
  authUnlock(pin: string): Promise<{ token: string }>;
  authSetupPin(pin: string, currentPin: string): Promise<{ token: string }>;
  authClearPin(currentPin: string): Promise<void>;

  // Meta / Settings
  saveSettings(settings: Record<string, unknown>): Promise<PublicSettings>;
  sendDummyEmail(): Promise<{ sentTo: string[] }>;
  sendReport(sessionId: string): Promise<{ sentTo: string[]; status?: string; deliveryId?: string }>;
  sendFeedback(data: { category: string; message: string; replyTo?: string }): Promise<{ ok: true }>;
  sendTelegramWorkoutPlan(data: { weekId: string; dayKey: string; date: string }): Promise<{ ok: true }>;
  getTelegramGymEntries(): Promise<{ entries: Array<{ exerciseIndex: number; sets: Array<{ w: number; r: number }>; note?: string }> }>;
  
  // AI / Coach
  getAiModels(): Promise<{ recommended: string; models: any[]; nvidiaModels: any[] }>;
  testAi(): Promise<{ ok: boolean; message?: string; model?: string; latencyMs?: number; sample?: string; error?: string }>;
  rebuildAnalyticsLab(): Promise<{ sessions: number; volume: number; avgReadiness: number | null; readinessPerformanceCorrelation: number | null; weekly: Array<{ week: string; volume: number; sessions: number }> }>;
  benchmarkAi(limit: number): Promise<any>;
  coachChat(message: string): Promise<{ ok: boolean; answer?: string; model?: string; error?: string }>;
  webResearch(question: string): Promise<{
    ok: boolean; answer?: string; model?: string; error?: string; searchCount?: number; searchMonth?: string;
    sources?: Array<{ title: string; url: string; content: string }>;
  }>;
  generateCoachAdvice(): Promise<{ coach: CoachResult }>;
  morningBrief(): Promise<{ ok: boolean; brief?: string; model?: string; error?: string }>;
  workoutGen(prompt: string): Promise<{ ok: boolean; workout?: any; model?: string; error?: string }>;
  plateauBuster(exercise: string): Promise<{ ok: boolean; advice?: string[]; model?: string; error?: string }>;
  exerciseCues(exercise: string): Promise<{ ok: boolean; cues?: string[]; model?: string; error?: string }>;
  
  // Readiness
  saveReadiness(data: Record<string, unknown>): Promise<void>;
  
  // Targets / Goals
  saveTarget(data: Record<string, unknown>): Promise<void>;
  deleteTarget(id: string): Promise<void>;

  // Measurements
  saveMeasurement(data: Record<string, unknown>): Promise<void>;
  deleteMeasurement(id: string): Promise<void>;
  deleteHabit(id: string): Promise<void>;
  deleteCardioSession(id: string): Promise<void>;

  // Weeks / Planner
  saveWeek(id: string, data: Partial<Week>): Promise<void>;
  activateWeek(id: string): Promise<void>;
  completeWeek(id: string): Promise<void>;
  startFlexibleWeek(strategy: 'today' | 'monday' | 'next-monday'): Promise<{ week: Week; resumed?: boolean }>;
  recordFlexibleRest(weekId: string, dayKey: string): Promise<void>;
  completeFlexibleWeek(weekId: string, name: string): Promise<{ ok: true; templateId: string }>;
  deleteWeek(id: string): Promise<void>;
  importWeek(data: Record<string, unknown>): Promise<Week>;
  duplicateWeek(id: string): Promise<Week>;
  saveLibrarySplit(data: Partial<Week>): Promise<Week>;
  deleteLibrarySplit(id: string): Promise<void>;

  // Sessions
  saveSession(session: Record<string, unknown> | TrackerState): Promise<{ session: { id: string } }>;
  updateSession(id: string, data: Partial<Session>): Promise<void>;
  deleteSession(id: string): Promise<void>;
  
  // Habits
  saveHabit(data: Record<string, unknown>): Promise<void>;
  saveHabitLog(data: Record<string, unknown>): Promise<void>;
  
  // Cardio
  saveCardioSession(data: Record<string, unknown>): Promise<void>;
  
  // Goal Check-ins
  saveGoalCheckIn(data: Record<string, unknown>): Promise<void>;
  
  // Weekly Reviews
  saveWeeklyReview(data: Record<string, unknown>): Promise<void>;
  
  getPreviousSets(exerciseName: string): Promise<{ sets: any[] }>;
  getProgressionTips(exerciseName: string): Promise<{ tips: any[] }>;
  
  importSessions(data: any[]): Promise<{ imported: number; skipped: number }>;

  // Backup
  getBackup(): Promise<AppDb>;
  restoreBackup(db: Partial<AppDb>): Promise<void>;
  previewCloudSync(data: { url: string; publishableKey: string; accessToken: string; deviceId: string }): Promise<{ localRecords: number; remoteRecords: number; upload: number; download: number; conflicts: unknown[] }>;
  uploadInitialCloudSync(data: { url: string; publishableKey: string; accessToken: string; deviceId: string }): Promise<{ ok: boolean; uploaded: number }>;
  
  // Google Drive
  getGdriveAuthUrl(): Promise<{ url: string }>;
  triggerGdriveBackup(): Promise<{ ok: boolean; size?: number }>;
  listGdriveBackups(): Promise<{ backups: Array<{ id: string; name: string; date: string; size: number }> }>;
  restoreGdriveBackup(fileId: string): Promise<{ ok: true; safetyBackup: { createdAt: string; localPath: string } }>;
  disconnectGdrive(): Promise<void>;

  // Advanced
  listExercises(): Promise<{ exercises: any[] }>;
  saveExercise(data: Record<string, unknown>): Promise<void>;
  importExercises(data: any[]): Promise<{ imported: number }>;
  deleteExercise(id: string): Promise<void>;
  exerciseHistory(name: string): Promise<{ name: string; familyId?: string; history: any[] }>;
  saveProgram(data: Record<string, unknown>): Promise<void>;
  deleteProgram(id: string): Promise<void>;
  savePainLog(data: Record<string, unknown>): Promise<void>;
  deletePainLog(id: string): Promise<void>;
  saveSchedule(data: Record<string, unknown>): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
  saveTrainingConfig(data: Record<string, unknown>): Promise<any>;
  createDeloadWeek(weekId: string, volumeMultiplier?: number): Promise<any>;
  missedSession(data: Record<string, unknown>): Promise<void>;

  // Skincare workspace
  getSkin(): Promise<SkinState>;
  saveCareData(data: CareData): Promise<CareData>;
  listCarePhotos(): Promise<CarePhoto[]>;
  saveCarePhoto(data: CarePhoto): Promise<CarePhoto>;
  deleteCarePhoto(id:string): Promise<void>;
  observeCarePhoto(id:string, consent:boolean): Promise<{observation:string;model:string}>;
  validateCareProposal(data: unknown): Promise<CareProposal>;
  applyCareProposal(data: CareProposal): Promise<CareData>;
  saveSkinProfile(data: Partial<SkinProfile>): Promise<SkinProfile>;
  saveSkinProduct(data: Partial<SkinProduct> & { name: string }): Promise<SkinProduct>;
  deleteSkinProduct(id: string): Promise<void>;
  saveSkinRoutine(data: SkinRoutine): Promise<SkinRoutine>;
  saveSkinLog(data: Partial<SkinLog> & { date?: string; skipReview?: boolean }): Promise<{
    log: SkinLog;
    review: { comment: string; adjustments: string[]; local?: boolean; model?: string } | null;
    skin: SkinState;
  }>;
  deleteSkinLog(id: string): Promise<void>;
  importSkinProducts(data: unknown): Promise<{ imported: number; skipped: number; errors: string[] }>;
  getSkinProductTemplate(): Promise<{ products: unknown[] }>;
  skinCoachAsk(
    question: string,
    history?: Array<{ role: 'user' | 'ai'; content: string }>,
  ): Promise<{ ok: boolean; answer?: string; model?: string; error?: string; local?: boolean; actions?: string[]; proposal?: unknown; productProposal?: {name:string;brand:string;category:SkinProduct['category'];actives:string[];useCase:string;bestFor:string[];sourceUrl:string;sourceExcerpt?:string}; skin?: SkinState }>;
  readSkinProductLabel(dataUrl:string,consent:boolean): Promise<{proposal:{name:string;brand:string;category:SkinProduct['category'];actives:string[];useCase:string;bestFor:string[];sourceUrl:string};model:string}>;
  searchSkinProduct(query: string): Promise<{
    ok: boolean; answer?: string; model?: string; error?: string; searchCount?: number; searchMonth?: string;
    sources?: Array<{ title: string; url: string; content: string }>;
    proposal?: { name: string; brand: string; category: SkinProduct['category']; actives: string[]; useCase: string; bestFor: string[]; sourceUrl: string; sourceExcerpt?: string };
  }>;  skinBuildRoutine(prompt?: string): Promise<{
    ok: boolean;
    notes?: string;
    actions?: string[];
    am?: string[];
    pm?: string[];
    local?: boolean;
    error?: string;
    skin?: SkinState;
  }>;

  // Updates (GitHub Releases — free)
  checkUpdates(force?: boolean): Promise<UpdateCheckResult>;
  downloadUpdate(): Promise<UpdateDownloadStatus>;
  getUpdateDownloadStatus(): Promise<UpdateDownloadStatus>;
  installUpdate(): Promise<{ ok: true; message: string } | { ok: false; error: string }>;
  getUpdateNotice(): Promise<{ notice: UpdateNotice | null }>;
  acknowledgeUpdateNotice(): Promise<{ ok: true }>;
}

export interface UpdateCheckResult {
  configured: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  htmlUrl: string | null;
  repo: string | null;
  message?: string;
  checkedAt: string;
  fromCache?: boolean;
  dataProtection?: {
    dualBackupRequired: boolean;
    safetyVault: string;
    note: string;
  };
}

export interface UpdateDownloadStatus {
  phase: 'idle' | 'downloading' | 'ready' | 'failed';
  bytesDownloaded: number;
  totalBytes: number | null;
  percent: number | null;
  message: string;
  error?: string;
}

export interface UpdateNotice {
  version: string;
  name: string | null;
  notes: string | null;
  updatedAt: string;
}

export const CloudApiClient: WorkoutApiClient = {
  bootstrap: () => get<Bootstrap>('/api/bootstrap'),
  
  authStatus: () => get<{ hasPin: boolean }>('/api/auth/status'),
  authUnlock: (pin: string) => post<{ token: string }>('/api/auth/unlock', { pin }),
  authSetupPin: (pin: string, currentPin: string) => post<{ token: string }>('/api/auth/setup-pin', { pin, currentPin }),
  authClearPin: (pin: string) => post('/api/auth/clear-pin', { pin }),
  
  saveSettings: (settings) => post('/api/settings', settings),
  sendDummyEmail: () => post<{ sentTo: string[] }>('/api/send-dummy-email', {}),
  sendReport: (sessionId: string) => post<{ sentTo: string[]; status?: string; deliveryId?: string }>('/api/send-report', { sessionId }),
  sendFeedback: (data) => post('/api/feedback', data),
  sendTelegramWorkoutPlan: (data) => post('/api/telegram/send-workout-plan', data),
  getTelegramGymEntries: () => get('/api/telegram/gym-entries'),
  
  getAiModels: () => get<{ recommended: string; models: any[]; nvidiaModels: any[] }>('/api/ai/models'),
  testAi: () => post('/api/ai/test', {}),
  rebuildAnalyticsLab: () => post('/api/analytics-lab/rebuild', {}),
  benchmarkAi: (limit: number) => post('/api/ai/benchmark', { limit }),
  coachChat: (question: string) => post('/api/ai/ask', { question }),
  webResearch: (question: string) => post('/api/ai/web-research', { question }),
  generateCoachAdvice: () => post('/api/ai/coach', {}),
  morningBrief: () => post('/api/ai/morning-brief', {}),
  workoutGen: (prompt: string) => post('/api/ai/workout-gen', { prompt }),
  plateauBuster: (exercise: string) => post('/api/ai/plateau-buster', { exercise }),
  exerciseCues: (exercise: string) => post('/api/ai/exercise-cues', { exercise }),
  
  saveReadiness: (data) => post('/api/readiness', data),
  
  saveTarget: (data) => post('/api/targets', data),
  deleteTarget: (id) => del(`/api/targets/${id}`),
  
  saveMeasurement: (data) => post('/api/measurements', data),
  deleteMeasurement: (id) => del(`/api/measurements/${id}`),
  deleteHabit: (id) => del(`/api/habits/${id}`),
  deleteCardioSession: (id) => del(`/api/cardio/${id}`),
  
  saveWeek: (id, data) => put(`/api/weeks/${id}`, data),
  activateWeek: (id) => post(`/api/weeks/${id}/activate`, {}),
  completeWeek: (id) => post(`/api/weeks/${id}/complete`, {}),
  startFlexibleWeek: (strategy) => post('/api/flexible-weeks/start', { strategy }),
  recordFlexibleRest: (weekId, dayKey) => post(`/api/flexible-weeks/${weekId}/rest`, { dayKey }),
  completeFlexibleWeek: (weekId, name) => post(`/api/flexible-weeks/${weekId}/complete`, { name }),
  deleteWeek: (id) => del(`/api/weeks/${id}`),
  importWeek: (data) => post('/api/weeks/import', data),
  duplicateWeek: (id) => post(`/api/weeks/${id}/duplicate`, {}),
  saveLibrarySplit: (data) => post('/api/library-splits', data),
  deleteLibrarySplit: (id) => del(`/api/library-splits/${id}`),
  
  saveSession: (data) => post<{ session: { id: string } }>('/api/sessions', data),
  updateSession: (id, data) => put(`/api/sessions/${id}`, data),
  deleteSession: (id) => del(`/api/sessions/${id}`),
  
  getPreviousSets: (name) => get(`/api/sessions/previous?exercise=${encodeURIComponent(name)}`),
  getProgressionTips: (name) => get(`/api/sessions/progression?exercise=${encodeURIComponent(name)}`),
  
  importSessions: (data) => post('/api/sessions/import', data),
  
  saveHabit: (data) => post('/api/habits', data),
  saveHabitLog: (data) => post('/api/habit-logs', data),
  saveCardioSession: (data) => post('/api/cardio', data),
  saveGoalCheckIn: (data) => post('/api/goal-checkins', data),
  saveWeeklyReview: (data) => post('/api/weekly-reviews', data),
  
  getBackup: () => get<AppDb>('/api/backup'),
  restoreBackup: (db) => post('/api/backup/restore', db),
  previewCloudSync: (data) => post('/api/cloud-sync/preview', data),
  uploadInitialCloudSync: (data) => post('/api/cloud-sync/upload-initial', data),

  getGdriveAuthUrl: () => get('/api/gdrive/auth-url'),
  triggerGdriveBackup: () => post('/api/gdrive/backup', {}),
  listGdriveBackups: () => get('/api/gdrive/backups'),
  restoreGdriveBackup: (fileId) => post('/api/gdrive/restore', { fileId }),
  disconnectGdrive: () => post('/api/gdrive/disconnect', {}),

  listExercises: () => get('/api/exercises'),
  saveExercise: (data) => post('/api/exercises', data),
  importExercises: (data) => post('/api/exercises/import', data),
  deleteExercise: (id) => del(`/api/exercises/${id}`),
  exerciseHistory: (name) => get(`/api/exercise-history?name=${encodeURIComponent(name)}`),
  saveProgram: (data) => post('/api/programs', data),
  deleteProgram: (id) => del(`/api/programs/${id}`),
  savePainLog: (data) => post('/api/pain-logs', data),
  deletePainLog: (id) => del(`/api/pain-logs/${id}`),
  saveSchedule: (data) => post('/api/schedule', data),
  deleteSchedule: (id) => del(`/api/schedule/${id}`),
  saveTrainingConfig: (data) => post('/api/training-config', data),
  createDeloadWeek: (weekId, volumeMultiplier = 0.6) =>
    post(`/api/weeks/deload-from/${weekId}`, { volumeMultiplier }),
  missedSession: (data) => post('/api/sessions/missed', data),

  getSkin: () => get<SkinState>('/api/skin'),
  saveCareData: (data) => post<CareData>('/api/skin/care', data),
  listCarePhotos: () => get<CarePhoto[]>('/api/skin/photos'),
  saveCarePhoto: (data) => post<CarePhoto>('/api/skin/photos',data),
  deleteCarePhoto: (id) => del(`/api/skin/photos/${id}`),
  observeCarePhoto: (id,consent) => post<{observation:string;model:string}>('/api/skin/photos/observe',{id,consent}),
  validateCareProposal: (data) => post<CareProposal>('/api/skin/proposal/validate', data),
  applyCareProposal: (data) => post<CareData>('/api/skin/proposal/apply', data),
  saveSkinProfile: (data) => post<SkinProfile>('/api/skin/profile', data),
  saveSkinProduct: (data) => post<SkinProduct>('/api/skin/products', data),
  deleteSkinProduct: (id) => del(`/api/skin/products/${id}`),
  saveSkinRoutine: (data) => post<SkinRoutine>('/api/skin/routines', data),
  saveSkinLog: (data) => post('/api/skin/logs', data),
  deleteSkinLog: (id) => del(`/api/skin/logs/${id}`),
  importSkinProducts: (data) => post('/api/skin/products/import', data),
  getSkinProductTemplate: () => get('/api/skin/products/template'),
  skinCoachAsk: (question, history = []) => post('/api/ai/skin', { question, history }),
  searchSkinProduct: (query) => post('/api/skin/products/search-web', { query }),
  readSkinProductLabel: (dataUrl,consent) => post('/api/skin/products/read-label',{dataUrl,consent}),
  skinBuildRoutine: (prompt = '') => post('/api/ai/skin/build-routine', { prompt }),

  checkUpdates: (force = false) =>
    get<UpdateCheckResult>(`/api/updates/check${force ? '?force=1' : ''}`),
  downloadUpdate: () => post('/api/updates/download', {}),
  getUpdateDownloadStatus: () => get('/api/updates/download-status'),
  installUpdate: () => post('/api/updates/install', {}),
  getUpdateNotice: () => get('/api/updates/notice'),
  acknowledgeUpdateNotice: () => post('/api/updates/notice/acknowledge', {}),
};
