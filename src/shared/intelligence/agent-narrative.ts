import type {AgentStep} from './agent-contracts.js';
/** Every model-written explanation shown in an approval card is part of grounding validation. */
export function agentNarrative(step:AgentStep){return [step.summary,...step.proposedActions.map(action=>'reason' in action?action.reason:action.kind==='recovery_plan'?action.note:action.kind==='mission'?action.objective:'')].filter(Boolean).join('\n');}
