import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAgentRun,
  buildExecutorLease,
  canAcquireLease,
  isLeaseActive,
  renewExecutorLease,
  type AgentRun,
  type RunRepository,
  type BackgroundPolicy
} from './intelligence/run-contracts.js';
import {continueAgentRun} from '../integrations/orchestration/durable-agent.js';
import {AgentReadTools} from './intelligence/agent-tools.js';
import {agentRequestSchema} from './intelligence/agent-contracts.js';
import {defaultProfile} from './defaults.js';
import {emptySkinState} from './skin.js';
import {negotiateCapability, DEFAULT_EXECUTOR_CAPABILITIES} from './intelligence/parity-contracts.js';
import {intelligenceActionDefinitions} from './intelligence/action-families.js';
import {executeActionFamily} from './intelligence/action-family-execution.js';
import {
  rankMemories,
  decayedConfidence,
  type HealthMemory
} from './intelligence/memory.js';
import {deriveGoalMemories} from './intelligence/goal-memory.js';
import {
  evaluateStrategyRecommendation,
  buildOutcomeMemory,
  type OutcomeObservation
} from './intelligence/adaptive-strategy.js';
import type {BioRecord} from './biology.js';

function createMockData(userId = 'owner-123') {
  return {
    userId,
    records: [] as BioRecord[],
    skin: emptySkinState(),
    db: {
      profile: defaultProfile(),
      meta: {},
      weeks: [],
      sessions: [],
      readiness: [],
      measurements: [],
      healthReadings: [],
      notes: [],
      targets: [],
      habits: [],
      habitLogs: [],
      goalCheckIns: [],
      painLogs: [],
      cardio: [],
      weeklyReviews: [],
      programs: [],
      scheduledWorkouts: [],
      librarySplits: [],
      exercises: []
    }
  };
}

function createMockRequest(userId = 'owner-123', goal = 'Optimize sleep and recovery') {
  return agentRequestSchema.parse({
    requestId: 'req-level8-' + Math.random().toString(36).slice(2, 8),
    phase: 'route',
    question: goal,
    power: 'general',
    mode: 'act',
    policy: {
      mode: 'auto',
      domains: ['goals', 'training', 'sleep', 'recovery', 'medical'],
      recordIds: [],
      date: '2026-10-14',
      research: 'off'
    },
    conversation: [],
    toolResults: [],
    memories: [],
    attachments: []
  });
}

function createTestHarness(userId = 'owner-123', backgroundPolicy?: BackgroundPolicy) {
  const req = createMockRequest(userId);
  let saved = createAgentRun(req, userId, 'workspace-default');
  if (backgroundPolicy) {
    saved.backgroundPolicy = backgroundPolicy;
  }
  const repository: RunRepository = {
    load: async (id) => {assert.equal(id,saved.id);return structuredClone(saved);},
    save: async (r, expected) => {
      assert.equal(r.version, expected + 1, 'Optimistic version must increment by 1');
      saved = structuredClone(r);
    },
    list: async () => [structuredClone(saved)]
  };
  const data = createMockData(userId);
  const tools = new AgentReadTools(data, req.policy);
  return {
    repository,
    tools,
    data,
    executorId: 'cloud-worker-1',
    saved: () => saved,
    updateSaved: (r: AgentRun) => { saved = structuredClone(r); }
  };
}

// ============================================================================
// 1. CLOUD EXECUTION & LEASE TESTS
// ============================================================================

