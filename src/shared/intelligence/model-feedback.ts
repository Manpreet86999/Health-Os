import {modelRoles,type AgentRequest} from './agent-contracts.js';
import {SUPPORTED_MODELS} from './production-models.js';
export function modelFeedback(usage:{requestId:string;model:string;role:string;latencyMs:number}|undefined,outcome:NonNullable<AgentRequest['feedback']>['outcome']):AgentRequest['feedback']{
 if(!usage||!(SUPPORTED_MODELS as readonly string[]).includes(usage.model)||!(modelRoles as readonly string[]).includes(usage.role))return undefined;
 return {requestId:usage.requestId,model:usage.model as typeof SUPPORTED_MODELS[number],role:usage.role as typeof modelRoles[number],outcome,latencyMs:usage.latencyMs};
}
