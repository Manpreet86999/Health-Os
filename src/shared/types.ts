export type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type SetType = 'warmup' | 'work' | 'amrap' | 'drop' | 'failure' | 'backoff';
export type Side = 'both' | 'L' | 'R';
/** The value a user records for each set. Missing means legacy weight + reps. */
export type ExerciseTrackingMode = 'weight_reps' | 'reps' | 'time';
export type ProgramPhase = 'accumulate' | 'intensify' | 'deload' | 'peak' | 'other';

export interface Exercise {
  source?: 'supabase' | 'custom';
  pendingGlobalResolution?: boolean;
  legacyId?: string;
  approvedAliases?: string[];
  media?: import('./global-exercises.js').ExerciseMedia[];
  id: string;
  name: string;
  aliases: string[];
  muscles: string[];
  equipment: string;
  movementPattern: string;
  substitutions: string[];
  bodyPart?: string;
  workoutSplit?: string;
  tutorialLink?: string;
  /** Group history across variants (e.g. "bench-family") */
  familyId?: string;
  defaultCue?: string;
  defaultRestSec?: number;
  defaultTempo?: string;
  /** Suggested logging UI for this exercise. Users can always change it in Tracker. */
  trackingMode?: ExerciseTrackingMode;
  /** Personal organization and usage metadata for the local library. */
  meta?: LibraryMeta;
}