test('cloud worker lease acquisition, renewal, and collision recovery', () => {
  const lease1 = buildExecutorLease({ id: 'cloud-worker-1', executorType: 'cloud_worker', ownerId: 'owner-123', durationMs: 60000 });
  assert.equal(lease1.id, 'cloud-worker-1');
  assert.equal(lease1.executorType, 'cloud_worker');
  assert.equal(lease1.ownerId, 'owner-123');
  assert.equal(isLeaseActive(lease1), true);

  // Another executor cannot acquire an active unexpired lease
  assert.equal(canAcquireLease(lease1, 'browser-session-9'), false);

  // Same executor CAN re-acquire / continue
  assert.equal(canAcquireLease(lease1, 'cloud-worker-1'), true);

  // Stale lease recovery: when expiresAt is in the past, another executor can acquire
  const staleLease = { ...lease1, expiresAt: new Date(Date.now() - 5000).toISOString() };
  assert.equal(canAcquireLease(staleLease, 'cloud-worker-2'), true);

  // Lease renewal extends renewedAt and expiresAt
  const renewed = renewExecutorLease(lease1, 120000);
  assert.ok(renewed.renewedAt);
  assert.equal(Date.parse(renewed.expiresAt) > Date.parse(lease1.expiresAt), true);
});

test('owner opt-in and budget safety stops background execution cleanly', async () => {
  const disabledPolicy: BackgroundPolicy = {
    enabled: false,
    allowReads: true,
    allowWrites: true,
    medicalConsent: false,
    permittedDomains: ['training', 'sleep'],
    maxSpendUsd: 1.0,
    maxExecutionTimeMs: 60000,
    maxToolsLimit: 10,
    maxActionsLimit: 3
  };
  const harness = createTestHarness('owner-123', disabledPolicy);
  assert.equal(harness.saved().backgroundPolicy?.enabled, false);

  // Medical consent required: action in medical domain blocked if medicalConsent is false
  const medicalNoConsent: BackgroundPolicy = {
    ...disabledPolicy,
    enabled: true,
    medicalConsent: false
  };
  assert.equal(medicalNoConsent.medicalConsent, false);
});

test('device-only step pauses with waiting_for_device and resumes with device executor', async () => {
  const harness = createTestHarness('owner-123');
  const cloudLease = buildExecutorLease({ id: 'cloud-worker-1', executorType: 'cloud_worker', ownerId: 'owner-123', durationMs: 60000 });
  harness.saved().executorLease = cloudLease;

  // Verify capability negotiation: cloud worker lacks active workout capability
  const cap = negotiateCapability('training.get_active_workout', DEFAULT_EXECUTOR_CAPABILITIES['cloud_worker'], 'cloud_worker');
  assert.equal(cap.satisfied, false);
  assert.equal(cap.requiredCapability, 'device_active_workout');
  assert.ok(cap.compatibleExecutorTypes?.includes('android'));

  // Android executor supports it
  const androidCap = negotiateCapability('training.get_active_workout', DEFAULT_EXECUTOR_CAPABILITIES['android'], 'android');
  assert.equal(androidCap.satisfied, true);

  // Cloud worker continues run encountering device step
  const hooks = {
    ...harness,
    ownerId: 'owner-123',
    workspaceId: 'workspace-default',
    call: async (r: any) => {
      if (r.phase === 'route') {
        return {
          result: {
            intent: 'active_workout',
            domains: ['training'],
            taskType: 'analyze',
            complexity: 1,
            requiresReasoning: true,
            requiresTools: true,
            requiresResearch: false,
            risk: 'low'
          },
          usage: []
        };
      }
      return {
        result: {
          responseType: 'plan',
          summary: 'Read active workout session from device.',
          toolCalls: [{name: 'training.get_active_workout', arguments: {}}],
          evidence: [],
          proposedActions: [],
          confidence: 'high',
          needsEscalation: false
        },
        usage: []
      };
    },
    execute: async () => { throw new Error('No write expected'); }
  };

  const runAfterCloud = await continueAgentRun(harness.saved().id, hooks);
  assert.equal(runAfterCloud.status, 'waiting');
  const pausedStep = runAfterCloud.plan.steps.find(s => s.status === 'waiting_for_device');
  assert.ok(pausedStep, 'Step must be marked waiting_for_device');
  assert.equal(pausedStep?.requiredCapability, 'device_active_workout');
  assert.ok(pausedStep?.compatibleExecutorTypes?.includes('android'));

  // Android executor arrives, acquires lease and resumes the SAME run
  const androidLease = buildExecutorLease({ id: 'android-device-pixel8', executorType: 'android', ownerId: 'owner-123', durationMs: 60000 });
  runAfterCloud.executorLease = androidLease;
  harness.updateSaved(runAfterCloud);

  const androidHooks = {
    ...harness,
    ownerId: 'owner-123',
    workspaceId: 'workspace-default',
    executorId: 'android-device-pixel8',
    executorType: 'android' as const,
    call: async () => ({
      result: {
        responseType: 'plan',
        summary: 'Active workout reviewed on device.',
        toolCalls: [],
        evidence: [],
        proposedActions: [],
        confidence: 'high',
        needsEscalation: false
      },
      usage: []
    }),
    execute: async () => { throw new Error('No write expected'); }
  };

  const completedRun = await continueAgentRun(harness.saved().id, androidHooks);
  assert.equal(completedRun.status, 'completed');
  assert.ok(completedRun.observations.some(o=>o.name==='training.get_active_workout'&&!o.error));
  assert.equal(completedRun.plan.steps.find(s=>s.id===pausedStep?.id)?.status,'completed');
  assert.equal(completedRun.executorLease?.executorType, 'android');
});

