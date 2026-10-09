import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const parent=path.resolve('scratch');fs.mkdirSync(parent,{recursive:true});
process.env.BODY_OS_DATA_DIR=fs.mkdtempSync(path.join(parent,'automation-db-'));
const {getDb,closeDb}=await import('../db/connection.js');
const {migrate}=await import('../db/migrate.js');
const repo=await import('../db/repository.js');
const {runServerAutomations}=await import('./automation-runtime.js');
const {readAutomationState,persistDomainEvent}=await import('./automation-store.js');
migrate(getDb());
test.after(()=>closeDb());

test('repository saves publish events and persistent background results before viewing insights',()=>{
  const date='2026-09-30';repo.saveSession({id:'automation-workout',status:'finished',date,createdAt:new Date().toISOString(),weekId:'week-1',weekName:'Week 1',weekNumber:1,dayKey:'Wed',dayTitle:'Strength',name:'Test',sleep:'',soreness:'',logs:[{name:'Bench',target:'Chest',status:'done',sets:[{w:50,r:10,type:'work'}]}]});
  const state=runServerAutomations(true,new Date(`${date}T22:00:00`));
  assert.ok(state.events.some(e=>e.type==='workout.completed'));assert.equal((state.derived.training.value as any).prs[0].bestWeight,50);
  const saved=readAutomationState();assert.ok(saved.derived[`report:Daily summary:${date}`]);
  const raw=getDb().prepare("SELECT data FROM automation_cache WHERE id='state'").get() as {data:string};assert.equal(raw.data.includes('Bench'),false);
  const runs=getDb().prepare('SELECT COUNT(*) as count FROM automation_runs').get() as {count:number};runServerAutomations(false,new Date(`${date}T22:00:00`));assert.equal((getDb().prepare('SELECT COUNT(*) as count FROM automation_runs').get() as {count:number}).count,runs.count);
});
test('source deletion updates persisted PRs, while malformed events cannot mutate source tables',()=>{
  const before=repo.loadAppDb().sessions.length;
  assert.throws(()=>persistDomainEvent({id:'bad'} as any));assert.equal(repo.loadAppDb().sessions.length,before);
  repo.deleteSession('automation-workout');const state=runServerAutomations(false,new Date('2026-09-30T22:01:00'));
  assert.equal((state.derived.training.value as any).prs.length,0);assert.ok(state.events.some(e=>e.type==='workout.deleted'));
});
