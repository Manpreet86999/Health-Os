import type { AppDb } from './types.js';
import type { SyncEntityType, SyncRecord } from './sync.js';
import { defaultTrainingConfig } from './training.js';
import { defaultProfile } from './defaults.js';
import { emptySkinProfile, emptyCareData, type CareData } from './skin.js';
import { careFromRecords } from './care-sync.js';

/** Read-only domain view for the same calculations used by the desktop app. */
export function snapshotFromRecords(records:SyncRecord[]):AppDb {
  const live=records.filter(r=>!r.deletedAt);
  const list=<T>(type:SyncEntityType)=>live.filter(r=>r.entityType===type).map(r=>r.payload as T);
  const weeks=list<AppDb['weeks'][number]>('week');
  return {
    meta:{version:4,createdAt:'',activeWeekId:list<{activeWeekId:string}>('workspaceState')[0]?.activeWeekId||weeks.find(w=>w.active)?.id||'',storage:'sqlite'},
    weeks,sessions:list('session'),readiness:list('readiness'),targets:list('target'),measurements:list('measurement'),
    habits:list('habit'),habitLogs:list('habitLog'),cardio:list('cardio'),goalCheckIns:list('goalCheckIn'),weeklyReviews:list('weeklyReview'),
    notes:[],profile:list<AppDb['profile']>('profile')[0]||defaultProfile(),exercises:list('exercise'),librarySplits:list('librarySplit'),
    programs:list('program'),painLogs:list('painLog'),scheduledWorkouts:list('scheduledWorkout'),healthReadings:list('healthReading'),
    trainingConfig:list<AppDb['trainingConfig']>('trainingConfig')[0]||defaultTrainingConfig(),
    skin:{profile:list<ReturnType<typeof emptySkinProfile>>('skinProfile')[0]||emptySkinProfile(),products:list('skinProduct'),routines:list('skinRoutine'),logs:list('skinLog'),care:careFromRecords(live,list<CareData>('skinCareData')[0]||emptyCareData())},
  };
}