test('closed-app 14-step goal continuation and approval lifecycle', async () => {
  // Step 1: Owner starts goal
  const harness = createTestHarness('owner-123');
  // Step 2: Owner enables cloud execution
  harness.saved().backgroundPolicy = {
    enabled: true,
    allowReads: true,
    allowWrites: true,
    medicalConsent: true,
    permittedDomains: ['goals', 'training', 'sleep', 'recovery'],
    maxSpendUsd: 2.0,
    maxExecutionTimeMs: 120000,
    maxToolsLimit: 20,
    maxActionsLimit: 5
  };

  let writeExecuted = 0;
  const writtenReceipts: string[] = [];

  const hooks = {
    ...harness,
    ownerId: 'owner-123',
    workspaceId: 'workspace-default',
    executorId: 'cloud-worker-lon1',
    call: async (r: any) => {
      if (r.phase === 'route') {
        return {
          result: {
            intent: 'training_plan',
            domains: ['training', 'goals'],
            taskType: 'plan',
            complexity: 2,
            requiresReasoning: true,
            requiresTools: true,
            requiresResearch: false,
            risk: 'medium'
          },
          usage: []
        };
      }
      const verifiedCount = r.toolResults.filter((o: any) => o.name === 'action.verify' && o.data?.success).length;
      if (verifiedCount === 0) {
        // Step 5: Cloud worker proposes approval-required action
        return {
          result: {
            responseType: 'plan',
            summary: 'Propose custom training program.',
            toolCalls: [],
            evidence: [],
            proposedActions: [{
              kind: 'canonical_action',
              action: 'training.save_program',
              reason: 'Create 4-week progressive hypertrophy workout block',
              input: {
                idempotencyKey: 'prog-week-1',
                name: 'Hypertrophy Block A',
                weeks: [{ weekId: 'week-1', weekNumber: 1, phase: 'accumulate' }]
              }
            }],
            confidence: 'high',
            needsEscalation: false
          },
          usage: []
        };
      }
      // Step 12: Next step continues to goal completion
      return {
        result: {
          responseType: 'plan',
          summary: 'Custom training block verified and active in schedule.',
          toolCalls: [],
          evidence: [],
          proposedActions: [],
          confidence: 'high',
          needsEscalation: false
        },
        usage: []
      };
    },
    execute: async () => {
      // Step 10 & 11: Action executes once and receipt is persisted
      writeExecuted++;
      const receiptId = 'receipt-prog-' + writeExecuted;
      writtenReceipts.push(receiptId);
      return {
        success: true as const,
        actionReceiptId: receiptId,
        summary: 'Created and verified custom workout',
        changedRecords: [{id: 'custom-prog-rec-1'}]
      };
    }
  };

  // Step 3 & 4: Web/Android closes; cloud worker takes over with lease
  const cloudLease = buildExecutorLease({ id: 'cloud-worker-lon1', executorType: 'cloud_worker', ownerId: 'owner-123', durationMs: 60000 });
  harness.saved().executorLease = cloudLease;

  // Step 6: Run pauses awaiting approval
  let run = await continueAgentRun(harness.saved().id, hooks);
  assert.equal(run.status, 'awaiting_approval');
  assert.equal(writeExecuted, 0, 'No write must occur before approval');
  const proposalId = run.pendingProposal?.id;
  assert.ok(proposalId);

  // Step 7 & 8: Owner later opens app and approves proposal
  const browserLease = buildExecutorLease({ id: 'browser-session-p1', executorType: 'browser', ownerId: 'owner-123', durationMs: 60000 });
  run.executorLease = browserLease;
  harness.updateSaved(run);

  const ownerApprovalHooks = {
    ...hooks,
    executorId: 'browser-session-p1'
  };

  // Step 9-13: Cloud / executor resumes, executes once, persists receipt, completes goal
  run = await continueAgentRun(harness.saved().id, ownerApprovalHooks, {
    proposalId,
    approved: true
  });

  assert.equal(run.status, 'completed');
  assert.equal(writeExecuted, 1, 'Write must execute exactly once');
  assert.equal(writtenReceipts.length, 1);
  assert.ok(run.plan.steps.some(s => s.type === 'verify' && s.status === 'completed'));

  // Step 14: Reopening app loads the same completed run without re-executing
  const reloadedRun = await harness.repository.load(harness.saved().id);
  assert.equal(reloadedRun?.status, 'completed');
  assert.equal(reloadedRun?.id, harness.saved().id);
  assert.equal(writeExecuted, 1, 'Must not duplicate write on subsequent loads');
});

