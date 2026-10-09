import * as repo from '../db/repository.js';


export interface AppTask {
  id: string;
  type: 'missing_session' | 'weekly_measurement';
  title: string;
  description: string;
  payload?: any;
}

export function getPendingTasks(): AppTask[] {
  const tasks: AppTask[] = [];
  const db = repo.loadAppDb();
  
  // 1. Missing sessions in active week
  const activeWeek = db.weeks.find(w => w.id === db.meta.activeWeekId);
  if (activeWeek && activeWeek.startDate) {
    const start = new Date(activeWeek.startDate);
    const now = new Date();
    // Reset time for diff
    start.setHours(0,0,0,0);
    const nowDays = new Date(now);
    nowDays.setHours(0,0,0,0);
    const diffTime = Math.abs(nowDays.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    // Day mappings
    const dayIndexMap: Record<string, number> = {
      'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6
    };
    
    for (const day of activeWeek.days) {
      if (day.type === 'rest') continue;
      
      const idx = dayIndexMap[day.key];
      if (idx === undefined) continue;
      
      // If this day's index is less than the current diff days (i.e. it is in the past)
      if (idx < diffDays) {
        // Did we log it?
        const logged = db.sessions.find(s => s.weekId === activeWeek.id && s.dayKey === day.key);
        if (!logged) {
          // Expected date:
          const d = new Date(start);
          d.setDate(d.getDate() + idx);
          const expectedDateStr = d.toISOString().split('T')[0];
          
          tasks.push({
            id: `missing-session-${activeWeek.id}-${day.key}`,
            type: 'missing_session',
            title: `Missed Workout: ${day.title}`,
            description: `You missed your workout on ${day.key}. Did you skip it or are you logging it late?`,
            payload: {
              weekId: activeWeek.id,
              dayKey: day.key,
              date: expectedDateStr
            }
          });
        }
      }
    }
  }
  
  // 2. Weekly Body Measurements
  const lastMeasurement = [...db.measurements].sort((a, b) => b.date.localeCompare(a.date))[0];
  let needsMeasurement = false;
  if (!lastMeasurement) {
    needsMeasurement = true;
  } else {
    const lastDate = new Date(lastMeasurement.date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays >= 7) {
      needsMeasurement = true;
    }
  }
  
  if (needsMeasurement) {
    tasks.push({
      id: 'weekly-measurement',
      type: 'weekly_measurement',
      title: 'Weekly Weigh-in & Measurements',
      description: 'It has been a week since your last body measurement. Please log your updated metrics.',
    });
  }
  
  return tasks;
}
