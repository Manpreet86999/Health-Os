import type {AgentModelRole} from './agent-contracts.js';
export const PRIMARY_MODEL='qwen/qwen3-235b-a22b-2507';
export const SECONDARY_MODEL=PRIMARY_MODEL;
export const PRODUCTION_MODELS=[PRIMARY_MODEL] as const;
// Historical evidence and adapters remain readable; these models are not routed.
export const SUPPORTED_MODELS=[...PRODUCTION_MODELS,'deepseek/deepseek-v4-flash-0731','z-ai/glm-5.3-flash'] as const;
export type ProductionModelStatus='PROVISIONAL'|'QUALIFIED';
// Reviewed server policy, distinct from evidence-derived qualification records.
// Vision is unavailable for this text-only model and must continue to fail closed.
export const provisionalModelAdmission=(model:string,role:AgentModelRole)=>model===PRIMARY_MODEL&&role!=='vision';
export const productionModelStatus=(model:string,role:AgentModelRole,qualifications:readonly {model:string;roles:AgentModelRole[]}[]):ProductionModelStatus|undefined=>qualifications.some(q=>q.model===model&&q.roles.includes(role))?'QUALIFIED':provisionalModelAdmission(model,role)?'PROVISIONAL':undefined;
export const MONTHLY_MODEL_LIMIT_USD=5;
export const productionRoleModel=(_role:AgentModelRole)=>PRIMARY_MODEL;