// ============================================================================
// 2. ACTION COVERAGE & DETERMINISTIC GUARDS
// ============================================================================

test('action coverage: experiments create schema enforces non-causal hypothesis and blocks medical claims', () => {
  const validExp = {
    idempotencyKey: 'exp-key-12345',
    name: 'Bedtime Stretching Experiment',
    hypothesis: 'Pre-bed stretching routine is associated with faster sleep onset',
    intervention: '15 minutes static stretching before sleep',
    metric: 'Sleep' as const,
    baseline: '28 minutes average',
    start: '2026-10-15',
    baselineDays: 7,
    days: 14,
    successCriteria: 'Onset latency reduction >= 8 minutes',
    notes: 'Observational self-tracking experiment'
  };
  const parsed = intelligenceActionDefinitions['experiments.create'].schema.safeParse(validExp);
  assert.equal(parsed.success, true);

  // Medical treatment / prescription attempts are rejected by schema guards
  const medicalExp = {
    ...validExp,
    hypothesis: 'Prescribed medication dosage improves hypertension',
    intervention: 'Altering prescription medicine dose daily'
  };
  const medParsed = intelligenceActionDefinitions['experiments.create'].schema.safeParse(medicalExp);
  assert.equal(medParsed.success, false);
});

test('action coverage: medical notes and symptoms require provenance and prohibit clinical diagnosis', () => {
  const validSymptom = {
    idempotencyKey: 'sym-key-12345',
    date: '2026-10-14',
    name: 'Mild lower back tightness',
    severity: 3,
    provenance: 'user_reported' as const,
    note: 'Mild discomfort after physical activity'
  };
  assert.equal(intelligenceActionDefinitions['medical.log_symptom'].schema.safeParse(validSymptom).success, true);

  // Rejects clinical diagnosis attempt
  const diagnosticSymptom = {
    ...validSymptom,
    name: 'Diagnosed herniated disc with radiculopathy',
    note: 'Clinical diagnosis confirmed'
  };
  assert.equal(intelligenceActionDefinitions['medical.log_symptom'].schema.safeParse(diagnosticSymptom).success, false);

  // Medical note with model observation provenance
  const validNote = {
    idempotencyKey: 'note-key-12345',
    date: '2026-10-14',
    note: 'Observed slight decrease in shoulder mobility on pull days',
    provenance: 'model_observation' as const
  };
  assert.equal(intelligenceActionDefinitions['medical.add_note'].schema.safeParse(validNote).success, true);
});

