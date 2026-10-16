import { actionPolicy, verifyAgentWrite, type AgentProposal } from '../../shared/agentic-intelligence.js';
export { executeHealthAction, type HealthActionServices } from '../../shared/health-action-registry.js';
export { actionDefinitions } from '../../shared/mcp-contracts.js';
import type { BioRecord } from '../../shared/biology.js';
export interface ActionServices {
  read(): Promise<BioRecord[]>;
  save(input: {id:string;type:BioRecord['type'];domain:BioRecord['domain'];name:string;metadata:BioRecord['metadata'];source:string}): Promise<unknown>;
  audit(proposal: AgentProposal): Promise<unknown>;
}
export async function executeIntelligenceAction(proposal: AgentProposal, services: ActionServices): Promise<number> {
  const latest=await services.read(), id=`intelligence-result-${proposal.id}`;
  const expected={id,...proposal.payload,metadata:{...proposal.payload.metadata,intelligenceActionId:proposal.id}};
  const existing=latest.find(r=>r.id===id);
  // Recovery after a committed write and failed audit must not create another health record.
  if(existing) {if(!verifyAgentWrite(expected,existing))throw new Error('This action’s record changed. Review it in its domain.');}
  else {const p=actionPolicy(proposal,true,latest); await services.save({...expected,...p.payload,metadata:expected.metadata,source:'Health OS Intelligence'});}
  const actual=(await services.read()).find(r=>r.id===id);
  if(!verifyAgentWrite(expected,actual))throw new Error('The saved result could not be verified. Review your records before retrying.');
  await services.audit({...proposal,status:'executed',resultRevision:actual!.revision});
  return actual!.revision;
}
