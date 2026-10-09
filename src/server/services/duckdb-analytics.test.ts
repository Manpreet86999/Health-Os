import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildAnalyticsMirror } from './duckdb-analytics.js';
test('DuckDB analytics mirror calculates volume and readiness correlation from finished sessions', async () => {
  const result = await rebuildAnalyticsMirror({ meta:{version:4,createdAt:'',activeWeekId:'',storage:'test'}, weeks:[], readiness:[], targets:[], measurements:[], habits:[], habitLogs:[], cardio:[], goalCheckIns:[], weeklyReviews:[], notes:[], profile:{displayName:'',units:'kg',createdAt:''}, exercises:[], librarySplits:[], programs:[], painLogs:[], scheduledWorkouts:[], healthReadings:[], trainingConfig:{} as any, skin:{profile:{} as any,products:[],routines:[],logs:[],care:{} as any}, sessions:[{id:'a',date:'2026-01-01',status:'finished',logs:[{status:'completed',sets:[{w:100,r:5}]}],readiness:{score:80}} as any,{id:'b',date:'2026-01-08',status:'finished',logs:[{status:'completed',sets:[{w:120,r:5}]}],readiness:{score:90}} as any] });
  assert.equal(result.sessions,2); assert.equal(result.volume,1100); assert.equal(result.weekly.length,2); assert.ok(result.readinessPerformanceCorrelation !== null);
});
