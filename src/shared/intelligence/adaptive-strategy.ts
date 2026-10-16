import {z} from 'zod';
import {fingerprint} from '../automation-model.js';
import type {HealthMemory} from './memory.js';
import type {StateDomain} from './contracts.js';

export const outcomeObservationSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  intervention: z.string().min(1).max(200),
  domain: z.enum(['readiness', 'nutrition', 'training', 'recovery', 'sleep', 'body', 'medical', 'care', 'goals']),
  context: z.record(z.string(), z.unknown()),
  predictedOutcome: z.object({
    metric: z.string(),
    expectedChange: z.string().or(z.number()),
    confidence: z.number().min(0).max(1)
  }),
  actualOutcome: z.object({
    metric: z.string(),
    observedChange: z.string().or(z.number()),
    evaluation: z.enum(['supported', 'contradicted', 'insufficient_evidence'])
  }),
  correlationLanguage: z.enum(['associated_with', 'followed_by', 'consistent_with', 'insufficient_evidence']),
  confidenceLevel: z.enum(['low', 'moderate', 'high']),
  causalClaim: z.literal(false),
  timestamp: z.string()
}).strict();

export type OutcomeObservation = z.infer<typeof outcomeObservationSchema>;

export interface StrategyContext {
  domain?: StateDomain;
  fatigue?: 'low' | 'moderate' | 'high';
  soreness?: number;
  trainingPhase?: string;
  sleepDebtHours?: number;
  daysToTarget?: number;
  [key: string]: unknown;
}

export interface StrategyEvaluation {
  intervention: string;
  status: 'recommended' | 'caution_revise' | 'deprioritized';
  weight: number;
  confidence: number;
  reasoning: string;
  causalClaim: false;
  matchedPastEpisodes: number;
  supportedCount: number;
  contradictedCount: number;
  applicableContext: Record<string, unknown>;
}

/** Check if two context profiles share key attributes that make them functionally equivalent contexts. */
export function isMatchingContext(c1: Record<string, unknown>, c2: Record<string, unknown>): boolean {
  const keys = [...new Set([...Object.keys(c1),...Object.keys(c2)])];
  let checked = 0;
  for (const k of keys) {
    if (c1[k] !== undefined && c2[k] !== undefined) {
      if(k!=='domain')checked++;
      if (c1[k] !== c2[k]) return false;
    }
  }
  return checked > 0;
}

/**
 * Builds a verified outcome memory record from an empirical observation.
 * Adheres strictly to non-causal language and provenance verification.
 */
export function buildOutcomeMemory(observation: OutcomeObservation): HealthMemory {
  const obs = outcomeObservationSchema.parse(observation);
  const matched = obs.actualOutcome.evaluation === 'supported';
  const contradicts = obs.actualOutcome.evaluation === 'contradicted';
  const id = obs.id || `outcome-memory-${fingerprint([obs.userId, obs.intervention, obs.timestamp])}`;

  const summary = `Recorded outcome for ${obs.intervention} was ${obs.actualOutcome.evaluation} in context (${JSON.stringify(obs.context)}). ` +
    `Observed results were ${obs.correlationLanguage.replace('_', ' ')} this intervention without establishing causality.`;

  return {
    id,
    userId: obs.userId,
    category: 'outcome_learning',
    layer: 'episodic',
    type: 'outcome_comparison',
    domain: obs.domain,
    summary,
    value: {
      intervention: obs.intervention,
      context: obs.context,
      predictedOutcome: obs.predictedOutcome,
      actualOutcome: obs.actualOutcome,
      matched,
      contradicts,
      correlationLanguage: obs.correlationLanguage,
      causalClaim: false
    },
    provenance: 'measured_observation',
    verified: true,
    confidence: obs.confidenceLevel === 'high' ? 0.85 : obs.confidenceLevel === 'moderate' ? 0.65 : 0.45,
    evidenceCount: 1,
    stability: 1,
    contradictions: contradicts ? 1 : 0,
    firstObserved: obs.timestamp,
    lastObserved: obs.timestamp,
    sourceIds: [id],
    sourceFingerprint: fingerprint([obs.userId, obs.intervention, obs.timestamp]),
    status: 'active'
  };
}

/**
 * Evaluates candidate interventions against verified outcome memories.
 * Implements adaptive intelligence (Task 3.6):
 * - If verified poor outcomes occurred in the SAME context, weight is reduced and caution advised.
 * - If evaluating the same intervention in a DIFFERENT context, it is not blacklisted and remains viable.
 * - Single observations never trigger absolute conclusions (Task 3.4).
 */
