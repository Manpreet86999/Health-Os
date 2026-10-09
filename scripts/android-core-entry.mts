// Packaged domain functions only. No DOM, Web UI, network access or downloaded code.
import { snapshotFromRecords } from '../src/shared/record-snapshot.ts';
import { bioSchema, readiness, experimentResult, nutrition } from '../src/shared/biology.ts';
import { mergeDailyReadiness } from '../src/shared/readiness.ts';
import { effectiveBiology } from '../src/shared/legacy-biology.ts';
import { buildHealthIntelligence } from '../src/shared/health-intelligence.ts';
import { buildProgressionRules, applyProgressionToPlan, buildDeloadWeekDays } from '../src/shared/training.ts';
import { adaptTrainingSession } from '../src/shared/training-adaptation.ts';
import { buildTimeline, goalProgress, summarizeRange, sleepStats, scaleNutrition } from '../src/shared/biological-intelligence.ts';
import { validateRecord } from '../src/shared/cloud.ts';
import { backupRecords, compareBackup } from '../src/shared/cloud-backup.ts';
import { parseReportText, reportInputSchema, labTrends, rangeFlag, reportBundle } from '../src/shared/medical.ts';
import { emptyMedicalActions, reconcileMedicalActions, rankedMedicalInbox, medicalTimeline, prospectiveResearchRows } from '../src/shared/medical-actions.ts';
import { reconcileAutomations, drainAutomationJobs } from '../src/shared/automation-engine.ts';
import { emptyAutomationState } from '../src/shared/automation-model.ts';
import { pendingInbox, resolveInbox } from '../src/shared/automation-inbox.ts';
import { calculateMedical, evidenceCards, physiologicalSignals, medicationReview } from '../src/shared/medical-intelligence.ts';
import { measurementInputSchema } from '../src/shared/schemas.ts';
import { careTasksForDate } from '../src/shared/skin.ts';
import { computeMetrics } from '../src/shared/metrics.ts';
import { localCoach } from '../src/shared/local-coach.ts';
import { automationPreferences } from '../src/shared/automation-model.ts';
import { catalogExercise } from '../src/shared/global-exercises.ts';
import { validateCareProposal } from '../src/shared/care-proposal.ts';
import { researchWorkbenchSchema } from '../src/shared/research-workbench.ts';

if (!globalThis.structuredClone) globalThis.structuredClone = (input: any) => JSON.parse(JSON.stringify(input));
if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', { value: function(index: number) { const i = Math.trunc(index) || 0; return this[i < 0 ? this.length + i : i]; }, configurable: true, writable: true });
if (!Object.hasOwn) Object.hasOwn = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);

