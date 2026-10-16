export * from '../../shared/types.js';
import type { ExerciseTrackingMode, AppDb, PublicSettings, Metrics, CoachResult, Readiness, ExerciseLog, PlannedExercise, SetLog } from '../../shared/types.js';
import type { SkinState } from '../../shared/skin.js';
export interface Bootstrap {
  db: AppDb;
  skin?: SkinState;
  settings: PublicSettings;
  analytics: Metrics;
  coach: CoachResult;
  programming?: { volumeMultiplier: number; intensityNote: string; skipHeavy: boolean } | null;
  urls: { local: string; network: string[] };
}



export interface TrackerState {
  mcpRevision?:string;
  mcpResults?:Record<string,{success:boolean;actionReceiptId:string;summary:string;changedRecords:{id:string;type:string}[];warnings:string[];requiresUserAttention:boolean;undoable:boolean}>;
  id?: string;
  currentEntry?: { key:string; weights:string[]; reps:string[]; durations:string[]; rpes:string[]; rirs:string[]; setTypes:string[]; sides:string[]; journal:string; trackingMode:ExerciseTrackingMode; completedSets?:number[]; completedRecords?:Record<number,SetLog> };
  restTimer?: { deadline:number|null; remaining:number; total:number; running:boolean; card?:boolean };
  plannedExercises?: PlannedExercise[];
  notes?: string;
  weekId: string;
  weekName: string;
  weekNumber: number | string;
  dayKey: string;
  dayTitle: string;
  date: string;
  name: string;
  sleep: number | string;
  soreness: number | string;
  readiness?: Readiness | null;
  index: number;
  logs: ExerciseLog[];
  exercises: PlannedExercise[];
  startedAt?: string;
  gymMode?: boolean;
  mode?: 'planned' | 'flexible';
  targetMuscles?: string[];
  preparationChoice?: 'original' | 'adapted' | 'customized';
}
