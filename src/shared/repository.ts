import type {
  AppDb,
  AppSettings,
  CardioSession,
  GoalCheckIn,
  Habit,
  HabitLog,
  Measurement,
  Profile,
  PublicSettings,
  Readiness,
  Session,
  Target,
  Week,
  WeeklyReview,
} from './types.js';

export type Awaitable<T> = T | Promise<T>;

export interface WorkoutRepository {
  // Meta / Profile / Settings
  getActiveWeekId(): Awaitable<string>;
  setActiveWeekId(weekId: string): Awaitable<void>;
  getProfile(): Awaitable<Profile>;
  saveProfile(profile: Partial<Profile>): Awaitable<Profile>;
  getSettings(): Awaitable<AppSettings>;
  saveSettings(partial: Partial<AppSettings>): Awaitable<AppSettings>;
  publicSettings(): Awaitable<PublicSettings>;

  // Weeks
  listWeeks(): Awaitable<Week[]>;
  getWeek(weekId: string): Awaitable<Week | null>;
  upsertWeek(week: Partial<Week>, makeActive?: boolean): Awaitable<Week>;
  deleteWeek(weekId: string): Awaitable<void>;

  // Sessions
  listSessions(): Awaitable<Session[]>;
  getSession(sessionId: string): Awaitable<Session | null>;
  saveSession(session: Session): Awaitable<Session>;
  deleteSession(sessionId: string): Awaitable<void>;

  // Readiness
  listReadiness(): Awaitable<Readiness[]>;
  saveReadiness(item: Readiness): Awaitable<Readiness>;

  // Targets / Goals
  listTargets(): Awaitable<Target[]>;
  saveTarget(item: Target): Awaitable<Target>;
  deleteTarget(targetId: string): Awaitable<void>;
  
  // Goal CheckIns
  listGoalCheckIns(): Awaitable<GoalCheckIn[]>;
  saveGoalCheckIn(item: GoalCheckIn): Awaitable<GoalCheckIn>;

  // Measurements
  listMeasurements(): Awaitable<Measurement[]>;
  saveMeasurement(item: Measurement): Awaitable<Measurement>;
  deleteMeasurement?(measurementId: string): Awaitable<void>;

  // Habits
  listHabits(): Awaitable<Habit[]>;
  saveHabit(item: Habit): Awaitable<Habit>;
  deleteHabit?(habitId: string): Awaitable<void>;
  listHabitLogs(): Awaitable<HabitLog[]>;
  saveHabitLog(item: HabitLog): Awaitable<HabitLog>;

  // Cardio
  listCardioSessions(): Awaitable<CardioSession[]>;
  saveCardioSession(item: CardioSession): Awaitable<CardioSession>;
  deleteCardioSession?(cardioId: string): Awaitable<void>;

  // Weekly Reviews
  listWeeklyReviews(): Awaitable<WeeklyReview[]>;
  saveWeeklyReview(item: WeeklyReview): Awaitable<WeeklyReview>;

  // DB Backup
  loadAppDb(): Awaitable<AppDb>;
  restoreBackup(payload: Partial<AppDb>): Awaitable<void>;
  
  // Analytics queries
  lastExercisePerformance(exerciseName: string): Awaitable<{ weight: number; reps: number; date: string } | null>;
}
