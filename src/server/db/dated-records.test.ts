import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
test('dated records insert and update on the real migrated schema',async()=>{
  assert.ok(process.env.BODY_OS_DATA_DIR?.includes('scratch'));
  process.env.BODY_OS_DATA_DIR=path.join(process.env.BODY_OS_DATA_DIR!,'dated-records');
  const {getDb,closeDb}=await import('./connection.js');
  const {migrate}=await import('./migrate.js');const repo=await import('./repository.js');
  migrate(getDb());
  try {
    repo.saveHabitLog({id:'habit-log',habitId:'habit',date:'2026-09-09',value:1,createdAt:'2026-09-09'});
    repo.saveCardioSession({id:'cardio',activity:'Walk',durationMinutes:20,date:'2026-09-09',createdAt:'2026-09-09'});
    repo.saveGoalCheckIn({id:'check-in',goalId:'goal',date:'2026-09-09',value:50,createdAt:'2026-09-09'});
    repo.savePainLog({id:'pain',date:'2026-09-09',region:'Shoulder',severity:2,affectsTraining:false,createdAt:'2026-09-09'});
    repo.saveScheduledWorkout({id:'schedule',date:'2026-09-09',title:'Push',status:'planned',createdAt:'2026-09-09'});
    repo.saveWeeklyReview({id:'review',weekStart:'2026-09-07',wins:'Consistent',blockers:'',adjustment:'',createdAt:'2026-09-09'});
    for(const table of ['habit_logs','cardio_sessions','goal_check_ins','pain_logs','scheduled_workouts']) {
      const row=getDb().prepare(`SELECT date,data FROM ${table}`).get() as {date:string;data:string};assert.equal(row.date,'2026-09-09');assert.equal(JSON.parse(row.data).date,row.date);
    }
    assert.equal((getDb().prepare('SELECT week_id FROM weekly_reviews').get() as {week_id:string}).week_id,'2026-09-07');
    repo.saveCardioSession({id:'cardio',activity:'Walk',durationMinutes:30,date:'2026-09-10',createdAt:'2026-09-09'});
    assert.equal(repo.listCardioSessions()[0].durationMinutes,30);
    assert.equal((getDb().prepare('SELECT date FROM cardio_sessions').get() as {date:string}).date,'2026-09-10');
  }finally{closeDb();}
});