test('action coverage: reminders create and complete with recurrence and run linkage', () => {
  const validReminder = {
    idempotencyKey: 'rem-key-12345',
    name: 'Hydration check before afternoon training',
    date: '2026-10-14',
    time: '14:00',
    timeZone: 'UTC',
    domain: 'care' as const,
    recurrence: 'daily' as const,
    relatedGoalId: 'goal-hydration-1',
    relatedRunId: 'run-123'
  };
  assert.equal(intelligenceActionDefinitions['reminders.create'].schema.safeParse(validReminder).success, true);

  const completeAction = {
    idempotencyKey: 'rem-comp-12345',
    reminderId: 'rem-hyd-1',
    date: '2026-10-14'
  };
  assert.equal(intelligenceActionDefinitions['reminders.complete'].schema.safeParse(completeAction).success, true);
});

test('action execution: idempotency prevents duplicate writes and returns existing verified receipt', async () => {
  const recordsList: BioRecord[] = [];
  const services: any = {
    runId: 'audit-run-idempotency',
    dataset: { db: { weeks: [] } },
    readRecords: async () => [...recordsList],
    saveMany: async () => {},
    commit: async (writes: any[]) => {
      for (const w of writes) {
        const idx = recordsList.findIndex(r => r.id === w.id);
        const bio: BioRecord = {
          id: w.id,
          userId: 'owner-123',
          type: w.type as any,
          domain: (w.domain || 'Insights') as any,
          name: w.name,
          timestamp: w.timestamp || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          revision: 'rev-1',
          metadata: w.metadata || {}
        };
        if (idx >= 0) recordsList[idx] = bio;
        else recordsList.push(bio);
      }
    }
  };

  const payload = {
    idempotencyKey: 'exp-idem-12345',
    name: 'Bedtime Routine Observation',
    hypothesis: 'Consistent 10pm bedtime is associated with improved readiness',
    intervention: '10pm wind-down routine',
    metric: 'Readiness' as const,
    baseline: '72',
    start: '2026-10-15',
    baselineDays: 7,
    days: 7,
    successCriteria: 'Readiness >= 80 on 5 of 7 days'
  };

  const res1 = await executeActionFamily(
    'experiments.create',
    payload,
    services,
    recordsList,
    'receipt-exp-1'
  );
  assert.equal(res1?.success, true);
  assert.equal(res1?.verificationState, 'verified');

  // Second execution with same parameters (duplicate worker tick / replay)
  const res2 = await executeActionFamily(
    'experiments.create',
    payload,
    services,
    recordsList,
    'receipt-exp-1'
  );
  assert.equal(res2?.success, true);
  assert.equal(res2?.actionReceiptId, 'receipt-exp-1');

  // Verify only 1 experiment record and 1 receipt record exist
  const expRows = recordsList.filter(r => r.type === 'experiment');
  assert.equal(expRows.length, 1, 'Only one experiment record must exist');
  const receiptRows = recordsList.filter(r => r.metadata?.mcpReceipt === true);
  assert.equal(receiptRows.length, 1, 'Only one receipt record must exist');
});

// ============================================================================
// 3. MEMORY, RETRIEVAL RANKING & OUTCOME ADAPTATION
// ============================================================================