export interface LibraryMeta {
  tags?: string[];
  collectionIds?: string[];
  favorite?: boolean;
  archived?: boolean;
  lastUsedAt?: string;
  useCount?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LibraryCollection {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface PlannedExercise {
  name: string;
  target: string;
  vol: string;
  cue: string;
  /** Optional link to library exercise */
  exerciseId?: string;
  familyId?: string;
  /** Superset group label e.g. "A", "B" — same letter = paired */
  supersetGroup?: string;
  /** Target intensity */
  percent1rm?: number | string;
  rirTarget?: number | string;
  rpeTarget?: number | string;
  tempo?: string;
  restSec?: number | string;
  notes?: string;
  trackingMode?: ExerciseTrackingMode;
}

export interface WeekDay {
  key: string;
  type: string;
  title: string;
  subtitle: string;
  muscles: string[];
  exercises: PlannedExercise[];
  /** Optional calendar date override YYYY-MM-DD */
  scheduledDate?: string;
}

export type FlexibleDayStatus = 'locked' | 'ready' | 'workout' | 'rest' | 'not_in_week';
export interface FlexibleDayState { status: FlexibleDayStatus; date: string; completedAt?: string; }

export interface Week {
  id: string;
  name: string;
  weekNumber: number | string;
  startDate: string;
  notes: string;
  active: boolean;
  status?: string;
  missionObjective?: string;
  days: WeekDay[];
  programId?: string;
  phase?: ProgramPhase;
  /** A flexible week is a live Monday–Sunday log that can later become a reusable program. */
  mode?: 'planned' | 'flexible';
  flexibleStartDate?: string;
  flexibleEndDate?: string;
  flexibleFirstDayKey?: string;
  dayStates?: Record<string, FlexibleDayState>;
}

export interface SetLog {
  s: number;
  w: number | string;
  r: number | string;
  rpe?: number | string | null;
  rir?: number | string | null;
  /** Default work if missing (legacy) */
  type?: SetType | string;
  side?: Side | string;
  tempo?: string;
  restSec?: number | string;
  /** Used by time-based exercises; stored in seconds while retaining legacy r/w fields. */
  durationSec?: number | string;
  trackingMode?: ExerciseTrackingMode;
}

export interface ExerciseLog {
  name: string;
  target: string;
  status: 'completed' | 'skipped' | string;
  sets: SetLog[];
  journal?: string;
  aiCoachComment?: string;
  exerciseId?: string;
  familyId?: string;
  supersetGroup?: string;
  plannedRestSec?: number;
  plannedTempo?: string;
  trackingMode?: ExerciseTrackingMode;
}

export interface Readiness {
  evidence?: import('./evidence.js').CalculationEvidence;
  hydrationUnit?: 'L' | 'mL' | 'fl oz';
  id?: string;
  weekId?: string;
  dayKey?: string;
  date: string;
  sleepHours: number;
  sleepQuality: number;
  steps: number;
  soreness: number;
  energy: number;
  stress: number;
  motivation: number;
  mood: number;
  hydration: number;
  mealProtein: number;
  painFlag: boolean;
  restingHeartRate: number | string;
  notes: string;
  score: number;
  band: string;
  recommendation: string;
  assistant?: {
    score: number;
    band: string;
    intensity: string;
    reason: string;
    warmup: string;
    recovery: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface Session {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  weekId: string;
  weekName: string;
  weekNumber: number | string;
  dayKey: string;
  dayTitle: string;
  date: string;
  name: string;
  sleep: number | string;
  soreness: number | string;
  logs: ExerciseLog[];
  readiness?: Readiness | null;
  completedByLibrary?: boolean;
  notes?: string;
  aiOverallSummary?: string;
  aiReportInputHash?: string;
  aiReportModel?: string;
  aiReportGeneratedAt?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes?: number;
  /** If rescheduled from another date/day */
  originalDayKey?: string;
  originalDate?: string;
  mode?: 'planned' | 'flexible';
  targetMuscles?: string[];
  preparationChoice?: 'original' | 'adapted' | 'customized';
  plannedExercises?: PlannedExercise[];
}

export interface Target {
  id: string;
  name: string;
  type: string;
  current: number | string;
  target: number | string;
  unit?: string;
  status?: string;
  deadline?: string;
  linkedExercise?: string;
  createdAt: string;
}

export interface PersonalRecord {
  exercise: string;
  bestWeight: number;
  bestReps: number;
  bestE1rm: number;
  /** Best same-rep max label e.g. 5RM */
  repMax?: number;
  date: string;
  sessionId?: string;
  familyId?: string;
  workSetsOnly?: boolean;
}

export interface E1rmPoint {
  date: string;
  e1rm: number;
  weight: number;
  reps: number;
}

export interface WeeklyVolumePoint {
  weekStart: string;
  tonnage: number;
  sets: number;
  sessions: number;
}

export interface GoalProgress {
  id: string;
  name: string;
  type: string;
  current: number;
  target: number;
  unit: string;
  percent: number;
  status: string;
  deadline?: string;
  linkedExercise?: string;
  latestCheckIn?: { date: string; value: number; note?: string };
  checkInCount: number;
}

export interface BodyMetricDelta {
  latest: number;
  previous?: number;
  delta30d?: number;
}

export interface BodyDeltas {
  weight?: BodyMetricDelta;
  bodyFat?: BodyMetricDelta;
  waist?: BodyMetricDelta;
}

export interface PeriodCompare {
  label: string;
  sessions: number;
  tonnage: number;
  sets: number;
  avgReadiness: number | null;
  prs: number;
}

export interface VolumeLandmarkConfig {
  muscle: string;
  mev: number;
  mav: number;
  mrv: number;
}

export interface DeloadSuggestion {
  recommended: boolean;
  reason: string;
  volumeMultiplier: number;
  actions: string[];
}

export interface Measurement {
  id: string;
  date: string;
  weight: number | string;
  neck?: number | string;
  waist?: number | string;
  chest?: number | string;
  arms?: number | string;
  bodyFat?: number | string;
  hips?: number | string;
  bmr?: number | string;
  muscleMass?: number | string;
  waterPercentage?: number | string;
  notes?: string;
  createdAt: string;
}

export interface Profile {
  displayName: string;
  units: 'kg' | 'lb';
  height?: number | string;
  createdAt: string;
}

export interface Habit {
  id: string;
  name: string;
  target: number;
  unit: string;
  active: boolean;
  createdAt: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  value: number;
  createdAt: string;
}

export interface CardioSession {
  id: string;
  date: string;
  activity: string;
  durationMinutes: number;
  distance?: number | string;
  perceivedEffort?: number | string;
  notes?: string;
  createdAt: string;
}

export interface GoalCheckIn {
  id: string;
  goalId: string;
  date: string;
  value: number;
  note?: string;
  createdAt: string;
}

export interface WeeklyReview {
  id: string;
  weekStart: string;
  wins: string;
  blockers: string;
  adjustment: string;
  createdAt: string;
}

/** Body-region pain / injury timeline entry */
export interface PainLog {
  id: string;
  date: string;
  region: string;
  severity: number;
  notes?: string;
  affectsTraining: boolean;
  createdAt: string;
}

/** Calendar-dated workout assignment */
export interface ScheduledWorkout {
  id: string;
  date: string;
  weekId?: string;
  dayKey?: string;
  title: string;
  status: 'planned' | 'done' | 'skipped' | 'rescheduled';
  notes?: string;
  createdAt: string;
}

export interface ProgramWeekRef {
  weekId: string;
  weekNumber: number;
  phase: ProgramPhase;
  name?: string;
}

/** Multi-week mesocycle / program */
export interface Program {
  id: string;
  name: string;
  notes: string;
  weeks: ProgramWeekRef[];
  active: boolean;
  createdAt: string;
  archived?: boolean;
  updatedAt?: string;
}

export interface TrainingConfig {
  volumeLandmarks: VolumeLandmarkConfig[];
  /** Map exercise name (lower) → familyId */
  exerciseFamilies: Record<string, string>;
  reminders: {
    train: boolean;
    readiness: boolean;
    weeklyReview: boolean;
    trainTime?: string;
  };
  loadIncrements?: Record<string, number>;
  gymModeDefault?: boolean;
  barWeightKg?: number;
  barWeightLb?: number;
  libraryCollections?: LibraryCollection[];
  /** Default preserves the imported/week-planning workflow. */
  preplannedWeekMode?: boolean;
}

export interface AppSettings {
  senderName: string;
  userEmail?: string;
  senderEmail: string;
  appPassword: string;
  recipients: string[];
  streakStartDate: string;
  aiProvider: string;
  aiApiKey: string;
  /** Separate provider credentials let the owner switch AI without re-entering keys. */
  openRouterApiKey?: string;
  nvidiaNimApiKey?: string;
  aiModel: string;
  pinHash: string;
  secretsSalt: string;
  telegramBotToken: string;
  telegramChatId: string;
  /** Public HTTPS page that hosts telegram.html for the gym Mini App. */
  telegramMiniAppUrl: string;
  reportSchedule: string;
  braveSearchApiKey: string;
  /** Optional Tavily key for user-requested, source-backed web research. */
  tavilyApiKey?: string;
  /** Count of Health OS Tavily search requests in the current calendar month. */
  tavilySearchCount?: number;
  tavilySearchMonth?: string;
  gender?: 'male' | 'female';
  googleClientId?: string;
  googleClientSecret?: string;
  googleRefreshToken?: string;
  /** Kept separate from Google Fit so either integration can be revoked safely. */
  gdriveRefreshToken?: string;
  isActivated: boolean;
  productKeyHash: string;
  hasSeenFeatureGuide: boolean;
  /** Legacy update setting; runtime update source is configured in code. */
  githubUpdatesRepo?: string;
  /** Legacy update preference; GitHub update checks are currently disabled. */
  autoCheckUpdates?: boolean;
  gdriveEnabled?: boolean;
  gdriveSchedule?: 'daily' | 'weekly' | 'monthly';
  gdriveLastBackup?: string;
  gdriveLastBackupSize?: number;
  gdriveFolderId?: string;
  weeklyGoal?: number;
  restSeconds?: number;
}

export interface PublicSettings {
  senderName: string;
  userEmail?: string;
  senderEmail: string;
  recipients: string[];
  hasAppPassword: boolean;
  /** Product-managed sender status. User Gmail credentials are never required. */
  hasEmailDelivery?: boolean;
  streakStartDate: string;
  aiProvider: string;
  aiModel: string;
  hasAiApiKey: boolean;
  hasOpenRouterApiKey?: boolean;
  hasNvidiaNimApiKey?: boolean;
  hasPin: boolean;
  profileName: string;
  units: 'kg' | 'lb';
  height?: number | string;
  gender?: 'male' | 'female';
  hasTelegramBot: boolean;
  telegramMiniAppUrl?: string;
  reportSchedule: string;
  hasBraveSearchApiKey: boolean;
  hasTavilyApiKey?: boolean;
  hasYoutubeApiKey?: boolean;
  tavilySearchCount?: number;
  tavilySearchMonth?: string;
  hasGoogleFit?: boolean;
  isActivated: boolean;
  hasSeenFeatureGuide: boolean;
  githubUpdatesRepo?: string;
  autoCheckUpdates?: boolean;
  appVersion?: string;
  hasGdrive?: boolean;
  hasGoogleOAuthConfig?: boolean;
  gdriveSchedule?: string;
  gdriveLastBackup?: string;
  gdriveLastBackupSize?: number;
  weeklyGoal?: number;
  restSeconds?: number;
}

export interface AppDb {
  healthReadings?: import('./health.js').HealthReading[];
  meta: {
    version: number;
    createdAt: string;
    activeWeekId: string;
    storage: string;
    sqliteFile?: string;
  };
  weeks: Week[];
  sessions: Session[];
  readiness: Readiness[];
  targets: Target[];
  measurements: Measurement[];
  habits: Habit[];
  habitLogs: HabitLog[];
  cardio: CardioSession[];
  goalCheckIns: GoalCheckIn[];
  weeklyReviews: WeeklyReview[];
  notes: unknown[];
  profile: Profile;
  exercises: Exercise[];
  librarySplits: Week[];
  programs: Program[];
  painLogs: PainLog[];
  scheduledWorkouts: ScheduledWorkout[];
  trainingConfig: TrainingConfig;
  skin?: import('./skin.js').SkinState;
}

export type WorkoutPage =
  | 'Dashboard'
  | 'Planner'
  | 'Tracker'
  | 'Records'
  | 'Analyzer'
  | 'Coach'
  | 'Targets'
  | 'Body'
  | 'Library'
  | 'Reports'
  | 'ExerciseHistory'
  | 'Calendar'
  | 'Programs';

export type SkinPage =
  | 'SkinOverview'
  | 'SkinRoutine'
  | 'SkinProfile'
  | 'SkinProducts'
  | 'SkinProgress'
  | 'SkinAi'
  | 'SkinGoals'
  | 'SkinCalendar'
  | 'SkinCheckIn'
  | 'SkinReviews';

export type WebOSPage = 'Today' | 'Timeline' | 'Eat' | 'Recover' | 'Health' | 'Insights' | 'Habits' | 'Nudges' | 'Experiments' | 'Research' | 'BodyCoach' | 'Search' | 'Sync' | 'Permissions' | 'Profile';
export type Page = WorkoutPage | SkinPage | WebOSPage | 'Settings';

export interface ProgressionTip {
  evidence?: import('./evidence.js').CalculationEvidence;
  exercise: string;
  lastWeight: number;
  lastReps: number;
  suggestedWeight: number;
  suggestedReps: string;
  reason: string;
  hitTopOfRange: boolean;
  applyNext?: boolean;
}

export interface Metrics {
  totals: {
    sessions: number;
    tonnage: number;
    completed: number;
    skipped: number;
    completion: number;
    streak: number;
    totalDurationMinutes?: number;
    avgSessionMinutes?: number;
  };
  exerciseLeaders: Array<{
    name: string;
    sessions: number;
    tonnage: number;
    best1rm: number;
  }>;
  muscleVolume: Record<string, number>;
  readiness: Array<{ date: string; score: number; band: string }>;
  measurementTrend: Measurement[];
  targetProgress: Target[];
  dates: string[];
  volumeLandmarks: Array<{
    muscle: string;
    weeklySets: number;
    status: string;
    mev?: number;
    mav?: number;
    mrv?: number;
  }>;
  plateaus: Array<{ exercise: string; sessions: number; note: string }>;
  personalRecords: PersonalRecord[];
  recentPrs: PersonalRecord[];
  e1rmSeries: Record<string, E1rmPoint[]>;
  trainingCalendar: Record<string, number>;
  weeklyVolume: WeeklyVolumePoint[];
  goalProgress: GoalProgress[];
  bodyDeltas: BodyDeltas;
  weekCompare?: { current: PeriodCompare; previous: PeriodCompare };
  deload?: DeloadSuggestion;
  progressionRules?: ProgressionTip[];
  repMaxes?: Array<{ exercise: string; reps: number; weight: number; date: string }>;
  imbalanceFlags?: Array<{ exercise: string; left: number; right: number; note: string }>;
}

export interface CoachResult {
  score: number;
  advice: string[];
  source?: string;
  model?: string;
  aiAvailable?: boolean;
  aiError?: string;
  progression?: ProgressionTip[];
}
