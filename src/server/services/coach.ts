import { runAiCoach } from '../ai/engine.js';
import { localCoach } from './local-coach.js';
import type { AppDb, AppSettings, CoachResult } from '../../shared/types.js';

export async function aiCoach(data: AppDb, appSettings: AppSettings): Promise<CoachResult> {
  return runAiCoach(data, appSettings);
}
export { localCoach };