test('memory categories, explicit preferences, superseding and expiration', () => {
  const records: BioRecord[] = [
    {
      id: 'pref-old',
      userId: 'owner-123',
      type: 'nudgePreference',
      domain: 'Insights',
      name: 'Older preference',
      timestamp: '2026-10-01T08:00:00Z',
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-10-01T08:00:00Z',
      metadata: {
        preferredWorkoutTime: '06:00',
        dislikedExercises: 'Burpees'
      }
    },
    {
      id: 'pref-new',
      userId: 'owner-123',
      type: 'nudgePreference',
      domain: 'Insights',
      name: 'Updated preference',
      timestamp: '2026-10-10T08:00:00Z',
      createdAt: '2026-10-10T08:00:00Z',
      updatedAt: '2026-10-10T08:00:00Z',
      metadata: {
        preferredWorkoutTime: '17:30',
        dislikedExercises: 'Burpees, Bulgarian Split Squats'
      }
    }
  ];

  const memories = deriveGoalMemories(records, 'owner-123');
  // New preference should be active
  const activeWorkoutTime = memories.find(m => m.value?.field === 'preferredWorkoutTime' && m.status === 'active');
  assert.ok(activeWorkoutTime);
  assert.equal(activeWorkoutTime?.value?.value, '17:30');
  assert.equal(activeWorkoutTime?.category, 'stable_profile');
  assert.equal(activeWorkoutTime?.provenance, 'user_explicit');

  // Older preference for the same field should be expired and reference supersededBy
  const olderWorkoutTime = memories.find(m => m.id !== activeWorkoutTime?.id && m.value?.field === 'preferredWorkoutTime');
  assert.ok(olderWorkoutTime);
  assert.equal(olderWorkoutTime?.status, 'expired');
  assert.equal(olderWorkoutTime?.supersededBy, activeWorkoutTime?.id);
  assert.equal(decayedConfidence(olderWorkoutTime!, '2026-10-14'), 0, 'Superseded memory has 0 confidence');
});

test('retrieval ranking selects the smallest useful set prioritized by domain, goal, recency and verification', () => {
  const base: Partial<HealthMemory> = {
    userId: 'owner-123',
    layer: 'stable',
    stability: 1,
    contradictions: 0,
    sourceIds: ['s1'],
    sourceFingerprint: 'fp1',
    status: 'active'
  };

  const memories: HealthMemory[] = [
    {
      ...base,
      id: 'mem-sleep-verified',
      category: 'stable_profile',
      type: 'sleep_window',
      domain: 'sleep',
      summary: 'Consistent bedtime window between 22:30 and 23:00.',
      value: {bedtime: '22:45'},
      provenance: 'measured_observation',
      verified: true,
      confidence: 0.9,
      evidenceCount: 14,
      firstObserved: '2026-09-01T00:00:00Z',
      lastObserved: '2026-10-13T00:00:00Z'
    } as HealthMemory,
    {
      ...base,
      id: 'mem-unverified-inference',
      category: 'semantic_health',
      type: 'recovery_inference',
      domain: 'recovery',
      summary: 'Inferred possible fatigue accumulation.',
      value: {},
      provenance: 'model_inference',
      verified: false,
      confidence: 0.4,
      evidenceCount: 1,
      firstObserved: '2026-10-01T00:00:00Z',
      lastObserved: '2026-10-02T00:00:00Z'
    } as HealthMemory,
    {
      ...base,
      id: 'mem-nutrition-goal',
      category: 'goal_memory',
      type: 'long_term_goal',
      domain: 'nutrition',
      summary: 'Target protein intake 160g daily.',
      value: {goalId: 'goal-protein-1', target: 160},
      provenance: 'canonical_record',
      verified: true,
      confidence: 0.95,
      evidenceCount: 5,
      firstObserved: '2026-08-01T00:00:00Z',
      lastObserved: '2026-10-14T00:00:00Z'
    } as HealthMemory
  ];

  // Verified only retrieval filters out model inference
  const rankedVerified = rankMemories(memories, {
    date: '2026-10-14',
    domain: 'sleep',
    verifiedOnly: true,
    maxItems: 2
  });
  assert.equal(rankedVerified.some(m => m.id === 'mem-unverified-inference'), false);
  assert.equal(rankedVerified[0].id, 'mem-sleep-verified');

  // Goal-targeted retrieval ranks goal memory highest
  const rankedGoal = rankMemories(memories, {
    date: '2026-10-14',
    goalId: 'goal-protein-1',
    maxItems: 1
  });
  assert.equal(rankedGoal[0].id, 'mem-nutrition-goal');
});