export function execute(request: any) {
  const rows = request.rows || [];
  const core = rows.filter((r: any) => r.lane === 'core').map((r: any) => validateRecord(r.record));
  const bio = rows.filter((r: any) => r.lane === 'bio').map((r: any) => bioSchema.parse(r.record));
  if (bio.some((r: any) => r.userId !== request.uid)) throw Error('Record owner mismatch');
  const db = snapshotFromRecords(core);
  if (!core.some((r: any) => r.entityType === 'trainingConfig') && !db.weeks.length) db.trainingConfig.preplannedWeekMode = false;
  db.readiness = mergeDailyReadiness(db.readiness, bio);
  const records = effectiveBiology(db, bio);
  const date = request.date;
  const dataset = { db, skin: db.skin!, records, userId: request.uid };
  switch (request.action) {
    case 'trainingSettings': return db.trainingConfig;
    case 'snapshot': return {
      readiness: readiness(records, date),
      intelligence: buildHealthIntelligence(dataset, date, new Date(request.now)),
      progression: buildProgressionRules(db),
      timeline: buildTimeline(records, db, db.skin!, date),
      sleep: sleepStats(records, date),
      nutrition: nutrition(records, date),
      goals: records.filter(r => r.type === 'goal' && !r.deletedAt).map(goal => ({ id: goal.id, name: goal.name, ...goalProgress(goal, records, db, db.skin!, date) })),
      experiments: records.filter(r => r.type === 'experiment' && !r.deletedAt).map(experiment => ({ id: experiment.id, name: experiment.name, ...experimentResult(experiment, records, date) })),
      labs: labTrends(core.filter(r => r.entityType === 'medicalReport').map(r => r.payload as any)),
      careTasks: careTasksForDate(db.skin!.care, date, db.skin!.products),
    };
    case 'automation': {
      const previous = core.find(r => r.entityType === 'automationState' && r.id === 'health-os-automations')?.payload?.state as any;
      const state = reconcileAutomations(dataset, structuredClone(previous || emptyAutomationState()), new Date(request.now), Boolean(request.rebuild));
      drainAutomationJobs(dataset, state, new Date(request.now));
      if (request.resolve) resolveInbox(state, request.resolve.id, request.resolve.status, new Date(request.now));
      return {state, inbox: pendingInbox(state, new Date(request.now))};
    }
    case 'medical': {
      const reports = core.filter(r => r.entityType === 'medicalReport' && !r.deletedAt).map(r => r.payload as any);
      return {labs: labTrends(reports), signals: physiologicalSignals(records, date), medication: medicationReview(records, new Date(request.now)), evidence: evidenceCards(reports, records, date)};
    }
    case 'calculator': return calculateMedical(request.payload);
    case 'analytics': {
      if(request.from)db.sessions=db.sessions.filter(s=>s.date>=request.from&&s.date<=request.to);
      return {metrics:computeMetrics(db),coach:localCoach(db)};
    }
    case 'automationPreferences': return automationPreferences(records);
    case 'researchInput': return researchWorkbenchSchema.parse(request.input);
    case 'exerciseCatalog': return request.catalog.exercises.map((row:any)=>catalogExercise(row,request.catalog.aliases,request.catalog.media));
    case 'careProposal': {
      const ids = [...request.uuids];
      (globalThis as any).crypto = {randomUUID:()=>{const id=ids.shift();if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Missing native UUID');return id;}};
      return validateCareProposal(request.proposal,db.skin!);
    }
    case 'medicalActions': {
      const reports = core.filter(r=>r.entityType==='medicalReport'&&!r.deletedAt).map(r=>r.payload as any);
      const prior = core.find(r=>r.entityType==='automationState'&&r.id==='health-os-medical-actions')?.payload?.state as any;
      const state = reconcileMedicalActions(structuredClone(prior || emptyMedicalActions()),reports,records,request.now);
      return {state,inbox:rankedMedicalInbox(state),timeline:medicalTimeline(reports,records,state)};
    }
    case 'researchDays': {
      const state = core.find(r=>r.entityType==='automationState'&&r.id==='health-os-medical-actions')?.payload?.state as any;
      if(!state?.enrollment)throw Error('Study enrollment is required');
      const count=Math.floor((Date.parse(request.to)-Date.parse(request.from))/86400000)+1;
      if(count<1||count>366||request.from<state.enrollment.consentedAt.slice(0,10)||request.to>date)throw Error('Choose up to 366 days within the enrolled study period');
      const dates=Array.from({length:count},(_,i)=>new Date(Date.parse(request.from)+i*86400000).toISOString().slice(0,10));
      return {schemaVersion:'prospective-1.0',rows:prospectiveResearchRows(state,records,dates),enrollment:state.enrollment};
    }
    case 'fhir': {
      const report=core.find(r=>r.entityType==='medicalReport'&&r.id===request.id&&!r.deletedAt)?.payload as any;
      if(report?.status!=='reviewed')throw Error('Review this report before FHIR export');
      return reportBundle(report,request.uid);
    }
    case 'adaptTraining': return adaptTrainingSession(request.exercises, db.exercises, request.constraints || {});
    case 'progressTraining': return request.days.map((day:any) => ({...day,exercises:applyProgressionToPlan(day.exercises,buildProgressionRules(db))}));
    case 'deloadTraining': return buildDeloadWeekDays({days:request.days});
    case 'measurement': return measurementInputSchema.parse(request.payload);
    case 'report': return summarizeRange(records, db, db.skin!, request.from, request.to);
    case 'validate': return request.record.lane === 'bio' ? bioSchema.parse(request.record.record) : validateRecord(request.record.record);
    case 'import': {
      const incoming = backupRecords(request.backup);
      const result = compareBackup(incoming, core).map(item => ({ status: item.status, lane: 'core', record: item.record }));
      const seen = new Set<string>();
      for (const input of request.backup.biologicalRecords || []) {
        const record = bioSchema.parse(input);
        if (record.userId !== request.uid) throw Error('Backup belongs to another account');
        if (seen.has(record.id)) throw Error('Duplicate biological record');
        seen.add(record.id);
        if (record.deletedAt) continue;
        const previous = bio.find(r => r.id === record.id);
        result.push({status: !previous ? 'new' : JSON.stringify(previous) === JSON.stringify(record) ? 'same' : 'conflict', lane: 'bio', record} as any);
      }
      if (result.length > 50000) throw Error('Backup too large');
      return result;
    }
    case 'parseMedical': return parseReportText(request.text, request.collectedAt, request.laboratory || '');
    case 'reviewMedical': return reportInputSchema.parse(request.report);
    case 'rangeFlag': return rangeFlag(request.result);
    case 'scaleNutrition': return scaleNutrition(request.metadata, request.factor);
    default: throw Error('Unsupported native Core operation');
  }
}