export function evaluateStrategyRecommendation(
  intervention: string,
  currentContext: StrategyContext,
  memories: HealthMemory[],
  options?: { baseWeight?: number; baseConfidence?: number }
): StrategyEvaluation {
  const baseWeight = options?.baseWeight ?? 0.8;
  const baseConfidence = options?.baseConfidence ?? 0.7;

  // Extract all relevant outcome memories for this intervention
  const relevantMemories = memories.filter(m => {
    if (m.category !== 'outcome_learning' || m.status !== 'active' || !m.verified || m.provenance==='model_inference') return false;
    const itemIntervention = String(m.value?.intervention || m.value?.actionId || m.value?.forecastType || '');
    return !!itemIntervention&&itemIntervention.toLowerCase()===intervention.toLowerCase();
  });

  if (!relevantMemories.length) {
    return {
      intervention,
      status: 'recommended',
      weight: baseWeight,
      confidence: baseConfidence,
      reasoning: `No prior outcome history for ${intervention}. Recommended under current guidelines with baseline verification.`,
      causalClaim: false,
      matchedPastEpisodes: 0,
      supportedCount: 0,
      contradictedCount: 0,
      applicableContext: currentContext
    };
  }

  // Filter memories matching the same context vs different context
  const sameContextMemories: HealthMemory[] = [];
  const differentContextMemories: HealthMemory[] = [];

  for (const m of relevantMemories) {
    const pastContext = (m.value?.context as Record<string, unknown>) || {};
    if (isMatchingContext(pastContext, currentContext)) {
      sameContextMemories.push(m);
    } else {
      differentContextMemories.push(m);
    }
  }

  // Calculate stats in the matching context
  let contradictedInSameContext = 0;
  let supportedInSameContext = 0;

  for (const m of sameContextMemories) {
    const val = m.value as any;
    if (val?.contradicts === true || val?.actualOutcome?.evaluation === 'contradicted' || val?.matched === false) {
      contradictedInSameContext++;
    } else if (val?.matched === true || val?.actualOutcome?.evaluation === 'supported') {
      supportedInSameContext++;
    }
  }

  // If we have verified poor outcomes in the exact same context:
  if (contradictedInSameContext > 0 && contradictedInSameContext >= supportedInSameContext) {
    const penalty = Math.min(0.55, contradictedInSameContext * 0.35);
    const weight = Math.max(0.2, baseWeight - penalty);
    return {
      intervention,
      status: weight < 0.35 ? 'deprioritized' : 'caution_revise',
      weight,
      confidence: Math.min(0.85, baseConfidence + contradictedInSameContext * 0.08),
      reasoning: `In matched context (${JSON.stringify(currentContext)}), recorded prior outcome(s) contradicted expected benefit. ` +
        `Evidence shows ${contradictedInSameContext} poor outcome(s); reducing recommendation priority and favoring reversible alternatives. ` +
        `This is observational feedback, not proof of causation.`,
      causalClaim: false,
      matchedPastEpisodes: sameContextMemories.length,
      supportedCount: supportedInSameContext,
      contradictedCount: contradictedInSameContext,
      applicableContext: currentContext
    };
  }

  // If different context had poor outcomes, but current context is different:
  if (!sameContextMemories.length && differentContextMemories.length > 0) {
    const diffContradicted = differentContextMemories.filter(m => m.value?.contradicts === true || m.value?.matched === false).length;
    if (diffContradicted > 0) {
      return {
        intervention,
        status: 'recommended',
        weight: baseWeight * 0.95, // slight calibration, but NOT blacklisted
        confidence: baseConfidence,
        reasoning: `Prior caution for ${intervention} was observed under a different context. ` +
          `It remains viable in current context (${JSON.stringify(currentContext)}) subject to standard verification.`,
        causalClaim: false,
        matchedPastEpisodes: 0,
        supportedCount: 0,
        contradictedCount: 0,
        applicableContext: currentContext
      };
    }
  }

  // Positive or mixed support in same context
  return {
    intervention,
    status: 'recommended',
    weight: Math.min(0.95, baseWeight + supportedInSameContext * 0.05),
    confidence: Math.min(0.9, baseConfidence + supportedInSameContext * 0.05),
    reasoning: `Prior observations in matched context support ${intervention}. Retaining recommendation with current verification.`,
    causalClaim: false,
    matchedPastEpisodes: sameContextMemories.length,
    supportedCount: supportedInSameContext,
    contradictedCount: contradictedInSameContext,
    applicableContext: currentContext
  };
}