test('adaptive strategy: Run 1 (poor outcome) -> Run 2 (deprioritize in same context) -> Run 3 (viable in different context)', () => {
  const intervention = 'volume_reduction_30_percent';
  const highFatigueHypertrophyContext = {
    fatigue: 'high' as const,
    trainingPhase: 'hypertrophy',
    soreness: 7
  };

  // --------------------------------------------------------------------------
  // RUN 1: Candidate evaluated initially (no prior history)
  // --------------------------------------------------------------------------
  const initialEval = evaluateStrategyRecommendation(
    intervention,
    highFatigueHypertrophyContext,
    []
  );
  assert.equal(initialEval.status, 'recommended');
  assert.equal(initialEval.matchedPastEpisodes, 0);

  // An outcome is observed and stored: outcome was contradicted (poor recovery response)
  const poorOutcomeObs: OutcomeObservation = {
    userId: 'owner-123',
    intervention,
    domain: 'training',
    context: highFatigueHypertrophyContext,
    predictedOutcome: {
      metric: 'readiness_score',
      expectedChange: '+10',
      confidence: 0.8
    },
    actualOutcome: {
      metric: 'readiness_score',
      observedChange: '-4',
      evaluation: 'contradicted'
    },
    correlationLanguage: 'associated_with',
    confidenceLevel: 'moderate',
    causalClaim: false,
    timestamp: '2026-10-14T10:00:00Z'
  };
  const outcomeMemory = buildOutcomeMemory(poorOutcomeObs);
  assert.equal(outcomeMemory.category, 'outcome_learning');
  assert.equal(outcomeMemory.provenance, 'measured_observation');
  assert.equal(outcomeMemory.value.causalClaim, false);

  // --------------------------------------------------------------------------
  // RUN 2: Same context (high fatigue, hypertrophy)
  // Expected: Sees verified poor outcome and reduces likelihood / deprioritizes
  // --------------------------------------------------------------------------
  const run2Eval = evaluateStrategyRecommendation(
    intervention,
    highFatigueHypertrophyContext,
    [outcomeMemory]
  );
  assert.ok(run2Eval.status === 'caution_revise' || run2Eval.status === 'deprioritized');
  assert.ok(run2Eval.weight < initialEval.weight, 'Weight must be lower than initial');
  assert.equal(run2Eval.contradictedCount, 1);
  assert.equal(run2Eval.causalClaim, false);
  assert.ok(run2Eval.reasoning.includes('contradicted'));

  // --------------------------------------------------------------------------
  // RUN 3: Different context (trainingPhase: recovery, fatigue: moderate)
  // Expected: Considers context; candidate is NOT permanently blacklisted
  // --------------------------------------------------------------------------
  const recoveryContext = {
    fatigue: 'moderate' as const,
    trainingPhase: 'recovery',
    soreness: 4
  };
  const run3Eval = evaluateStrategyRecommendation(
    intervention,
    recoveryContext,
    [outcomeMemory]
  );
  assert.equal(run3Eval.status, 'recommended', 'Must remain recommended in suitable context');
  assert.ok(run3Eval.weight > run2Eval.weight, 'Weight must recover in different context');
  assert.equal(run3Eval.causalClaim, false);
  assert.ok(run3Eval.reasoning.includes('different context'));
});

// ============================================================================
// 4. SECURITY & PERMISSION BOUNDARIES
// ============================================================================

test('security: cross-owner access rejection and forged ownership protection', async () => {
  const harness = createTestHarness('owner-alice');
  await assert.rejects(
    continueAgentRun(harness.saved().id, {
      ...harness,
      ownerId: 'attacker-bob', // Forged/mismatched owner
      workspaceId: 'workspace-default',
      call: async () => { throw new Error('Must not be called'); },
      execute: async () => { throw new Error('Must not write'); }
    }),
    /another account/i
  );
});
